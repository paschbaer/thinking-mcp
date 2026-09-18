/**
 * Lesson consolidation (spec FR-022 as scoped by the spec amendment):
 * MVP supports candidate-level lesson detection and proposal. Promotion
 * thresholds per research.md D5 / spec: one verified episode = candidate;
 * two independent verified episodes = provisional; three scopes or a
 * reproduced benchmark = verified lesson. Counterexamples narrow scope or
 * mark the lesson contested. No destructive merging; lesson entity was
 * schema-reserved in data-model.md.
 */
import { randomUUID } from 'node:crypto';
import type { StorageAdapter } from '../storage/adapter.js';

export interface LessonCandidate {
  lesson_id: string;
  normalized_hash: string;
  pattern: string;
  status: 'candidate' | 'provisional' | 'verified' | 'contested';
  supporting_episodes: string[];
  counterexample_episodes: string[];
  confidence: number;
  created_at: string;
  last_updated_at: string;
}

export interface LessonRecord extends LessonCandidate {
  rule: string;
  recommended_strategy: string;
  prohibited_strategies: string[];
  validation_recipe: string;
}

export class LessonService {
  constructor(private readonly adapter: StorageAdapter) {}

  /**
   * Propose (or update) a lesson from episodes sharing a normalized failure
   * signature. Promotion per independent-verified-episode count; any
   * contradicting outcome marks the lesson contested.
   */
  async proposeFromEpisodes(normalized_hash: string, pattern: string, rule: string, recommended_strategy: string): Promise<LessonRecord | null> {
    const existing = await this.adapter.getLessonByHash(normalized_hash);
    const supporting = await this.adapter.listVerifiedEpisodesForSignature(normalized_hash);
    const contradicting = await this.adapter.listContradictingEpisodesForSignature(normalized_hash);

    if (supporting.length === 0) return null; // FR-022: nothing to propose from

    let status: LessonCandidate['status'];
    if (contradicting.length > 0) {
      status = 'contested';
    } else if (supporting.length >= 3 || new Set(supporting.map((e) => e.scope_id)).size >= 3) {
      status = 'verified';
    } else if (supporting.length >= 2) {
      status = 'provisional';
    } else {
      status = 'candidate';
    }

    const now = new Date().toISOString();
    const record: LessonRecord = existing
      ? {
          ...existing,
          status,
          supporting_episodes: supporting.map((e) => e.experience_id),
          counterexample_episodes: contradicting.map((e) => e.experience_id),
          confidence: Math.min(1, supporting.length * 0.3 - contradicting.length * 0.4),
          last_updated_at: now,
        }
      : {
          lesson_id: 'les_' + randomUUID().slice(0, 12),
          normalized_hash,
          pattern,
          rule,
          recommended_strategy,
          prohibited_strategies: [],
          validation_recipe: '',
          status,
          supporting_episodes: supporting.map((e) => e.experience_id),
          counterexample_episodes: contradicting.map((e) => e.experience_id),
          confidence: Math.min(1, supporting.length * 0.3),
          created_at: now,
          last_updated_at: now,
        };

    if (existing) await this.adapter.updateLesson(record);
    else await this.adapter.insertLesson(record);
    return record;
  }

  async search(query: string): Promise<LessonRecord[]> {
    return this.adapter.searchLessons(query);
  }

  async get(lesson_id: string): Promise<LessonRecord | undefined> {
    return this.adapter.getLesson(lesson_id);
  }
}
