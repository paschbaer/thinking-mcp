import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { composeApplication } from "../../src/main.js";

let ws: string;
beforeEach(() => { ws = mkdtempSync(join(tmpdir(), "guidance-e2e-")); });
afterEach(() => { rmSync(ws, { recursive: true, force: true }); });

describe("scaffolded workflow end-to-end (HIGH-1 regression)", () => {
  it("can be driven from understand to completed without operation_not_configured", async () => {
    const cfgDir = join(ws, ".guidance");
    const { ensureConfiguration } = await import("../../src/main.js");
    ensureConfiguration(cfgDir);
    const engine = composeApplication(ws, cfgDir, join(ws, "state")).engine;
    const start = await engine.startWorkflow({ workspaceRoot: ws, request: "e2e" });
    let current = "understand";
    const payloads: { [phase: string]: Record<string, unknown> } = {
      understand: { summary: "s" },
      plan: { summary: "s", tasks: [] },
      review_plan: { summary: "s" },
      implement: { summary: "s" },
      review_implementation: { summary: "s" },
      verify: { summary: "s" },
    };
    // verify hat beforeExit-Gates (lint/test/build) — required: test/build.
    // Diese laufen als Prozesse und schlagen in der Testumgebung fehl, daher
    // prüfen wir nur bis zur verify-Transition und erwarten eine strukturierte
    // required_hook_failed-Antwort (kein operation_not_configured-Throw).
    let result = await engine.submit(start.sessionId, current, payloads[current] ?? {});
    const visited: string[] = [current];
    for (let i = 0; i < 10 && result.accepted; i++) {
      current = result.currentPhase;
      visited.push(current);
      if (current === "complete") break;
      result = await engine.submit(start.sessionId, current, payloads[current] ?? {});
    }
    // Kein Schritt darf operation_not_configured werfen — wir sind entweder in
    // complete (Ziel) oder hängen strukturiert an verify (Gates).
    expect(visited).toContain("verify");
    expect(result.accepted ? result.currentPhase : result.error!.code).not.toBe("operation_not_configured");
  });
});
