/**
 * MCP tool registration (contracts/tools.md). Every tool flows through
 * registerTool wrapper: zod schema validation, idempotency, revision check,
 * guidance attachment, error mapping (single choke point).
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { EmmsService, ClientContext } from '../service.js';
import { EmmsError } from '../domain/errors.js';
import { StaleRevisionError } from '../domain/revision.js';
import { InvalidTransitionError } from '../domain/state-machine.js';

export interface ToolDeps {
  service: EmmsService;
  adapter: import('../storage/adapter.js').StorageAdapter;
}

export const ClientContextSchema = z.object({
  scope_id: z.string().min(1),
  scope_fingerprint: z.string().optional(),
  agent_id: z.string().optional(),
  trace_id: z.string().optional(),
});

export const CommonMutationSchema = {
  workflow_id: z.string().min(1),
  expected_revision: z.number().int().positive().optional(),
  idempotency_key: z.string().min(1).optional(),
  client_context: ClientContextSchema,
};

const ObservationKindEnum = z.enum([
  'failure_output', 'command_output', 'test_result', 'environment_fact',
  'file_state', 'dependency_graph_fact', 'user_feedback',
  'performance_measurement', 'security_measurement', 'external_service_result',
  'agent_reflection',
]);

const CheckSchema = z.object({
  criterion: z.string(),
  test_type: z.string(),
  expected_result: z.string(),
  regression_coverage: z.boolean(),
  timeout_s: z.number().int().positive(),
  evidence_requirement: z.boolean(),
  targets_original_failure: z.boolean(),
});

function toClientContext(input: { client_context?: unknown }): ClientContext {
  const parsed = ClientContextSchema.safeParse(input.client_context);
  if (!parsed.success) {
    throw new EmmsError('INVALID_REQUEST', 'client_context requires scope_id', false, {
      errors: parsed.error.issues.map((i) => i.message),
    });
  }
  return parsed.data;
}

function mapError(e: unknown): never {
  if (e instanceof EmmsError) throw e;
  if (e instanceof StaleRevisionError) {
    throw new EmmsError('STALE_REVISION', e.message, false, { current_revision: e.current_revision });
  }
  if (e instanceof InvalidTransitionError) {
    throw new EmmsError('INVALID_TRANSITION', e.message, false, {
      from: e.from, to: e.to,
      recommended_next_request: undefined,
    });
  }
  throw new EmmsError('INTERNAL_ERROR', e instanceof Error ? e.message : String(e), true);
}

let moduleDeps: ToolDeps | undefined;

type JsonContent = { type: 'text'; text: string };

function jsonResult(payload: unknown): { content: JsonContent[]; isError?: boolean } {
  return { content: [{ type: 'text', text: JSON.stringify(payload) }] };
}

/** Register one tool with the shared validation/error pipeline. */
function registerTool(
  server: McpServer,
  name: string,
  description: string,
  schema: Record<string, z.ZodTypeAny>,
  handler: (args: Record<string, unknown>) => Promise<unknown>,
  deps?: ToolDeps
): void {
  server.tool(name, description, schema, async (args) => {
    let parsedSuccessArgs: Record<string, unknown> | undefined;
    try {
      const parsed = z.object(schema).safeParse(args);
      if (!parsed.success) {
        return jsonResult({
          error: {
            code: 'INVALID_REQUEST',
            message: 'Request failed schema validation',
            retryable: false,
            details: { errors: parsed.error.issues.map((i) => ({ path: i.path, message: i.message })) },
          },
        });
      }
      parsedSuccessArgs = parsed.data as Record<string, unknown>;
      const payload = await handler(parsedSuccessArgs);
      return jsonResult(payload);
    } catch (e) {
      const mapped = (() => {
        try {
          mapError(e);
        } catch (mappedErr) {
          return mappedErr as EmmsError;
        }
        return new EmmsError('INTERNAL_ERROR', 'unreachable', true);
      })();
      // FR-010: recoverable errors still carry a guidance envelope
      let guidance: unknown;
      try {
        const wfId = (parsedSuccessArgs ?? {})['workflow_id'] as string | undefined;
        const cc = (parsedSuccessArgs ?? {})['client_context'];
        if (wfId && cc && mapped.code !== 'INVALID_REQUEST') {
          const service = moduleDeps!.service;
          guidance = (await service.status(wfId, cc as never)).guidance;
        }
      } catch {
        guidance = undefined;
      }
      return jsonResult({
        error: {
          code: mapped.code,
          message: mapped.message,
          retryable: mapped.retryable,
          details: mapped.details,
        },
        guidance,
      });
    }
  });
}

export function registerEmmsTools(server: McpServer, deps: ToolDeps): void {
  moduleDeps = deps;
  const { service } = deps;

  registerTool(server, 'workflow_start', 'Start a durable workflow and create an experience episode', {
    goal: z.string().min(1),
    scope_id: z.string().min(1),
    scope_fingerprint: z.string().optional(),
    problem_summary: z.string().optional(),
    idempotency_key: z.string().min(1),
    client_context: ClientContextSchema,
  }, async (a) => service.startWorkflow(a as never));

  registerTool(server, 'workflow_status', 'Current workflow state, missing information and guidance', {
    workflow_id: z.string().min(1),
    client_context: ClientContextSchema,
  }, async (a) => service.status(a.workflow_id as string, toClientContext(a)));

  registerTool(server, 'workflow_abandon', 'Abandon an incomplete workflow; evidence is retained', {
    ...CommonMutationSchema,
    reason: z.string().min(1),
  }, async (a) =>
    service.abandon(a.workflow_id as string, toClientContext(a), a.expected_revision as number | undefined, a.reason as string));

  registerTool(server, 'experience_search', 'Hybrid retrieval: exact signature, normalized hash, full-text, version filter', {
    query: z.string().min(1),
    scope_id: z.string().min(1),
    failure_signature_hash: z.string().optional(),
    limit: z.number().int().min(1).max(20).optional(),
    environment: z.record(z.string()).optional(),
  }, async (a) => service.search(a as never));

  registerTool(server, 'experience_record_observation', 'Record a structured observation with provenance', {
    ...CommonMutationSchema,
    kind: ObservationKindEnum,
    content: z.string().min(1),
    exit_code: z.number().int().optional(),
    evidence_artifact_id: z.string().optional(),
  }, async (a) => service.recordObservation(a as never));

  registerTool(server, 'experience_record_attempt', 'Record an intended strategy before execution', {
    ...CommonMutationSchema,
    intent: z.string().min(1),
    risk_classification: z.string().optional(),
    rationale: z.string().optional(),
  }, async (a) => service.recordAttempt(a as never));

  registerTool(server, 'experience_complete_attempt', 'Record the actual outcome of an attempt', {
    ...CommonMutationSchema,
    attempt_id: z.string().min(1),
    outcome: z.string().min(1),
    classification: z.enum(['successful', 'partially_successful', 'ineffective', 'harmful', 'inconclusive', 'not_applicable']),
    side_effects: z.array(z.string()).optional(),
  }, async (a) => service.completeAttempt(a as never));

  registerTool(server, 'experience_propose_hypothesis', 'Propose a root-cause hypothesis with evidence references', {
    ...CommonMutationSchema,
    statement: z.string().min(1),
    evidence_refs: z.array(z.string()).optional(),
  }, async (a) => service.proposeHypothesis(a as never));

  registerTool(server, 'experience_propose_solution', 'Propose a candidate solution with coupled validation checks', {
    ...CommonMutationSchema,
    strategy: z.string().min(1),
    mechanism: z.string().min(1),
    prerequisites: z.array(z.string()).optional(),
    rollback: z.array(z.string()).optional(),
    checks: z.array(CheckSchema).optional(),
  }, async (a) => service.proposeSolution(a as never));

  registerTool(server, 'validation_plan', 'Define acceptance-criteria-linked validation checks', {
    ...CommonMutationSchema,
    checks: z.array(CheckSchema).min(1),
  }, async (a) => service.planValidation(a as never));

  registerTool(server, 'validation_record_run', 'Record one validation execution with evidence', {
    ...CommonMutationSchema,
    check_index: z.number().int().min(0),
    status: z.enum(['passed', 'failed']),
    exit_code: z.number().int().optional(),
    evidence_artifact_id: z.string().optional(),
  }, async (a) => service.recordValidationRun(a as never));

  registerTool(server, 'artifact_attach', 'Attach a redacted, content-addressed evidence artifact', {
    ...CommonMutationSchema,
    content_base64: z.string().min(1),
    kind: z.string().min(1),
    media_type: z.enum(['text/plain', 'application/json', 'text/x-diff', 'application/x-ndjson']),
  }, async (a) => service.attachArtifact(a as never));

  registerTool(server, 'experience_finalize', 'Attempt a terminal transition; evidence is assessed server-side', {
    ...CommonMutationSchema,
    requested_outcome: z.enum(['verified', 'partially_verified', 'unresolved']),
  }, async (a) => service.finalize(a as never));

  registerTool(server, 'experience_record_reuse_feedback', 'Report whether retrieved experience was applicable/useful/misleading/harmful', {
    workflow_id: z.string().min(1),
    experience_id: z.string().min(1),
    verdict: z.enum(['applicable', 'useful', 'misleading', 'harmful']),
    changed_plan: z.boolean().optional(),
    outcome: z.string().optional(),
    client_context: ClientContextSchema,
  }, async (a) => service.recordReuseFeedback(a as never));

  registerTool(server, 'experience_mark_regression', 'Record that a previously verified solution regressed', {
    ...CommonMutationSchema,
    failed_episode_id: z.string().min(1),
    reason: z.string().min(1),
  }, async (a) => service.recordRegression(a as never));

  registerTool(server, 'experience_invalidate', 'Privileged: invalidate an episode while preserving history (audited)', {
    ...CommonMutationSchema,
    target_episode_id: z.string().min(1),
    reason: z.string().min(1),
  }, async (a) => service.invalidate(a as never));

  registerTool(server, 'lesson_publish', 'Widen a lesson episode visibility to public — discoverable by all scopes (cross-project sharing)', {
    ...CommonMutationSchema,
    experience_id: z.string().min(1),
  }, async (a) => service.lesson_publish(a as never));

  registerTool(server, 'lesson_unpublish', 'Narrow a lesson episode visibility back to repository-only', {
    ...CommonMutationSchema,
    experience_id: z.string().min(1),
  }, async (a) => service.lesson_unpublish(a as never));

  registerTool(server, 'experience_seed_lessons', 'Batch-seed curated lessons as complete episodes (observation → environment → attempt → outcome → hypothesis → finalize). Idempotent per slug; per-lesson result reporting. Works on any transport — no local script or repo checkout required.', {
    lessons: z.array(z.object({
      slug: z.string().min(1),
      observation: z.string().min(1),
      cause: z.string().min(1),
      fix: z.string().min(1),
    })).min(1),
    scope_id: z.string().min(1).optional(),
    client_context: ClientContextSchema,
  }, async (a) => service.seedLessons(a as never));
}
