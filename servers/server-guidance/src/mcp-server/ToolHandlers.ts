/** Typed wrappers around WorkflowEngine — one per upstream MCP tool (FR-016). */
import type {
  WorkflowEngine,
  StartResult,
  SubmitResult,
} from "../workflow/WorkflowEngine.js";
import type { WorkflowSession, PhaseInstruction } from "../types/index.js";
import {
  OperationRegistry,
  fingerprintArgs,
  type OperationRecord,
} from "../workflow/operation-registry.js";
import {
  hooksFromContext,
  type TransitionContext,
} from "../workflow/transition-protocol.js";
import { GuidanceError } from "../types/errors.js";

/** Spec 016 FR-1: acceptance payload returned promptly when a gate-executing
 *  call is opted into async mode. Outcome stays retrievable via
 *  get_workflow_state (FR-3), failures included. */
interface AsyncAcceptance {
  accepted: true;
  asyncAccepted: true;
  sessionId: string;
  tool: string;
  operationId: string;
  status: OperationRecord["status"];
  /** True when this response is an idempotent replay of an in-flight
   *  transition (FR-2) — no second execution was started. */
  retry: boolean;
  acceptedAt: string;
  pollWith: "get_workflow_state";
}

function acceptancePayload(
  record: OperationRecord,
  retry: boolean,
): AsyncAcceptance {
  return {
    accepted: true,
    asyncAccepted: true,
    sessionId: record.sessionId,
    tool: record.tool,
    operationId: record.operationId,
    status: record.status,
    retry,
    acceptedAt: record.acceptedAt,
    pollWith: "get_workflow_state",
  };
}

function errorDetail(err: unknown): {
  code: string;
  message: string;
  recoverable?: boolean;
} {
  if (err && typeof err === "object" && "code" in err && "message" in err) {
    const e = err as { code: string; message: string; recoverable?: boolean };
    return { code: e.code, message: e.message, recoverable: e.recoverable };
  }
  return { code: "internal_error", message: String(err) };
}

export class WorkflowTools {
  /** Spec 016: registry present only when a stateDir was wired (HTTP/boot
   *  composition). Without it, async acceptance is unavailable and every
   *  call stays synchronous — the default (FR-4/FR-10). */
  private readonly registry?: OperationRegistry;
  private readonly asyncDefault: boolean;

  constructor(
    private readonly engine: WorkflowEngine,
    options?: { stateDir?: string; asyncAcceptanceDefault?: boolean },
  ) {
    this.registry = options?.stateDir
      ? new OperationRegistry(options.stateDir)
      : undefined;
    this.asyncDefault =
      options?.asyncAcceptanceDefault ??
      process.env.GUIDANCE_ASYNC_ACCEPTANCE === "1";
  }

  /** Resolves the effective per-call options: _meta flag wins over the
   *  server default; `async: false` opts back out (FR-4/FR-10). */
  private resolveTransition(ctx?: TransitionContext): TransitionContext {
    const asyncAcceptance =
      ctx?.asyncAcceptance !== undefined
        ? ctx.asyncAcceptance
        : this.asyncDefault;
    return { asyncAcceptance, progress: ctx?.progress };
  }

  /** Spec 016 FR-2: while a transition for (session, tool) is in flight, an
   *  identical retry returns the current state instead of queueing a second
   *  execution behind the single-flight lock. Terminal outcomes are recorded
   *  for get_workflow_state (FR-3). Execution itself continues under the
   *  EXISTING per-session single-flight lock — reused, not duplicated. */
  private async runTransition<T>(
    tool: string,
    sessionId: string,
    args: Record<string, unknown>,
    ctx: TransitionContext | undefined,
    fn: () => Promise<T>,
  ): Promise<T | AsyncAcceptance> {
    const resolved = this.resolveTransition(ctx);
    const exec = fn;
    if (!resolved.asyncAcceptance || !this.registry) return await exec();
    // F1: begin() checks-and-registers atomically under the per-session
    // registry mutex — a concurrent submit can never start a second
    // execution; the loser receives the winner's in-flight record.
    const fingerprint = fingerprintArgs(args);
    const { record, created } = await this.registry.begin(
      sessionId,
      tool,
      fingerprint,
    );
    if (!created) {
      // F5: only an IDENTICAL payload is an idempotent retry (FR-2); a
      // different payload must not be swallowed under the original's id.
      if (record.fingerprint !== fingerprint) {
        throw new GuidanceError(
          "operation_in_progress",
          `a different ${tool} transition is currently in flight for session ${sessionId}; poll get_workflow_state and resubmit afterwards`,
          { recoverable: true },
        );
      }
      return acceptancePayload(record, true);
    }
    // F7: the terminal .catch keeps a registry write failure from becoming
    // an unhandled rejection after the acceptance response is gone.
    void exec()
      .then(
        (result) => this.registry!.complete(sessionId, tool, result),
        (err: unknown) =>
          this.registry!.fail(sessionId, tool, errorDetail(err)),
      )
      .catch(() => undefined);
    return acceptancePayload(record, false);
  }

  private submitPhase(
    tool: string,
    phase: string,
    sessionId: string,
    payload: Record<string, unknown>,
    requestId: string | undefined,
    ctx: TransitionContext | undefined,
  ): Promise<SubmitResult | AsyncAcceptance> {
    return this.runTransition(
      tool,
      sessionId,
      { ...payload, requestId },
      ctx,
      () =>
        this.engine.submit(
          sessionId,
          phase,
          payload,
          requestId,
          hooksFromContext(ctx),
        ),
    );
  }

  async startWorkflow(input: {
    workspaceRoot: string;
    request: string;
    workflowId?: string;
    metadata?: Record<string, unknown>;
    chain?: unknown;
  }): Promise<StartResult> {
    return this.engine.startWorkflow(input);
  }

  async getCurrentGuidance(sessionId: string): Promise<{
    sessionId: string;
    currentPhase: string;
    status: string;
    guidance: PhaseInstruction;
  }> {
    const s = this.engine.getSession(sessionId);
    return {
      sessionId,
      currentPhase: s.currentPhase,
      status: s.status,
      guidance: this.engine.guidanceForPublic(s),
    };
  }

  async submitUnderstanding(
    sessionId: string,
    payload: Record<string, unknown>,
    requestId?: string,
    ctx?: TransitionContext,
  ): Promise<SubmitResult | AsyncAcceptance> {
    return this.submitPhase(
      "submit_understanding",
      "understand",
      sessionId,
      payload,
      requestId,
      ctx,
    );
  }
  async submitPlan(
    sessionId: string,
    payload: Record<string, unknown>,
    requestId?: string,
    ctx?: TransitionContext,
  ): Promise<SubmitResult | AsyncAcceptance> {
    return this.submitPhase(
      "submit_plan",
      "plan",
      sessionId,
      payload,
      requestId,
      ctx,
    );
  }
  async submitPlanReview(
    sessionId: string,
    payload: Record<string, unknown>,
    requestId?: string,
    ctx?: TransitionContext,
  ): Promise<SubmitResult | AsyncAcceptance> {
    return this.submitPhase(
      "submit_plan_review",
      "review_and_adjust_plan",
      sessionId,
      payload,
      requestId,
      ctx,
    );
  }
  async submitImplementation(
    sessionId: string,
    payload: Record<string, unknown>,
    requestId?: string,
    ctx?: TransitionContext,
  ): Promise<SubmitResult | AsyncAcceptance> {
    return this.submitPhase(
      "submit_implementation",
      "implement",
      sessionId,
      payload,
      requestId,
      ctx,
    );
  }
  async submitImplementationReview(
    sessionId: string,
    payload: Record<string, unknown>,
    requestId?: string,
    ctx?: TransitionContext,
  ): Promise<SubmitResult | AsyncAcceptance> {
    return this.submitPhase(
      "submit_implementation_review",
      "review_and_fix_implementation",
      sessionId,
      payload,
      requestId,
      ctx,
    );
  }
  async submitVerification(
    sessionId: string,
    payload: Record<string, unknown>,
    requestId?: string,
    ctx?: TransitionContext,
  ): Promise<SubmitResult | AsyncAcceptance> {
    return this.submitPhase(
      "submit_verification",
      "verify",
      sessionId,
      payload,
      requestId,
      ctx,
    );
  }

  async completeWorkflow(
    sessionId: string,
    report: Record<string, unknown>,
    requestId?: string,
    ctx?: TransitionContext,
  ): Promise<SubmitResult | AsyncAcceptance> {
    return this.runTransition(
      "complete_workflow",
      sessionId,
      { ...report, requestId },
      ctx,
      () =>
        this.engine.completeWorkflow(
          sessionId,
          report,
          requestId,
          hooksFromContext(ctx),
        ),
    );
  }

  async getWorkflowState(
    sessionId: string,
  ): Promise<
    WorkflowSession & { asyncOperations?: Record<string, OperationRecord> }
  > {
    // specs/008 AC-5: agent-facing read goes through getWorkflowState, which
    // enforces the configurationVersion binding (getSession is internal-only).
    const state = await this.engine.getWorkflowState(sessionId);
    // Spec 016 FR-3: surface async-accepted operation outcomes (incl.
    // failures with gate results) through the existing status interface.
    if (!this.registry) return state;
    const operations = this.registry.allFor(sessionId);
    return Object.keys(operations).length > 0
      ? { ...state, asyncOperations: operations }
      : state;
  }

  async reportBlocker(
    sessionId: string,
    input: {
      category: string;
      description: string;
      requiresUserDecision?: boolean;
      options?: string[];
    },
  ): Promise<SubmitResult> {
    return this.engine.reportBlocker(sessionId, input);
  }

  async resumeWorkflow(
    sessionId: string,
    input: { decision: string; notes?: string },
  ): Promise<SubmitResult> {
    return this.engine.resumeWorkflow(sessionId, input);
  }

  async cancelWorkflow(sessionId: string): Promise<SubmitResult> {
    return this.engine.cancelWorkflow(sessionId);
  }

  // ---- orchestration tools (FR-046, profile §31) ----

  async getOrchestrationStatus(
    sessionId: string,
  ): Promise<ReturnType<WorkflowEngine["getOrchestrationStatus"]>> {
    return this.engine.getOrchestrationStatus(sessionId);
  }

  listConfiguredOperations(): ReturnType<
    WorkflowEngine["listConfiguredOperations"]
  > {
    return this.engine.listConfiguredOperations();
  }

  async getDownstreamStatus(): Promise<
    ReturnType<WorkflowEngine["getDownstreamStatus"]>
  > {
    return this.engine.getDownstreamStatus();
  }

  async retryOperation(sessionId: string): Promise<SubmitResult> {
    return this.engine.retryOperations(sessionId);
  }

  /** Spec 016: single-step operation with optional async acceptance and
   *  progress reporting (started/succeeded/failed; status-only messages,
   *  FR-8). */
  async runOperation(
    sessionId: string,
    operationId: string,
    argumentOverrides?: Record<string, unknown>,
    ctx?: TransitionContext,
  ): Promise<ReturnType<WorkflowEngine["runOperation"]> | AsyncAcceptance> {
    const resolved = this.resolveTransition(ctx);
    return await this.runTransition(
      "run_operation",
      sessionId,
      { operationId, argumentOverrides },
      resolved,
      async () => {
        const progress = resolved.progress;
        if (progress) {
          await progress
            .send({
              progress: 0,
              total: 1,
              message: `operation ${operationId} started`,
            })
            .catch(() => {});
        }
        try {
          const result = await this.engine.runOperation(
            sessionId,
            operationId,
            argumentOverrides,
          );
          if (progress) {
            await progress
              .send({
                progress: 1,
                total: 1,
                message: `operation ${operationId} ${result.status}`,
              })
              .catch(() => {});
          }
          return result;
        } catch (err) {
          if (progress) {
            await progress
              .send({
                progress: 1,
                total: 1,
                message: `operation ${operationId} failed`,
              })
              .catch(() => {});
          }
          throw err;
        }
      },
    );
  }

  /** CT-ARGS-1: transparent downstream tool passthrough (gated invoker). */
  async callDownstream(
    sessionId: string,
    serverId: string,
    toolName: string,
    args: Record<string, unknown> = {},
  ): Promise<ReturnType<WorkflowEngine["callDownstream"]>> {
    return this.engine.callDownstream(sessionId, serverId, toolName, args);
  }

  async getMetrics(): Promise<ReturnType<WorkflowEngine["getMetrics"]>> {
    return this.engine.getMetrics();
  }

  registerWorkspace(
    input: Parameters<WorkflowEngine["registerWorkspace"]>[0],
  ): ReturnType<WorkflowEngine["registerWorkspace"]> {
    return this.engine.registerWorkspace(input);
  }

  /** FR-1207: tool-list gate — registry_register is flag-gated only
   *  (default ON, opt-out via enabled: false; profile-independent); keeps
   *  the tool off the tool list entirely when gated (defense in depth with
   *  the engine check). */
  isRegistryRegisterEnabled(): boolean {
    return this.engine.config.registryRegister.enabled;
  }
}
