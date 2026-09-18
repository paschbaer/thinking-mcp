/**
 * PostgreSQL + pgvector StorageAdapter (D-team-phase, research.md/Clarifications).
 *
 * Implements the same StorageAdapter contract as SqliteAdapter — tool behavior
 * is identical across backends. Selected via EMMS_STORAGE_BACKEND=postgres;
 * the `pg` driver is imported lazily so local SQLite users never need it.
 *
 * Vector columns use pgvector (`CREATE EXTENSION IF NOT EXISTS vector`).
 */
import type {
  Attempt,
  AuditEvent,
  DomainEvent,
  Episode,
  EvidenceArtifact,
  Hypothesis,
  IdempotencyRecord,
  Observation,
  ReuseFeedback,
  ValidationPlan,
  ValidationRun,
  Workflow,
} from '../domain/types.js';
import type { SearchRow, StorageAdapter } from './adapter.js';
import type { LessonRecord } from '../domain/lesson-service.js';

export interface PostgresAdapterOptions {
  connectionString: string;
  /** Required superuser once: CREATE EXTENSION vector */
  autoCreateExtension?: boolean;
}

export class PostgresAdapter implements StorageAdapter {
  // `pg` types via type-only import; the module itself is loaded lazily.
  private client: import('pg').Client | null = null;
  private opts: PostgresAdapterOptions;
  private seq = 0;

  constructor(opts: PostgresAdapterOptions) {
    this.opts = opts;
  }

  async init(): Promise<void> {
    const { Client } = await import('pg');
    this.client = new Client({ connectionString: this.opts.connectionString });
    await this.client.connect();
    if (this.opts.autoCreateExtension) {
      await this.client.query('CREATE EXTENSION IF NOT EXISTS vector');
    }
    await this.runMigrations();
  }

  async close(): Promise<void> {
    await this.client?.end();
    this.client = null;
  }

  private async runMigrations(): Promise<void> {
    await this.client!.query(`
      CREATE TABLE IF NOT EXISTS workflows (
        workflow_id TEXT PRIMARY KEY,
        experience_id TEXT,
        goal TEXT NOT NULL,
        scope_id TEXT NOT NULL,
        scope_fingerprint TEXT,
        state TEXT NOT NULL,
        revision INTEGER NOT NULL,
        actor_id TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL
      );
      CREATE TABLE IF NOT EXISTS episodes (
        experience_id TEXT PRIMARY KEY,
        workflow_id TEXT NOT NULL,
        scope_id TEXT NOT NULL,
        scope_fingerprint TEXT,
        visibility TEXT NOT NULL,
        goal_summary TEXT NOT NULL,
        acceptance_criteria JSONB NOT NULL,
        problem_summary TEXT NOT NULL,
        state TEXT NOT NULL,
        last_verified_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL
      );
      CREATE TABLE IF NOT EXISTS observations (
        observation_id TEXT PRIMARY KEY,
        episode_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        content TEXT NOT NULL,
        exit_code INTEGER,
        evidence_artifact_id TEXT,
        provenance JSONB NOT NULL,
        seq BIGINT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS attempts (
        attempt_id TEXT PRIMARY KEY,
        episode_id TEXT NOT NULL,
        intent TEXT NOT NULL,
        fact TEXT,
        risk_classification TEXT,
        rationale TEXT,
        prior_knowledge_used TEXT,
        outcome TEXT,
        side_effects JSONB,
        affected_artifacts JSONB,
        classification TEXT,
        seq BIGINT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS hypotheses (
        hypothesis_id TEXT PRIMARY KEY,
        episode_id TEXT NOT NULL,
        statement TEXT NOT NULL,
        status TEXT NOT NULL,
        supporting_evidence JSONB NOT NULL,
        conflicting_evidence JSONB NOT NULL,
        seq BIGINT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS validation_plans (
        validation_plan_id TEXT PRIMARY KEY,
        episode_id TEXT NOT NULL UNIQUE,
        checks JSONB NOT NULL,
        seq BIGINT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS validation_runs (
        run_id TEXT PRIMARY KEY,
        episode_id TEXT NOT NULL,
        check_index INTEGER NOT NULL,
        status TEXT NOT NULL,
        exit_code INTEGER,
        evidence_artifact_id TEXT,
        seq BIGINT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS artifacts (
        artifact_id TEXT PRIMARY KEY,
        episode_id TEXT NOT NULL,
        scope_id TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        kind TEXT NOT NULL,
        media_type TEXT NOT NULL,
        byte_size INTEGER NOT NULL,
        redaction_status TEXT NOT NULL,
        redaction_findings INTEGER NOT NULL,
        redaction_ruleset_version TEXT NOT NULL,
        trust TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL
      );
      CREATE TABLE IF NOT EXISTS signatures (
        episode_id TEXT NOT NULL,
        normalized_hash TEXT NOT NULL,
        exact_tokens JSONB NOT NULL,
        kind TEXT NOT NULL,
        exit_code INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_signatures_hash ON signatures(normalized_hash);
      CREATE TABLE IF NOT EXISTS environment (
        episode_id TEXT NOT NULL,
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        PRIMARY KEY (episode_id, key)
      );
      CREATE TABLE IF NOT EXISTS embeddings (
        episode_id TEXT PRIMARY KEY,
        vec vector(384)
      );
      CREATE TABLE IF NOT EXISTS lessons (
        lesson_id TEXT PRIMARY KEY,
        normalized_hash TEXT NOT NULL UNIQUE,
        data JSONB NOT NULL
      );
      CREATE TABLE IF NOT EXISTS events (
        event_id TEXT PRIMARY KEY,
        workflow_id TEXT NOT NULL,
        episode_id TEXT,
        type TEXT NOT NULL,
        payload JSONB NOT NULL,
        seq BIGINT NOT NULL,
        recorded_at TIMESTAMPTZ NOT NULL
      );
      CREATE TABLE IF NOT EXISTS feedback (
        feedback_id TEXT PRIMARY KEY,
        episode_id TEXT NOT NULL,
        verdict TEXT NOT NULL,
        changed_plan BOOLEAN,
        outcome TEXT,
        seq BIGINT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS audit (
        event_id TEXT PRIMARY KEY,
        actor JSONB NOT NULL,
        action TEXT NOT NULL,
        target TEXT NOT NULL,
        before_revision INTEGER,
        after_revision INTEGER,
        timestamp TIMESTAMPTZ NOT NULL,
        policy_version TEXT NOT NULL,
        reason TEXT
      );
      CREATE TABLE IF NOT EXISTS idempotency (
        key TEXT NOT NULL,
        actor_id TEXT NOT NULL,
        tool TEXT NOT NULL,
        request_id TEXT NOT NULL,
        result_json JSONB NOT NULL,
        PRIMARY KEY (key, actor_id, tool)
      );
    `);
  }

  private nextSeq(): number {
    return ++this.seq;
  }

  // ---- Workflows ----
  async createWorkflow(wf: Workflow): Promise<void> {
    await this.client!.query(
      `INSERT INTO workflows (workflow_id, experience_id, goal, scope_id, scope_fingerprint, state, revision, actor_id, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [wf.workflow_id, wf.experience_id ?? null, wf.goal, wf.scope_id, wf.scope_fingerprint ?? null, wf.state, wf.revision, wf.actor_id, wf.created_at]
    );
  }
  async getWorkflow(workflow_id: string, scope_id: string): Promise<Workflow | undefined> {
    const r = await this.client!.query('SELECT * FROM workflows WHERE workflow_id=$1 AND scope_id=$2', [workflow_id, scope_id]);
    return r.rows[0] as Workflow | undefined;
  }
  async saveWorkflow(wf: Workflow): Promise<void> {
    await this.client!.query(
      'UPDATE workflows SET experience_id=$1, state=$2, revision=$3 WHERE workflow_id=$4 AND scope_id=$5',
      [wf.experience_id ?? null, wf.state, wf.revision, wf.workflow_id, wf.scope_id]
    );
  }

  // ---- Episodes ----
  async createEpisode(ep: Episode): Promise<void> {
    await this.client!.query(
      `INSERT INTO episodes (experience_id, workflow_id, scope_id, scope_fingerprint, visibility, goal_summary, acceptance_criteria, problem_summary, state, last_verified_at, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [ep.experience_id, ep.workflow_id, ep.scope_id, ep.scope_fingerprint ?? null, ep.visibility, ep.goal_summary, JSON.stringify(ep.acceptance_criteria), ep.problem_summary, ep.state, ep.last_verified_at ?? null, ep.created_at]
    );
  }
  async getEpisode(episode_id: string, scope_id: string): Promise<Episode | undefined> {
    const r = await this.client!.query('SELECT * FROM episodes WHERE experience_id=$1 AND scope_id=$2', [episode_id, scope_id]);
    if (!r.rows[0]) return undefined;
    const row = r.rows[0];
    return { ...row, acceptance_criteria: row.acceptance_criteria } as Episode;
  }
  async saveEpisode(ep: Episode): Promise<void> {
    await this.client!.query(
      `UPDATE episodes SET state=$1, last_verified_at=$2, goal_summary=$3, acceptance_criteria=$4, problem_summary=$5, visibility=$8
       WHERE experience_id=$6 AND scope_id=$7`,
      [ep.state, ep.last_verified_at ?? null, ep.goal_summary, JSON.stringify(ep.acceptance_criteria), ep.problem_summary, ep.experience_id, ep.scope_id, ep.visibility]
    );
  }

  // ---- Records ----
  async insertObservation(o: Observation): Promise<void> {
    await this.client!.query(
      `INSERT INTO observations (observation_id, episode_id, kind, content, exit_code, evidence_artifact_id, provenance, seq)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [o.observation_id, o.episode_id, o.kind, o.content, o.exit_code ?? null, o.evidence_artifact_id ?? null, JSON.stringify(o.provenance), this.nextSeq()]
    );
  }
  async listObservations(episode_id: string): Promise<Observation[]> {
    const r = await this.client!.query('SELECT * FROM observations WHERE episode_id=$1 ORDER BY seq', [episode_id]);
    return r.rows.map((row: Record<string, unknown>) => ({ ...(row as unknown as Observation), provenance: row.provenance as Observation['provenance'] }));
  }
  async insertAttempt(a: Attempt): Promise<void> {
    await this.client!.query(
      `INSERT INTO attempts (attempt_id, episode_id, intent, fact, risk_classification, rationale, prior_knowledge_used, outcome, side_effects, affected_artifacts, classification, seq)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [a.attempt_id, a.episode_id, a.intent, a.fact ?? null, a.risk_classification ?? null, a.rationale ?? null, a.prior_knowledge_used ?? null, a.outcome ?? null, a.side_effects ? JSON.stringify(a.side_effects) : null, a.affected_artifacts ? JSON.stringify(a.affected_artifacts) : null, a.classification ?? null, this.nextSeq()]
    );
  }
  async getAttempt(attempt_id: string, episode_id: string): Promise<Attempt | undefined> {
    const r = await this.client!.query('SELECT * FROM attempts WHERE attempt_id=$1 AND episode_id=$2', [attempt_id, episode_id]);
    return r.rows[0] as Attempt | undefined;
  }
  async saveAttempt(a: Attempt): Promise<void> {
    await this.client!.query(
      `UPDATE attempts SET fact=$1, outcome=$2, side_effects=$3, affected_artifacts=$4, classification=$5
       WHERE attempt_id=$6 AND episode_id=$7`,
      [a.fact ?? null, a.outcome ?? null, a.side_effects ? JSON.stringify(a.side_effects) : null, a.affected_artifacts ? JSON.stringify(a.affected_artifacts) : null, a.classification ?? null, a.attempt_id, a.episode_id]
    );
  }
  async listAttempts(episode_id: string): Promise<Attempt[]> {
    const r = await this.client!.query('SELECT * FROM attempts WHERE episode_id=$1 ORDER BY seq', [episode_id]);
    return (r.rows as Record<string, unknown>[]).map((row) => ({
      ...(row as unknown as Attempt),
      side_effects: (row.side_effects as string[] | null) ?? undefined,
      affected_artifacts: (row.affected_artifacts as string[] | null) ?? undefined,
    }));
  }
  async insertHypothesis(h: Hypothesis): Promise<void> {
    await this.client!.query(
      `INSERT INTO hypotheses (hypothesis_id, episode_id, statement, status, supporting_evidence, conflicting_evidence, seq)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [h.hypothesis_id, h.episode_id, h.statement, h.status, JSON.stringify(h.supporting_evidence), JSON.stringify(h.conflicting_evidence), this.nextSeq()]
    );
  }
  async saveHypothesis(h: Hypothesis): Promise<void> {
    await this.client!.query('UPDATE hypotheses SET status=$1, statement=$2 WHERE hypothesis_id=$3 AND episode_id=$4', [h.status, h.statement, h.hypothesis_id, h.episode_id]);
  }
  async listHypotheses(episode_id: string): Promise<Hypothesis[]> {
    const r = await this.client!.query('SELECT * FROM hypotheses WHERE episode_id=$1 ORDER BY seq', [episode_id]);
    return r.rows as Hypothesis[];
  }
  async insertValidationPlan(p: ValidationPlan): Promise<void> {
    await this.client!.query('INSERT INTO validation_plans (validation_plan_id, episode_id, checks, seq) VALUES ($1,$2,$3,$4)', [p.validation_plan_id, p.episode_id, JSON.stringify(p.checks), this.nextSeq()]);
  }
  async getValidationPlan(episode_id: string): Promise<ValidationPlan | undefined> {
    const r = await this.client!.query('SELECT * FROM validation_plans WHERE episode_id=$1', [episode_id]);
    if (!r.rows[0]) return undefined;
    return { ...r.rows[0], checks: r.rows[0].checks } as ValidationPlan;
  }
  async insertValidationRun(run: ValidationRun): Promise<void> {
    await this.client!.query(
      `INSERT INTO validation_runs (run_id, episode_id, check_index, status, exit_code, evidence_artifact_id, seq)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [run.run_id, run.episode_id, run.check_index, run.status, run.exit_code ?? null, run.evidence_artifact_id ?? null, this.nextSeq()]
    );
  }
  async listValidationRuns(episode_id: string): Promise<ValidationRun[]> {
    return (await this.client!.query('SELECT * FROM validation_runs WHERE episode_id=$1 ORDER BY seq', [episode_id])).rows as ValidationRun[];
  }

  // ---- Evidence ----
  async putArtifactMeta(a: EvidenceArtifact): Promise<void> {
    await this.client!.query(
      `INSERT INTO artifacts (artifact_id, episode_id, scope_id, content_hash, kind, media_type, byte_size, redaction_status, redaction_findings, redaction_ruleset_version, trust, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [a.artifact_id, a.episode_id, a.scope_id, a.content_hash, a.kind, a.media_type, a.byte_size, a.redaction_status, a.redaction_findings, a.redaction_ruleset_version, a.trust, a.created_at]
    );
  }
  async getArtifactMeta(artifact_id: string, scope_id: string): Promise<EvidenceArtifact | undefined> {
    const r = await this.client!.query('SELECT * FROM artifacts WHERE artifact_id=$1 AND scope_id=$2', [artifact_id, scope_id]);
    return r.rows[0] as EvidenceArtifact | undefined;
  }

  // ---- Append-only events ----
  async appendEvent(e: DomainEvent): Promise<void> {
    await this.client!.query(
      `INSERT INTO events (event_id, workflow_id, episode_id, type, payload, seq, recorded_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [e.event_id, e.workflow_id, e.episode_id ?? null, e.type, JSON.stringify(e.payload), this.nextSeq(), e.recorded_at]
    );
  }
  async listEvents(workflow_id: string): Promise<DomainEvent[]> {
    const r = await this.client!.query('SELECT * FROM events WHERE workflow_id=$1 ORDER BY seq', [workflow_id]);
    return r.rows as DomainEvent[];
  }

  // ---- Feedback / audit / idempotency ----
  async insertFeedback(f: ReuseFeedback): Promise<void> {
    await this.client!.query(
      `INSERT INTO feedback (feedback_id, episode_id, verdict, changed_plan, outcome, seq)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [f.feedback_id, f.episode_id, f.verdict, f.changed_plan ?? null, f.outcome ?? null, this.nextSeq()]
    );
  }
  async listFeedback(episode_id: string): Promise<ReuseFeedback[]> {
    return (await this.client!.query('SELECT * FROM feedback WHERE episode_id=$1 ORDER BY seq', [episode_id])).rows as ReuseFeedback[];
  }
  async insertAudit(a: AuditEvent): Promise<void> {
    await this.client!.query(
      `INSERT INTO audit (event_id, actor, action, target, before_revision, after_revision, timestamp, policy_version, reason)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [a.event_id, JSON.stringify(a.actor), a.action, a.target, a.before_revision ?? null, a.after_revision ?? null, a.timestamp, a.policy_version, a.reason ?? null]
    );
  }
  async getIdempotency(key: string): Promise<IdempotencyRecord | undefined> {
    const r = await this.client!.query('SELECT * FROM idempotency WHERE key=$1', [key]);
    return r.rows[0] as IdempotencyRecord | undefined;
  }
  async putIdempotency(rec: IdempotencyRecord): Promise<boolean> {
    const r = await this.client!.query(
      `INSERT INTO idempotency (key, actor_id, tool, request_id, result_json) VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (key, actor_id, tool) DO NOTHING`,
      [rec.key, rec.actor_id, rec.tool, rec.request_id, rec.result_json]
    );
    return (r.rowCount ?? 0) > 0;
  }

  // ---- Retrieval ----
  async searchExact(hash: string, scope_id: string): Promise<SearchRow[]> {
    const params: unknown[] = [hash];
    const scopeFilter = scope_id === '' ? '' : `AND e.scope_id = $2`;
    if (scope_id !== '') params.push(scope_id);
    const r = await this.client!.query(
      `SELECT e.experience_id AS episode_id, e.goal_summary AS summary, e.state, e.scope_id,
              e.last_verified_at, s.normalized_hash, s.exact_tokens
       FROM episodes e JOIN signatures s ON s.episode_id = e.experience_id
       WHERE s.normalized_hash = $1 ${scopeFilter}`,
      params
    );
    return r.rows as SearchRow[];
  }
  async searchFullText(terms: string, scope_id: string): Promise<SearchRow[]> {
    const params: unknown[] = [terms];
    const scopeFilter = scope_id === '' ? '' : 'AND e.scope_id = $2';
    if (scope_id !== '') params.push(scope_id);
    const r = await this.client!.query(
      `SELECT e.experience_id AS episode_id, e.goal_summary AS summary, e.state, e.scope_id,
              e.last_verified_at, s.normalized_hash, s.exact_tokens
       FROM episodes e JOIN signatures s ON s.episode_id = e.experience_id
       WHERE e.goal_summary ILIKE '%' || $1 || '%' ${scopeFilter}`,
      params
    );
    return r.rows as SearchRow[];
  }
  async listInScope(scope_id: string): Promise<SearchRow[]> {
    const r = await this.client!.query(
      `SELECT e.experience_id AS episode_id, e.goal_summary AS summary, e.state, e.scope_id,
              e.last_verified_at, s.normalized_hash, s.exact_tokens
       FROM episodes e JOIN signatures s ON s.episode_id = e.experience_id
       WHERE e.scope_id = $1`,
      [scope_id]
    );
    return r.rows as SearchRow[];
  }
  async getFeedbackSummary(episode_id: string): Promise<{ harmful: number; useful: number }> {
    const r = await this.client!.query(
      `SELECT COUNT(*) FILTER (WHERE verdict='harmful') AS harmful,
              COUNT(*) FILTER (WHERE verdict IN ('useful','applicable')) AS useful
       FROM feedback WHERE episode_id=$1`,
      [episode_id]
    );
    const row = r.rows[0] as { harmful: string; useful: string };
    return { harmful: Number(row.harmful), useful: Number(row.useful) };
  }
  async putSignature(episode_id: string, normalized_hash: string, exact_tokens: string, kind: string, exit_code?: number): Promise<void> {
    await this.client!.query(
      'INSERT INTO signatures (episode_id, normalized_hash, exact_tokens, kind, exit_code) VALUES ($1,$2,$3,$4,$5)',
      [episode_id, normalized_hash, exact_tokens, kind, exit_code ?? null]
    );
  }
  async putEnvironment(episode_id: string, dims: Array<{ key: string; value: string }>): Promise<void> {
    for (const d of dims) {
      await this.client!.query('INSERT INTO environment (episode_id, key, value) VALUES ($1,$2,$3) ON CONFLICT (episode_id, key) DO UPDATE SET value=$3', [episode_id, d.key, d.value]);
    }
  }
  async getEnvironment(episode_id: string): Promise<Array<{ key: string; value: string }>> {
    return (await this.client!.query('SELECT key, value FROM environment WHERE episode_id=$1', [episode_id])).rows as Array<{ key: string; value: string }>;
  }

  // ---- Lessons (consolidation groundwork) ----
  async getLessonByHash(_normalized_hash: string): Promise<LessonRecord | undefined> {
    const r = await this.client!.query('SELECT data FROM lessons WHERE normalized_hash=$1', [_normalized_hash]);
    return r.rows[0]?.data as LessonRecord | undefined;
  }
  async insertLesson(l: LessonRecord): Promise<void> {
    await this.client!.query('INSERT INTO lessons (lesson_id, normalized_hash, data) VALUES ($1,$2,$3)', [l.lesson_id, l.normalized_hash, JSON.stringify(l)]);
  }
  async updateLesson(l: LessonRecord): Promise<void> {
    await this.client!.query('UPDATE lessons SET data=$1 WHERE lesson_id=$2', [JSON.stringify(l), l.lesson_id]);
  }
  async getLesson(lesson_id: string): Promise<LessonRecord | undefined> {
    const r = await this.client!.query('SELECT data FROM lessons WHERE lesson_id=$1', [lesson_id]);
    return r.rows[0]?.data as LessonRecord | undefined;
  }
  async searchLessons(_query: string): Promise<LessonRecord[]> {
    return (await this.client!.query('SELECT data FROM lessons')).rows.map((r: { data: LessonRecord }) => r.data);
  }
  async listVerifiedEpisodesForSignature(_normalized_hash: string): Promise<Array<{ experience_id: string; scope_id: string }>> {
    const r = await this.client!.query(
      `SELECT e.experience_id, e.scope_id FROM episodes e JOIN signatures s ON s.episode_id=e.experience_id
       WHERE s.normalized_hash=$1 AND e.state IN ('LOCALLY_VERIFIED','REPRODUCED','CROSS_PROJECT_VERIFIED')`,
      [_normalized_hash]
    );
    return r.rows as Array<{ experience_id: string; scope_id: string }>;
  }
  async listContradictingEpisodesForSignature(_normalized_hash: string): Promise<Array<{ experience_id: string; scope_id: string }>> {
    const r = await this.client!.query(
      `SELECT e.experience_id, e.scope_id FROM episodes e
       JOIN signatures s ON s.episode_id=e.experience_id
       JOIN attempts a ON a.episode_id=e.experience_id
       WHERE s.normalized_hash=$1 AND a.classification IN ('harmful','ineffective')
       GROUP BY e.experience_id, e.scope_id`,
      [_normalized_hash]
    );
    return r.rows as Array<{ experience_id: string; scope_id: string }>;
  }

  // ---- Embeddings ----
  async getEmbedding(episode_id: string): Promise<number[] | undefined> {
    const r = await this.client!.query('SELECT vec::text AS vec FROM embeddings WHERE episode_id=$1', [episode_id]);
    if (!r.rows[0]) return undefined;
    // pgvector text format: "[1,2,3]"
    const raw = r.rows[0].vec as string;
    return JSON.parse(raw.replace(/^\[/, '[').replace(/\]$/, ']'));
  }
  async putEmbedding(episode_id: string, vec: number[]): Promise<void> {
    await this.client!.query(
      'INSERT INTO embeddings (episode_id, vec) VALUES ($1, $2::vector) ON CONFLICT (episode_id) DO UPDATE SET vec=$2::vector',
      [episode_id, `[${vec.join(',')}]`]
    );
  }

  /** Migration helper: vector upsert for the one-shot SQLite -> Postgres CLI. */
  async rawUpsertEmbedding(episode_id: string, vec: number[]): Promise<void> {
    await this.client!.query(
      'INSERT INTO embeddings (episode_id, vec) VALUES ($1, $2::vector) ON CONFLICT (episode_id) DO NOTHING',
      [episode_id, `[${vec.join(',')}]`]
    );
  }

  /** Migration helper: raw upsert for the one-shot SQLite -> Postgres CLI. */
  async rawUpsert(table: string, cols: string[], row: Record<string, unknown>): Promise<void> {
    const values = cols.map((c) => {
      let v = row[c];
      if (v === undefined) v = null;
      return v;
    });
    const placeholders = cols.map((_, i) => `$${i + 1}`).join(',');
    await this.client!.query(
      `INSERT INTO ${table} (${cols.join(',')}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`,
      values
    );
  }
}
