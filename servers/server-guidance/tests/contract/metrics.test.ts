import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MetricsRepository } from "../../src/metrics/MetricsRepository.js";

let dir: string;
let file: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "guidance-metrics-"));
  file = join(dir, "metrics.jsonl");
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("metrics repository (spec 005 FR-402/403, L260)", () => {
  it("aggregates operation outcomes into separate counters", () => {
    const m = new MetricsRepository(null);
    m.recordOperation("test", "succeeded", 100);
    m.recordOperation("test", "succeeded", 200);
    m.recordOperation("test", "failed", 50);
    m.recordOperation("test", "cancelled", 10);
    m.recordOperation("test", "timed_out", 400);
    const snap = m.snapshot();
    const t = snap.operations["test"]!;
    expect(t.runs).toBe(5);
    expect(t.succeeded).toBe(2);
    expect(t.failed).toBe(1);
    expect(t.cancelled).toBe(1);
    expect(t.timedOut).toBe(1);
    expect(t.durationMs).toEqual({ count: 5, sum: 760, max: 400 });
  });

  it("keeps separate buckets per operation id", () => {
    const m = new MetricsRepository(null);
    m.recordOperation("a", "succeeded", 1);
    m.recordOperation("b", "failed", 2);
    expect(m.snapshot().operations["a"]!.runs).toBe(1);
    expect(m.snapshot().operations["b"]!.runs).toBe(1);
  });

  it("appends JSONL per record and replays it into a fresh repository", () => {
    const m = new MetricsRepository(file);
    m.recordOperation("lint", "succeeded", 10);
    m.recordOperation("lint", "failed", 20);
    expect(existsSync(file)).toBe(true);
    const lines = readFileSync(file, "utf8").trim().split("\n");
    expect(lines.length).toBe(2);
    for (const line of lines) {
      const rec = JSON.parse(line) as Record<string, unknown>;
      // FR-403: identifiers and numbers only — no free-text payloads
      expect(Object.keys(rec).sort()).toEqual(["durationMs", "kind", "operationId", "outcome", "ts"]);
    }
    const replayed = new MetricsRepository(file);
    expect(replayed.snapshot().operations["lint"]!.runs).toBe(2);
  });

  it("records connection health snapshots keyed by server", () => {
    const m = new MetricsRepository(file);
    m.recordConnection("gitnexus", "connected");
    m.recordConnection("gitnexus", "disconnected");
    const snap = m.snapshot();
    expect(snap.connections).toEqual([{ serverId: "gitnexus", status: "disconnected" }]);
  });
});
