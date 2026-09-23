import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { composeApplication } from "../../src/main.js";
import { registerWorkflowTools, WORKFLOW_TOOL_NAMES } from "../../src/mcp-server/register-tools.js";
import { createGuidanceServer } from "../../src/mcp-server/GuidanceServer.js";

let ws: string;
let server: ReturnType<typeof createGuidanceServer>;
let client: Client;

beforeEach(async () => {
  ws = mkdtempSync(join(tmpdir(), "guidance-reg-"));
  writeFileSync(join(ws, "package.json"), JSON.stringify({ name: "ws" }));
  // Fixture-Konfiguration bereitstellen (Fail-closed Loader verlangt guidance.json)
  const fixture = join(import.meta.dirname, "../workflow/fixtures/guidance");
  const cfgDir = join(ws, ".guidance");
  mkdirSync(cfgDir, { recursive: true });
  for (const f of ["guidance.json", "workflow.json", "responses.json", "operations.json", "downstream-servers.json", "policies.json"]) {
    writeFileSync(join(cfgDir, f), readFileSync(join(fixture, f)));
  }
  mkdirSync(join(cfgDir, "schemas"), { recursive: true });
  for (const f of readdirSync(join(fixture, "schemas"))) {
    writeFileSync(join(cfgDir, "schemas", f), readFileSync(join(fixture, "schemas", f)));
  }
  const app = composeApplication(ws, cfgDir, join(ws, "state"));
  server = createGuidanceServer();
  registerWorkflowTools(server, app.tools, ws);
  const pair = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(pair[0]), (client = new Client({ name: "test", version: "1" })).connect(pair[1])]);
});

afterEach(async () => {
  await client.close();
});

describe("tool registration (Review Finding 1)", () => {
  it("exposes exactly the workflow tool surface (no hidden/missing tools)", async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual([...WORKFLOW_TOOL_NAMES].sort());
    expect(names).not.toContain("discover_spec_kit_feature"); // plain profile: keine Spec-Kit-Tools (R17)
  });

  it("round-trips start_workflow over the MCP protocol", async () => {
    const res = await client.callTool({ name: "start_workflow", arguments: { workspaceRoot: ws, request: "demo" } });
    const text = (res.content as { type: string; text: string }[])[0]!.text;
    const parsed = JSON.parse(text);
    expect(parsed.accepted).toBe(true);
    expect(parsed.currentPhase).toBe("understand");
    expect(parsed.guidance.title).toBeTruthy();
  });

  it("round-trips an invalid_active_phase rejection over the protocol", async () => {
    const start = await client.callTool({ name: "start_workflow", arguments: { workspaceRoot: ws, request: "demo" } });
    const sid = JSON.parse((start.content as { type: string; text: string }[])[0]!.text).sessionId as string;
    const res = await client.callTool({ name: "submit_verification", arguments: { sessionId: sid, verificationSummary: ["x"] } });
    const parsed = JSON.parse((res.content as { type: string; text: string }[])[0]!.text);
    expect(parsed.accepted).toBe(false);
    expect(parsed.error.code).toBe("invalid_active_phase");
  });
});
