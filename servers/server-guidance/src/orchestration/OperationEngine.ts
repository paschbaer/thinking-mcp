/**
 * Operation engine — Phase 3 scope: process execution + composite
 * firstAvailable fallback (FR-010–012, FR-040, FR-055). Downstream MCP
 * operation types fail transport until the Phase 5 client manager lands.
 */
import { spawn, spawnSync } from "node:child_process";
import type { NormalizedResult, OperationConfig } from "../types/index.js";
import { createRedactor, redactUnknown } from "../policy/redaction.js";
import { GuidanceError } from "../types/errors.js";

export interface OperationContext {
  workspaceRoot: string;
  /** Variables for template argument resolution (GUID-3): `${token}` tokens.
   * Known tokens: `session.request`, `project.name`. Unknown tokens fail fast. */
  templateVars?: Record<string, string>;
  /** spec 004 (final review HIGH-1): configured redaction patterns from
   *  policies.json — applied to failing-operation stderr. Defaults apply
   *  when omitted. */
  redactionPatterns?: string[];
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
  strategy?:
    | "sequential"
    | "parallel"
    | "dependencyGraph"
    | "firstSuccessful"
    | "firstAvailable";
}

export type ExecuteFn = (
  config: OperationConfig,
  ctx: OperationContext,
  attempt: number,
  signal?: AbortSignal,
  /** CT-ARGS-1: agent-supplied argument overrides (run_operation
   *  `arguments`). mcpTool ops only; deep-merged OVER resolved args. */
  argumentOverrides?: Record<string, unknown>,
) => Promise<NormalizedResult>;

/** CT-ARGS-1: deep-merge agent overrides OVER operation-resolved arguments —
 *  agent keys win per-key, operation-only keys are retained. Plain objects
 *  merge recursively; arrays and primitives replace wholesale. */
function deepMergeArgs(
  base: Record<string, unknown>,
  overrides: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(overrides)) {
    // Prototype-pollution hardening: skip structural keys from agent input.
    if (k === "__proto__" || k === "constructor" || k === "prototype") continue;
    const b = out[k];
    out[k] =
      v !== null &&
      typeof v === "object" &&
      !Array.isArray(v) &&
      b !== null &&
      typeof b === "object" &&
      !Array.isArray(b)
        ? deepMergeArgs(
            b as Record<string, unknown>,
            v as Record<string, unknown>,
          )
        : v;
  }
  return out;
}

/**
 * GUID-3: resolves `${token}` placeholders in template arguments against
 * ctx.templateVars. Unknown tokens fail fast (operation_arguments_invalid) —
 * literal passthrough previously masked broken gates (repo="${project.name}").
 */
function resolveTemplateValue(
  value: unknown,
  vars: Record<string, string> | undefined,
  operationId: string,
): unknown {
  if (typeof value === "string") {
    return value.replace(/\$\{([^}]+)\}/g, (_m, token: string) => {
      const v = vars?.[token];
      if (v === undefined) {
        throw new GuidanceError(
          "operation_arguments_invalid",
          `operations.${operationId}: unresolved template token \${${token}} (known tokens: ${Object.keys(vars ?? {}).join(", ") || "none"})`,
          { recoverable: false },
        );
      }
      return v;
    });
  }
  if (Array.isArray(value)) {
    return value.map((v) => resolveTemplateValue(v, vars, operationId));
  }
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = resolveTemplateValue(v, vars, operationId);
    }
    return out;
  }
  return value;
}

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
  invokeTool(
    serverId: string,
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<DownstreamInvokerResult>;
}

export class OperationEngine {
  /** Overridable for tests. The optional signal carries hard-cancellation
   *  (spec 004 FR-202): aborting it kills the child (SIGTERM). */
  execute: ExecuteFn = (config, ctx, attempt, signal, argumentOverrides) =>
    this.executeOperation(
      config,
      ctx,
      attempt,
      signal,
      argumentOverrides,
    ) as unknown as Promise<NormalizedResult>;

  private downstreamInvoker: DownstreamInvoker | null = null;

  setDownstreamInvoker(invoker: DownstreamInvoker): void {
    this.downstreamInvoker = invoker;
  }

  async executeRequired(
    configs: OperationConfig[],
    ctx: OperationContext,
  ): Promise<{ allSucceeded: boolean; results: NormalizedResult[] }> {
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

  private async executeOperation(
    config: OperationConfig,
    ctx: OperationContext,
    attempt: number,
    signal?: AbortSignal,
    argumentOverrides?: Record<string, unknown>,
  ): Promise<NormalizedResult> {
    const result = await this.executeSync(
      config,
      ctx,
      attempt,
      signal,
      argumentOverrides,
    );
    // CT-ARGS-1: overrides are an mcpTool-only feature — process/composite
    // ops ignore them with a visible warning (no argv injection from agent
    // input), keeping the call itself successful.
    if (
      argumentOverrides !== undefined &&
      Object.keys(argumentOverrides).length > 0 &&
      config.type !== "mcpTool"
    ) {
      result.warnings.push({
        code: "argument_overrides_ignored",
        message: `argument overrides are only supported for mcpTool operations (type: ${config.type})`,
      });
    }
    return result;
  }

  /** Runs a list of operations; required failures stop the run (FR-040). */

  private async executeSync(
    config: OperationConfig,
    ctx: OperationContext,
    attempt: number,
    signal?: AbortSignal,
    argumentOverrides?: Record<string, unknown>,
  ): Promise<NormalizedResult> {
    const base = baseResult(config);

    if (config.type === "composite") {
      const composite = config as CompositeConfig;
      const strategy = composite.strategy ?? "sequential";
      const errors: string[] = [];
      const warnings: NormalizedResult["warnings"] = [];
      for (const step of composite.steps ?? []) {
        const stepResult = await this.executeSync(
          {
            ...config,
            ...step,
            operationId: config.operationId,
            required: true,
          } as OperationConfig,
          ctx,
          attempt,
          signal,
        );
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
        // REV-US2-F3: a failing composite gate must keep its steps' warnings
        // (e.g. node_deps_hint from a 'Cannot find module' stderr) — the
        // previous failure merge discarded them and left the agent guessing.
        warnings.push(...stepResult.warnings);
        if (strategy !== "firstAvailable" && strategy !== "firstSuccessful")
          break;
      }
      return {
        ...base,
        errors: errors.map((message) => ({ message })),
        warnings,
        summary: `all alternatives failed: ${errors.join("; ")}`,
      };
    }

    if (config.type === "mcpTool") {
      const invoker = this.downstreamInvoker;
      if (!invoker) {
        return {
          ...base,
          errors: [
            {
              code: "downstream_connection_failed",
              message: "downstream invoker not configured",
            },
          ],
          summary: "downstream invoker not configured",
        };
      }
      const rawArgs = config.arguments?.value ?? {};
      let args: Record<string, unknown>;
      try {
        args = (
          config.arguments?.mode === "template"
            ? resolveTemplateValue(
                rawArgs,
                ctx.templateVars,
                config.operationId,
              )
            : rawArgs
        ) as Record<string, unknown>;
      } catch (err) {
        return {
          ...base,
          errors: [
            {
              code: "operation_arguments_invalid",
              message: String(err instanceof GuidanceError ? err.message : err),
            },
          ],
          summary: "template arguments invalid",
        };
      }
      // CT-ARGS-1: agent argument overrides (run_operation `arguments`).
      // Deep-merged OVER resolved args (agent keys win per-key); rejected
      // fail-closed when the operation declares argumentsLocked.
      if (
        argumentOverrides !== undefined &&
        Object.keys(argumentOverrides).length > 0
      ) {
        if (config.argumentsLocked === true) {
          return {
            ...base,
            errors: [
              {
                code: "operation_arguments_invalid",
                message: `operations.${config.operationId}: arguments are locked (argumentsLocked) — agent overrides rejected`,
              },
            ],
            summary: "argument overrides rejected (argumentsLocked)",
          };
        }
        args = deepMergeArgs(args, argumentOverrides);
      }
      let outcome: Awaited<ReturnType<typeof invoker.invokeTool>>;
      try {
        outcome = await invoker.invokeTool(
          config.server ?? "",
          config.capability ?? "",
          args,
        );
      } catch (err) {
        // Policy rejections (e.g. allowlist) and invoker crashes fail the
        // operation deterministically instead of leaking exceptions.
        return {
          ...base,
          errors: [{ code: "operation_result_invalid", message: String(err) }],
          summary: "invoker rejected the operation",
        };
      }
      if (outcome.kind === "transport") {
        return {
          ...base,
          errors: [
            { code: "downstream_connection_failed", message: outcome.message },
          ],
          summary: "transport failure",
        };
      }
      if (outcome.kind === "tool_reported") {
        return {
          ...base,
          errors: [
            { code: "operation_result_invalid", message: outcome.message },
          ],
          summary: "tool reported an error",
          content: redactUnknown(outcome.content) as typeof base.content,
        };
      }
      return {
        ...base,
        status: "succeeded",
        summary: `${config.operationId} succeeded`,
        // 2c sanitization seam: downstream payloads are redacted BEFORE they
        // become part of any agent-facing result (structuredContent was
        // previously returned verbatim via protocolMetadata).
        content: redactUnknown(outcome.content) as typeof base.content,
        protocolMetadata: {
          structuredContent:
            outcome.structuredContent !== undefined &&
            outcome.structuredContent !== null
              ? redactUnknown(outcome.structuredContent)
              : null,
        },
      };
    }

    if (config.type === "sampling") {
      const sampling = (
        config as unknown as {
          sampling?: {
            purpose?: string;
            maxOutputTokens?: number;
            maximumAttempts?: number;
          };
        }
      ).sampling;
      if (!sampling?.purpose) {
        return {
          ...base,
          errors: [
            {
              code: "operation_arguments_invalid",
              message: "sampling requires a purpose",
            },
          ],
          summary: "sampling misconfigured",
        };
      }
      // Phase 3+ engines without an upstream sampling capability degrade to a
      // warning: sampling is advisory-only and never transition-authoritative.
      return {
        ...base,
        status: "succeeded",
        validated: true,
        warnings: [
          {
            code: "sampling_degraded",
            message: "upstream sampling unavailable — advisory result omitted",
          },
        ],
        summary: `sampling (advisory, purpose: ${sampling.purpose}) degraded per policy`,
      };
    }

    if (config.type === "elicitation") {
      // Structured blocker: the session stays recoverable; input arrives via
      // resolve_operation_input (FR-054).
      return {
        ...base,
        status: "input_required",
        summary: "structured user input required",
        data: { inputRequest: { fields: [], schema: "stored-with-operation" } },
        errors: [],
      };
    }

    if (config.type !== "process") {
      // Downstream MCP operations require the client manager (Phase 5, FR-031).
      return {
        ...base,
        errors: [
          {
            code: "downstream_connection_failed",
            message: `operation type ${config.type} requires the downstream MCP client (Phase 5)`,
          },
        ],
        summary: "downstream client not available",
      };
    }

    const timeoutMs = (config.timeoutSeconds ?? 120) * 1000;
    const maxBuffer = config.output?.maximumBytes ?? 1_048_576;
    const procConfig = config as {
      env?: Record<string, string>;
      shell?: boolean | string;
    };
    const run = await this.runProcessAsync(
      config.executable ?? "",
      config.args ?? [],
      {
        cwd: ctx.workspaceRoot,
        timeoutMs,
        maxBuffer,
        // GUID-5: per-operation environment (merged over the inherited
        // container/host environment) and optional shell execution.
        env: procConfig.env
          ? ({ ...process.env, ...procConfig.env } as Record<string, string>)
          : undefined,
        shell: procConfig.shell,
        signal,
      },
    );
    if (run.error) {
      const cancelled = run.cancelled === true;
      const timedOut =
        (run.error as NodeJS.ErrnoException).code === "ETIMEDOUT";
      return {
        ...base,
        status: cancelled ? "cancelled" : timedOut ? "timed_out" : "failed",
        errors: [
          {
            code: cancelled
              ? "operation_cancelled"
              : timedOut
                ? "operation_timed_out"
                : "downstream_connection_failed",
            message: String(run.error),
          },
        ],
        summary: cancelled
          ? "operation cancelled"
          : timedOut
            ? "operation timed out"
            : "process failed to start",
      };
    }
    const redactor = createRedactor(ctx.redactionPatterns);
    const exitCode = run.status ?? -1;
    const ok = exitCode === 0;
    const stderrText = redactor
      .redact((run.stderr ?? "") || `exit code ${exitCode}`)
      .slice(0, maxBuffer);
    return {
      ...base,
      status: ok ? "succeeded" : "failed",
      validated: ok,
      // GDS-5: raw transparency - carry capped+redacted stdout; exposure
      // filtering strips it for restriction modes.
      content: run.stdout
        ? [
            {
              type: "text",
              text: redactor.redact(run.stdout).slice(0, maxBuffer),
            },
          ]
        : [],
      summary: ok
        ? `${config.operationId} succeeded`
        : `${config.operationId} failed with exit code ${exitCode}`,
      errors: ok ? [] : [{ message: stderrText }],
      warnings: ok
        ? []
        : // specs/015 US2 reactive detection (AC-9, FR-1213): gate failures
          // matching the warnNodeDeps error patterns point at the healing
          // operations instead of leaving the agent to guess the remedy.
          OperationEngine.nodeDepsHints(stderrText),
      data: { exitCode },
    };
  }

  /**
   * specs/015 US2 (FR-1213): map node-deps failure patterns to the
   * dependency-bootstrap operations. 'Cannot find module' => dependencies
   * missing => deps-install; ERR_DLOPEN_FAILED => native addon ABI mismatch
   * => deps-reinstall (clean + in-container reinstall).
   */
  private static nodeDepsHints(stderr: string): NormalizedResult["warnings"] {
    const hints: NormalizedResult["warnings"] = [];
    if (/Cannot find module/.test(stderr)) {
      hints.push({
        code: "node_deps_hint",
        message:
          'failure matches "Cannot find module" — dependencies are likely missing or incompatible: run the guidance operation deps-install (npm ci; falls back to npm install without a lockfile) in this workspace, then re-run the gate',
      });
    }
    if (/ERR_DLOPEN_FAILED/.test(stderr)) {
      hints.push({
        code: "node_deps_hint",
        message:
          'failure matches "ERR_DLOPEN_FAILED" — a native addon does not load in this environment (platform/ABI mismatch): run the guidance operation deps-reinstall (deletes node_modules, reinstalls — inside the container for a Linux-native tree), then re-run the gate',
      });
    }
    return hints;
  }

  /** spec 004 FR-201: async child-process execution (replaces spawnSync —
   *  the event loop stays responsive, enabling real concurrency and hard
   *  cancellation). Kill escalation: SIGTERM, then SIGKILL after a 5 s
   *  grace on both timeout and abort (FR-202). maxBuffer parity: exceeding
   *  the cap kills the child and fails the operation. */
  private runProcessAsync(
    executable: string,
    args: string[],
    opts: {
      cwd: string;
      timeoutMs: number;
      maxBuffer: number;
      env?: Record<string, string>;
      shell?: boolean | string;
      signal?: AbortSignal;
    },
  ): Promise<{
    status: number | null;
    stdout: string;
    stderr: string;
    error?: Error;
    cancelled?: boolean;
  }> {
    return new Promise((resolve) => {
      let stdout = "";
      let stderr = "";
      let settled = false;
      let exceeded = false;
      let timedOut = false;
      let child: ReturnType<typeof spawn>;
      const settle = (result: {
        status: number | null;
        stdout: string;
        stderr: string;
        error?: Error;
        cancelled?: boolean;
      }): void => {
        if (settled) return;
        settled = true;
        resolve(result);
      };
      // Pre-aborted signal: fail fast without spawning (final review LOW).
      if (opts.signal?.aborted) {
        settle({
          status: null,
          stdout: "",
          stderr: "",
          error: new Error("operation cancelled"),
          cancelled: true,
        });
        return;
      }
      try {
        child = spawn(executable, args, {
          cwd: opts.cwd,
          env: opts.env,
          shell: opts.shell,
          // Abort wird manuell behandelt (Listener unten), damit wir die
          // SIGTERM→SIGKILL-Eskalation kontrollieren (Node würde nur einmal
          // SIGTERM senden).
        });
      } catch (err) {
        resolve({ status: null, stdout: "", stderr: "", error: err as Error });
        return;
      }
      const killWithEscalation = (signal: NodeJS.Signals): void => {
        try {
          child.kill(signal);
        } catch {
          /* already gone */
        }
        if (signal === "SIGTERM") {
          const escalation = setTimeout(() => {
            try {
              child.kill("SIGKILL");
            } catch {
              /* already gone */
            }
          }, 5_000);
          escalation.unref?.();
        }
      };
      const onOutput = (
        buf: { toString(): string },
        target: "stdout" | "stderr",
      ): void => {
        // LR-1 (LOW-Residue-Closure 2026-09-27, ex-"FR-801" — Nummern-
        // kreisung mit specs/008 bereinigt): stdout und stderr werden in
        // getrennten Puffern erfasst — eine quergestreamte Reihenfolge
        // (out/err interleaved) wird bewusst NICHT garantiert (POSIX-
        // Limitierung ohne Merged-Pipe). Der agent-facing Fehlerpfad nutzt
        // ausschließlich den redigierten stderr-Kanal.
        // MEDIUM-2: capped accumulation — a runaway child cannot grow memory
        // unboundedly; exceeding the cap kills with SIGTERM escalation.
        if (target === "stdout") {
          if (stdout.length <= opts.maxBuffer) stdout += buf.toString();
        } else {
          if (stderr.length <= opts.maxBuffer) stderr += buf.toString();
        }
        if (
          !exceeded &&
          (stdout.length > opts.maxBuffer || stderr.length > opts.maxBuffer)
        ) {
          exceeded = true;
          killWithEscalation("SIGTERM");
        }
      };
      child.stdout?.on("data", (buf: { toString(): string }) =>
        onOutput(buf, "stdout"),
      );
      child.stderr?.on("data", (buf: { toString(): string }) =>
        onOutput(buf, "stderr"),
      );
      const timeout = setTimeout(() => {
        timedOut = true;
        killWithEscalation("SIGTERM");
      }, opts.timeoutMs);
      timeout.unref?.();
      child.once("close", (code) => {
        clearTimeout(timeout);
        if (opts.signal?.aborted) {
          // FR-202: aborted execution — distinguishable from timeout/failure.
          settle({
            status: null,
            stdout: stdout.slice(0, opts.maxBuffer),
            stderr: stderr.slice(0, opts.maxBuffer),
            error: new Error("operation cancelled"),
            cancelled: true,
          });
          return;
        }
        if (timedOut) {
          // Parity with spawnSync's ETIMEDOUT behaviour.
          const err = new Error("operation timed out") as NodeJS.ErrnoException;
          err.code = "ETIMEDOUT";
          settle({
            status: null,
            stdout: stdout.slice(0, opts.maxBuffer),
            stderr: stderr.slice(0, opts.maxBuffer),
            error: err,
          });
          return;
        }
        if (exceeded) {
          settle({
            status: null,
            stdout: stdout.slice(0, opts.maxBuffer),
            stderr: stderr.slice(0, opts.maxBuffer),
            error: new Error(`maxBuffer exceeded (${opts.maxBuffer} bytes)`),
          });
          return;
        }
        settle({
          status: code,
          stdout: stdout.slice(0, opts.maxBuffer),
          stderr: stderr.slice(0, opts.maxBuffer),
        });
      });
      child.once("error", (err: NodeJS.ErrnoException) => {
        clearTimeout(timeout);
        if (opts.signal?.aborted) {
          settle({
            status: null,
            stdout,
            stderr,
            error: new Error("operation cancelled"),
            cancelled: true,
          });
          return;
        }
        settle({ status: null, stdout, stderr, error: err });
      });
      if (opts.signal) {
        opts.signal.addEventListener(
          "abort",
          () => killWithEscalation("SIGTERM"),
          { once: true },
        );
      }
    });
  }
}
