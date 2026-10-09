/**
 * Registriert alle upstream MCP-Tools am SDK-Server (Review Finding 1).
 * Profile-Tools nur bei profile === "spec-kit" (R17).
 * Reihenfolge: Registrierung VOR connect() (SDK-Anforderung).
 */
import { z } from "zod";
import { resolve } from "node:path";
import type { WorkspaceRegistry } from "../workspace-registry.js";
import { GuidanceError } from "../types/errors.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WorkflowTools } from "./ToolHandlers.js";
import type { TransitionContext } from "../workflow/transition-protocol.js";

/**
 * Spec 016 (FR-4/FR-6): extract per-call transition options from the MCP
 * request `_meta`: `async` toggles async acceptance per request (synchronous
 * stays the default), `progressToken` opens the notifications/progress
 * channel (delivered via the request-related sendNotification, i.e. over
 * the SSE response stream when one is active).
 */
interface MetaCarrier {
  _meta?: { async?: boolean; progressToken?: string | number };
  sendNotification: (notification: never) => Promise<void>;
}

export function transitionContextFrom(
  extra: MetaCarrier | undefined,
): TransitionContext | undefined {
  const meta = extra?._meta;
  const progressToken = meta?.progressToken;
  const progress =
    progressToken !== undefined && extra?.sendNotification
      ? {
          token: progressToken,
          send: (update: {
            progress: number;
            total?: number;
            message: string;
          }) =>
            extra.sendNotification({
              method: "notifications/progress",
              params: {
                progressToken,
                progress: update.progress,
                ...(update.total !== undefined ? { total: update.total } : {}),
                message: update.message,
              },
            } as never),
        }
      : undefined;
  if (meta?.async === undefined && progress === undefined) return undefined;
  return { asyncAcceptance: meta?.async, progress };
}

const sessionId = { sessionId: z.string().min(1) };
const requestId = { requestId: z.string().min(1).optional() };

/** Amendment 002 v1.1 (CHN-3): mixed chain manifest — optional explicit
 *  steps (run first), optional Form B task-derivation (runs after); at least
 *  one of both (engine gate raises configuration_invalid otherwise). */
const chainManifest = z
  .object({
    steps: z
      .array(
        z.object({
          request: z.string().min(1),
          workflowId: z.string().optional(),
        }),
      )
      .min(1),
    // upper bound = chain.maxStepsPerManifest, enforced in the engine gate
    // (validateChainManifest) so the configured limit stays authoritative
    // and violations surface as recoverable configuration_invalid (LOW-5).
    source: z.literal("spec_kit_tasks").optional(),
    requestTemplate: z.string().min(1).optional(),
    featureId: z.string().optional(),
    taskFilter: z
      .object({ statuses: z.array(z.string()).optional() })
      .optional(),
    // Chain fix (2026-10-08): per-manifest temporary depth override — the
    // user decision surfaced by the Form-B depth pre-check warning. Hard cap
    // mirrors the config schema (512); the effective depth stays bounded.
    maxChainDepthOverride: z.number().int().min(1).max(512).optional(),
  })
  .refine((m) => m.steps !== undefined || m.source !== undefined, {
    message: "chain requires either steps or source",
  });

export const WORKFLOW_TOOL_NAMES = [
  "start_workflow",
  "get_current_guidance",
  "submit_understanding",
  "submit_plan",
  "submit_plan_review",
  "submit_implementation",
  "submit_implementation_review",
  "submit_verification",
  "complete_workflow",
  "get_workflow_state",
  "report_blocker",
  "resume_workflow",
  "cancel_workflow",
  "get_orchestration_status",
  "list_configured_operations",
  "retry_operation",
  "run_operation",
  "call_downstream",
  "get_metrics",
  "get_downstream_status",
  "release_capability_pins",
] as const;

export const SPEC_KIT_TOOL_NAMES = [
  "discover_spec_kit_feature",
  "import_spec_kit_artifacts",
  "get_spec_kit_status",
  "get_next_task",
  "release_batch",
  "start_task",
  "submit_task_implementation",
  "submit_task_review",
  "verify_task",
  "complete_task",
  "propose_plan_change",
  "approve_plan_change",
  "apply_plan_change",
  "refresh_spec_kit_artifacts",
  "get_traceability_report",
  "validate_spec_kit_completion",
] as const;

/**
 * HIGH-Fix (HTTP-Review): ein client-supplied workspaceRoot muss innerhalb des
 * serverkonfigurierten Roots liegen (resolve + Prefix-Check, separator-bewusst).
 */
/**
 * specs/008 FR-802: membership ONLY — candidate must be a registered name or
 * a realpath-exact registered root. Sub-paths of registered roots are
 * rejected (documented hardening, AC-2 matrix).
 */
export function assertWorkspaceRegistered(
  registry: WorkspaceRegistry,
  candidate: string,
): string {
  return registry.resolve(candidate).root;
}

export function registerWorkflowTools(
  server: McpServer,
  tools: WorkflowTools,
  workspaceRoot: string,
  /** Live provider — the engine recomposes its config (and registry) on
   *  registry_register; a frozen boot-time instance here was the root cause
   *  of workspace_not_registered right after a successful registration. */
  resolveRegistry: () => WorkspaceRegistry,
): void {
  server.tool(
    "start_workflow",
    "Startet eine Workflow-Session im Workspace",
    {
      workspaceRoot: z.string().optional(),
      workspace: z.string().optional(),
      request: z.string(),
      workflowId: z.string().optional(),
      metadata: z.record(z.unknown()).optional(),
      chain: chainManifest.optional(),
    },
    async (input) =>
      toJson(
        await tools.startWorkflow({
          ...input,
          workspaceRoot: input.workspace
            ? assertWorkspaceRegistered(resolveRegistry(), input.workspace)
            : assertWorkspaceRegistered(
                resolveRegistry(),
                input.workspaceRoot ?? workspaceRoot,
              ),
        }),
      ),
  );
  server.tool(
    "get_current_guidance",
    "Liest Guidance für die aktive Phase (read-only)",
    sessionId,
    async ({ sessionId }) => toJson(await tools.getCurrentGuidance(sessionId)),
  );
  server.tool(
    "submit_understanding",
    "Reicht das Verständnis der Anfrage ein",
    {
      ...sessionId,
      ...requestId,
      summary: z.string(),
      assumptions: z.array(z.string()).optional(),
      acceptanceCriteria: z.array(z.string()).optional(),
    },
    async ({ sessionId, requestId, ...payload }, extra) =>
      toJson(
        await tools.submitUnderstanding(
          sessionId,
          payload,
          requestId,
          transitionContextFrom(extra),
        ),
      ),
  );
  server.tool(
    "submit_plan",
    "Reicht den Implementierungsplan ein",
    { ...sessionId, ...requestId, tasks: z.array(z.record(z.unknown())) },
    async ({ sessionId, requestId, ...payload }, extra) =>
      toJson(
        await tools.submitPlan(
          sessionId,
          payload,
          requestId,
          transitionContextFrom(extra),
        ),
      ),
  );
  server.tool(
    "submit_plan_review",
    "Reicht die Plan-Review-Ergebnisse ein",
    {
      ...sessionId,
      ...requestId,
      findings: z.array(z.record(z.unknown())).optional(),
      approvedPlan: z.record(z.unknown()).optional(),
    },
    async ({ sessionId, requestId, ...payload }, extra) =>
      toJson(
        await tools.submitPlanReview(
          sessionId,
          payload,
          requestId,
          transitionContextFrom(extra),
        ),
      ),
  );
  server.tool(
    "submit_implementation",
    "Reicht Implementierungsnachweise ein",
    {
      ...sessionId,
      ...requestId,
      implementedTasks: z.array(z.string()),
      changedFiles: z.array(z.string()),
    },
    async ({ sessionId, requestId, ...payload }, extra) =>
      toJson(
        await tools.submitImplementation(
          sessionId,
          payload,
          requestId,
          transitionContextFrom(extra),
        ),
      ),
  );
  server.tool(
    "submit_implementation_review",
    "Reicht Implementation-Review-Findings ein",
    {
      ...sessionId,
      ...requestId,
      findings: z.array(z.record(z.unknown())).optional(),
      filesChangedDuringReview: z.array(z.string()).optional(),
    },
    async ({ sessionId, requestId, ...payload }, extra) =>
      toJson(
        await tools.submitImplementationReview(
          sessionId,
          payload,
          requestId,
          transitionContextFrom(extra),
        ),
      ),
  );
  server.tool(
    "submit_verification",
    "Reicht Verifizierungsergebnisse ein",
    { ...sessionId, ...requestId, verificationSummary: z.array(z.string()) },
    async ({ sessionId, requestId, ...payload }, extra) =>
      toJson(
        await tools.submitVerification(
          sessionId,
          payload,
          requestId,
          transitionContextFrom(extra),
        ),
      ),
  );
  server.tool(
    "complete_workflow",
    "Reicht den Abschlussbericht ein und fordert Completion an",
    { ...sessionId, ...requestId, summary: z.string() },
    async ({ sessionId, requestId, summary }, extra) =>
      toJson(
        await tools.completeWorkflow(
          sessionId,
          { summary },
          requestId,
          transitionContextFrom(extra),
        ),
      ),
  );
  server.tool(
    "get_workflow_state",
    "Liest den persistierten Session-Zustand",
    { ...sessionId, includeHistory: z.boolean().optional() },
    async ({ sessionId }) => ({
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(await tools.getWorkflowState(sessionId)),
        },
      ],
    }),
  );
  server.tool(
    "report_blocker",
    "Meldet einen Blocker; Session geht in 'blocked'",
    {
      ...sessionId,
      category: z.string(),
      description: z.string(),
      requiresUserDecision: z.boolean().optional(),
      options: z.array(z.string()).optional(),
    },
    async ({ sessionId, ...rest }) =>
      toJson(await tools.reportBlocker(sessionId, rest)),
  );
  server.tool(
    "resume_workflow",
    "Beendet 'blocked' und kehrt in die vorherige Phase zurück",
    { ...sessionId, decision: z.string(), notes: z.string().optional() },
    async ({ sessionId, decision, notes }) =>
      toJson(await tools.resumeWorkflow(sessionId, { decision, notes })),
  );
  server.tool(
    "cancel_workflow",
    "Bricht die Session graceful ab (FR-057)",
    sessionId,
    async ({ sessionId }) => toJson(await tools.cancelWorkflow(sessionId)),
  );
  // Orchestration tools (FR-046)
  server.tool(
    "get_orchestration_status",
    "Status der Operationen der aktiven Phase",
    sessionId,
    async ({ sessionId }) => ({
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(await tools.getOrchestrationStatus(sessionId)),
        },
      ],
    }),
  );
  server.tool(
    "list_configured_operations",
    "Sichere Liste konfigurierter Operationen",
    {},
    async () => ({
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(tools.listConfiguredOperations()),
        },
      ],
    }),
  );
  server.tool(
    "retry_operation",
    "Wiederholt fehlgeschlagene Pflicht-Operationen der aktuellen Phase",
    sessionId,
    async ({ sessionId }) => toJson(await tools.retryOperation(sessionId)),
  );
  server.tool(
    "run_operation",
    "Führt eine konfigurierte Operation on-demand aus (nur mit invocableByAgent:true); optionale arguments werden für mcpTool-Ops über die konfigurierten Argumente gemergt (Agent-Keys gewinnen; argumentsLocked-Ops lehnen Overrides ab)",
    {
      ...sessionId,
      operationId: z.string().min(1),
      arguments: z.record(z.unknown()).optional(),
    },
    async ({ sessionId, operationId, arguments: argumentOverrides }, extra) =>
      toJson(
        await tools.runOperation(
          sessionId,
          operationId,
          argumentOverrides,
          transitionContextFrom(extra),
        ),
      ),
  );
  server.tool(
    "call_downstream",
    "Transparenter Passthrough zu einem konfigurierten Downstream-Tool (serverId/toolName/args) — durchläuft dieselben Fail-closed-Gates wie Operationen (Allowlist, Wildcard-Rejection, Egress, Capability-Pin, Container-Route-Fallback bei read-only-Timeout). Args werden nicht schema-validiert — Input-Validierung bleibt beim Downstream-Tool.",
    {
      ...sessionId,
      serverId: z.string().min(1),
      toolName: z.string().min(1),
      args: z.record(z.unknown()).default({}),
    },
    async ({ sessionId, serverId, toolName, args }) =>
      toJson(await tools.callDownstream(sessionId, serverId, toolName, args)),
  );
  server.tool(
    "release_capability_pins",
    "Releases stale capability pins IN-PROCESS (hybrid re-pin): after a downstream_capability_changed drift was detected (audited as capability_pin_drift) and the infra event is CONFIRMED (e.g. server upgrade/reindex), this removes the matching pins — the next successful tool call re-pins automatically, no server restart. confirm:true is required (conscious step); the release is audited as capability_pins_reset. Optional serverId/toolName narrow the scope; without filters ALL pins are released.",
    {
      ...sessionId,
      serverId: z.string().min(1).optional(),
      toolName: z.string().min(1).optional(),
      confirm: z.literal(true),
    },
    async ({ sessionId, serverId, toolName, confirm }) =>
      toJson(
        await tools.releaseCapabilityPins(sessionId, {
          ...(serverId ? { serverId } : {}),
          ...(toolName ? { toolName } : {}),
          confirm,
        }),
      ),
  );
  server.tool(
    "get_metrics",
    "Liest Aggregierte Metriken (Operation-Counter, Laufzeiten, Connection-Health)",
    {},
    async () => toJson(await tools.getMetrics()),
  );
  server.tool(
    "get_downstream_status",
    "Gesundheitsstatus der Downstream-Server",
    { sessionId: z.string().optional() },
    async ({ sessionId }) => {
      const report = await tools.getDownstreamStatusReport(sessionId);
      // Backward compatibility: in monolith mode the tool historically
      // returned the flat live-status array — keep that wire contract and
      // only introduce the envelope { mode, live, workspaces } for pools.
      const payload = report.mode === "monolith" ? report.live : report;
      return {
        content: [{ type: "text" as const, text: JSON.stringify(payload) }],
      };
    },
  );
  // specs/015 US1 (FR-1201..1210): flag-gated runtime registration
  // (default ON, opt-out via registryRegister.enabled: false — profile-
  // independent; the engine re-checks, this gate keeps the attack surface
  // off the tool list entirely when opted out).
  if (tools.isRegistryRegisterEnabled()) {
    server.tool(
      "registry_register",
      "Registriert/entfernt eine Workspace-Root zur Laufzeit (specs/015 US1; fail-closed Validierung über WorkspaceRegistry.build)",
      {
        name: z.string().regex(/^[a-z][a-z0-9-]{0,63}$/),
        root: z.string().min(1),
        projectName: z.string().min(1).optional(),
        remove: z.boolean().optional(),
      },
      async ({ name, root, projectName, remove }) =>
        toJson(
          await tools.registerWorkspace({
            name,
            root,
            ...(projectName ? { projectName } : {}),
            ...(remove !== undefined ? { remove } : {}),
          }),
        ),
    );
  }
}

function toJson(result: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
}
