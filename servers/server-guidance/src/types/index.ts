/** Core domain types for Guidance (see specs/002-guidance-workflow-server/data-model.md). */

export type PhaseId = string;
export type SessionStatus =
  "active" | "activating" | "blocked" | "completed" | "cancelled";
export type ProfileId = "plain" | "spec-kit";

export type OperationType =
  | "process"
  | "mcpTool"
  | "mcpResource"
  | "mcpPrompt"
  | "sampling"
  | "elicitation"
  | "composite";

export type OperationStatus =
  | "pending"
  | "running"
  | "succeeded"
  | "failed"
  | "timed_out"
  | "cancelled"
  | "input_required"
  | "unknown"
  | "reconciling";

export type OperationErrorKind =
  | "transport"
  | "protocol"
  | "tool_reported"
  | "validation"
  | "policy"
  | "timeout"
  | "cancelled";

export type RiskClass =
  | "read_only"
  | "workspace_write"
  | "external_write"
  | "destructive"
  | "credential_sensitive";

export type TrustLevel = "untrusted" | "restricted" | "trusted" | "privileged";

export type LifecyclePoint =
  "beforeEnter" | "afterEnter" | "beforeExit" | "afterExit";

export interface OperationConfig {
  operationId: string;
  description?: string;
  type: OperationType;
  server?: string;
  capability?: string;
  executable?: string;
  args?: string[];
  env?: Record<string, string>;
  shell?: boolean | string;
  arguments?: { mode: "fixed" | "template" | "mapped"; value: unknown };
  required: boolean;
  timeoutSeconds?: number;
  limits?: { maxBytes?: number; concurrency?: number };
  retry?: {
    maximumAttempts: number;
    retryOn: string[];
    initialDelayMilliseconds?: number;
    backoffMultiplier?: number;
  };
  validation?: import("./operation-validation.js").OperationValidationPolicy;
  output?: {
    returnToAgent:
      | "none"
      | "status_only"
      | "summary"
      | "summary_and_errors"
      | "normalized"
      | "raw";
    retainRawResult?: boolean;
    maximumBytes?: number;
  };
  riskClass?: RiskClass;
  approved?: boolean;
  /** FR-102 (spec 003): opt-in marker — the operation may be invoked on
   *  demand by the agent via run_operation. Default false (fail-closed). */
  invocableByAgent?: boolean;
  fallback?: OperationConfig[];
  condition?: unknown;
}

export interface NormalizedResult {
  operationId: string;
  serverId?: string;
  capabilityType?: OperationType;
  capabilityName?: string;
  status: OperationStatus;
  summary: string;
  data: Record<string, unknown>;
  content: unknown[];
  warnings: { code?: string; message: string }[];
  errors: { code?: string; message: string }[];
  protocolMetadata: Record<string, unknown>;
  validated: boolean;
}

export interface OperationExecution {
  executionId: string;
  operationId: string;
  status: OperationStatus;
  attempt: number;
  errorKind?: OperationErrorKind;
  startedAt: string;
  finishedAt?: string;
  durationMs?: number;
  result?: NormalizedResult;
  rawResultRef?: string;
}

export interface Submission {
  phaseId: PhaseId;
  payload: Record<string, unknown>;
  acceptedAt: string;
  schemaRef: string;
}

export interface Blocker {
  blockerId: string;
  category: string;
  description: string;
  requiresUserDecision: boolean;
  options?: string[];
  resolution?: { decision: string; notes?: string; resolvedAt: string };
}

export interface WorkflowSession {
  sessionId: string;
  workflowId: string;
  profile: ProfileId;
  configurationVersion: string;
  configDir: string;
  workspaceRoot: string;
  status: SessionStatus;
  currentPhase: PhaseId;
  previousPhase: PhaseId | null;
  request: string;
  submissions: Record<PhaseId, Submission>;
  blockers: Blocker[];
  requestIds: Record<string, unknown>;
  /** Amendment 002 (Workflow-Chaining): optional — absent = legacy session. */
  chainFrom?: string | null;
  /** Position in the chain, 0-based (0 = chain head). */
  chainIndex?: number;
  /** Chain manifest — set on the head (Form A) or head+successors (Form A/B, copied per FR-114). */
  chainSpec?: {
    steps?: { request: string; workflowId?: string }[];
    source?: "spec_kit_tasks";
    requestTemplate?: string;
    featureId?: string;
    taskFilter?: { statuses?: string[] };
    /** Form B: task IDs already turned into chain steps (progress carried in the copy). */
    chainedTaskIds?: string[];
  };
  /** Index of the next chain step to execute (relative to chainSpec.steps). */
  chainUpNext?: number;
  /** Form B successor scope (FR-118): this workflow executes exactly this spec-kit task. */
  chainTaskScope?: { taskId: string; featureId: string };
  downstream: {
    servers: Record<
      string,
      {
        status: string;
        capabilitySnapshotHash?: string;
        lastSuccessfulRequestAt?: string;
      }
    >;
    operations: Record<
      string,
      { latestExecutionId?: string; status?: OperationStatus; attempts: number }
    >;
  };
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface WorkflowDefinition {
  workflowId: string;
  profile?: ProfileId;
  initialPhase: PhaseId;
  terminalStates: string[];
  phases: Record<
    PhaseId,
    {
      response?: string;
      submissionSchema?: string;
      lifecycle?: Partial<Record<LifecyclePoint, string[]>>;
      transitions: { to: PhaseId; when?: string; reason?: string }[];
    }
  >;
}

export interface PhaseInstruction {
  title: string;
  instruction: string;
  requiredActions: string[];
}
