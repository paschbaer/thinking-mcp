/**
 * GUID-4 regression: schema loading must go through the ESM-safe
 * createRequire path in WorkflowEngine.validatorFor — NOT a bare `require`
 * (ReferenceError: require is not defined in built ESM; the crash surfaced
 * only in live dist runs, vitest masked the path before the fix).
 *
 * (a) exercises the public API schema-load path (valid + invalid submissions),
 * (b) source-scans WorkflowEngine.ts against a bare-require recurrence.
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, readdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../../src/config.js";
import { WorkflowEngine } from "../../src/workflow/WorkflowEngine.js";

let ws: string;
let engine: WorkflowEngine;

beforeEach(() => {
  ws = mkdtempSync(join(tmpdir(), "guidance-schema-load-"));
  const fixtureDir = join(process.cwd(), "tests/workflow/fixtures/guidance");
  for (const f of ["guidance.json", "workflow.json", "responses.json", "operations.json", "downstream-servers.json", "policies.json"]) {
    writeFileSync(join(ws, f), readFileSync(join(fixtureDir, f), "utf8"));
  }
  mkdirSync(join(ws, "schemas"), { recursive: true });
  for (const s of readdirSync(join(fixtureDir, "schemas"))) {
    writeFileSync(join(ws, "schemas", s), readFileSync(join(fixtureDir, "schemas", s), "utf8"));
  }
  if (!existsSync(join(ws, "schemas", "understand.schema.json"))) {
    throw new Error(`[dbg] schema copy failed: ${join(ws, "schemas", "understand.schema.json")} missing`);
  }
  engine = new WorkflowEngine({ config: loadConfig(ws), stateDir: join(ws, "state") });
});

afterEach(() => { rmSync(ws, { recursive: true, force: true }); });

describe("GUID-4 regression: schema load path stays ESM-safe", () => {
  it("validatorFor loads and validates through the public submit API", async () => {
    const start = await engine.startWorkflow({ workspaceRoot: ws, request: "schema load regression" });
    // understand first (phase order), then plan — both pass the real schema load + validation path
    const u = await engine.submit(start.sessionId, "understand", { summary: "s" });
    expect(u.accepted).toBe(true);
    const res = await engine.submit(start.sessionId, "plan", { tasks: [{ id: "T001", title: "t" }] });
    expect(res.accepted).toBe(true);
  });

  it("invalid submissions are rejected by the loaded schema (not by a crash)", async () => {
    const start = await engine.startWorkflow({ workspaceRoot: ws, request: "schema load regression invalid" });
    const u = await engine.submit(start.sessionId, "understand", { summary: "s" });
    expect(u.accepted).toBe(true);
    const res = await engine.submit(start.sessionId, "plan", { tasks: "not-an-array" });
    expect(res.accepted).toBe(false);
  });

  it("source scan: WorkflowEngine.ts contains no bare string require( calls", () => {
    const src = readFileSync(join(process.cwd(), "tests/workflow/../../src/workflow/WorkflowEngine.ts"), "utf8");
    // forbidden: bare-require of module specifiers (ESM crash); allowed: the
    // local `require(path)` shim variable fed by createRequire.
    const offenders = src.match(/require\(\s*["']/g) ?? [];
    expect(offenders, "bare string require( found in WorkflowEngine.ts — use createRequire from node:module (ESM)").toEqual([]);
  });
});
