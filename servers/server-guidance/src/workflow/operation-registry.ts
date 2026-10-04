/**
 * Spec 016 FR-2/FR-3 — persisted operation registry for async-accepted
 * phase transitions.
 *
 * One JSON file per session under `<stateDir>/operations/`. Entries are keyed
 * by (sessionId, tool) because the per-session single-flight lock guarantees
 * at most one transition per session at a time; a client retry of the same
 * submit MUST map onto the in-flight entry instead of starting a second
 * execution (decision 016-idempotency-key: JSON-RPC requestId and pure
 * argument hashes are NOT keys — requestId is unstable across reconnects and
 * a retry may legitimately carry a fresh one).
 *
 * Terminal entries are retained (bounded: last operation per session+tool)
 * so get_workflow_state can report outcomes including failures (FR-3);
 * they are superseded by the next transition of the same tool.
 *
 * Concurrency (review 73b2dbf F1/F4): every mutation runs under an in-process
 * per-session mutex and writes are atomic (tmp file + rename), so the
 * check-then-begin sequence cannot lose an in-flight record to a concurrent
 * submit and readers cannot observe torn files.
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { createHash } from "node:crypto";

export interface OperationRecord {
  /** Opaque operation reference (safe to expose; no internal task ids). */
  operationId: string;
  tool: string;
  sessionId: string;
  /** Diagnostics fingerprint of the submitted arguments (F5): compared on
   *  in-flight retries — a DIFFERENT payload is not an idempotent retry. */
  fingerprint: string;
  status: "in_flight" | "succeeded" | "failed";
  acceptedAt: string;
  completedAt?: string;
  /** Boot-scoped: an in_flight record stamped by a previous process boot is
   *  reclassified as failed/interrupted on first read (F2 — no permanent
   *  latch after a crash mid-transition). */
  bootId?: string;
  /** JSON-serializable tool result (SubmitResult / ExposedOpResult). */
  result?: unknown;
  /** Failure detail (GuidanceError code/message) — failures are never
   *  swallowed (FR-3). */
  error?: { code: string; message: string; recoverable?: boolean };
}

export interface BeginResult {
  record: OperationRecord;
  /** False when an in-flight record for (session, tool) already existed —
   *  the caller must NOT start a second execution (FR-2). */
  created: boolean;
}

interface RegistryFile {
  version: 1;
  operations: Record<string, OperationRecord>;
}

/** Canonical diagnostics fingerprint: zod-normalized args, recursively
 *  sorted keys (PLAN-R2). Unstable serialization degrades logging only. */
export function fingerprintArgs(args: Record<string, unknown>): string {
  const canonical = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === "object") {
      const obj = value as Record<string, unknown>;
      return Object.fromEntries(
        Object.keys(obj)
          .sort()
          .map((k) => [k, canonical(obj[k])]),
      );
    }
    return value;
  };
  return createHash("sha256")
    .update(JSON.stringify(canonical(args)))
    .digest("hex");
}

export class OperationRegistry {
  private readonly dir: string;
  /** Process-unique boot stamp for F2 staleness reclassification. */
  private readonly bootId = `boot-${randomUUID()}`;
  /** F1/F4: in-process per-session mutex serializing whole-file RMW. */
  private readonly mutexes = new Map<string, Promise<unknown>>();

  constructor(stateDir: string) {
    this.dir = join(stateDir, "operations");
    mkdirSync(this.dir, { recursive: true });
  }

  private mutexFor(sessionId: string): {
    enter: <T>(fn: () => T) => Promise<T>;
  } {
    let tail = this.mutexes.get(sessionId) ?? Promise.resolve();
    const enter = <T>(fn: () => T): Promise<T> => {
      const run = tail.then(fn, fn);
      tail = run.catch(() => undefined);
      this.mutexes.set(sessionId, tail);
      return run;
    };
    return { enter };
  }

  private fileFor(sessionId: string): string {
    // Session ids are server-generated (session-<uuid>) — sanitize defensively.
    const safe = sessionId.replace(/[^a-zA-Z0-9._-]/g, "_");
    return join(this.dir, `${safe}.json`);
  }

  private load(sessionId: string): RegistryFile {
    try {
      return JSON.parse(
        readFileSync(this.fileFor(sessionId), "utf8"),
      ) as RegistryFile;
    } catch {
      return { version: 1, operations: {} };
    }
  }

  /** Atomic write (F4): tmp + rename so readers never see a torn file. */
  private save(sessionId: string, data: RegistryFile): void {
    const final = this.fileFor(sessionId);
    const tmp = `${final}.${randomUUID()}.tmp`;
    writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`);
    renameSync(tmp, final);
  }

  /** F2: in_flight records stamped by a previous boot cannot make progress
   *  anymore — reclassify them as failed/interrupted on first read. */
  private reconcile(data: RegistryFile, sessionId: string): RegistryFile {
    let dirty = false;
    for (const record of Object.values(data.operations)) {
      if (record.status === "in_flight" && record.bootId !== this.bootId) {
        record.status = "failed";
        record.completedAt = new Date().toISOString();
        record.error = {
          code: "operation_interrupted",
          message:
            "the server restarted while this operation was in flight; outcome unknown — resubmit",
          recoverable: true,
        };
        dirty = true;
      }
    }
    if (dirty) this.save(sessionId, data);
    return data;
  }

  get(sessionId: string, tool: string): OperationRecord | undefined {
    return this.reconcile(this.load(sessionId), sessionId).operations[tool];
  }

  /** All retained records for a session, keyed by tool name (FR-3). */
  allFor(sessionId: string): Record<string, OperationRecord> {
    return this.reconcile(this.load(sessionId), sessionId).operations;
  }

  /** Registers the start of a transition ATOMICALLY (F1): when an in-flight
   *  record already exists it is returned with created=false and the caller
   *  must not start a second execution (FR-2). */
  async begin(
    sessionId: string,
    tool: string,
    fingerprint: string,
  ): Promise<BeginResult> {
    return this.mutexFor(sessionId).enter(() => {
      const data = this.reconcile(this.load(sessionId), sessionId);
      const existing = data.operations[tool];
      if (existing?.status === "in_flight") {
        return { record: existing, created: false };
      }
      const record: OperationRecord = {
        operationId: `op-${randomUUID()}`,
        tool,
        sessionId,
        fingerprint,
        status: "in_flight",
        acceptedAt: new Date().toISOString(),
        bootId: this.bootId,
      };
      data.operations[tool] = record;
      this.save(sessionId, data);
      return { record, created: true };
    });
  }

  async complete(
    sessionId: string,
    tool: string,
    result: unknown,
  ): Promise<void> {
    await this.mutexFor(sessionId).enter(() => {
      const data = this.load(sessionId);
      const record = data.operations[tool];
      if (!record || record.status !== "in_flight") return;
      record.status = "succeeded";
      record.completedAt = new Date().toISOString();
      record.result = result;
      this.save(sessionId, data);
    });
  }

  async fail(
    sessionId: string,
    tool: string,
    error: { code: string; message: string; recoverable?: boolean },
  ): Promise<void> {
    await this.mutexFor(sessionId).enter(() => {
      const data = this.load(sessionId);
      const record = data.operations[tool];
      if (!record || record.status !== "in_flight") return;
      record.status = "failed";
      record.completedAt = new Date().toISOString();
      record.error = error;
      this.save(sessionId, data);
    });
  }
}
