/** Typed wrappers around WorkflowEngine — one per upstream MCP tool (FR-016). */
import type {
  WorkflowEngine,
  StartResult,
  SubmitResult,
} from "../workflow/WorkflowEngine.js";
import type { WorkflowSession, PhaseInstruction } from "../types/index.js";

export class WorkflowTools {
  constructor(private readonly engine: WorkflowEngine) {}

  async startWorkflow(input: {
    workspaceRoot: string;
    request: string;
    workflowId?: string;
    metadata?: Record<string, unknown>;
    chain?: unknown;
  }): Promise<StartResult> {
    return this.engine.startWorkflow(input);
  }

  async getCurrentGuidance(
    sessionId: string,
  ): Promise<{
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
  ): Promise<SubmitResult> {
    return this.engine.submit(sessionId, "understand", payload, requestId);
  }
  async submitPlan(
    sessionId: string,
    payload: Record<string, unknown>,
    requestId?: string,
  ): Promise<SubmitResult> {
    return this.engine.submit(sessionId, "plan", payload, requestId);
  }
  async submitPlanReview(
    sessionId: string,
    payload: Record<string, unknown>,
    requestId?: string,
  ): Promise<SubmitResult> {
    return this.engine.submit(
      sessionId,
      "review_and_adjust_plan",
      payload,
      requestId,
    );
  }
  async submitImplementation(
    sessionId: string,
    payload: Record<string, unknown>,
    requestId?: string,
  ): Promise<SubmitResult> {
    return this.engine.submit(sessionId, "implement", payload, requestId);
  }
  async submitImplementationReview(
    sessionId: string,
    payload: Record<string, unknown>,
    requestId?: string,
  ): Promise<SubmitResult> {
    return this.engine.submit(
      sessionId,
      "review_and_fix_implementation",
      payload,
      requestId,
    );
  }
  async submitVerification(
    sessionId: string,
    payload: Record<string, unknown>,
    requestId?: string,
  ): Promise<SubmitResult> {
    return this.engine.submit(sessionId, "verify", payload, requestId);
  }

  async completeWorkflow(
    sessionId: string,
    report: Record<string, unknown>,
    requestId?: string,
  ): Promise<SubmitResult> {
    return this.engine.completeWorkflow(sessionId, report, requestId);
  }

  async getWorkflowState(sessionId: string): Promise<WorkflowSession> {
    return this.engine.getSession(sessionId);
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

  async runOperation(
    sessionId: string,
    operationId: string,
  ): Promise<ReturnType<WorkflowEngine["runOperation"]>> {
    return this.engine.runOperation(sessionId, operationId);
  }

  async getMetrics(): Promise<ReturnType<WorkflowEngine["getMetrics"]>> {
    return this.engine.getMetrics();
  }
}
