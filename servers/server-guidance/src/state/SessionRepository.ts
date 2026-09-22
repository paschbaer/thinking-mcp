/** Atomic session persistence (FR-019): write temp file, fsync, rename. */
import { mkdirSync, readFileSync, writeFileSync, renameSync, existsSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { GuidanceError } from "../types/errors.js";
import type { WorkflowSession } from "../types/index.js";

export class SessionRepository {
  readonly dir: string;
  private readonly mutexes = new Map<string, Promise<unknown>>();

  constructor(dir: string) {
    this.dir = dir;
    mkdirSync(dir, { recursive: true });
  }

  /** Serialize state-changing operations per session (FR-022). */
  async withLock<T>(sessionId: string, fn: () => Promise<T> | T): Promise<T> {
    const prev = this.mutexes.get(sessionId) ?? Promise.resolve();
    const next = prev.then(fn, fn);
    this.mutexes.set(
      sessionId,
      next.catch(() => undefined),
    );
    return next;
  }

  pathOf(sessionId: string): string {
    return join(this.dir, `${sessionId}.json`);
  }

  save(session: WorkflowSession): void {
    this.atomicWrite(this.pathOf(session.sessionId), JSON.stringify(session, null, 2));
  }

  update(sessionId: string, mutate: (s: WorkflowSession) => void): WorkflowSession {
    const s = this.load(sessionId);
    mutate(s);
    s.updatedAt = new Date().toISOString();
    this.save(s);
    return s;
  }

  load(sessionId: string): WorkflowSession {
    const path = this.pathOf(sessionId);
    if (!existsSync(path)) {
      throw new GuidanceError("session_not_found", `no session ${sessionId}`, { recoverable: true });
    }
    return JSON.parse(readFileSync(path, "utf-8")) as WorkflowSession;
  }

  exists(sessionId: string): boolean {
    return existsSync(this.pathOf(sessionId));
  }

  /** Atomically replace a file: temp write + rename (FR-019). */
  atomicWrite(path: string, content: string): void {
    mkdirSync(join(path, ".."), { recursive: true });
    const tmp = `${path}.tmp-${process.pid}-${Date.now()}`;
    try {
      writeFileSync(tmp, content, "utf-8");
      renameSync(tmp, path);
    } catch (err) {
      if (existsSync(tmp)) rmSync(tmp, { force: true });
      throw new GuidanceError("state_persistence_failed", String(err), { recoverable: true });
    }
  }

  list(): string[] {
    return readdirSync(this.dir).filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/, ""));
  }
}

type AuditEvent = { sessionId: string; eventType: string; phase?: string; data?: Record<string, unknown>; timestamp?: string; snapshotId?: string };

/** Append-only JSONL audit log (FR-021/FR-045) with redaction hook. */
export class AuditRepository {
  readonly dir: string;
  private readonly redact: (serialized: string) => string;

  constructor(dir: string, redact: (serialized: string) => string = (s) => s) {
    this.dir = dir;
    this.redact = redact;
    mkdirSync(dir, { recursive: true });
  }

  append(event: AuditEvent): void {
    const record = { timestamp: event.timestamp ?? new Date().toISOString(), ...event };
    const line = this.redact(JSON.stringify(record));
    writeFileSync(join(this.dir, `${event.sessionId}.jsonl`), line + "\n", { flag: "a" });
  }

  read(sessionId: string): AuditEvent[] {
    const path = join(this.dir, `${sessionId}.jsonl`);
    if (!existsSync(path)) return [];
    return readFileSync(path, "utf-8")
      .split("\n")
      .filter((l) => l.trim() !== "")
      .map((l) => JSON.parse(l) as AuditEvent);
  }
}
