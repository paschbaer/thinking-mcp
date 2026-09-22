/**
 * Exclusive per-feature-directory session locks (FR-061).
 * SINGLE-INSTANCE INVARIANT: one FeatureLockRegistry per process must be
 * shared by all components; concurrent processes are out of scope for the
 * MVP (single-process deployment).
 */
import { existsSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { join } from "node:path";
import { GuidanceError } from "../types/errors.js";

interface LockFile {
  [featureDir: string]: { sessionId: string; acquiredAt: string };
}

export class FeatureLockRegistry {
  private readonly lockPath: string;
  private cache: LockFile | null = null;

  constructor(stateDir: string) {
    this.lockPath = join(stateDir, "feature-locks.json");
  }

  private load(): LockFile {
    if (!this.cache) {
      if (!existsSync(this.lockPath)) {
        this.cache = {};
      } else {
        try {
          this.cache = JSON.parse(readFileSync(this.lockPath, "utf-8")) as LockFile;
        } catch {
          // Corrupt lock file must not brick locking: quarantine and rebuild.
          try {
            renameSync(this.lockPath, `${this.lockPath}.corrupt-${Date.now()}`);
          } catch {
            // quarantine best-effort
          }
          this.cache = {};
        }
      }
    }
    return this.cache;
  }

  private persist(lock: LockFile): void {
    // Atomic tmp+rename: a crash must never leave a truncated lock file.
    const tmp = `${this.lockPath}.tmp-${process.pid}-${Date.now()}`;
    writeFileSync(tmp, JSON.stringify(lock, null, 2));
    renameSync(tmp, this.lockPath);
    this.cache = lock;
  }

  acquire(featureDir: string, sessionId: string): void {
    const lock = this.load();
    const holder = lock[featureDir];
    if (holder && holder.sessionId !== sessionId) {
      throw new GuidanceError("spec_kit_feature_in_use" as never, `feature locked by ${holder.sessionId}`, {
        recoverable: true,
      });
    }
    lock[featureDir] = { sessionId, acquiredAt: new Date().toISOString() };
    this.persist(lock);
  }

  release(featureDir: string, sessionId: string): void {
    const lock = this.load();
    const holder = lock[featureDir];
    if (holder && holder.sessionId !== sessionId) {
      throw new GuidanceError("spec_kit_feature_in_use" as never, `feature locked by ${holder.sessionId}`, {
        recoverable: true,
      });
    }
    delete lock[featureDir];
    this.persist(lock);
  }

  holderOf(featureDir: string): string | undefined {
    return this.load()[featureDir]?.sessionId;
  }

  /** Remove locks whose holding session no longer exists (startup sweep, R19). */
  sweepDeadSessions(aliveSessionIds: Set<string>): void {
    const lock = this.load();
    for (const [dir, holder] of Object.entries(lock)) {
      if (!aliveSessionIds.has(holder.sessionId)) {
        delete lock[dir];
      }
    }
    this.persist(lock);
  }

  /** Directory containing the lock file (for tests/inspection). */
  get dir(): string {
    return this.lockPath.split(sepOf()).slice(0, -1).join(sepOf()) || ".";
  }
}

function sepOf(): string {
  return process.platform === "win32" ? "\\" : "/";
}
