import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../../src/config.js";
import { WorkflowEngine } from "../../src/workflow/WorkflowEngine.js";

let ws: string;
beforeEach(() => {
  ws = mkdtempSync(join(tmpdir(), "guidance-perf-"));
  const configDir = join(ws, ".guidance");
  mkdirSync(configDir, { recursive: true });
  const fixture = join(import.meta.dirname, "../workflow/fixtures/guidance");
  for (const f of ["guidance.json", "workflow.json", "responses.json", "operations.json", "downstream-servers.json", "policies.json"]) {
    writeFileSync(join(configDir, f), readFileSync(join(fixture, f)));
  }
  mkdirSync(join(configDir, "schemas"), { recursive: true });
  for (const f of readdirSync(join(fixture, "schemas"))) {
    writeFileSync(join(configDir, "schemas", f), readFileSync(join(fixture, "schemas", f)));
  }
  writeFileSync(join(ws, "package.json"), JSON.stringify({ name: "ws" }));
});

import { readFileSync, readdirSync, mkdirSync } from "node:fs";

describe("SC-010 orchestration overhead (<1s p95 per transition)", () => {
  it("transitions stay under 1s Guidance-added overhead with stub ops", async () => {
    const config = loadConfig(join(ws, ".guidance"));
    const opEngine = new (await import("../../src/orchestration/OperationEngine.js")).OperationEngine();
    opEngine.setDownstreamInvoker({ invokeTool: async () => ({ kind: "success", content: [] }) });
    const engine = new WorkflowEngine({ config, stateDir: join(ws, "state"), operationEngine: opEngine });
    const durations: number[] = [];
    for (let run = 0; run < 10; run++) {
      const start = await engine.startWorkflow({ workspaceRoot: ws, request: `r${run}` });
      const t0 = Date.now();
      await engine.submit(start.sessionId, "understand", { summary: "s", acceptanceCriteria: ["a"] });
      durations.push(Date.now() - t0);
    }
    durations.sort((a, b) => a - b);
    const p95 = durations[Math.floor(durations.length * 0.95)] ?? durations[durations.length - 1]!;
    expect(p95).toBeLessThan(1000);
  });
});
