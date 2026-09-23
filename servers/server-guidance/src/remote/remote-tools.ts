/**
 * FR-100..104: Remote-Mode-Tool-Registrierung. Alle Workflow-Tools werden
 * sessiongebunden registriert (Engine je Session via RemoteSessionManager);
 * neu: init_session (Config-Upload) und report_operation_result (FR-104).
 */
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { RemoteSessionManager, RemoteSession } from "./remote-session-manager.js";

function toJson(result: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
}

const sessionId = { sessionId: z.string().min(1) };
const requestId = { requestId: z.string().min(1).optional() };

/** FR-104: awaiting_client-Responses in client_operations_pending umformen. */
function reshapeRemote(result: Record<string, unknown>): Record<string, unknown> {
  const err = result.error as { code?: string } | undefined;
  const ops = result.operations as { status?: string; id?: string }[] | undefined;
  if (err?.code === "required_hook_failed" && Array.isArray(ops)) {
    const pending = ops.filter((o) => o.status === "input_required");
    if (pending.length > 0) {
      return {
        ...result,
        code: "client_operations_pending",
        pendingOperations: pending.map((o) => ({ operationId: o.id, status: "awaiting_client_execution" })),
      };
    }
  }
  return result;
}

export function registerRemoteTools(server: McpServer, manager: RemoteSessionManager): void {
  const engineOf = (session: RemoteSession) => session.composition.engine;
  const toolsOf = (session: RemoteSession) => session.composition.tools;

  server.tool(
    "init_session",
    "FR-102: Laedt die lokale .guidance-Konfiguration eines Repos hoch und erzeugt eine isolierte Session",
    {
      key: z.string().min(1).optional(),
      config: z.custom<Record<string, unknown>>((v) => typeof v === "object" && v !== null),
      configFiles: z.custom<Record<string, string>>((v) => typeof v === "object" && v !== null).optional(),
      requestId: z.string().min(1).optional(),
    },
    async ({ key, config, configFiles }) => {
      try {
        const session = manager.initSession({ key, config, configFiles });
        return toJson({
          sessionId: session.meta.sessionId,
          configVersion: session.meta.configVersion,
          key: session.meta.key,
          workflow: { id: session.composition.config.main.workflow?.file ?? "workflow.json" },
        });
      } catch (err) {
        return toJson({ isError: true, code: "configuration_invalid", message: String((err as Error).message ?? err) });
      }
    },
  );

  server.tool(
    "list_sessions",
    "FR-103: Listet die Remote-Sessions dieses Servers (Meta, ohne Inhalt)",
    {},
    async () => toJson({ sessions: manager.listSessions() }),
  );

  server.tool(
    "report_operation_result",
    "FR-104: Meldet das Ergebnis einer client-seitig ausgefuehrten Operation; vollzieht die Transition automatisch, wenn alle Required-Ops erfolgreich sind",
    {
      ...sessionId,
      operationId: z.string().min(1),
      status: z.enum(["succeeded", "failed", "timed_out", "cancelled"]),
      exitCode: z.number().optional(),
      summary: z.string(),
      logs: z.string().optional(),
    },
    async ({ sessionId: sid, operationId, status, exitCode, summary, logs }) => {
      const session = manager.resolve(sid);
      session.ledger.record({
        operationId, status, exitCode, summary, logs,
        reportedAt: new Date().toISOString(),
      }); // requestId: im v1 Ledger über operationId je Transition addressiert
      // FR-104.3: letzten blockierten Submit automatisch wiederholen.
      const attempt = session.lastAttempt;
      if (attempt) {
        const engine = engineOf(session);
        const result = (await engine.submit(attempt.sessionId, attempt.phase, attempt.payload as never, attempt.requestId)) as unknown as Record<string, unknown>;
        return toJson(reshapeRemote(result));
      }
      return toJson({ recorded: true, pendingOperations: [] });
    },
  );

  server.tool(
    "start_workflow",
    "Startet eine Workflow-Session in der init_session-Konfiguration",
    { ...sessionId, request: z.string(), metadata: z.record(z.unknown()).optional() },
    async ({ sessionId: sid, request, metadata }) => {
      const session = manager.resolve(sid);
      const result = (await toolsOf(session).startWorkflow({ workspaceRoot: "/remote", request, metadata })) as unknown as Record<string, unknown>;
      // Workflow-Session-Id dem Binding/Mapping zuordnen (FR-103.1).
      if (result.accepted === true) {
        manager.registerWorkflowSession(sid, result.sessionId as string);
        session.workflowSid = result.sessionId as string;
      }
      return toJson(result);
    },
  );

  server.tool(
    "get_current_guidance",
    "Liest Guidance fuer die aktive Phase (read-only)",
    sessionId,
    async ({ sessionId: sid }) => {
      try {
        return toJson(await toolsOf(manager.resolve(sid)).getCurrentGuidance(sid));
      } catch (err) {
        console.error("[guidance][dbg] gcg:", (err as Error).message);
        return toJson({ isError: true, code: "session_not_found", message: (err as Error).message });
      }
    },
  );

  server.tool(
    "submit_understanding",
    "Reicht das Verstaendnis der Anfrage ein",
    { ...sessionId, ...requestId, summary: z.string(), assumptions: z.array(z.string()).optional(), acceptanceCriteria: z.array(z.string()).optional() },
    async ({ sessionId: sid, requestId: reqId, ...payload }) => {
      const session = manager.resolve(sid);
      const result = (await toolsOf(session).submitUnderstanding(sid, payload, reqId)) as unknown as Record<string, unknown>;
      if (result.accepted === true) session.lastAttempt = { sessionId: session.workflowSid ?? sid, phase: "plan", payload: {}, requestId: reqId };
      return toJson(reshapeRemote(result));
    },
  );

  server.tool(
    "submit_plan",
    "Reicht den Implementierungsplan ein",
    { ...sessionId, ...requestId, tasks: z.array(z.record(z.unknown())) },
    async ({ sessionId: sid, requestId: reqId, tasks }) => {
      const session = manager.resolve(sid);
      const result = (await toolsOf(session).submitPlan(sid, { tasks }, reqId)) as unknown as Record<string, unknown>;
      if (result.accepted === true) session.lastAttempt = { sessionId: session.workflowSid ?? sid, phase: "review_plan", payload: { summary: "plan submitted" }, requestId: reqId };
      return toJson(reshapeRemote(result));
    },
  );

  server.tool(
    "submit_plan_review",
    "Reicht die Plan-Review-Ergebnisse ein",
    { ...sessionId, ...requestId, findings: z.array(z.record(z.unknown())).optional(), approvedPlan: z.record(z.unknown()).optional() },
    async ({ sessionId: sid, requestId: reqId, ...payload }) => {
      const session = manager.resolve(sid);
      const result = (await toolsOf(session).submitPlanReview(sid, payload, reqId)) as unknown as Record<string, unknown>;
      if (result.accepted === true) session.lastAttempt = { sessionId: session.workflowSid ?? sid, phase: "implement", payload: { summary: "plan approved" }, requestId: reqId };
      return toJson(reshapeRemote(result));
    },
  );

  server.tool(
    "submit_implementation",
    "Reicht Implementierungsnachweise ein",
    { ...sessionId, ...requestId, implementedTasks: z.array(z.string()), changedFiles: z.array(z.string()) },
    async ({ sessionId: sid, requestId: reqId, ...payload }) => {
      const session = manager.resolve(sid);
      const result = (await toolsOf(session).submitImplementation(sid, payload, reqId)) as unknown as Record<string, unknown>;
      if (result.accepted === true) session.lastAttempt = { sessionId: session.workflowSid ?? sid, phase: "review_implementation", payload: { summary: "implementation submitted" }, requestId: reqId };
      return toJson(reshapeRemote(result));
    },
  );

  server.tool(
    "submit_implementation_review",
    "Reicht Implementation-Review-Findings ein",
    { ...sessionId, ...requestId, findings: z.array(z.record(z.unknown())).optional(), filesChangedDuringReview: z.array(z.string()).optional() },
    async ({ sessionId: sid, requestId: reqId, ...payload }) => {
      const session = manager.resolve(sid);
      const result = (await toolsOf(session).submitImplementationReview(sid, payload, reqId)) as unknown as Record<string, unknown>;
      if (result.accepted === true) session.lastAttempt = { sessionId: session.workflowSid ?? sid, phase: "verify", payload: { summary: "review done" }, requestId: reqId };
      return toJson(reshapeRemote(result));
    },
  );

  server.tool(
    "submit_verification",
    "Reicht Verifizierungsergebnisse ein; loest die Client-Gates (verify beforeExit) aus",
    { ...sessionId, ...requestId, verificationSummary: z.array(z.string()) },
    async ({ sessionId: sid, requestId: reqId, verificationSummary }) => {
      const session = manager.resolve(sid);
      const result = (await toolsOf(session).submitVerification(sid, { verificationSummary }, reqId)) as unknown as Record<string, unknown>;
      session.lastAttempt = { sessionId: session.workflowSid ?? sid, phase: "verify", payload: { verificationSummary }, requestId: reqId };
      return toJson(reshapeRemote(result));
    },
  );

  server.tool(
    "complete_workflow",
    "Reicht den Abschlussbericht ein und fordert Completion an",
    { ...sessionId, ...requestId, summary: z.string() },
    async ({ sessionId: sid, requestId: reqId, summary }) =>
      toJson(await toolsOf(manager.resolve(sid)).completeWorkflow(sid, { summary }, reqId)),
  );

  server.tool(
    "get_workflow_state",
    "Liest den persistierten Session-Zustand",
    { ...sessionId, includeHistory: z.boolean().optional() },
    async ({ sessionId: sid }) => toJson(await toolsOf(manager.resolve(sid)).getWorkflowState(sid)),
  );

  server.tool(
    "report_blocker",
    "Meldet einen Blocker; Session geht in 'blocked'",
    { ...sessionId, category: z.string(), description: z.string(), requiresUserDecision: z.boolean().optional(), options: z.array(z.string()).optional() },
    async ({ sessionId: sid, ...rest }) => toJson(await toolsOf(manager.resolve(sid)).reportBlocker(sid, rest)),
  );

  server.tool(
    "resume_workflow",
    "Beendet 'blocked' und kehrt in die vorherige Phase zurueck",
    { ...sessionId, decision: z.string(), notes: z.string().optional() },
    async ({ sessionId: sid, decision, notes }) => toJson(await toolsOf(manager.resolve(sid)).resumeWorkflow(sid, { decision, notes })),
  );

  server.tool(
    "cancel_workflow",
    "Bricht die Session graceful ab (FR-057)",
    sessionId,
    async ({ sessionId: sid }) => toJson(await toolsOf(manager.resolve(sid)).cancelWorkflow(sid)),
  );

  server.tool(
    "get_orchestration_status",
    "Status der Operationen der aktiven Phase",
    sessionId,
    async ({ sessionId: sid }) => toJson(await toolsOf(manager.resolve(sid)).getOrchestrationStatus(sid)),
  );

  server.tool(
    "list_configured_operations",
    "Sichere Liste konfigurierter Operationen der Session",
    sessionId,
    async ({ sessionId: sid }) => { manager.resolve(sid); return toJson(toolsOf(manager.resolve(sid)).listConfiguredOperations()); },
  );

  server.tool(
    "retry_operation",
    "Wiederholt fehlgeschlagene Pflicht-Operationen der aktuellen Phase",
    sessionId,
    async ({ sessionId: sid }) => toJson(await toolsOf(manager.resolve(sid)).retryOperation(sid)),
  );

  server.tool(
    "get_downstream_status",
    "Gesundheitsstatus der Downstream-Server der Session",
    sessionId,
    async ({ sessionId: sid }) => { manager.resolve(sid); return toJson(await toolsOf(manager.resolve(sid)).getDownstreamStatus()); },
  );
}
