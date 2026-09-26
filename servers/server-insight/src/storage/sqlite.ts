import Database from 'better-sqlite3';
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
import { runMigrations } from './migrations.js';

/**
 * Embedded SQLite adapter (research.md: better-sqlite3, WAL mode for
 * read-after-write consistency; visibility filter applied inside every read).
 */
export class SqliteAdapter implements StorageAdapter {
  private db!: Database.Database;
  private seq = 0;

  constructor(private readonly path: string) {}

  async init(): Promise<void> {
    this.db = new Database(this.path);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    runMigrations(this.db);
    // FTS index maintenance: episodes_fts has NO runtime writer elsewhere,
    // so (1) backfill missing rows from episodes and (2) keep it in sync via
    // triggers — without this, experience_search's full-text arm never
    // matches and retrieval degrades to the scope-list fallback (all
    // relevance 0.25).
    this.db.exec(`
      CREATE TRIGGER IF NOT EXISTS episodes_fts_insert
      AFTER INSERT ON episodes BEGIN
        INSERT INTO episodes_fts (episode_id, summary, scope_id)
        VALUES (new.experience_id, new.goal_summary, new.scope_id);
      END;
      CREATE TRIGGER IF NOT EXISTS episodes_fts_update
      AFTER UPDATE OF goal_summary, scope_id ON episodes BEGIN
        DELETE FROM episodes_fts WHERE episode_id = new.experience_id;
        INSERT INTO episodes_fts (episode_id, summary, scope_id)
        VALUES (new.experience_id, new.goal_summary, new.scope_id);
      END;
      CREATE TRIGGER IF NOT EXISTS observations_fts_insert
      AFTER INSERT ON observations BEGIN
        INSERT INTO observations_fts (episode_id, content, scope_id)
        SELECT new.episode_id, substr(new.content, 1, 500), e.scope_id
        FROM episodes e WHERE e.experience_id = new.episode_id;
      END;
    `);
    this.db.prepare(`
      INSERT INTO episodes_fts (episode_id, summary, scope_id)
      SELECT e.experience_id, e.goal_summary, e.scope_id FROM episodes e
      LEFT JOIN episodes_fts f ON f.episode_id = e.experience_id
      WHERE f.episode_id IS NULL
    `).run();
    // Backfill observation contents (first 500 chars) for stores created
    // before observations_fts existed. Guarded by a count check so steady-
    // state init() (every server start) skips the correlated-subquery scan
    // entirely (review finding: O(N×M) on large stores); the count check is
    // only bypassed when a divergence actually exists (pre-migration store).
    const counts = this.db.prepare(
      `SELECT (SELECT COUNT(*) FROM observations) AS obs,
              (SELECT COUNT(*) FROM observations_fts) AS fts`
    ).get() as { obs: number; fts: number };
    if (counts.obs !== counts.fts) {
      this.db.prepare(`
        INSERT INTO observations_fts (episode_id, content, scope_id)
        SELECT o.episode_id, substr(o.content, 1, 500), e.scope_id
        FROM observations o
        JOIN episodes e ON e.experience_id = o.episode_id
        WHERE NOT EXISTS (
          SELECT 1 FROM observations_fts f
          WHERE f.episode_id = o.episode_id AND f.content = substr(o.content, 1, 500)
        )
      `).run();
    }
    const row = this.db.prepare('SELECT COALESCE(MAX(seq),0) AS s FROM events').get() as { s: number };
    this.seq = row.s;
  }

  async close(): Promise<void> {
    this.db.close();
  }

  private nextSeq(): number {
    return ++this.seq;
  }

  // ---------- Workflows ----------
  async createWorkflow(wf: Workflow): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO workflows (workflow_id, experience_id, goal, scope_id, scope_fingerprint, state, revision, actor_id, created_at)
         VALUES (@workflow_id, @experience_id, @goal, @scope_id, @scope_fingerprint, @state, @revision, @actor_id, @created_at)`
      )
      .run({ ...wf, experience_id: wf.experience_id ?? null, scope_fingerprint: wf.scope_fingerprint ?? null });
  }

  async getWorkflow(workflow_id: string, scope_id: string): Promise<Workflow | undefined> {
    const row = this.db
      .prepare('SELECT * FROM workflows WHERE workflow_id = ? AND scope_id = ?')
      .get(workflow_id, scope_id) as Workflow | undefined;
    return row;
  }

  async saveWorkflow(wf: Workflow): Promise<void> {
    this.db
      .prepare(
        `UPDATE workflows SET experience_id=@experience_id, state=@state, revision=@revision
         WHERE workflow_id=@workflow_id AND scope_id=@scope_id`
      )
      .run({ ...wf, experience_id: wf.experience_id ?? null });
  }

  // ---------- Episodes ----------
  async createEpisode(ep: Episode): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO episodes (experience_id, workflow_id, scope_id, scope_fingerprint, visibility, goal_summary, acceptance_criteria, problem_summary, state, last_verified_at, created_at)
         VALUES (@experience_id, @workflow_id, @scope_id, @scope_fingerprint, @visibility, @goal_summary, @acceptance_criteria, @problem_summary, @state, @last_verified_at, @created_at)`
      )
      .run({
        ...ep,
        scope_fingerprint: ep.scope_fingerprint ?? null,
        last_verified_at: ep.last_verified_at ?? null,
        acceptance_criteria: JSON.stringify(ep.acceptance_criteria),
      });
  }

  async getEpisode(episode_id: string, scope_id: string): Promise<Episode | undefined> {
    const row = this.db
      .prepare('SELECT * FROM episodes WHERE experience_id = ? AND scope_id = ?')
      .get(episode_id, scope_id) as Record<string, unknown> | undefined;
    if (!row) return undefined;
    return this.episodeFromRow(row);
  }

  async saveEpisode(ep: Episode): Promise<void> {
    this.db
      .prepare(
        `UPDATE episodes SET state=@state, last_verified_at=@last_verified_at,
         goal_summary=@goal_summary, acceptance_criteria=@acceptance_criteria, problem_summary=@problem_summary,
         visibility=@visibility
         WHERE experience_id=@experience_id AND scope_id=@scope_id`
      )
      .run({
        ...ep,
        last_verified_at: ep.last_verified_at ?? null,
        acceptance_criteria: JSON.stringify(ep.acceptance_criteria),
      });
  }

  private episodeFromRow(row: Record<string, unknown>): Episode {
    return {
      ...(row as unknown as Episode),
      acceptance_criteria: JSON.parse(String(row.acceptance_criteria)),
    };
  }

  // ---------- Captured records ----------
  async insertObservation(o: Observation): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO observations (observation_id, episode_id, kind, content, exit_code, evidence_artifact_id, provenance, seq)
         VALUES (@observation_id, @episode_id, @kind, @content, @exit_code, @evidence_artifact_id, @provenance, @seq)`
      )
      .run({
        observation_id: o.observation_id, episode_id: o.episode_id, kind: o.kind,
        content: o.content, exit_code: o.exit_code ?? null,
        evidence_artifact_id: o.evidence_artifact_id ?? null,
        provenance: JSON.stringify(o.provenance), seq: this.nextSeq(),
      });
  }

  async listObservations(episode_id: string): Promise<Observation[]> {
    const rows = this.db
      .prepare('SELECT * FROM observations WHERE episode_id = ? ORDER BY seq')
      .all(episode_id) as Record<string, unknown>[];
    return rows.map((r) => ({ ...(r as unknown as Observation), provenance: JSON.parse(String(r.provenance)) }));
  }

  async insertAttempt(a: Attempt): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO attempts (attempt_id, episode_id, intent, fact, risk_classification, rationale, prior_knowledge_used, outcome, side_effects, affected_artifacts, classification, seq)
         VALUES (@attempt_id, @episode_id, @intent, @fact, @risk_classification, @rationale, @prior_knowledge_used, @outcome, @side_effects, @affected_artifacts, @classification, @seq)`
      )
      .run({
        attempt_id: a.attempt_id, episode_id: a.episode_id, intent: a.intent,
        fact: a.fact ?? null,
        risk_classification: a.risk_classification ?? null,
        rationale: a.rationale ?? null,
        prior_knowledge_used: a.prior_knowledge_used ?? null,
        outcome: a.outcome ?? null,
        side_effects: a.side_effects ? JSON.stringify(a.side_effects) : null,
        affected_artifacts: a.affected_artifacts ? JSON.stringify(a.affected_artifacts) : null,
        classification: a.classification ?? null,
        seq: this.nextSeq(),
      });
  }

  async getAttempt(attempt_id: string, episode_id: string): Promise<Attempt | undefined> {
    const row = this.db
      .prepare('SELECT * FROM attempts WHERE attempt_id = ? AND episode_id = ?')
      .get(attempt_id, episode_id) as Record<string, unknown> | undefined;
    return row ? this.attemptFromRow(row) : undefined;
  }

  async saveAttempt(a: Attempt): Promise<void> {
    this.db
      .prepare(
        `UPDATE attempts SET fact=@fact, outcome=@outcome, side_effects=@side_effects,
         affected_artifacts=@affected_artifacts, classification=@classification
         WHERE attempt_id=@attempt_id AND episode_id=@episode_id`
      )
      .run({
        ...a,
        side_effects: a.side_effects ? JSON.stringify(a.side_effects) : null,
        affected_artifacts: a.affected_artifacts ? JSON.stringify(a.affected_artifacts) : null,
      });
  }

  private attemptFromRow(row: Record<string, unknown>): Attempt {
    return {
      ...(row as unknown as Attempt),
      side_effects: row.side_effects ? JSON.parse(String(row.side_effects)) : undefined,
      affected_artifacts: row.affected_artifacts ? JSON.parse(String(row.affected_artifacts)) : undefined,
    };
  }

  async listAttempts(episode_id: string): Promise<Attempt[]> {
    const rows = this.db
      .prepare('SELECT * FROM attempts WHERE episode_id = ? ORDER BY seq')
      .all(episode_id) as Record<string, unknown>[];
    return rows.map((r) => this.attemptFromRow(r));
  }

  async insertHypothesis(h: Hypothesis): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO hypotheses (hypothesis_id, episode_id, statement, status, supporting_evidence, conflicting_evidence, seq)
         VALUES (@hypothesis_id, @episode_id, @statement, @status, @supporting_evidence, @conflicting_evidence, @seq)`
      )
      .run({
        hypothesis_id: h.hypothesis_id, episode_id: h.episode_id, statement: h.statement,
        status: h.status,
        supporting_evidence: JSON.stringify(h.supporting_evidence),
        conflicting_evidence: JSON.stringify(h.conflicting_evidence),
        seq: this.nextSeq(),
      });
  }

  async saveHypothesis(h: Hypothesis): Promise<void> {
    this.db
      .prepare('UPDATE hypotheses SET status=@status, statement=@statement WHERE hypothesis_id=@hypothesis_id AND episode_id=@episode_id')
      .run({ ...h, supporting_evidence: JSON.stringify(h.supporting_evidence), conflicting_evidence: JSON.stringify(h.conflicting_evidence) });
  }

  async listHypotheses(episode_id: string): Promise<Hypothesis[]> {
    const rows = this.db
      .prepare('SELECT * FROM hypotheses WHERE episode_id = ? ORDER BY seq')
      .all(episode_id) as Record<string, unknown>[];
    return rows.map((r) => ({
      ...(r as unknown as Hypothesis),
      supporting_evidence: JSON.parse(String(r.supporting_evidence)),
      conflicting_evidence: JSON.parse(String(r.conflicting_evidence)),
    }));
  }

  async insertValidationPlan(p: ValidationPlan): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO validation_plans (validation_plan_id, episode_id, checks, seq) VALUES (@validation_plan_id, @episode_id, @checks, @seq)`
      )
      .run({ ...p, checks: JSON.stringify(p.checks), seq: this.nextSeq() });
  }

  async getValidationPlan(episode_id: string): Promise<ValidationPlan | undefined> {
    const row = this.db
      .prepare('SELECT * FROM validation_plans WHERE episode_id = ?')
      .get(episode_id) as Record<string, unknown> | undefined;
    return row ? { ...(row as unknown as ValidationPlan), checks: JSON.parse(String(row.checks)) } : undefined;
  }

  async insertValidationRun(r: ValidationRun): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO validation_runs (run_id, episode_id, check_index, status, exit_code, evidence_artifact_id, seq)
         VALUES (@run_id, @episode_id, @check_index, @status, @exit_code, @evidence_artifact_id, @seq)`
      )
      .run({
        run_id: r.run_id, episode_id: r.episode_id, check_index: r.check_index,
        status: r.status, exit_code: r.exit_code ?? null,
        evidence_artifact_id: r.evidence_artifact_id ?? null, seq: this.nextSeq(),
      });
  }

  async listValidationRuns(episode_id: string): Promise<ValidationRun[]> {
    return this.db
      .prepare('SELECT * FROM validation_runs WHERE episode_id = ? ORDER BY seq')
      .all(episode_id) as ValidationRun[];
  }

  // ---------- Evidence metadata ----------
  async putArtifactMeta(a: EvidenceArtifact): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO artifacts (artifact_id, episode_id, scope_id, content_hash, kind, media_type, byte_size, redaction_status, redaction_findings, redaction_ruleset_version, trust, created_at)
         VALUES (@artifact_id, @episode_id, @scope_id, @content_hash, @kind, @media_type, @byte_size, @redaction_status, @redaction_findings, @redaction_ruleset_version, @trust, @created_at)`
      )
      .run(a);
  }

  async getArtifactMeta(artifact_id: string, scope_id: string): Promise<EvidenceArtifact | undefined> {
    return this.db
      .prepare('SELECT * FROM artifacts WHERE artifact_id = ? AND scope_id = ?')
      .get(artifact_id, scope_id) as EvidenceArtifact | undefined;
  }

  // ---------- Append-only events ----------
  async appendEvent(e: DomainEvent): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO events (event_id, workflow_id, episode_id, type, payload, seq, recorded_at)
         VALUES (@event_id, @workflow_id, @episode_id, @type, @payload, @seq, @recorded_at)`
      )
      .run({ ...e, episode_id: e.episode_id ?? null, payload: JSON.stringify(e.payload), seq: this.nextSeq() });
  }

  async listEvents(workflow_id: string): Promise<DomainEvent[]> {
    const rows = this.db
      .prepare('SELECT * FROM events WHERE workflow_id = ? ORDER BY seq')
      .all(workflow_id) as Record<string, unknown>[];
    return rows.map((r) => ({ ...(r as unknown as DomainEvent), payload: JSON.parse(String(r.payload)) }));
  }

  // ---------- Feedback / audit / idempotency ----------
  async insertFeedback(f: ReuseFeedback): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO feedback (feedback_id, episode_id, verdict, changed_plan, outcome, seq)
         VALUES (@feedback_id, @episode_id, @verdict, @changed_plan, @outcome, @seq)`
      )
      .run({
        feedback_id: f.feedback_id, episode_id: f.episode_id, verdict: f.verdict,
        // better-sqlite3 rejects booleans — encode as 0/1 (column is INTEGER)
        changed_plan: f.changed_plan == null ? null : (f.changed_plan ? 1 : 0),
        outcome: f.outcome ?? null, seq: this.nextSeq(),
      });
  }

  async listFeedback(episode_id: string): Promise<ReuseFeedback[]> {
    return this.db
      .prepare('SELECT * FROM feedback WHERE episode_id = ? ORDER BY seq')
      .all(episode_id) as ReuseFeedback[];
  }

  async insertAudit(a: AuditEvent): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO audit (event_id, actor, action, target, before_revision, after_revision, timestamp, policy_version, reason)
         VALUES (@event_id, @actor, @action, @target, @before_revision, @after_revision, @timestamp, @policy_version, @reason)`
      )
      .run({ ...a, actor: JSON.stringify(a.actor), before_revision: a.before_revision ?? null, after_revision: a.after_revision ?? null, reason: a.reason ?? null });
  }

  async getIdempotency(key: string): Promise<IdempotencyRecord | undefined> {
    return this.db.prepare('SELECT * FROM idempotency WHERE key = ?').get(key) as IdempotencyRecord | undefined;
  }

  async putIdempotency(rec: IdempotencyRecord): Promise<boolean> {
    const res = this.db
      .prepare(
        `INSERT OR IGNORE INTO idempotency (key, actor_id, tool, request_id, result_json) VALUES (@key, @actor_id, @tool, @request_id, @result_json)`
      )
      .run(rec);
    return res.changes > 0;
  }

  // ---------- Retrieval (visibility-filtered) ----------
  private searchBase(where: string, params: unknown[], scope_id: string): SearchRow[] {
    const scopeFilter = scope_id === '' ? '' : 'AND (e.scope_id = @scope_id OR e.visibility = \'public\')';
    return this.db
      .prepare(
        `SELECT e.experience_id AS episode_id, e.goal_summary AS summary, e.state, e.scope_id,
                e.last_verified_at AS last_verified_at, s.normalized_hash, s.exact_tokens
         FROM episodes e JOIN signatures s ON s.episode_id = e.experience_id
         ${where ? where.replace('@scope_id', '@scope_id') : ''}
         ${scopeFilter}`
      )
      .all(...params, scope_id === '' ? {} : { scope_id }) as unknown as SearchRow[];
  }

  async searchExact(hash: string, scope_id: string): Promise<SearchRow[]> {
    const scopeFilter = scope_id === '' ? '' : 'AND (e.scope_id = ? OR e.visibility = \'public\')';
    return this.db
      .prepare(
        `SELECT e.experience_id AS episode_id, e.goal_summary AS summary, e.state, e.scope_id,
                e.last_verified_at, s.normalized_hash, s.exact_tokens
         FROM episodes e JOIN signatures s ON s.episode_id = e.experience_id
         WHERE s.normalized_hash = ? ${scopeFilter}`
      )
      .all(hash, ...(scope_id === '' ? [] : [scope_id])) as SearchRow[];
  }

  async searchFullText(terms: string, scope_id: string): Promise<SearchRow[]> {
    // scope filter belongs to the FTS query (its own scope_id column), NOT
    // to the episodes follow-up query (alias e) — the previous placement
    // ('AND f.scope_id = ?' appended to the episodes query) threw SQLITE_ERROR
    // 'no such column: f.scope_id' whenever the FTS index was non-empty
    // (masked for months by the empty index).
    const ftsScopeFilter = scope_id === '' ? '' : 'AND scope_id = ?';
    const safe = terms.replace(/[^\w\s]/g, ' ').trim();
    if (!safe) return [];
    // CB-12: each token is quoted as an FTS5 string literal — bare operators
    // surviving sanitization (NOT/AND/OR/NEAR) would otherwise throw a raw
    // FTS5 syntax error. Only \w chars remain, so quoting is unambiguous.
    const matchArg = safe.split(/\s+/).map((t) => `"${t}"`).join(' ');
    // L256: match both the goal-summary index and the observation-contents
    // index; a hit in either makes the episode findable via full text.
    const ftsTables = ['episodes_fts', 'observations_fts'];
    const ids: { episode_id: string }[] = [];
    for (const table of ftsTables) {
      const rows = this.db
        .prepare(`SELECT episode_id FROM ${table} WHERE ${table} MATCH ? ${ftsScopeFilter}`)
        .all(...(scope_id === '' ? [matchArg] : [matchArg, scope_id])) as { episode_id: string }[];
      ids.push(...rows);
    }
    if (!ids.length) return [];
    // an episode may match in BOTH indexes — dedupe so the follow-up SELECT
    // returns each episode exactly once
    const uniqueIds = [...new Set(ids.map((i) => i.episode_id))];
    const placeholders = uniqueIds.map(() => '?').join(',');
    return this.db
      .prepare(
        `SELECT e.experience_id AS episode_id, e.goal_summary AS summary, e.state, e.scope_id,
                e.last_verified_at, s.normalized_hash, s.exact_tokens
         FROM episodes e LEFT JOIN signatures s ON s.episode_id = e.experience_id
         WHERE e.experience_id IN (${placeholders})`
      )
      .all(...uniqueIds) as SearchRow[];
  }

  async listInScope(scope_id: string): Promise<SearchRow[]> {
    // LEFT JOIN: episodes without failure signatures (e.g. lesson/consolidation
    // episodes) must also be discoverable via search — signature-less rows get
    // NULL hash and cannot exact-match, but full-text/semantic arms find them.
    // Public episodes (visibility='public') are included regardless of scope.
    return this.db
      .prepare(
        `SELECT e.experience_id AS episode_id, e.goal_summary AS summary, e.state, e.scope_id,
                e.last_verified_at, s.normalized_hash, s.exact_tokens
         FROM episodes e LEFT JOIN signatures s ON s.episode_id = e.experience_id
         WHERE e.scope_id = ? OR e.visibility = 'public'`
      )
      .all(scope_id) as SearchRow[];
  }

  async getFeedbackSummary(episode_id: string): Promise<{ harmful: number; useful: number }> {
    const row = this.db
      .prepare(
        `SELECT SUM(verdict='harmful') AS harmful, SUM(verdict IN ('useful','applicable')) AS useful
         FROM feedback WHERE episode_id = ?`
      )
      .get(episode_id) as { harmful: number | null; useful: number | null };
    return { harmful: row.harmful ?? 0, useful: row.useful ?? 0 };
  }

  async putSignature(episode_id: string, normalized_hash: string, exact_tokens: string, kind: string, exit_code?: number): Promise<void> {
    this.db
      .prepare(`INSERT INTO signatures (episode_id, normalized_hash, exact_tokens, kind, exit_code) VALUES (?, ?, ?, ?, ?)`)
      .run(episode_id, normalized_hash, exact_tokens, kind, exit_code ?? null);
  }

  async putEnvironment(episode_id: string, dims: { key: string; value: string }[]): Promise<void> {
    const ins = this.db.prepare(`INSERT OR REPLACE INTO environment (episode_id, key, value) VALUES (?, ?, ?)`);
    for (const d of dims) ins.run(episode_id, d.key, d.value);
  }

  async getEnvironment(episode_id: string): Promise<{ key: string; value: string }[]> {
    return this.db
      .prepare('SELECT key, value FROM environment WHERE episode_id = ?')
      .all(episode_id) as { key: string; value: string }[];
  }

  async getLessonByHash(normalized_hash: string): Promise<import('../domain/lesson-service.js').LessonRecord | undefined> {
    const row = this.db
      .prepare('SELECT data FROM lessons WHERE normalized_hash = ?')
      .get(normalized_hash) as { data: string } | undefined;
    return row ? JSON.parse(row.data) : undefined;
  }

  async insertLesson(l: import('../domain/lesson-service.js').LessonRecord): Promise<void> {
    this.db
      .prepare(`INSERT INTO lessons (lesson_id, normalized_hash, data) VALUES (?, ?, ?)`)
      .run(l.lesson_id, l.normalized_hash, JSON.stringify(l));
  }

  async updateLesson(l: import('../domain/lesson-service.js').LessonRecord): Promise<void> {
    this.db
      .prepare(`UPDATE lessons SET data = ? WHERE lesson_id = ?`)
      .run(JSON.stringify(l), l.lesson_id);
  }

  async getLesson(lesson_id: string): Promise<import('../domain/lesson-service.js').LessonRecord | undefined> {
    const row = this.db
      .prepare('SELECT data FROM lessons WHERE lesson_id = ?')
      .get(lesson_id) as { data: string } | undefined;
    return row ? JSON.parse(row.data) : undefined;
  }

  async searchLessons(query: string): Promise<import('../domain/lesson-service.js').LessonRecord[]> {
    const rows = this.db
      .prepare('SELECT data FROM lessons')
      .all() as { data: string }[];
    const q = query.toLowerCase();
    return rows
      .map((r) => JSON.parse(r.data) as import('../domain/lesson-service.js').LessonRecord)
      .filter((l) => l.pattern.toLowerCase().includes(q) || l.rule.toLowerCase().includes(q));
  }

  async listVerifiedEpisodesForSignature(normalized_hash: string): Promise<{ experience_id: string; scope_id: string }[]> {
    return this.db
      .prepare(
        `SELECT e.experience_id, e.scope_id FROM episodes e
         JOIN signatures s ON s.episode_id = e.experience_id
         WHERE s.normalized_hash = ? AND e.state IN ('LOCALLY_VERIFIED','REPRODUCED','CROSS_PROJECT_VERIFIED')`
      )
      .all(normalized_hash) as { experience_id: string; scope_id: string }[];
  }

  async listContradictingEpisodesForSignature(normalized_hash: string): Promise<{ experience_id: string; scope_id: string }[]> {
    return this.db
      .prepare(
        `SELECT DISTINCT e.experience_id, e.scope_id FROM episodes e
         JOIN signatures s ON s.episode_id = e.experience_id
         JOIN attempts a ON a.episode_id = e.experience_id
         WHERE s.normalized_hash = ? AND a.classification IN ('harmful','ineffective')
           AND NOT EXISTS (
             SELECT 1 FROM attempts a2 WHERE a2.episode_id = e.experience_id AND a2.classification = 'successful'
           )`
      )
      .all(normalized_hash) as { experience_id: string; scope_id: string }[];
  }
  async listScopes(): Promise<string[]> {

    return (this.db.prepare('SELECT DISTINCT scope_id FROM episodes').all() as Array<{ scope_id: string }>).map((r) => r.scope_id);
  }

  async findAllEpisodes(): Promise<Episode[]> {
    const rows = this.db.prepare('SELECT * FROM episodes').all() as Record<string, unknown>[];
    return rows.map((row) => ({
      ...(row as unknown as Episode),
      acceptance_criteria: JSON.parse(String(row.acceptance_criteria)),
    }));
  }

  async getEmbedding(episode_id: string): Promise<number[] | undefined> {
    const row = this.db
      .prepare('SELECT vec FROM embeddings WHERE episode_id = ?')
      .get(episode_id) as { vec: string } | undefined;
    return row ? JSON.parse(row.vec) as number[] : undefined;
  }

  async putEmbedding(episode_id: string, vec: number[]): Promise<void> {
    this.db
      .prepare(`INSERT OR REPLACE INTO embeddings (episode_id, vec) VALUES (?, ?)`)
      .run(episode_id, JSON.stringify(vec));
  }
}
