/**
 * Metrics repository (spec 005, L260/FR-059 — FR-402/FR-403).
 *
 * In-memory operation aggregates plus optional JSONL persistence
 * (append per record, replayed on construction). Payloads carry
 * identifiers and numbers only — no free text, nothing to redact.
 */
import { existsSync, appendFileSync, readFileSync } from "node:fs";

export type OperationOutcome = "succeeded" | "failed" | "cancelled" | "timed_out";

export interface OperationMetrics {
  runs: number;
  succeeded: number;
  failed: number;
  cancelled: number;
  timedOut: number;
  durationMs: { count: number; sum: number; max: number };
}

export interface ConnectionSnapshot {
  serverId: string;
  status: string;
}

export interface MetricsSnapshot {
  operations: Record<string, OperationMetrics>;
  connections: ConnectionSnapshot[];
}

interface MetricsRecord {
  ts: string;
  kind: "operation" | "connection";
  operationId?: string;
  outcome?: OperationOutcome;
  durationMs?: number;
  serverId?: string;
  status?: string;
}

function emptyBucket(): OperationMetrics {
  return { runs: 0, succeeded: 0, failed: 0, cancelled: 0, timedOut: 0, durationMs: { count: 0, sum: 0, max: 0 } };
}

export class MetricsRepository {
  private readonly operations: Record<string, OperationMetrics> = {};
  private readonly connections: Record<string, ConnectionSnapshot> = {};
  private replaying = false;

  constructor(private readonly file: string | null = null) {
    this.replay();
  }

  recordOperation(operationId: string, outcome: OperationOutcome, durationMs: number): void {
    const bucket = (this.operations[operationId] ??= emptyBucket());
    bucket.runs += 1;
    if (outcome === "succeeded") bucket.succeeded += 1;
    else if (outcome === "failed") bucket.failed += 1;
    else if (outcome === "cancelled") bucket.cancelled += 1;
    else if (outcome === "timed_out") bucket.timedOut += 1;
    bucket.durationMs.count += 1;
    bucket.durationMs.sum += durationMs;
    if (durationMs > bucket.durationMs.max) bucket.durationMs.max = durationMs;
    this.persist({ ts: new Date().toISOString(), kind: "operation", operationId, outcome, durationMs });
  }

  recordConnection(serverId: string, status: string): void {
    this.connections[serverId] = { serverId, status };
    this.persist({ ts: new Date().toISOString(), kind: "connection", serverId, status });
  }

  snapshot(): MetricsSnapshot {
    return {
      operations: Object.fromEntries(Object.entries(this.operations).map(([k, v]) => [k, { ...v, durationMs: { ...v.durationMs } }])),
      connections: Object.values(this.connections).map((c) => ({ ...c })),
    };
  }

  private persist(record: MetricsRecord): void {
    // Final review F1 (HIGH): replayed records must NOT be re-persisted —
    // otherwise metrics.jsonl doubles on every boot.
    if (!this.file || this.replaying) return;
    try {
      appendFileSync(this.file, JSON.stringify(record) + "\n");
    } catch {
      /* best effort — metrics never break operations */
    }
  }

  private replay(): void {
    if (!this.file || !existsSync(this.file)) return;
    this.replaying = true;
    try {
      for (const line of readFileSync(this.file, "utf8").split("\n")) {
        if (!line.trim()) continue;
        try {
          const rec = JSON.parse(line) as MetricsRecord;
          if (rec.kind === "operation" && rec.operationId && rec.outcome && typeof rec.durationMs === "number") {
            this.recordOperation(rec.operationId, rec.outcome, rec.durationMs);
          } else if (rec.kind === "connection" && rec.serverId && rec.status) {
            this.recordConnection(rec.serverId, rec.status);
          }
        } catch {
          /* skip malformed lines */
        }
      }
    } catch {
      /* unreadable file: start empty */
    } finally {
      this.replaying = false;
    }
  }
}
