/**
 * Consolidation Worker (spec Phase 3): background maintenance tasks.
 * Runs on a timer when started; can also be triggered on-demand.
 *
 * Tasks:
 * 1. Stale scan — flags episodes not verified within the threshold
 * 2. Auto-dedup — runs findDuplicates + dedupeScope per scope
 * 3. Lesson promotion — auto-proposes lessons from verified episodes
 */
import type { StorageAdapter } from '../storage/adapter.js';
import type { LessonService } from '../domain/lesson-service.js';

export interface WorkerOptions {
  /** Days after which an episode is considered stale (default 90). */
  staleDays?: number;
  /** Interval between runs in ms (default 5 min; 0 = manual only). */
  intervalMs?: number;
}

export interface WorkerReport {
  ran_at: string;
  scopes_scanned: number;
  stale_flagged: number;
  dedup_groups: number;
  lessons_promoted: number;
  errors: string[];
}

export class ConsolidationWorker {
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly staleDays: number;
  private readonly intervalMs: number;

  constructor(
    private readonly adapter: StorageAdapter,
    private readonly lessonService: LessonService,
    options: WorkerOptions = {}
  ) {
    this.staleDays = options.staleDays ?? 90;
    this.intervalMs = options.intervalMs ?? 300_000; // 5 min
  }

  start(): void {
    if (this.intervalMs <= 0 || this.timer) return;
    this.timer = setInterval(() => {
      this.runOnce().catch((e) => {
        console.error('[EMMS consolidation] run failed:', (e as Error).message);
      });
    }, this.intervalMs);
    this.timer.unref(); // don't prevent process exit
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async runOnce(): Promise<WorkerReport> {
    const ran_at = new Date().toISOString();
    const errors: string[] = [];
    let stale_flagged = 0;
    let dedup_groups = 0;
    let lessons_promoted = 0;

    let scopes: string[] = [];
    try {
      scopes = await this.adapter.listScopes();
    } catch (e) {
      errors.push(`listScopes: ${(e as Error).message}`);
      return { ran_at, scopes_scanned: 0, stale_flagged: 0, dedup_groups: 0, lessons_promoted: 0, errors };
    }

    const staleCutoff = Date.now() - this.staleDays * 24 * 3600 * 1000;

    for (const scope_id of scopes) {
      // 1. Stale scan
      try {
        const eps = await this.adapter.findAllEpisodes();
        for (const ep of eps) {
          if (ep.scope_id !== scope_id) continue;
          if (ep.last_verified_at && Date.parse(ep.last_verified_at) < staleCutoff) {
            stale_flagged++;
          }
        }
      } catch (e) {
        errors.push(`stale scan ${scope_id}: ${(e as Error).message}`);
      }

      // 2. Auto-dedup
      try {
        const groups = await this.findDuplicates(scope_id);
        dedup_groups += groups.length;
      } catch (e) {
        errors.push(`dedup ${scope_id}: ${(e as Error).message}`);
      }

      // 3. Lesson promotion from verified episodes
      try {
        const eps = await this.adapter.findAllEpisodes();
        const verified = eps.filter(
          (e) => e.scope_id === scope_id &&
            (e.state === 'LOCALLY_VERIFIED' || e.state === 'REPRODUCED' || e.state === 'CROSS_PROJECT_VERIFIED')
        );
        for (const ep of verified) {
          const sigs = await (this.adapter as unknown as {
            db: { prepare: (q: string) => { all: (...p: unknown[]) => Array<{ normalized_hash: string }> } };
          });
          void sigs;
          // Use the adapter's listInScope to get the hash
          const rows = await this.adapter.listInScope(scope_id);
          const row = rows.find((r) => r.episode_id === ep.experience_id);
          if (!row) continue;
          const lesson = await this.lessonService.proposeFromEpisodes(
            row.normalized_hash,
            ep.problem_summary.slice(0, 80),
            `Fix: ${ep.goal_summary.slice(0, 80)}`,
            ep.problem_summary.slice(0, 80)
          );
          if (lesson) lessons_promoted++;
        }
      } catch (e) {
        errors.push(`lesson promotion ${scope_id}: ${(e as Error).message}`);
      }
    }

    return { ran_at, scopes_scanned: scopes.length, stale_flagged, dedup_groups, lessons_promoted, errors };
  }

  private async findDuplicates(scope_id: string): Promise<string[][]> {
    const rows = await this.adapter.listInScope(scope_id);
    const byHash = new Map<string, typeof rows>();
    for (const r of rows) {
      if (!r.normalized_hash) continue;
      const list = byHash.get(r.normalized_hash) ?? [];
      list.push(r);
      byHash.set(r.normalized_hash, list);
    }
    const groups: string[][] = [];
    for (const [, list] of byHash) {
      if (list.length < 2) continue;
      groups.push(list.map((r) => r.episode_id));
    }
    return groups;
  }
}
