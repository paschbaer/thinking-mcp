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
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createHash, randomUUID } from "node:crypto";

export interface OperationRecord {
  /** Opaque operation reference (safe to expose; no internal task ids). */
  operationId: string;
  tool: string;
  sessionId: string;
  /** Diagnostics-only fingerprint of the submitted arguments. */
  fingerprint: string;
  status: "in_flight" | "succeeded" | "failed";
  acceptedAt: string;
  completedAt?: string;
  /** JSON-serializable tool result (SubmitResult / ExposedOpResult). */
  result?: unknown;
  /** Failure detail (GuidanceError code/message) — failures are never
   *  swallowed (FR-3). */
  error?: { code: string; message: string; recoverable?: boolean };
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

  constructor(stateDir: string) {
    this.dir = join(stateDir, "operations");
    mkdirSync(this.dir, { recursive: true });
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

  private save(sessionId: string, data: RegistryFile): void {
    writeFileSync(this.fileFor(sessionId), `${JSON.stringify(data, null, 2)}\n`);
  }

  get(sessionId: string, tool: string): OperationRecord | undefined {
    return this.load(sessionId).operations[tool];
  }

  /** All retained records for a session, keyed by tool name (FR-3). */
  allFor(sessionId: string): Record<string, OperationRecord> {
    return this.load(sessionId).operations;
  }

  /** Registers the start of a transition; returns the new record. */
  begin(sessionId: string, tool: string, fingerprint: string): OperationRecord {
    const record: OperationRecord = {
      operationId: `op-${randomUUID()}`,
      tool,
      sessionId,
      fingerprint,
      status: "in_flight",
      acceptedAt: new Date().toISOString(),
    };
    const data = this.load(sessionId);
    data.operations[tool] = record;
    this.save(sessionId, data);
    return record;
  }

  complete(
    sessionId: string,
    tool: string,
    result: unknown,
  ): void {
    const data = this.load(sessionId);
    const record = data.operations[tool];
    if (!record || record.status !== "in_flight") return;
    record.status = "succeeded";
    record.completedAt = new Date().toISOString();
    record.result = result;
    this.save(sessionId, data);
  }

  fail(
    sessionId: string,
    tool: string,
    error: { code: string; message: string; recoverable?: boolean },
  ): void {
    const data = this.load(sessionId);
    const record = data.operations[tool];
    if (!record || record.status !== "in_flight") return;
    record.status = "failed";
    record.completedAt = new Date().toISOString();
    record.error = error;
    this.save(sessionId, data);
  }
}
