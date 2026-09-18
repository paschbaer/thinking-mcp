/**
 * EmmsService — central orchestration (spec FR-001..FR-037).
 * Mutation pipeline order (guidance.md invariant 9): idempotency BEFORE
 * revision; every mutation bumps revision, appends an event, returns guidance.
 */
import { randomUUID } from 'node:crypto';
import type {
  Attempt,
  AttemptClassification,
  Episode,
  Observation,
  ObservationKind,
  ValidationCheck,
  Workflow,
} from './domain/types.js';
import type { SearchRow } from './storage/adapter.js';
import { assertTransition, isTerminal } from './domain/state-machine.js';
import { assertExpectedRevision, nextRevision, StaleRevisionError } from './domain/revision.js';
import { EmmsError, duplicateIdempotency, missingEvidence, artifactRejected } from './domain/errors.js';
import type { StorageAdapter } from './storage/adapter.js';
import { EvidenceStore } from './evidence/store.js';
import { redact } from './evidence/redact.js';
import { normalizeFailure } from './domain/normalize.js';
import { buildGuidance, allowedToolsForState } from './guidance/engine.js';
import { assessLimits } from './guidance/limits.js';
import type { GuidanceEnvelope } from './guidance/envelope.js';

export const POLICY_VERSION = 'emms-policy-2026-09-01';

export interface ClientContext {
  scope_id: string;
  scope_fingerprint?: string;
  agent_id?: string;
  trace_id?: string;
}

export interface ToolResult {
  result: Record<string, unknown>;
  guidance: GuidanceEnvelope;
}

interface Ctx {
  workflow: Workflow;
  episode: Episode;
  observations: Observation[];
  attempts: Attempt[];
  plan?: { checks: ValidationCheck[] };
  runs: { check_index: number; status: string; evidence_artifact_id?: string }[];
}

export class EmmsService {
  readonly evidence: EvidenceStore;

  constructor(
    private readonly adapter: StorageAdapter,
    artifactsDir: string,
    private readonly limits = { maxAttempts: 12, maxRepeatedIdenticalAttempts: 2 }
  ) {
    this.evidence = new EvidenceStore(artifactsDir);
  }

  // ---------- helpers ----------
  private now(): string {
    return new Date().toISOString();
  }

  private async requireWorkflow(workflow_id: string, ctx: ClientContext): Promise<Workflow> {
    const wf = await this.adapter.getWorkflow(workflow_id, ctx.scope_id);
    if (!wf) throw new EmmsError('INVALID_REQUEST', 'Workflow not found in scope', false, { workflow_id });
    return wf;
  }

  private async loadCtx(workflow_id: string, ctx: ClientContext): Promise<Ctx> {
    const workflow = await this.requireWorkflow(workflow_id, ctx);
    const episode = workflow.experience_id ? await this.adapter.getEpisode(workflow.experience_id, ctx.scope_id) : undefined;
    if (!episode) throw new EmmsError('INVALID_REQUEST', 'Episode not found', false, { workflow_id });
    const [observations, attempts, plan, runs] = await Promise.all([
      this.adapter.listObservations(episode.experience_id),
      this.adapter.listAttempts(episode.experience_id),
      this.adapter.getValidationPlan(episode.experience_id),
      this.adapter.listValidationRuns(episode.experience_id),
    ]);
    return { workflow, episode, observations, attempts, plan, runs };
  }

  private async guidanceFor(c: Ctx, extraWarnings?: Parameters<typeof buildGuidance>[0]['warnings']): Promise<GuidanceEnvelope> {
    const limits = assessLimits(c.attempts, this.limits);
    const verified = (idx: number) =>
      c.runs.some((r) => r.check_index === idx && r.status === 'passed' && !!r.evidence_artifact_id);
    const originalIdx = c.plan?.checks.findIndex((ch) => ch.targets_original_failure) ?? -1;
    return buildGuidance({
      workflow: c.workflow,
      episode: c.episode,
      hasFailureObservation: c.observations.some((o) => o.kind === 'failure_output'),
      hasEnvironmentFact: c.observations.some((o) => o.kind === 'environment_fact'),
      hasAttempt: c.attempts.length > 0,
      hasSolution: !!c.plan, // solution proposed == plan exists (tool-contract coupling)
      hasValidationPlan: !!c.plan,
      hasVerifiedOriginal: originalIdx >= 0 && verified(originalIdx),
      hasVerifiedRegression: c.plan
        ? c.plan.checks.some((ch, i) => ch.regression_coverage && verified(i))
        : false,
      warnings: [
        ...(extraWarnings ?? []),
        ...limits.warnings.map((w) => ({ code: w.code, severity: 'medium' as const, message: w.message })),
      ],
      stopConditions: limits.stop_conditions,
    });
  }

  /** Shared mutation pipeline. mutator persists changes and returns result. */
  private async mutate(
    workflow_id: string,
    ctx: ClientContext,
    expected_revision: number | undefined,
    idempotency_key: string | undefined,
    tool: string,
    event: { type: string; payload: unknown },
    mutator: (c: Ctx) => Promise<Record<string, unknown>>,
    extraWarnings?: Parameters<typeof buildGuidance>[0]['warnings']
  ): Promise<ToolResult> {
    const request_id = randomUUID();
    if (idempotency_key) {
      const existing = await this.adapter.getIdempotency(idempotency_key);
      if (existing) {
        const original = JSON.parse(existing.result_json);
        if (existing.tool !== tool) {
          throw new EmmsError('DUPLICATE_IDEMPOTENCY', 'Idempotency key reused with different tool', false, { tool });
        }
        return original as ToolResult; // FR-028: replay returns original result
      }
    }
    const c = await this.loadCtx(workflow_id, ctx);
    assertExpectedRevision(expected_revision, c.workflow.revision);
    const result = await mutator(c);

    c.workflow.revision = nextRevision(c.workflow.revision);
    await this.adapter.saveWorkflow(c.workflow);
    await this.adapter.appendEvent({
      event_id: randomUUID(),
      workflow_id: workflow_id,
      episode_id: c.episode?.experience_id,
      type: event.type,
      payload: event.payload,
      seq: 0,
      recorded_at: this.now(),
    });
    const guidance = await this.guidanceFor(c, extraWarnings);
    const out: ToolResult = { result: { ...result, new_revision: c.workflow.revision }, guidance };
    if (idempotency_key) {
      await this.adapter.putIdempotency({ key: idempotency_key, actor_id: ctx.agent_id ?? 'local-agent', tool, request_id, result_json: JSON.stringify(out) });
    }
    return out;
  }

  // ---------- workflow lifecycle ----------
  async startWorkflow(args: {
    goal: string;
    scope_id: string;
    scope_fingerprint?: string;
    problem_summary?: string;
    idempotency_key?: string;
    client_context: ClientContext;
  }): Promise<ToolResult> {
    if (args.idempotency_key) {
      const existing = await this.adapter.getIdempotency(args.idempotency_key);
      if (existing) return JSON.parse(existing.result_json) as ToolResult;
    }
    const workflow_id = 'wf_' + randomUUID().slice(0, 12);
    const experience_id = 'exp_' + randomUUID().slice(0, 12);
    const now = this.now();
    const workflow: Workflow = {
      workflow_id,
      experience_id,
      goal: args.goal,
      scope_id: args.scope_id,
      scope_fingerprint: args.scope_fingerprint,
      state: 'DRAFT',
      revision: 1,
      actor_id: args.client_context.agent_id ?? 'local-agent',
      created_at: now,
    };
    await this.adapter.createWorkflow(workflow);
    const episode: Episode = {
      experience_id,
      workflow_id,
      scope_id: args.scope_id,
      scope_fingerprint: args.scope_fingerprint,
      visibility: 'repository',
      goal_summary: args.goal,
      acceptance_criteria: [],
      problem_summary: args.problem_summary ?? '',
      state: 'DRAFT',
      created_at: now,
    };
    await this.adapter.createEpisode(episode);
    await this.adapter.appendEvent({
      event_id: randomUUID(), workflow_id, episode_id: experience_id,
      type: 'workflow.started', payload: { goal: args.goal }, seq: 0, recorded_at: now,
    });
    const c = await this.loadCtx(workflow_id, args.client_context);
    const guidance = await this.guidanceFor(c);
    const out: ToolResult = { result: { workflow_id, experience_id, revision: 1 }, guidance };
    if (args.idempotency_key) {
      await this.adapter.putIdempotency({ key: args.idempotency_key, actor_id: workflow.actor_id, tool: 'workflow.start', request_id: randomUUID(), result_json: JSON.stringify(out) });
    }
    return out;
  }

  async status(workflow_id: string, ctx: ClientContext): Promise<ToolResult> {
    const c = await this.loadCtx(workflow_id, ctx);
    const guidance = await this.guidanceFor(c);
    return {
      result: {
        state: c.workflow.state,
        revision: c.workflow.revision,
        missing_information: guidance.missing_information,
        recent_transitions: (await this.adapter.listEvents(workflow_id)).slice(-5).map((e) => e.type),
      },
      guidance,
    };
  }

  async abandon(workflow_id: string, ctx: ClientContext, expected_revision: number | undefined, reason: string): Promise<ToolResult> {
    return this.mutate(
      workflow_id, ctx, expected_revision, undefined, 'workflow.abandon',
      { type: 'workflow.abandoned', payload: { reason } },
      async (c) => {
        assertTransition(c.episode!.state, 'UNRESOLVED');
        c.episode!.state = 'UNRESOLVED';
        await this.adapter.saveEpisode(c.episode!);
        assertTransition(c.workflow.state, 'UNRESOLVED');
        c.workflow.state = 'UNRESOLVED';
        await this.adapter.insertAudit({
          event_id: randomUUID(),
          actor: { actor_type: 'agent', actor_id: c.workflow.actor_id },
          action: 'workflow.abandon', target: workflow_id,
          before_revision: c.workflow.revision, after_revision: c.workflow.revision + 1,
          timestamp: this.now(), policy_version: POLICY_VERSION, reason,
        });
        return { final_state: 'UNRESOLVED' };
      }
    );
  }

  // ---------- capture ----------
  async recordObservation(args: {
    workflow_id: string; kind: ObservationKind; content: string; exit_code?: number;
    evidence_artifact_id?: string; expected_revision?: number; idempotency_key?: string;
    client_context: ClientContext;
  }): Promise<ToolResult> {
    return this.mutate(
      args.workflow_id, args.client_context, args.expected_revision, args.idempotency_key,
      'experience.record_observation',
      { type: 'observation.recorded', payload: { kind: args.kind } },
      async (c) => {
        const provenance = {
          actor_type: 'agent' as const,
          actor_id: c.workflow.actor_id,
          source_type: args.kind,
          recorded_at: this.now(),
          derivation: 'observed' as const,
          trace_id: args.client_context.trace_id,
        };
        const observation: Observation = {
          observation_id: 'obs_' + randomUUID().slice(0, 12),
          episode_id: c.episode!.experience_id,
          kind: args.kind,
          content: args.content,
          exit_code: args.exit_code,
          evidence_artifact_id: args.evidence_artifact_id,
          provenance,
          seq: 0,
        };
        await this.adapter.insertObservation(observation);
        if (args.kind === 'failure_output') {
          const norm = normalizeFailure(args.content, [], args.exit_code);
          await this.adapter.putSignature(c.episode!.experience_id, norm.normalized_hash, JSON.stringify(norm.exact_tokens), 'failure_output', args.exit_code);
        }
        if (args.kind === 'environment_fact') {
          try {
            const dims = JSON.parse(args.content) as Record<string, string>;
            if (dims && typeof dims === 'object' && !Array.isArray(dims)) {
              await this.adapter.putEnvironment(
                c.episode!.experience_id,
                Object.entries(dims).map(([key, value]) => ({ key, value: String(value) }))
              );
            }
          } catch {
            // non-JSON environment fact: stored as observation only
          }
        }
        if (c.episode!.state === 'DRAFT') {
          assertTransition(c.episode!.state, 'OBSERVED');
          c.episode!.state = 'OBSERVED';
          c.workflow.state = 'OBSERVED';
          await this.adapter.saveEpisode(c.episode!);
        }
        return { observation_id: observation.observation_id };
      }
    );
  }

  async recordAttempt(args: {
    workflow_id: string; intent: string; risk_classification?: string; rationale?: string;
    expected_revision?: number; idempotency_key?: string; client_context: ClientContext;
  }): Promise<ToolResult> {
    return this.mutate(
      args.workflow_id, args.client_context, args.expected_revision, args.idempotency_key,
      'experience.record_attempt',
      { type: 'attempt.proposed', payload: { intent: args.intent } },
      async (c) => {
        if (c.episode!.state === 'OBSERVED') {
          assertTransition(c.episode!.state, 'DIAGNOSING');
          c.episode!.state = 'DIAGNOSING';
          c.workflow.state = 'DIAGNOSING';
          await this.adapter.saveEpisode(c.episode!);
        }
        const attempt: Attempt = {
          attempt_id: 'att_' + randomUUID().slice(0, 12),
          episode_id: c.episode!.experience_id,
          intent: args.intent,
          risk_classification: args.risk_classification,
          rationale: args.rationale,
          seq: 0,
        };
        await this.adapter.insertAttempt(attempt);
        return { attempt_id: attempt.attempt_id };
      }
    );
  }

  async completeAttempt(args: {
    workflow_id: string; attempt_id: string; outcome: string;
    classification: AttemptClassification; side_effects?: string[];
    expected_revision?: number; idempotency_key?: string; client_context: ClientContext;
  }): Promise<ToolResult> {
    const warnings: Parameters<typeof buildGuidance>[0]['warnings'] = [];
    const out = await this.mutate(
      args.workflow_id, args.client_context, args.expected_revision, args.idempotency_key,
      'experience.complete_attempt',
      { type: 'attempt.completed', payload: { attempt_id: args.attempt_id, classification: args.classification } },
      async (c) => {
        const attempt = await this.adapter.getAttempt(args.attempt_id, c.episode!.experience_id);
        if (!attempt) throw new EmmsError('INVALID_REQUEST', 'Attempt not found', false, { attempt_id: args.attempt_id });
        attempt.fact = attempt.intent;
        attempt.outcome = args.outcome;
        attempt.side_effects = args.side_effects;
        attempt.classification = args.classification;
        await this.adapter.saveAttempt(attempt);
        if (args.classification === 'harmful') {
          warnings.push({ code: 'UNVERIFIED_ROOT_CAUSE', severity: 'medium', message: 'A harmful attempt was recorded; its strategy is retained as negative knowledge' });
        }
        return { attempt_id: args.attempt_id };
      },
      warnings
    );
    return out;
  }

  async proposeHypothesis(args: {
    workflow_id: string; statement: string; evidence_refs?: string[];
    expected_revision?: number; idempotency_key?: string; client_context: ClientContext;
  }): Promise<ToolResult> {
    return this.mutate(
      args.workflow_id, args.client_context, args.expected_revision, args.idempotency_key,
      'experience.propose_hypothesis',
      { type: 'hypothesis.proposed', payload: { statement: args.statement } },
      async (c) => {
        const hypothesis_id = 'hyp_' + randomUUID().slice(0, 12);
        await this.adapter.insertHypothesis({
          hypothesis_id,
          episode_id: c.episode!.experience_id,
          statement: args.statement,
          status: 'proposed',
          supporting_evidence: args.evidence_refs ?? [],
          conflicting_evidence: [],
          seq: 0,
        });
        return { hypothesis_id };
      }
    );
  }

  async proposeSolution(args: {
    workflow_id: string; strategy: string; mechanism: string; prerequisites?: string[];
    rollback?: string[]; checks?: ValidationCheck[];
    expected_revision?: number; idempotency_key?: string; client_context: ClientContext;
  }): Promise<ToolResult> {
    return this.mutate(
      args.workflow_id, args.client_context, args.expected_revision, args.idempotency_key,
      'experience.propose_solution',
      { type: 'solution.proposed', payload: { strategy: args.strategy } },
      async (c) => {
        if (c.episode!.state === 'DIAGNOSING') {
          assertTransition(c.episode!.state, 'SOLUTION_PROPOSED');
          c.episode!.state = 'SOLUTION_PROPOSED';
          c.workflow.state = 'SOLUTION_PROPOSED';
          await this.adapter.saveEpisode(c.episode!);
        }
        // Solution and its validation plan are coupled (tool contract)
        const plan = {
          validation_plan_id: 'vp_' + randomUUID().slice(0, 12),
          episode_id: c.episode!.experience_id,
          checks: args.checks ?? [],
          seq: 0,
        };
        await this.adapter.insertValidationPlan(plan);
        return { solution_id: 'sol_' + randomUUID().slice(0, 12), validation_plan_id: plan.validation_plan_id, checks_recorded: plan.checks.length };
      }
    );
  }

  // ---------- validation ----------
  async planValidation(args: {
    workflow_id: string; checks: ValidationCheck[];
    expected_revision?: number; idempotency_key?: string; client_context: ClientContext;
  }): Promise<ToolResult> {
    return this.mutate(
      args.workflow_id, args.client_context, args.expected_revision, args.idempotency_key,
      'validation.plan',
      { type: 'validation.planned', payload: { count: args.checks.length } },
      async (c) => {
        if (!args.checks.some((ch) => ch.targets_original_failure)) {
          throw missingEvidence(['checks[].targets_original_failure — at least one check must target the original failure']);
        }
        if (c.episode!.state === 'SOLUTION_PROPOSED') {
          assertTransition(c.episode!.state, 'VALIDATING');
          c.episode!.state = 'VALIDATING';
          c.workflow.state = 'VALIDATING';
          await this.adapter.saveEpisode(c.episode!);
        }
        const plan = {
          validation_plan_id: 'vp_' + randomUUID().slice(0, 12),
          episode_id: c.episode!.experience_id,
          checks: args.checks,
          seq: 0,
        };
        await this.adapter.insertValidationPlan(plan);
        return { validation_plan_id: plan.validation_plan_id };
      }
    );
  }

  async recordValidationRun(args: {
    workflow_id: string; check_index: number; status: 'passed' | 'failed';
    exit_code?: number; evidence_artifact_id?: string;
    expected_revision?: number; idempotency_key?: string; client_context: ClientContext;
  }): Promise<ToolResult> {
    return this.mutate(
      args.workflow_id, args.client_context, args.expected_revision, args.idempotency_key,
      'validation.record_run',
      { type: 'validation.recorded', payload: { check_index: args.check_index, status: args.status } },
      async (c) => {
        const check = c.plan?.checks[args.check_index];
        if (!check) throw new EmmsError('INVALID_REQUEST', 'Unknown check_index', false, { check_index: args.check_index });
        if (check.evidence_requirement && !args.evidence_artifact_id) {
          throw missingEvidence([`checks[${args.check_index}].evidence_artifact_id`]);
        }
        const run_id = 'run_' + randomUUID().slice(0, 12);
        await this.adapter.insertValidationRun({
          run_id,
          episode_id: c.episode!.experience_id,
          check_index: args.check_index,
          status: args.status,
          exit_code: args.exit_code,
          evidence_artifact_id: args.evidence_artifact_id,
          seq: 0,
        });
        // episode may still be SOLUTION_PROPOSED; entering validation is the
        // first run being recorded (FR-019 progression)
        if (c.episode!.state === 'SOLUTION_PROPOSED') {
          assertTransition(c.episode!.state, 'VALIDATING');
          c.episode!.state = 'VALIDATING';
          c.workflow.state = 'VALIDATING';
          await this.adapter.saveEpisode(c.episode!);
        }
        if (c.episode!.state === 'VALIDATING') {
          const freshRuns = await this.adapter.listValidationRuns(c.episode!.experience_id);
          const allVerified =
            c.plan!.checks.every((_, i) =>
              freshRuns.some((r) => r.check_index === i && r.status === 'passed' && !!r.evidence_artifact_id)
            );
          if (allVerified) {
            assertTransition(c.episode!.state, 'LOCALLY_VERIFIED');
            c.episode!.state = 'LOCALLY_VERIFIED';
            c.episode!.last_verified_at = this.now();
            c.workflow.state = 'LOCALLY_VERIFIED';
            await this.adapter.saveEpisode(c.episode!);
          }
        }
        return { run_id };
      }
    );
  }

  // ---------- finalization ----------
  async finalize(args: {
    workflow_id: string; requested_outcome: 'verified' | 'partially_verified' | 'unresolved';
    expected_revision?: number; idempotency_key?: string; client_context: ClientContext;
  }): Promise<ToolResult> {
    const warnings: Parameters<typeof buildGuidance>[0]['warnings'] = [];
    const out = await this.mutate(
      args.workflow_id, args.client_context, args.expected_revision, args.idempotency_key,
      'experience.finalize',
      { type: 'episode.finalized', payload: { requested: args.requested_outcome } },
      async (c) => {
        const ep = c.episode!;
        // Re-read plan/runs so the just-recorded mutation counts (read-after-write)
        const plan = await this.adapter.getValidationPlan(ep.experience_id);
        const runs = await this.adapter.listValidationRuns(ep.experience_id);
        // duplicate candidate detection (D5)
        const dups = await this.detectDuplicates(ep.experience_id, ep.scope_id);
        if (args.requested_outcome === 'verified') {
          const missing: string[] = [];
          const verified = (idx: number) => runs.some((r) => r.check_index === idx && r.status === 'passed' && !!r.evidence_artifact_id);
          if (!plan) missing.push('validation_plan');
          if (plan) {
            plan.checks.forEach((_, i) => {
              if (!verified(i)) missing.push(`checks[${i}].passed_evidence`);
            });
          }
          // critical side effects (FR-008 criteria): harmful attempts that were
          // never resolved by a later successful attempt remain critical
          const freshAttempts = await this.adapter.listAttempts(ep.experience_id);
          const ordered = freshAttempts.sort((a, b) => a.seq - b.seq);
          const harmfulOpen = ordered.some((a, i) =>
            a.classification === 'harmful' &&
            !ordered.slice(i + 1).some((b) => b.classification === 'successful')
          );
          if (harmfulOpen) missing.push('unresolved_critical_side_effect');
          if (missing.length) {
            if (dups.length) warnings.push({ code: 'DUPLICATE', severity: 'medium', message: `Duplicate candidate(s): ${dups.join(', ')}` });
            if (isTerminal(ep.state)) return { final_state: ep.state };
            // Assessment is read-only: episode state stays VALIDATING so the
            // agent can complete the missing evidence and re-finalize.
            throw missingEvidence(missing);
          }
        }
        let final_state: Episode['state'];
        if (args.requested_outcome === 'verified') {
          if (isTerminal(ep.state) || ep.state === 'LOCALLY_VERIFIED') final_state = ep.state;
          else {
            assertTransition(ep.state, 'LOCALLY_VERIFIED');
            final_state = 'LOCALLY_VERIFIED';
            ep.last_verified_at = this.now();
          }
        } else if (args.requested_outcome === 'partially_verified') {
          final_state = isTerminal(ep.state) ? ep.state : 'PARTIALLY_VERIFIED';
        } else {
          final_state = isTerminal(ep.state) ? ep.state : 'UNRESOLVED';
        }
        if (final_state !== ep.state) {
          assertTransition(ep.state, final_state);
          ep.state = final_state;
        }
        c.workflow.state = final_state;
        await this.adapter.saveEpisode(ep);
        const result: Record<string, unknown> = { final_state };
        if (dups.length) {
          warnings.push({ code: 'DUPLICATE', severity: 'medium', message: `Duplicate candidate(s): ${dups.join(', ')}` });
          result.duplicate_candidates = dups;
        }
        return result;
      },
      warnings
    );
    return out;
  }

  // ---------- evidence ----------
  async attachArtifact(args: {
    workflow_id: string; content_base64: string; kind: string; media_type: string;
    expected_revision?: number; idempotency_key?: string; client_context: ClientContext;
  }): Promise<ToolResult> {
    const buffer = Buffer.from(args.content_base64, 'base64');
    const MAX_BYTES = 1024 * 1024;
    const ALLOWED_TYPES = ['text/plain', 'application/json', 'text/x-diff', 'application/x-ndjson'];
    if (buffer.length > MAX_BYTES) throw artifactRejected([`size ${buffer.length} exceeds 1 MiB limit`]);
    if (!ALLOWED_TYPES.includes(args.media_type)) throw artifactRejected([`media_type ${args.media_type} not accepted`]);
    const r = redact(buffer.toString('utf8'));
    return this.mutate(
      args.workflow_id, args.client_context, args.expected_revision, args.idempotency_key,
      'artifact.attach',
      { type: 'artifact.attached', payload: { kind: args.kind } },
      async (c) => {
        const { content_hash, byte_size } = await this.evidence.store(Buffer.from(r.redacted, 'utf8'));
        const artifact_id = 'art_' + randomUUID().slice(0, 12);
        await this.adapter.putArtifactMeta({
          artifact_id,
          episode_id: c.episode!.experience_id,
          scope_id: c.episode!.scope_id,
          content_hash, kind: args.kind, media_type: args.media_type,
          byte_size,
          redaction_status: 'completed',
          redaction_findings: r.findings,
          redaction_ruleset_version: r.ruleset_version,
          trust: r.flags_instruction_like ? 'untrusted_flagged_instruction_like' : 'untrusted_data',
          created_at: this.now(),
        });
        return { artifact_id, content_hash, redaction: { status: 'completed', findings_count: r.findings } };
      }
    );
  }

  /** Test/fixture helper: record environment dimensions for an episode's workflow. */
  async putEnvironmentDirect(workflow_id: string, env: Record<string, string>, scope_id: string): Promise<void> {
    const wf = await this.adapter.getWorkflow(workflow_id, scope_id);
    if (!wf?.experience_id) return;
    await this.adapter.putEnvironment(
      wf.experience_id,
      Object.entries(env).map(([key, value]) => ({ key, value }))
    );
  }

  // ---------- retrieval (US1) ----------
  async search(args: {
    query: string; scope_id: string; failure_signature_hash?: string;
    limit?: number; environment?: Record<string, string>;
  }): Promise<ToolResult> {
    const limit = Math.min(Math.max(args.limit ?? 5, 1), 20);
    const candidates = new Map<string, SearchRow>();
    const add = (rows: SearchRow[]) => rows.forEach((r) => candidates.set(r.episode_id, r));
    if (args.failure_signature_hash) add(await this.adapter.searchExact(args.failure_signature_hash, args.scope_id));
    add(await this.adapter.searchFullText(args.query.split(/\s+/).slice(0, 6).join(' '), args.scope_id));
    add(await this.adapter.listInScope(args.scope_id));

    const results = [];
    for (const row of candidates.values()) {
      const env = await this.adapter.getEnvironment?.(row.episode_id);
      const { harmful, useful } = await this.adapter.getFeedbackSummary(row.episode_id);
      const stale = row.last_verified_at
        ? Date.now() - Date.parse(row.last_verified_at) > 90 * 24 * 3600 * 1000
        : true;
      const knownBad = (await this.adapter.listAttempts(row.episode_id))
        .filter((a) => a.classification === 'harmful' || a.classification === 'ineffective')
        .map((a) => ({ strategy: a.intent, outcome: a.outcome ?? a.classification }));
      const contradiction = await this.hasContradiction(row.episode_id);
      const envMismatch = env ? env.filter((e) => args.environment?.[e.key] !== undefined && args.environment[e.key] !== e.value) : [];
      const applicability = env ? Math.max(0, 1 - envMismatch.length / Math.max(env.length, 1)) : 0.5;
      let score =
        (row.normalized_hash === args.failure_signature_hash ? 1 : 0) * 0.40 +
        applicability * 0.35 +
        (row.state === 'LOCALLY_VERIFIED' || row.state === 'REPRODUCED' ? 0.15 : 0.05) +
        Math.min(useful, 3) * 0.01;
      if (envMismatch.length > 0) score -= 0.50; // incompatibility penalty (D6)
      if (stale) score -= 0.15;
      if (contradiction) score -= 0.30;
      if (harmful > 0) score -= 0.40 * harmful;
      results.push({
        experience_id: row.episode_id,
        summary: row.summary,
        relevance: Math.max(0, Math.round(score * 1000) / 1000),
        applicability: {
          score: applicability,
          matches: env ? env.filter((e) => args.environment?.[e.key] === e.value).map((e) => e.key) : [],
          mismatches: envMismatch.map((e) => e.key),
          unknowns: [],
          hard_exclusions: [],
        },
        validation: { tier: row.state, last_verified_at: row.last_verified_at ?? null },
        known_bad_attempts: knownBad,
        flags: { contradiction, duplicate: false, stale },
        recommended_use: envMismatch.length > 0 ? 'reference_only' : 'applicable',
        excerpt: row.summary.slice(0, 2000),
      });
    }
    results.sort((a, b) => b.relevance - a.relevance);
    return {
      result: {
        results: results.slice(0, limit),
        retrieval_notes: { semantic_available: false },
      },
      guidance: {
        workflow_id: 'n/a',
        workflow_state: 'OBSERVED',
        revision: 1,
        missing_information: [],
        warnings: [{ code: 'SEMANTIC_UNAVAILABLE', severity: 'low', message: 'Semantic retrieval arm not active in MVP; signature + full-text only' }],
        allowed_next_tools: ['experience.search', 'experience.record_reuse_feedback'],
        recommended_next_request: { tool: 'experience.search', reason: 'Narrow or broaden the query', arguments_template: { query: '<collect value>', scope_id: args.scope_id } },
        alternative_next_requests: [],
        stop_conditions: [],
        human_approval: { required: false },
      },
    };
  }

  private async hasContradiction(episode_id: string): Promise<boolean> {
    const attempts = await this.adapter.listAttempts(episode_id);
    const withOutcome = attempts.filter((a) => a.classification);
    const positive = withOutcome.some((a) => a.classification === 'successful');
    const negative = withOutcome.some((a) => a.classification === 'harmful' || a.classification === 'ineffective');
    return positive && negative;
  }

  private async detectDuplicates(episode_id: string, scope_id: string): Promise<string[]> {
    const row = (await this.adapter.listInScope(scope_id)).find((r) => r.episode_id === episode_id);
    if (!row) return [];
    const sameHash = await this.adapter.searchExact(row.normalized_hash, scope_id);
    const dups: string[] = [];
    for (const other of sameHash) {
      if (other.episode_id === episode_id) continue;
      if (jaccard(other.summary, row.summary) >= 0.8) dups.push(other.episode_id);
    }
    return dups;
  }

  // ---------- lifecycle (US4) ----------
  async recordRegression(args: {
    workflow_id: string; failed_episode_id: string; reason: string;
    expected_revision?: number; client_context: ClientContext;
  }): Promise<ToolResult> {
    return this.mutate(
      args.workflow_id, args.client_context, args.expected_revision, undefined,
      'experience.mark_regression',
      { type: 'regression.recorded', payload: { failed_episode_id: args.failed_episode_id } },
      async (c) => {
        const failed = await this.adapter.getEpisode(args.failed_episode_id, c.episode!.scope_id);
        if (failed && !isTerminal(failed.state)) {
          assertTransition(failed.state, 'CONTRADICTED');
          failed.state = 'CONTRADICTED';
          await this.adapter.saveEpisode(failed);
        }
        await this.adapter.insertAudit({
          event_id: randomUUID(),
          actor: { actor_type: 'agent', actor_id: c.workflow.actor_id },
          action: 'experience.mark_regression',
          target: args.failed_episode_id,
          timestamp: this.now(), policy_version: POLICY_VERSION, reason: args.reason,
        });
        return { demoted: args.failed_episode_id };
      }
    );
  }

  async invalidate(args: {
    workflow_id: string; target_episode_id: string; reason: string;
    expected_revision?: number; client_context: ClientContext; actor_type?: 'agent' | 'human';
  }): Promise<ToolResult> {
    return this.mutate(
      args.workflow_id, args.client_context, args.expected_revision, undefined,
      'experience.invalidate',
      { type: 'episode.invalidated', payload: { target: args.target_episode_id } },
      async (c) => {
        const target = await this.adapter.getEpisode(args.target_episode_id, c.episode!.scope_id);
        if (!target) throw new EmmsError('INVALID_REQUEST', 'Target episode not found', false, { target: args.target_episode_id });
        if (!isTerminal(target.state)) {
          assertTransition(target.state, 'INVALIDATED');
          target.state = 'INVALIDATED';
          await this.adapter.saveEpisode(target);
        }
        await this.adapter.insertAudit({
          event_id: randomUUID(),
          actor: { actor_type: args.actor_type ?? 'human', actor_id: c.workflow.actor_id },
          action: 'experience.invalidate', target: args.target_episode_id,
          timestamp: this.now(), policy_version: POLICY_VERSION, reason: args.reason,
        });
        return { invalidated: args.target_episode_id };
      }
    );
  }

  async recordReuseFeedback(args: {
    workflow_id: string; experience_id: string;
    verdict: 'applicable' | 'useful' | 'misleading' | 'harmful';
    changed_plan?: boolean; outcome?: string; client_context: ClientContext;
  }): Promise<ToolResult> {
    const c = await this.loadCtx(args.workflow_id, args.client_context);
    await this.adapter.insertFeedback({
      feedback_id: 'fb_' + randomUUID().slice(0, 12),
      episode_id: args.experience_id,
      verdict: args.verdict,
      changed_plan: args.changed_plan,
      outcome: args.outcome,
      seq: 0,
    });
    const guidance = await this.guidanceFor(c);
    return { result: { feedback_id: 'recorded', experience_id: args.experience_id, verdict: args.verdict }, guidance };
  }
}

function jaccard(a: string, b: string): number {
  const tokens = (s: string) => new Set(s.toLowerCase().split(/\W+/).filter((w) => w.length > 3));
  const sa = tokens(a);
  const sb = tokens(b);
  const inter = [...sa].filter((t) => sb.has(t)).length;
  const union = new Set([...sa, ...sb]).size;
  return union === 0 ? 0 : inter / union;
}
