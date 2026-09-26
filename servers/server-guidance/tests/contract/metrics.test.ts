import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
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

  it("replay does NOT re-persist records (final review F1: no exponential growth)", () => {
    const m = new MetricsRepository(file);
    m.recordOperation("lint", "succeeded", 10);
    m.recordOperation("lint", "failed", 20);
    const sizeAfterFirst = readFileSync(file, "utf8").trim().split("\n").length;
    void new MetricsRepository(file); // replay boot
    const sizeAfterReplay = readFileSync(file, "utf8").trim().split("\n").length;
    expect(sizeAfterReplay).toBe(sizeAfterFirst);
  });

  it("get_metrics counts match executed operations (SC-401)", async () => {
    const { WorkflowEngine } = await import("../../src/workflow/WorkflowEngine.js");
    const { loadConfig } = await import("../../src/config.js");
    const FIXTURE = join(import.meta.dirname, "../workflow/fixtures/guidance");
    const ws2 = mkdtempSync(join(tmpdir(), "guidance-metrics-engine-"));
    const cfgDir2 = join(ws2, ".guidance");
    mkdirSync(cfgDir2, { recursive: true });
    for (const f of ["guidance.json", "workflow.json", "responses.json", "operations.json", "downstream-servers.json", "policies.json"]) {
      writeFileSync(join(cfgDir2, f), readFileSync(join(FIXTURE, f)));
    }
    // invocable-echo in die Config (sonst operation_not_configured)
    const opsPath = join(cfgDir2, "operations.json");
    const ops = JSON.parse(readFileSync(opsPath, "utf8")) as { operations: Record<string, unknown> };
    ops.operations["invocable-echo"] = { description: "d", type: "process", executable: "node", args: ["-e", "process.exit(0)"], required: false, invocableByAgent: true, timeoutSeconds: 10, validation: { exitCodeMustBeZero: true }, output: { returnToAgent: "summary_and_errors" } };
    writeFileSync(opsPath, JSON.stringify(ops));
    writeFileSync(join(ws2, "package.json"), JSON.stringify({ name: "ws" }));
    const config = loadConfig(cfgDir2);
    const engine = new WorkflowEngine({ config, stateDir: join(ws2, "state") });
    const start = await engine.startWorkflow({ workspaceRoot: ws2, request: "r" });
    await engine.runOperation(start.sessionId, "invocable-echo");
    await engine.runOperation(start.sessionId, "invocable-echo");
    const snap = await engine.getMetrics();
    const bucket = snap.operations["invocable-echo"]!;
    expect(bucket.runs).toBe(2);
    expect(bucket.succeeded).toBe(2);
    expect(bucket.durationMs.count).toBe(2);
    rmSync(ws2, { recursive: true, force: true });
  });
});
