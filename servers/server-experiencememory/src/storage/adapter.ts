/**
 * StorageAdapter interface (research.md): one interface, SQLite now,
 * PostgreSQL adapter later; tool behavior identical across adapters.
 * Visibility filtering (FR-027) happens INSIDE every read path.
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

export interface SearchRow {
  episode_id: string;
  summary: string;
  state: string;
  scope_id: string;
  last_verified_at?: string;
  normalized_hash: string;
  exact_tokens: string;
}

export interface StorageAdapter {
  init(): Promise<void>;
  close(): Promise<void>;

  // Workflows (revision ownership)
  createWorkflow(wf: Workflow): Promise<void>;
  getWorkflow(workflow_id: string, scope_id: string): Promise<Workflow | undefined>;
  saveWorkflow(wf: Workflow): Promise<void>;

  // Episodes
  createEpisode(ep: Episode): Promise<void>;
  getEpisode(episode_id: string, scope_id: string): Promise<Episode | undefined>;
  saveEpisode(ep: Episode): Promise<void>;

  // Captured records
  insertObservation(o: Observation): Promise<void>;
  listObservations(episode_id: string): Promise<Observation[]>;
  insertAttempt(a: Attempt): Promise<void>;
  getAttempt(attempt_id: string, episode_id: string): Promise<Attempt | undefined>;
  saveAttempt(a: Attempt): Promise<void>;
  listAttempts(episode_id: string): Promise<Attempt[]>;
  insertHypothesis(h: Hypothesis): Promise<void>;
  saveHypothesis(h: Hypothesis): Promise<void>;
  listHypotheses(episode_id: string): Promise<Hypothesis[]>;
  insertValidationPlan(p: ValidationPlan): Promise<void>;
  getValidationPlan(episode_id: string): Promise<ValidationPlan | undefined>;
  insertValidationRun(r: ValidationRun): Promise<void>;
  listValidationRuns(episode_id: string): Promise<ValidationRun[]>;

  // Evidence metadata
  putArtifactMeta(a: EvidenceArtifact): Promise<void>;
  getArtifactMeta(artifact_id: string, scope_id: string): Promise<EvidenceArtifact | undefined>;

  // Append-only events (FR-020); no update/delete API exists by design (FR-034)
  appendEvent(e: DomainEvent): Promise<void>;
  listEvents(workflow_id: string): Promise<DomainEvent[]>;

  // Feedback / audit / idempotency
  insertFeedback(f: ReuseFeedback): Promise<void>;
  listFeedback(episode_id: string): Promise<ReuseFeedback[]>;
  insertAudit(a: AuditEvent): Promise<void>;
  getIdempotency(key: string): Promise<IdempotencyRecord | undefined>;
  putIdempotency(rec: IdempotencyRecord): Promise<boolean>;

  // Retrieval (visibility-filtered; scope_id '' = unrestricted/admin)
  searchExact(hash: string, scope_id: string): Promise<SearchRow[]>;
  searchFullText(terms: string, scope_id: string): Promise<SearchRow[]>;
  listInScope(scope_id: string): Promise<SearchRow[]>;
  getFeedbackSummary(episode_id: string): Promise<{ harmful: number; useful: number }>;
  putSignature(episode_id: string, normalized_hash: string, exact_tokens: string, kind: string, exit_code?: number): Promise<void>;
  putEnvironment(episode_id: string, dims: { key: string; value: string }[]): Promise<void>;
  getEnvironment(episode_id: string): Promise<{ key: string; value: string }[]>;
  getEmbedding(episode_id: string): Promise<number[] | undefined>;
  putEmbedding(episode_id: string, vec: number[]): Promise<void>;
  getLessonByHash(normalized_hash: string): Promise<import('../domain/lesson-service.js').LessonRecord | undefined>;
  insertLesson(l: import('../domain/lesson-service.js').LessonRecord): Promise<void>;
  updateLesson(l: import('../domain/lesson-service.js').LessonRecord): Promise<void>;
  getLesson(lesson_id: string): Promise<import('../domain/lesson-service.js').LessonRecord | undefined>;
  searchLessons(query: string): Promise<import('../domain/lesson-service.js').LessonRecord[]>;
  listVerifiedEpisodesForSignature(normalized_hash: string): Promise<{ experience_id: string; scope_id: string }[]>;
  listContradictingEpisodesForSignature(normalized_hash: string): Promise<{ experience_id: string; scope_id: string }[]>;
  /** All distinct scope_ids (admin — bypasses visibility filter). */
  listScopes(): Promise<string[]>;
  /** All episodes across scopes (admin — bypasses visibility filter). */
  findAllEpisodes(): Promise<Episode[]>;
}
