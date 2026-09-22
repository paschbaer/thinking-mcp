/**
 * Operation engine — Phase 3 scope: process execution + composite
 * firstAvailable fallback (FR-010–012, FR-040, FR-055). Downstream MCP
 * operation types fail transport until the Phase 5 client manager lands.
 */
import { spawnSync } from "node:child_process";
import type { NormalizedResult, OperationConfig } from "../types/index.js";

export interface OperationContext {
  workspaceRoot: string;
}

export interface CompositeStep {
  type: string;
  server?: string;
  capability?: string;
  executable?: string;
  args?: string[];
  arguments?: { mode: "fixed" | "template" | "mapped"; value: unknown };
}

interface CompositeConfig extends OperationConfig {
  steps?: CompositeStep[];
  strategy?: "sequential" | "parallel" | "dependencyGraph" | "firstSuccessful" | "firstAvailable";
}

type ExecuteFn = (config: OperationConfig, ctx: OperationContext, attempt: number) => NormalizedResult;

function baseResult(config: OperationConfig): NormalizedResult {
  return {
    operationId: config.operationId,
    capabilityType: config.type,
    capabilityName: config.capability ?? config.executable,
    status: "failed",
    summary: "",
    data: {},
    content: [],
    warnings: [],
    errors: [],
    protocolMetadata: {},
    validated: false,
  };
}

export type DownstreamInvokerResult =
  | { kind: "success"; content: unknown[]; structuredContent?: unknown }
  | { kind: "tool_reported"; message: string; content: unknown[] }
  | { kind: "transport"; message: string };

export interface DownstreamInvoker {
  invokeTool(serverId: string, toolName: string, args: Record<string, unknown>): Promise<DownstreamInvokerResult>;
}

export class OperationEngine {
  /** Overridable for tests. */
  execute: ExecuteFn = (config, ctx, attempt) => this.executeOperation(config, ctx, attempt) as unknown as NormalizedResult;

  private downstreamInvoker: DownstreamInvoker | null = null;

  setDownstreamInvoker(invoker: DownstreamInvoker): void {
    this.downstreamInvoker = invoker;
  }

  async executeRequired(configs: OperationConfig[], ctx: OperationContext): Promise<{ allSucceeded: boolean; results: NormalizedResult[] }> {
    const results: NormalizedResult[] = [];
    let allSucceeded = true;
    for (const config of configs) {
      const result = await this.execute(config, ctx, 1);
      results.push(result);
      if (config.required && result.status !== "succeeded") {
        allSucceeded = false;
        break;
      }
    }
    return { allSucceeded, results };
  }

  private async executeOperation(config: OperationConfig, ctx: OperationContext, attempt: number): Promise<NormalizedResult> {
    return await this.executeSync(config, ctx, attempt);
  }

  /** Runs a list of operations; required failures stop the run (FR-040). */

  private async executeSync(config: OperationConfig, ctx: OperationContext, attempt: number): Promise<NormalizedResult> {
    const base = baseResult(config);

    if (config.type === "composite") {
      const composite = config as CompositeConfig;
      const strategy = composite.strategy ?? "sequential";
      const errors: string[] = [];
      for (const step of composite.steps ?? []) {
        const stepResult = await this.executeSync({ ...config, ...step, operationId: config.operationId, required: true } as OperationConfig, ctx, attempt);
        if (stepResult.status === "succeeded") {
          return {
            ...base,
            status: "succeeded",
            validated: true,
            summary: `composite ${config.operationId} succeeded`,
            data: { via: step.capability ?? step.executable ?? step.type },
          };
        }
        errors.push(...stepResult.errors.map((e) => e.message));
        if (strategy !== "firstAvailable" && strategy !== "firstSuccessful") break;
      }
      return {
        ...base,
        errors: errors.map((message) => ({ message })),
        summary: `all alternatives failed: ${errors.join("; ")}`,
      };
    }

    if (config.type === "mcpTool") {
      const invoker = this.downstreamInvoker;
      if (!invoker) {
        return { ...base, errors: [{ code: "downstream_connection_failed", message: "downstream invoker not configured" }], summary: "downstream invoker not configured" };
      }
      const args = (config.arguments?.mode === "fixed" ? config.arguments.value : config.arguments?.value ?? {}) as Record<string, unknown>;
      const outcome = await invoker.invokeTool(config.server ?? "", config.capability ?? "", args);
      if (outcome.kind === "transport") {
        return { ...base, errors: [{ code: "downstream_connection_failed", message: outcome.message }], summary: "transport failure" };
      }
      if (outcome.kind === "tool_reported") {
        return { ...base, errors: [{ code: "operation_result_invalid", message: outcome.message }], summary: "tool reported an error", content: outcome.content };
      }
      return {
        ...base,
        status: "succeeded",
        summary: `${config.operationId} succeeded`,
        content: outcome.content,
        protocolMetadata: { structuredContent: outcome.structuredContent ?? null },
      };
    }

    if (config.type !== "process") {
      // Downstream MCP operations require the client manager (Phase 5, FR-031).
      return {
        ...base,
        errors: [{ code: "downstream_connection_failed", message: `operation type ${config.type} requires the downstream MCP client (Phase 5)` }],
        summary: "downstream client not available",
      };
    }

    const timeoutMs = (config.timeoutSeconds ?? 120) * 1000;
    const maxBuffer = config.output?.maximumBytes ?? 1_048_576;
    const run = spawnSync(config.executable ?? "", config.args ?? [], {
      cwd: ctx.workspaceRoot,
      timeout: timeoutMs,
      killSignal: "SIGTERM",
      encoding: "utf-8",
      maxBuffer,
    });
    if (run.error) {
      const timedOut = (run.error as NodeJS.ErrnoException).code === "ETIMEDOUT";
      return {
        ...base,
        status: timedOut ? "timed_out" : "failed",
        errors: [{ code: timedOut ? "operation_timed_out" : "downstream_connection_failed", message: String(run.error) }],
        summary: timedOut ? "operation timed out" : "process failed to start",
      };
    }
    const exitCode = run.status ?? -1;
    const ok = exitCode === 0;
    return {
      ...base,
      status: ok ? "succeeded" : "failed",
      validated: ok,
      summary: ok ? `${config.operationId} succeeded` : `${config.operationId} failed with exit code ${exitCode}`,
      errors: ok ? [] : [{ message: ((run.stderr ?? "") || `exit code ${exitCode}`).slice(0, maxBuffer) }],
      data: { exitCode },
    };
  }
}
