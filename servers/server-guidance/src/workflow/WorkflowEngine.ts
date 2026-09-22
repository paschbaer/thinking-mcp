/**
 * Authoritative workflow state machine (FR-001–005, FR-019, FR-022, FR-028).
 * Phase guidance and transitions come exclusively from configuration.
 */
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
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

export interface StartResult {
  accepted: true;
  sessionId: string;
  workflowId: string;
  currentPhase: string;
  status: string;
  guidance: PhaseInstruction;
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
    this.operations = ((this.config.operations as unknown as OperationsFile | undefined)?.operations ?? {});
  }

  startWorkflow(input: { workspaceRoot: string; request: string; workflowId?: string; metadata?: Record<string, unknown> }): StartResult {
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
    return {
      accepted: true,
      sessionId,
      workflowId: session.workflowId,
      currentPhase: session.currentPhase,
      status: session.status,
      guidance: this.guidanceFor(session),
    };
  }

  getSession(sessionId: string): WorkflowSession {
    return this.sessions.load(sessionId);
  }

  submit(sessionId: string, phase: string, payload: Record<string, unknown>, requestId?: string): Promise<SubmitResult> {
    return this.sessions.withLock(sessionId, () => this.submitLocked(sessionId, phase, payload, requestId));
  }

  private submitLocked(sessionId: string, phase: string, payload: Record<string, unknown>, requestId?: string): SubmitResult {
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
      const run = this.operationEngine.executeRequired(ops, ctx);
      opsSucceeded = run.allSucceeded;
      opResults = run.results.map((r) => ({ id: r.operationId, status: r.status, summary: r.summary }));
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
    this.sessions.update(sessionId, (s) => {
      s.currentPhase = target;
      s.previousPhase = previousPhase;
      s.submissions = session.submissions;
    });
    this.audit.append({ sessionId, eventType: "transition_accepted", phase: target, data: { from: previousPhase } });
    this.audit.append({ sessionId, eventType: "phase_entered", phase: target, data: {} });

    const result: SubmitResult = {
      accepted: true,
      sessionId,
      previousPhase,
      currentPhase: target,
      status: session.status,
      guidance: this.guidanceFor(session, target),
      operations: opResults,
    };
    if (requestId) {
      this.sessions.update(sessionId, (s) => {
        s.requestIds[requestId] = result;
      });
    }
    return result;
  }

  completeWorkflow(sessionId: string, report: Record<string, unknown>, requestId?: string): Promise<SubmitResult> {
    return this.sessions.withLock(sessionId, () => this.completeWorkflowLocked(sessionId, report, requestId));
  }

  private completeWorkflowLocked(sessionId: string, report: Record<string, unknown>, requestId?: string): SubmitResult {
    const session = this.getSession(sessionId);
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
    if (requestId && session.requestIds[requestId] !== undefined) {
      return session.requestIds[requestId] as SubmitResult;
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
    const run = this.operationEngine.executeRequired(ops, { workspaceRoot: session.workspaceRoot });
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
    this.sessions.update(sessionId, (s) => {
      s.status = "completed";
      s.currentPhase = "completed";
      s.completedAt = now;
      if (requestId) s.requestIds[requestId] = { accepted: true };
    });
    this.audit.append({ sessionId, eventType: "workflow_completed", phase: "completed", data: { operations: opResults } });
    return {
      accepted: true,
      sessionId,
      currentPhase: "completed",
      status: "completed",
      operations: opResults,
    };
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
