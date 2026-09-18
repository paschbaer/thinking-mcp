import type Database from 'better-sqlite3';

/**
 * Schema migrations (FR-009 durable schema; FR-020 append-only events;
 * FR-027 scope columns on every read path; FTS5 required — fail fast if
 * unavailable per plan.md MVP operational constraints).
 */
export const MIGRATIONS: string[] = [
  `
  CREATE TABLE IF NOT EXISTS workflows (
    workflow_id TEXT PRIMARY KEY,
    experience_id TEXT,
    goal TEXT NOT NULL,
    scope_id TEXT NOT NULL,
    scope_fingerprint TEXT,
    state TEXT NOT NULL,
    revision INTEGER NOT NULL,
    actor_id TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS episodes (
    experience_id TEXT PRIMARY KEY,
    workflow_id TEXT NOT NULL,
    scope_id TEXT NOT NULL,
    scope_fingerprint TEXT,
    visibility TEXT NOT NULL,
    goal_summary TEXT NOT NULL,
    acceptance_criteria TEXT NOT NULL,
    problem_summary TEXT NOT NULL,
    state TEXT NOT NULL,
    last_verified_at TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS observations (
    observation_id TEXT PRIMARY KEY,
    episode_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    content TEXT NOT NULL,
    exit_code INTEGER,
    evidence_artifact_id TEXT,
    provenance TEXT NOT NULL,
    seq INTEGER NOT NULL
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
    side_effects TEXT,
    affected_artifacts TEXT,
    classification TEXT,
    seq INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS hypotheses (
    hypothesis_id TEXT PRIMARY KEY,
    episode_id TEXT NOT NULL,
    statement TEXT NOT NULL,
    status TEXT NOT NULL,
    supporting_evidence TEXT NOT NULL,
    conflicting_evidence TEXT NOT NULL,
    seq INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS validation_plans (
    validation_plan_id TEXT PRIMARY KEY,
    episode_id TEXT NOT NULL UNIQUE,
    checks TEXT NOT NULL,
    seq INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS validation_runs (
    run_id TEXT PRIMARY KEY,
    episode_id TEXT NOT NULL,
    check_index INTEGER NOT NULL,
    status TEXT NOT NULL,
    exit_code INTEGER,
    evidence_artifact_id TEXT,
    seq INTEGER NOT NULL
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
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS signatures (
    episode_id TEXT NOT NULL,
    normalized_hash TEXT NOT NULL,
    exact_tokens TEXT NOT NULL,
    kind TEXT NOT NULL,
    exit_code INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_signatures_hash ON signatures(normalized_hash);

  CREATE TABLE IF NOT EXISTS embeddings (
    episode_id TEXT PRIMARY KEY,
    vec TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS environment (
    episode_id TEXT NOT NULL,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    PRIMARY KEY (episode_id, key)
  );

  CREATE TABLE IF NOT EXISTS events (
    event_id TEXT PRIMARY KEY,
    workflow_id TEXT NOT NULL,
    episode_id TEXT,
    type TEXT NOT NULL,
    payload TEXT NOT NULL,
    seq INTEGER NOT NULL,
    recorded_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS feedback (
    feedback_id TEXT PRIMARY KEY,
    episode_id TEXT NOT NULL,
    verdict TEXT NOT NULL,
    changed_plan INTEGER,
    outcome TEXT,
    seq INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS audit (
    event_id TEXT PRIMARY KEY,
    actor TEXT NOT NULL,
    action TEXT NOT NULL,
    target TEXT NOT NULL,
    before_revision INTEGER,
    after_revision INTEGER,
    timestamp TEXT NOT NULL,
    policy_version TEXT NOT NULL,
    reason TEXT
  );

  CREATE TABLE IF NOT EXISTS idempotency (
    key TEXT NOT NULL,
    actor_id TEXT NOT NULL,
    tool TEXT NOT NULL,
    request_id TEXT NOT NULL,
    result_json TEXT NOT NULL,
    PRIMARY KEY (key, actor_id, tool)
  );
  `,
  `CREATE VIRTUAL TABLE IF NOT EXISTS episodes_fts USING fts5(
    episode_id UNINDEXED, summary, scope_id UNINDEXED)`,
];

export function runMigrations(db: Database.Database): void {
  const available = db
    .prepare("SELECT COUNT(*) AS n FROM pragma_compile_options WHERE compile_options LIKE 'ENABLE_FTS5'")
    .get() as { n: number };
  if (!available.n) {
    throw new Error('SQLite build lacks FTS5 — required for full-text retrieval. Use a SQLite build with FTS5 enabled.');
  }
  for (const migration of MIGRATIONS) {
    db.exec(migration);
  }
}
