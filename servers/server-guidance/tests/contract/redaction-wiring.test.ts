import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, mkdirSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../../src/config.js";
import { WorkflowEngine } from "../../src/workflow/WorkflowEngine.js";

let ws: string;
let configDir: string;
let stateDir: string;

beforeEach(() => {
  ws = mkdtempSync(join(tmpdir(), "guidance-redact-"));
  stateDir = join(ws, "state");
  configDir = join(ws, ".guidance");
  mkdirSync(configDir, { recursive: true });
  const fixture = join(import.meta.dirname, "../workflow/fixtures/guidance");
  for (const f of ["guidance.json", "workflow.json", "responses.json", "operations.json", "downstream-servers.json", "policies.json"]) {
    writeFileSync(join(configDir, f), readFileSync(join(fixture, f)));
  }
  mkdirSync(join(configDir, "schemas"), { recursive: true });
  for (const f of readdirSync(join(fixture, "schemas"))) {
    writeFileSync(join(configDir, "schemas", f), readFileSync(join(fixture, "schemas", f)));
  }
});

afterEach(() => { rmSync(ws, { recursive: true, force: true }); });

function addSecretToPolicies(): void {
  const policiesPath = join(configDir, "policies.json");
  const policies = JSON.parse(readFileSync(policiesPath, "utf-8"));
  policies.redaction = { patterns: ["\\bapi[_-]?key\\b"] };
  writeFileSync(policiesPath, JSON.stringify(policies, null, 2));
}

describe("audit redaction wiring (FR-045/FR-050, Review Finding 2)", () => {
  it("audit events contain no configured secret values", async () => {
    addSecretToPolicies();
    const engine = new WorkflowEngine({ config: loadConfig(configDir), stateDir });
    const start = await engine.startWorkflow({ workspaceRoot: ws, request: "api_key=sk-abc123 deployment" });
    const historyPath = join(stateDir, "history", `${start.sessionId}.jsonl`);
    const content = readFileSync(historyPath, "utf-8");
    expect(content).not.toContain("sk-abc123");
  });

  it("non-secret audit data is preserved verbatim", async () => {
    const engine = new WorkflowEngine({ config: loadConfig(configDir), stateDir });
    const start = await engine.startWorkflow({ workspaceRoot: ws, request: "normal request" });
    engine.audit.append({ sessionId: start.sessionId, eventType: "operation_failed", data: { message: "exit code 1: repo=/ws" } });
    const content = readFileSync(join(stateDir, "history", `${start.sessionId}.jsonl`), "utf-8");
    expect(content).toContain("repo=/ws"); // nicht-sensible Daten bleiben erhalten
  });
});
