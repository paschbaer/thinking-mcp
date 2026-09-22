/**
 * Authoritative workflow state machine (FR-001–005, FR-019, FR-022, FR-028).
 * Phase guidance and transitions come exclusively from configuration.
 */
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { GuidanceError } from "../types/errors.js";
import type {
  LoadedConfig,
} from "../config.js";
import type {
  OperationConfig,
  PhaseInstruction,
  WorkflowDefinition,
  WorkflowSession,
} from "../types/index.js";
import { SessionRepository } from "../state/SessionRepository.js";
import { AuditRepository } from "../state/SessionRepository.js";
import { createValidator, type SchemaValidator } from "./schema-validator.js";
import { OperationEngine, type OperationContext } from "../orchestration/OperationEngine.js";
import { ClientManager } from "../mcp-client/ClientManager.js";
import { PolicyEngine } from "../policy/PolicyEngine.js";

export interface StartResult {
  accepted: true;
  sessionId: string;
  workflowId: string;
  currentPhase: string;
  status: string;
  guidance: PhaseInstruction;
  operations: { id: string; status: string; summary: string }[];
}

export interface SubmitResult {
  accepted: boolean;
  sessionId: string;
  previousPhase?: string;
  currentPhase: string;
  status: string;
  guidance?: PhaseInstruction;
  operations?: { id: string; status: string; summary: string }[];
  error?: { code: string; message: string; recoverable: boolean };
}

export interface EngineDeps {
  config: LoadedConfig;
  stateDir: string;
  operationEngine?: OperationEngine;
}

interface ResponsesFile {
  responses: Record<string, PhaseInstruction>;
}

interface OperationsFile {
  operations: Record<string, OperationConfig>;
}

export class WorkflowEngine {
  readonly sessions: SessionRepository;
  readonly audit: AuditRepository;
  readonly operationEngine: OperationEngine;
  private readonly definition: WorkflowDefinition;
  private readonly instructions: Record<string, PhaseInstruction>;
  private readonly operations: Record<string, OperationConfig>;
  private readonly config: LoadedConfig;
  private readonly validators = new Map<string, SchemaValidator>();

  constructor(deps: EngineDeps) {
    this.config = deps.config;
    this.sessions = new SessionRepository(join(deps.stateDir, "sessions"));
    this.archiveDir = join(deps.stateDir, "archive");
    this.audit = new AuditRepository(join(deps.stateDir, "history"));
    this.operationEngine = deps.operationEngine ?? new OperationEngine();
    const file = this.config.workflow as unknown as {
      version: number;
      workflow: { id: string; profile?: string; initialPhase: string; terminalStates?: string[] };
      phases: WorkflowDefinition["phases"];
    };
    this.definition = {
      workflowId: file.workflow.id,
      profile: this.config.profile,
      initialPhase: file.workflow.initialPhase,
      terminalStates: file.workflow.terminalStates ?? ["completed", "cancelled"],
      phases: file.phases,
    };
    const responses = (this.config.responses as unknown as ResponsesFile | undefined)?.responses ?? {};
    this.instructions = responses;
    const opsRaw = (this.config.operations as unknown as OperationsFile | undefined)?.operations ?? {};
    this.operations = Object.fromEntries(
      Object.entries(opsRaw).map(([id, cfg]) => [id, { ...cfg, operationId: id }]),
    );
    const downstream = this.config.downstreamServers as {
      servers?: Record<string, { enabled?: boolean; required?: boolean; trustLevel?: string; transport?: { type: string; command?: { executable: string; args: string[]; cwd?: string } }; capabilities?: { allow?: { tools?: string[] } } }>;
    } | undefined;
    const servers = downstream?.servers ?? {};
    const enabled = Object.entries(servers).filter(([, v]) => v.enabled !== false);
    if (enabled.length > 0) {
      this.clientManager = new ClientManager({ requiredServers: enabled.filter(([, v]) => v.required).map(([id]) => id) });
      this.allowlists = new Map(
        enabled.map(([id, v]) => [id, v.capabilities?.allow?.tools ?? []]),
      );
      // An externally provided OperationEngine keeps its own invoker (test seam).
      if (!deps.operationEngine) this.operationEngine.setDownstreamInvoker({
        invokeTool: async (serverId, toolName, args) => {
          const allow = this.allowlists?.get(serverId) ?? [];
          this.clientManager!.assertAllowed(serverId, toolName, allow);
          const serverCfgE = servers[serverId];
          const opForEgress = Object.values(this.operations).find((o) => o.server === serverId && o.capability === toolName);
          this.policyEngine.evaluateEgress({
            serverId,
            trustLevel: (serverCfgE?.trustLevel as never) ?? "trusted",
            riskClass: opForEgress?.riskClass,
            args,
            approved: opForEgress?.approved === true,
          });
          const serverCfg = servers[serverId];
          const status = await this.clientManager!.ensureReady(serverId, serverCfg ? { executable: serverCfg.transport?.command?.executable ?? "", args: serverCfg.transport?.command?.args ?? [], cwd: serverCfg.transport?.command?.cwd } : undefined);
          const tool = status.tools.find((t) => t.name === toolName);
          const pinnedHash = this.pinnedHashes.get(`${serverId}:${toolName}`);
          if (pinnedHash && tool && tool.inputSchemaHash !== pinnedHash) {
            this.clientManager!.assertNotDrifted(serverId, toolName, pinnedHash);
          }
          if (tool) this.pinnedHashes.set(`${serverId}:${toolName}`, tool.inputSchemaHash);
          return await this.clientManager!.invokeTool(serverId, toolName, args);
        },
      });
    }
  }

  private clientManager?: ClientManager;
  private allowlists?: Map<string, string[]>;
  private pinnedHashes = new Map<string, string>();
  private readonly policyEngine = new PolicyEngine();
  private readonly archiveDir: string;

  /** Persists downstream op/server state into the session (FR-044). */
  recordDownstreamState(sessionId: string, opId: string, status: string, summary: string): void {
    if (!this.sessions.exists(sessionId)) return;
    this.sessions.update(sessionId, (s) => {
      s.downstream.operations[opId] = {
        latestExecutionId: `operation-${Date.now()}`,
        status: status as never,
        attempts: (s.downstream.operations[opId]?.attempts ?? 0) + 1,
        ...(summary ? { summary } : {}),
      } as never;
    });
  }

  async getWorkflowState(sessionId: string): Promise<WorkflowSession> {
    return await this.sessions.withLock(sessionId, () => {
      const session = this.reconcileRunningOperations(this.sessions.load(sessionId));
      return session;
    });
  }

  getOrchestrationStatus(sessionId: string): { sessionId: string; currentPhase: string; operations: { id: string; status?: string; required?: boolean; summary?: string }[] } {
    const s = this.sessions.load(sessionId);
    const phaseDef = this.definition.phases[s.currentPhase];
    const ids = [...(phaseDef?.lifecycle?.beforeExit ?? []), ...(phaseDef?.lifecycle?.afterEnter ?? [])];
    return {
      sessionId,
      currentPhase: s.currentPhase,
      operations: ids.map((id) => ({
        id,
        status: s.downstream.operations[id]?.status ?? "pending",
        required: this.operations[id]?.required,
        summary: (s.downstream.operations[id] as unknown as { summary?: string } | undefined)?.summary,
      })),
    };
  }

  listConfiguredOperations(): { id: string; description?: string; type: string; required: boolean }[] {
    return Object.values(this.operations).map((o) => ({
      id: o.operationId,
      description: o.description,
      type: o.type,
      required: o.required,
    }));
  }

  async getDownstreamStatus(): Promise<{ id: string; status?: string; required?: boolean; lastSuccessfulRequestAt?: string }[]> {
    if (!this.clientManager) return [];
    const out: { id: string; status?: string; required?: boolean; lastSuccessfulRequestAt?: string }[] = [];
    for (const id of this.allowlists?.keys() ?? []) {
      const st = this.clientManager.statusOf(id);
      out.push({ id, status: st?.status ?? "disconnected", required: st?.required, lastSuccessfulRequestAt: st?.lastSuccessfulRequestAt });
    }
    return out;
  }

  async startWorkflow(input: { workspaceRoot: string; request: string; workflowId?: string; metadata?: Record<string, unknown> }): Promise<StartResult> {
    const sessionId = `session-${randomUUID()}`;
    const now = new Date().toISOString();
    const session: WorkflowSession = {
      sessionId,
      workflowId: input.workflowId ?? this.definition.workflowId,
      profile: this.config.profile,
      configurationVersion: this.config.configVersion,
      configDir: this.config.configDir,
      workspaceRoot: input.workspaceRoot,
      status: "active",
      currentPhase: this.definition.initialPhase,
      previousPhase: null,
      request: input.request,
      submissions: {},
      blockers: [],
      requestIds: {},
      downstream: { servers: {}, operations: {} },
      createdAt: now,
      updatedAt: now,
      completedAt: null,
    };
    this.sessions.save(session);
    this.audit.append({ sessionId, eventType: "session_started", data: { workflowId: session.workflowId } });
    this.audit.append({ sessionId, eventType: "phase_entered", phase: session.currentPhase, data: {} });
    const operations = await this.runAfterEnter(session, session.currentPhase);
    const requiredFailed = operations.length > 0 && operations.some((o) => o.status !== "succeeded") &&
      (this.definition.phases[session.currentPhase]?.lifecycle?.afterEnter ?? []).some((id) => this.operations[id]?.required);
    if (requiredFailed) {
      // FR-040: a required afterEnter failure blocks the session at start.
      this.sessions.update(sessionId, (s) => {
        s.status = "blocked";
        s.previousPhase = s.currentPhase;
        s.blockers.push({
          blockerId: `blocker-${randomUUID()}`,
          category: "required_operation_failed",
          description: "a required afterEnter operation failed at session start",
          requiresUserDecision: false,
        });
      });
      this.audit.append({ sessionId, eventType: "hook_failed", phase: session.currentPhase, data: { blocked: true } });
    }
    return {
      accepted: true,
      sessionId,
      workflowId: session.workflowId,
      currentPhase: session.currentPhase,
      status: session.status,
      guidance: this.guidanceFor(session),
      operations,
    };
  }

  /** Runs afterEnter operations for a phase; required failures are audited (FR-040). */
  private async runAfterEnter(session: WorkflowSession, phase: string): Promise<{ id: string; status: string; summary: string }[]> {
    const ids = this.definition.phases[phase]?.lifecycle?.afterEnter ?? [];
    const out: { id: string; status: string; summary: string }[] = [];
    for (const id of ids) {
      const op = this.operations[id];
      if (!op) throw new GuidanceError("operation_not_configured", `operation ${id} is not configured`, { recoverable: false });
      const run = await this.operationEngine.executeRequired([op], { workspaceRoot: session.workspaceRoot });
      for (const r of run.results) {
        out.push({ id: r.operationId, status: r.status, summary: r.summary });
        if (op.required && r.status !== "succeeded") {
          this.audit.append({ sessionId: session.sessionId, eventType: "hook_failed", phase, data: { operationId: id } });
        }
      }
    }
    return out;
  }

  getSession(sessionId: string): WorkflowSession {
    // Pure read — running-op reconciliation happens under the session lock
    // via getWorkflowState (write-on-read outside the lock caused a
    // lost-update window, review Phase 10-12 Finding 1).
    return this.sessions.load(sessionId);
  }

  /**
   * FR-043 crash recovery: operations recorded as `running` at load time were
   * interrupted — reconcile them to `unknown` (state-changing ops block rather
   * than re-run). Read-only/idempotent ops may be retried by policy later.
   */
  private reconcileRunningOperations(session: WorkflowSession): WorkflowSession {
    let changed = false;
    for (const [opId, entry] of Object.entries(session.downstream.operations)) {
      if (entry.status === ("running" as never)) {
        session.downstream.operations[opId] = { ...entry, status: "unknown" as never };
        changed = true;
      }
    }
    if (changed) this.sessions.save(session);
    return session;
  }

  /** FR-029: archive/delete finished sessions older than the retention period. */
  pruneFinishedSessions(maxAgeDays: number, mode: "archive" | "delete" = "archive"): number {
    const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
    let pruned = 0;
    for (const id of this.sessions.list()) {
      const s = this.sessions.load(id);
      if (s.status !== "completed" && s.status !== "cancelled") continue;
      const ref = s.completedAt ?? s.updatedAt;
      if (new Date(ref).getTime() < cutoff) {
        const target = join(this.archiveDir, `${id}.json`);
        mkdirSync(this.archiveDir, { recursive: true });
        if (mode === "archive") {
          writeFileSync(target, JSON.stringify(s, null, 2));
        }
        this.sessions.remove(id);
        this.audit.append({ sessionId: id, eventType: mode === "archive" ? "session_archived" : "session_deleted", data: { retentionDays: maxAgeDays } });
        pruned += 1;
      }
    }
    return pruned;
  }

  submit(sessionId: string, phase: string, payload: Record<string, unknown>, requestId?: string): Promise<SubmitResult> {
    return this.sessions.withLock(sessionId, () => this.submitLocked(sessionId, phase, payload, requestId));
  }

  private async submitLocked(sessionId: string, phase: string, payload: Record<string, unknown>, requestId?: string): Promise<SubmitResult> {
    const session = this.getSession(sessionId);

    if (requestId && session.requestIds[requestId] !== undefined) {
      return session.requestIds[requestId] as SubmitResult;
    }

    const fail = (code: import("../types/errors.js").ErrorCode, message: string): SubmitResult => {
      this.audit.append({ sessionId, eventType: "submission_rejected", phase, data: { code } });
      const err = new GuidanceError(code, message, {
        recoverable: code !== "workflow_already_completed",
        currentPhase: session.currentPhase,
        workflowStatus: session.status,
      });
      return { ...err.toResponse(), sessionId, currentPhase: err.currentPhase ?? session.currentPhase, status: session.status };
    };

    if (session.status === "blocked") {
      return fail("workflow_blocked", "the session is blocked; use resume_workflow");
    }
    if (session.status !== "active") {
      return fail("workflow_already_completed", `session is ${session.status}`);
    }
    if (session.currentPhase !== phase) {
      return fail("invalid_active_phase", `expected ${session.currentPhase}, got ${phase}`);
    }

    const phaseDef = this.definition.phases[session.currentPhase];
    if (phaseDef?.submissionSchema) {
      const validator = this.validatorFor(phaseDef.submissionSchema);
      const result = validator.validate(payload);
      if (!result.valid) {
        return fail("submission_invalid", result.errors.join("; "));
      }
    }

    // Persist submission (FR-019) and audit.
    session.submissions[phase] = { phaseId: phase, payload, acceptedAt: new Date().toISOString(), schemaRef: phaseDef?.submissionSchema ?? "inline" };
    this.audit.append({ sessionId, eventType: "submission_received", phase, data: {} });

    // Required beforeExit operations gate the transition (FR-005/FR-040).
    const ops = (phaseDef?.lifecycle?.beforeExit ?? []).map((id) => {
      const op = this.operations[id];
      if (!op) throw new GuidanceError("operation_not_configured", `operation ${id} is not configured`, { recoverable: false });
      return op;
    });
    let opResults: { id: string; status: string; summary: string }[] = [];
    let opsSucceeded = true;
    if (ops.length > 0) {
      const ctx: OperationContext = { workspaceRoot: session.workspaceRoot };
      for (const op of ops) {
        this.recordDownstreamState(sessionId, op.operationId, "running", "");
      }
      const run = await this.operationEngine.executeRequired(ops, ctx);
      opsSucceeded = run.allSucceeded;
      opResults = run.results.map((r) => ({ id: r.operationId, status: r.status, summary: r.summary }));
      for (const r of run.results) {
        this.recordDownstreamState(sessionId, r.operationId, r.status, r.summary);
      }
    }

    // Transition selection: success path ignores reason-only alternatives.
    const target = this.selectTransition(phaseDef?.transitions ?? [], opsSucceeded, opsSucceeded ? undefined : "verification_failed");
    if (!target) {
      this.audit.append({ sessionId, eventType: "transition_rejected", phase, data: { opsSucceeded } });
      const err = new GuidanceError("required_hook_failed", "required lifecycle operations failed; remaining in phase", {
        recoverable: true,
        currentPhase: session.currentPhase,
        workflowStatus: session.status,
      });
      return { ...err.toResponse(), sessionId, status: session.status, operations: opResults } as SubmitResult;
    }

    const previousPhase = session.currentPhase;
    this.audit.append({ sessionId, eventType: "phase_exited", phase: previousPhase, data: {} });
    session.previousPhase = previousPhase;
    session.currentPhase = target;
    this.audit.append({ sessionId, eventType: "transition_accepted", phase: target, data: { from: previousPhase } });
    this.audit.append({ sessionId, eventType: "phase_entered", phase: target, data: {} });

    opResults.push(...(await this.runAfterEnter(session, target)));
    const result: SubmitResult = {
      accepted: true,
      sessionId,
      previousPhase,
      currentPhase: target,
      status: session.status,
      guidance: this.guidanceFor(session, target),
      operations: opResults,
    };
    this.sessions.update(sessionId, (s) => {
      s.currentPhase = target;
      s.previousPhase = previousPhase;
      s.submissions[phase] = session.submissions[phase]!;
      if (requestId) s.requestIds[requestId] = result;
    });
    return result;
  }

  completeWorkflow(sessionId: string, report: Record<string, unknown>, requestId?: string): Promise<SubmitResult> {
    return this.sessions.withLock(sessionId, () => this.completeWorkflowLocked(sessionId, report, requestId));
  }

  private async completeWorkflowLocked(sessionId: string, report: Record<string, unknown>, requestId?: string): Promise<SubmitResult> {
    const session = this.getSession(sessionId);
    if (requestId && session.requestIds[requestId] !== undefined) {
      return session.requestIds[requestId] as SubmitResult;
    }
    if (session.status === "completed") {
      const err = new GuidanceError("workflow_already_completed", "session is already completed", { recoverable: false });
      return { ...err.toResponse(), sessionId, currentPhase: err.currentPhase ?? session.currentPhase, status: session.status };
    }
    if (session.status === "blocked") {
      const err = new GuidanceError("workflow_blocked", "the session is blocked; use resume_workflow", { recoverable: true });
      return { ...err.toResponse(), sessionId, currentPhase: err.currentPhase ?? session.currentPhase, status: session.status };
    }
    if (session.currentPhase !== "complete") {
      const err = new GuidanceError("invalid_active_phase", `completion requires phase 'complete' (active: ${session.currentPhase})`, {
        recoverable: true,
        currentPhase: session.currentPhase,
        workflowStatus: session.status,
      });
      return { ...err.toResponse(), sessionId, currentPhase: err.currentPhase ?? session.currentPhase, status: session.status };
    }
    const phaseDef = this.definition.phases["complete"];
    const schema = phaseDef?.submissionSchema;
    if (schema) {
      const result = this.validatorFor(schema).validate(report);
      if (!result.valid) {
        const err = new GuidanceError("submission_invalid", result.errors.join("; "), { recoverable: true, currentPhase: "complete" });
        return { ...err.toResponse(), sessionId, currentPhase: err.currentPhase ?? "complete", status: session.status };
      }
    }

    const ops = (phaseDef?.lifecycle?.beforeExit ?? []).map((id) => {
      const op = this.operations[id];
      if (!op) throw new GuidanceError("operation_not_configured", `operation ${id} is not configured`, { recoverable: false });
      return op;
    });
    const run = await this.operationEngine.executeRequired(ops, { workspaceRoot: session.workspaceRoot });
    const opResults = run.results.map((r) => ({ id: r.operationId, status: r.status, summary: r.summary }));

    if (!run.allSucceeded) {
      this.audit.append({ sessionId, eventType: "hook_failed", phase: "complete", data: { results: opResults } });
      const err = new GuidanceError("required_hook_failed", "mandatory completion operations failed; the workflow cannot complete", {
        recoverable: true,
        currentPhase: "complete",
        workflowStatus: "active",
        allowedActions: ["retry_operation", "get_workflow_state", "report_blocker"],
      });
      return {
        ...err.toResponse(),
        sessionId,
        currentPhase: "complete",
        status: session.status,
        operations: opResults,
      } as SubmitResult;
    }

    const now = new Date().toISOString();
    const successResult: SubmitResult = {
      accepted: true,
      sessionId,
      currentPhase: "completed",
      status: "completed",
      operations: opResults,
    };
    this.sessions.update(sessionId, (s) => {
      s.status = "completed";
      s.currentPhase = "completed";
      s.completedAt = now;
      if (requestId) s.requestIds[requestId] = successResult;
    });
    this.audit.append({ sessionId, eventType: "workflow_completed", phase: "completed", data: { operations: opResults } });
    return successResult;
  }

  /** Re-runs the current phase's required beforeExit operations (FR-040 retry). */
  async retryOperations(sessionId: string): Promise<SubmitResult> {
    return this.sessions.withLock(sessionId, async () => {
      const session = this.getSession(sessionId);
      if (session.status !== "active") {
        const err = new GuidanceError("workflow_blocked", `session is ${session.status}`, { recoverable: false });
        return { ...err.toResponse(), sessionId, status: session.status } as SubmitResult;
      }
      const phaseDef = this.definition.phases[session.currentPhase];
      const ops = (phaseDef?.lifecycle?.beforeExit ?? []).map((id) => {
        const op = this.operations[id];
        if (!op) throw new GuidanceError("operation_not_configured", `operation ${id} is not configured`, { recoverable: false });
        return op;
      });
      const run = await this.operationEngine.executeRequired(ops, { workspaceRoot: session.workspaceRoot });
      const opResults = run.results.map((r) => ({ id: r.operationId, status: r.status, summary: r.summary }));
      if (!run.allSucceeded) {
        const err = new GuidanceError("required_hook_failed", "retry still failing", { recoverable: true, currentPhase: session.currentPhase, workflowStatus: session.status });
        return { ...err.toResponse(), sessionId, operations: opResults } as SubmitResult;
      }
      const target = this.selectTransition(phaseDef?.transitions ?? [], true);
      if (target) {
        const previousPhase = session.currentPhase;
        this.sessions.update(sessionId, (s) => {
          s.currentPhase = target;
          s.previousPhase = previousPhase;
        });
        this.audit.append({ sessionId, eventType: "operation_retried", phase: target, data: { retried: true } });
        return { accepted: true, sessionId, previousPhase, currentPhase: target, status: session.status, operations: opResults };
      }
      return { accepted: true, sessionId, currentPhase: session.currentPhase, status: session.status, operations: opResults };
    });
  }

  reportBlocker(sessionId: string, input: { category: string; description: string; requiresUserDecision?: boolean; options?: string[] }): Promise<SubmitResult> {
    return this.sessions.withLock(sessionId, () => {
      const session = this.getSession(sessionId);
      if (session.status !== "active") {
        const err = new GuidanceError("workflow_blocked", `session is ${session.status}`, { recoverable: false });
        return { ...err.toResponse(), sessionId, currentPhase: err.currentPhase ?? session.currentPhase, status: session.status };
      }
      const blockerId = `blocker-${randomUUID()}`;
      this.sessions.update(sessionId, (s) => {
        s.status = "blocked";
        s.previousPhase = s.currentPhase;
        s.blockers.push({
          blockerId,
          category: input.category,
          description: input.description,
          requiresUserDecision: input.requiresUserDecision ?? false,
          options: input.options,
        });
      });
      this.audit.append({ sessionId, eventType: "blocker_reported", phase: session.currentPhase, data: { blockerId } });
      return { accepted: true, sessionId, currentPhase: session.currentPhase, status: "blocked" };
    });
  }

  resumeWorkflow(sessionId: string, input: { decision: string; notes?: string }): Promise<SubmitResult> {
    return this.sessions.withLock(sessionId, () => {
      const session = this.getSession(sessionId);
      if (session.status !== "blocked") {
        const err = new GuidanceError("workflow_blocked", `session is not blocked (status: ${session.status})`, { recoverable: false });
        return { ...err.toResponse(), sessionId, currentPhase: err.currentPhase ?? session.currentPhase, status: session.status };
      }
      const target = session.previousPhase ?? session.currentPhase;
      this.sessions.update(sessionId, (s) => {
        s.status = "active";
        s.currentPhase = target;
        const open = [...s.blockers].reverse().find((b) => !b.resolution);
        if (open) open.resolution = { decision: input.decision, notes: input.notes, resolvedAt: new Date().toISOString() };
      });
      this.audit.append({ sessionId, eventType: "blocker_resolved", phase: target, data: { decision: input.decision } });
      return {
        accepted: true,
        sessionId,
        currentPhase: target,
        status: "active",
        guidance: this.guidanceFor(session, target),
      };
    });
  }

  private selectTransition(transitions: { to: string; when?: string; reason?: string }[], opsSucceeded: boolean, failureReason?: string): string | null {
    if (!opsSucceeded && failureReason) {
      return transitions.find((t) => t.reason === failureReason)?.to ?? null;
    }
    for (const t of transitions) {
      if (t.when === "submission_valid") return t.to;
      if (t.when === "required_operations_succeeded" && opsSucceeded) return t.to;
    }
    return null;
  }

  guidanceForPublic(session: WorkflowSession, phase?: string): PhaseInstruction {
    return this.guidanceFor(session, phase);
  }

  async cancelWorkflow(sessionId: string): Promise<SubmitResult> {
    return this.sessions.withLock(sessionId, () => {
      const session = this.getSession(sessionId);
      if (session.status === "cancelled") {
        const err = new GuidanceError("workflow_cancelled", "session is already cancelled", { recoverable: false });
        return { ...err.toResponse(), sessionId, status: session.status } as SubmitResult;
      }
      const now = new Date().toISOString();
      this.sessions.update(sessionId, (s) => {
        s.status = "cancelled";
        s.completedAt = now;
      });
      this.audit.append({ sessionId, eventType: "workflow_cancelled", phase: session.currentPhase, data: {} });
      return { accepted: true, sessionId, currentPhase: session.currentPhase, status: "cancelled" };
    });
  }

  private guidanceFor(session: WorkflowSession, phase?: string): PhaseInstruction {
    const key = phase ?? session.currentPhase;
    const phaseDef = this.definition.phases[key];
    const configured = this.instructions[phaseDef?.response ?? key];
    return {
      title: configured?.title ?? key,
      instruction: configured?.instruction ?? "",
      requiredActions: configured?.requiredActions ?? [],
    };
  }

  private validatorFor(schemaRef: string): SchemaValidator {
    const cached = this.validators.get(schemaRef);
    if (cached) return cached;
    const path = join(this.config.configDir, schemaRef);
    if (!existsSync(path)) {
      throw new GuidanceError("configuration_invalid", `submission schema missing: ${schemaRef}`, { recoverable: false });
    }
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const require = createRequireShim();
    const validator = createValidator(require(path));
    this.validators.set(schemaRef, validator);
    return validator;
  }
}

function createRequireShim(): (id: string) => unknown {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { createRequire } = require("node:module") as typeof import("node:module");
  return createRequire(import.meta.url);
}

export { AuditRepository };
