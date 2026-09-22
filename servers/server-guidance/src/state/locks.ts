/** Exclusive per-feature-directory session locks (FR-061). */
import { existsSync, readFileSync, writeFileSync, readdirSync, rmSync } from "node:fs";
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
      this.cache = existsSync(this.lockPath) ? (JSON.parse(readFileSync(this.lockPath, "utf-8")) as LockFile) : {};
    }
    return this.cache;
  }

  private persist(lock: LockFile): void {
    writeFileSync(this.lockPath, JSON.stringify(lock, null, 2));
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

// readdirSync/rmSync imported for potential sweep enhancements; keep tree-shaking honest.
void readdirSync;
void rmSync;
