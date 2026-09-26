/**
 * Registriert alle upstream MCP-Tools am SDK-Server (Review Finding 1).
 * Profile-Tools nur bei profile === "spec-kit" (R17).
 * Reihenfolge: Registrierung VOR connect() (SDK-Anforderung).
 */
import { z } from "zod";
import { resolve } from "node:path";
import { GuidanceError } from "../types/errors.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WorkflowTools } from "./ToolHandlers.js";

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
  "get_metrics",
  "get_downstream_status",
] as const;

export const SPEC_KIT_TOOL_NAMES = [
  "discover_spec_kit_feature",
  "import_spec_kit_artifacts",
  "get_spec_kit_status",
  "get_next_task",
  "start_task",
  "submit_task_implementation",
  "submit_task_review",
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
export function assertWorkspaceInside(
  serverRoot: string,
  candidate: string,
): string {
  const resolved = resolve(candidate);
  const root = resolve(serverRoot);
  if (
    resolved !== root &&
    !resolved.startsWith(root + "/") &&
    !resolved.startsWith(root + "\\")
  ) {
    throw new GuidanceError(
      "configuration_invalid",
      `workspaceRoot escapes the configured workspace: ${candidate}`,
      { recoverable: false },
    );
  }
  return resolved;
}

export function registerWorkflowTools(
  server: McpServer,
  tools: WorkflowTools,
  workspaceRoot: string,
): void {
  server.tool(
    "start_workflow",
    "Startet eine Workflow-Session im Workspace",
    {
      workspaceRoot: z.string(),
      request: z.string(),
      workflowId: z.string().optional(),
      metadata: z.record(z.unknown()).optional(),
      chain: chainManifest.optional(),
    },
    async (input) =>
      toJson(
        await tools.startWorkflow({
          ...input,
          workspaceRoot: assertWorkspaceInside(
            workspaceRoot,
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
    async ({ sessionId, requestId, ...payload }) =>
      toJson(await tools.submitUnderstanding(sessionId, payload, requestId)),
  );
  server.tool(
    "submit_plan",
    "Reicht den Implementierungsplan ein",
    { ...sessionId, ...requestId, tasks: z.array(z.record(z.unknown())) },
    async ({ sessionId, requestId, ...payload }) =>
      toJson(await tools.submitPlan(sessionId, payload, requestId)),
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
    async ({ sessionId, requestId, ...payload }) =>
      toJson(await tools.submitPlanReview(sessionId, payload, requestId)),
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
    async ({ sessionId, requestId, ...payload }) =>
      toJson(await tools.submitImplementation(sessionId, payload, requestId)),
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
    async ({ sessionId, requestId, ...payload }) =>
      toJson(
        await tools.submitImplementationReview(sessionId, payload, requestId),
      ),
  );
  server.tool(
    "submit_verification",
    "Reicht Verifizierungsergebnisse ein",
    { ...sessionId, ...requestId, verificationSummary: z.array(z.string()) },
    async ({ sessionId, requestId, ...payload }) =>
      toJson(await tools.submitVerification(sessionId, payload, requestId)),
  );
  server.tool(
    "complete_workflow",
    "Reicht den Abschlussbericht ein und fordert Completion an",
    { ...sessionId, ...requestId, summary: z.string() },
    async ({ sessionId, requestId, summary }) =>
      toJson(await tools.completeWorkflow(sessionId, { summary }, requestId)),
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
    "Führt eine konfigurierte Operation on-demand aus (nur mit invocableByAgent:true)",
    { ...sessionId, operationId: z.string().min(1) },
    async ({ sessionId, operationId }) =>
      toJson(await tools.runOperation(sessionId, operationId)),
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
    {},
    async () => ({
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(await tools.getDownstreamStatus()),
        },
      ],
    }),
  );
}

function toJson(result: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
}
