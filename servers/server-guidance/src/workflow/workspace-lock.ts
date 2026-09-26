/**
 * Workspace operation lock (spec 003 FR-109, hardened per review R-011/R-012).
 *
 * Cross-session/multi-process mutual exclusion via a lock file in the shared
 * stateDir. Design:
 *
 *  - ACQUIRE is `link(tmp, file)` — an atomic create-if-absent. Exactly one
 *    contender's inode can ever sit at `file`, so double-holding is
 *    impossible by construction.
 *  - STEAL (dead owner or TTL exceeded) moves the current file aside with
 *    `rename(quarantine)` — an atomic move, never a blind unlink. The mover
 *    re-reads the quarantine copy and verifies it is the stale snapshot it
 *    inspected; if a concurrent party swapped in a fresh lock meanwhile, the
 *    fresh inode is restored via `link(quarantine, file)` (atomic
 *    create-if-absent) and the mover defers with contention.
 *
 * Residual limitation (documented, LOW): the inspect→rename window can move a
 * freshly swapped lock into quarantine; the verify step then restores it via
 * link or — if that loses a create-race — the moved owner's inode becomes an
 * orphan quarantine file while its ex-holder backs off. No double-hold; worst
 * case is a transient spurious contention plus an orphan file.
 */
import {
  closeSync,
  existsSync,
  linkSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  unlinkSync,
  writeSync,
} from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { GuidanceError } from "../types/errors.js";

const MAX_ATTEMPTS = 3;
const ORPHAN_TTL_MS = 60 * 60 * 1000;

export interface LockInspection {
  pid: number;
  mtimeMs: number;
}

function contention(msg: string): GuidanceError {
  return new GuidanceError("operation_in_progress", msg, { recoverable: true });
}

export class WorkspaceOpLock {
  private held = false;

  constructor(
    private readonly file: string,
    private readonly basename: string,
    private readonly ttlMs: number,
  ) {}

  isHeld(): boolean {
    return this.held;
  }

  acquire(): void {
    if (this.held) {
      throw contention("workspace operation lock is held by this process");
    }
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      if (this.tryCreate()) {
        this.held = true;
        this.sweepOrphans();
        return;
      }
      // EEXIST → inspect before any destructive step.
      const inspect = this.inspectFile();
      if (inspect === null) continue; // vanished: a holder released → retry create
      if (!this.isStale(inspect)) {
        throw contention("workspace operation lock is held by another operation");
      }
      // Stale → steal atomically: move the CURRENT file into a private
      // quarantine (rename never deletes; it fails ENOENT if someone else
      // already moved/replaced it).
      const quarantine = `${this.file}.stolen.${process.pid}.${randomUUID()}`;
      try {
        renameSync(this.file, quarantine);
      } catch {
        continue; // vanished → retry create
      }
      // Verify we moved exactly the stale snapshot we inspected. If a
      // concurrent party swapped in a fresh lock between inspect and rename,
      // restore it via link (atomic create-if-absent) and defer.
      const moved = this.inspectPath(quarantine);
      if (moved === null || moved.pid !== inspect.pid || Math.abs(moved.mtimeMs - inspect.mtimeMs) > 2) {
        let restored = false;
        try {
          linkSync(quarantine, this.file);
          restored = true;
        } catch {
          // file already exists again — the current holder wins, nothing to do
        }
        try {
          unlinkSync(quarantine);
        } catch {
          /* orphan: harmless, TTL sweep cleans up */
        }
        if (restored) {
          throw contention("workspace lock re-acquired by another operation during recovery");
        }
        continue;
      }
      // Confirmed stale quarantine → the path is free; create our lock.
      try {
        this.linkNew();
        try {
          unlinkSync(quarantine);
        } catch {
          /* orphan: harmless */
        }
        this.held = true;
        return;
      } catch {
        try {
          unlinkSync(quarantine);
        } catch {
          /* orphan: harmless */
        }
        throw contention("workspace lock re-acquired by another process during recovery");
      }
    }
    throw contention("workspace operation lock contention after repeated attempts");
  }

  release(): void {
    if (!this.held) return;
    this.held = false;
    try {
      unlinkSync(this.file);
    } catch {
      // Lock file could not be removed (e.g. Windows file lock): stale
      // detection (dead pid / TTL) recovers it on the next acquire.
    }
  }

  /** Atomic create-if-absent of a lock file containing this pid. */
  private tryCreate(): boolean {
    try {
      const fd = openSync(this.file, "wx");
      writeSync(fd, String(process.pid));
      closeSync(fd);
      return true;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException)?.code;
      if (code === "EEXIST") return false;
      // Permission/FS problems are NOT contention — surface them distinctly
      // (review R-012b) instead of misreporting as operation_in_progress.
      throw new GuidanceError(
        "workspace_lock_unavailable",
        `workspace operation lock cannot be created: ${code ?? String(err)}`,
        { recoverable: true },
      );
    }
  }

  private linkNew(): void {
    const fd = openSync(this.file, "wx");
    writeSync(fd, String(process.pid));
    closeSync(fd);
  }

  private inspectFile(): LockInspection | null {
    return this.inspectPath(this.file);
  }

  private inspectPath(path: string): LockInspection | null {
    try {
      const stat = statSync(path);
      const pid = parseInt(readFileSync(path, "utf8").trim(), 10);
      return { pid: Number.isNaN(pid) ? -1 : pid, mtimeMs: stat.mtimeMs };
    } catch {
      return null;
    }
  }

  /**
   * R-012a: a live holder can never exceed the TTL — the TTL is derived from
   * the maximum configured operation timeout (×2) by the caller, so any lock
   * older than the TTL is by construction from a dead process. PID liveness
   * is still probed first for immediate recovery of crashed owners.
   */
  private isStale(inspect: LockInspection): boolean {
    if (inspect.pid > 0) {
      try {
        process.kill(inspect.pid, 0); // liveness probe (no signal)
        return false; // live owner → real contention
      } catch {
        return true; // ESRCH: owner is dead
      }
    }
    return Date.now() - inspect.mtimeMs > this.ttlMs; // unparseable/dead
  }

  /** Best-effort cleanup of orphaned quarantine files older than 1 h. */
  private sweepOrphans(): void {
    const dir = join(this.file, "..");
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      if (!entry.startsWith(`${this.basename}.stolen.`)) continue;
      const full = join(dir, entry);
      try {
        if (Date.now() - statSync(full).mtimeMs > ORPHAN_TTL_MS) unlinkSync(full);
      } catch {
        /* best effort */
      }
    }
  }
}

/** Re-exported for convenience of tests and callers that need existence. */
export const workspaceLockFileExists = existsSync;
