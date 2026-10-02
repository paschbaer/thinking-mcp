/**
 * specs/008 T5+T7 — name-based workspace binding over the real MCP protocol.
 * AC-2 matrix: unknown name/path, traversal, Windows-case mismatch, symlink
 * alias (accepted — realpath collapses), sub-path rejection (A1 hardening).
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  mkdtempSync,
  rmSync,
  mkdirSync,
  writeFileSync,
  readdirSync,
  readFileSync,
  symlinkSync,
  realpathSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { composeApplication } from "../../src/main.js";
import { registerWorkflowTools } from "../../src/mcp-server/register-tools.js";
import { createGuidanceServer } from "../../src/mcp-server/GuidanceServer.js";

let ws: string;
let other: string;
let client: Client | undefined;

function setup(): string {
  ws = mkdtempSync(join(tmpdir(), "wsbind-"));
  other = join(ws, "other-repo");
  mkdirSync(other);
  const fixture = join(import.meta.dirname, "../workflow/fixtures/guidance");
  // specs/014: every registered workspace needs its own process config —
  // the former cpSync bootstrap was removed.
  const otherCfg = join(other, ".guidance");
  mkdirSync(otherCfg, { recursive: true });
  for (const f of [
    "guidance.json",
    "workflow.json",
    "responses.json",
    "operations.json",
    "downstream-servers.json",
    "policies.json",
  ]) {
    writeFileSync(join(otherCfg, f), readFileSync(join(fixture, f)));
  }
  mkdirSync(join(otherCfg, "schemas"), { recursive: true });
  for (const f of readdirSync(join(fixture, "schemas"))) {
    writeFileSync(
      join(otherCfg, "schemas", f),
      readFileSync(join(fixture, "schemas", f)),
    );
  }
  const cfgDir = join(ws, ".guidance");
  mkdirSync(cfgDir, { recursive: true });
  for (const f of [
    "workflow.json",
    "responses.json",
    "operations.json",
    "downstream-servers.json",
    "policies.json",
  ]) {
    writeFileSync(join(cfgDir, f), readFileSync(join(fixture, f)));
  }
  const guidance = JSON.parse(
    readFileSync(join(fixture, "guidance.json"), "utf-8"),
  ) as Record<string, unknown>;
  guidance.workspaces = [
    { name: "main", root: ws },
    { name: "other", root: other },
  ];
  writeFileSync(
    join(cfgDir, "guidance.json"),
    JSON.stringify(guidance, null, 2),
  );
  mkdirSync(join(cfgDir, "schemas"), { recursive: true });
  for (const f of readdirSync(join(fixture, "schemas"))) {
    writeFileSync(
      join(cfgDir, "schemas", f),
      readFileSync(join(fixture, "schemas", f)),
    );
  }
  const app = composeApplication(ws, cfgDir, join(cfgDir, "state"));
  const server = createGuidanceServer();
  registerWorkflowTools(server, app.tools, ws, () => app.config.workspaces);
  const pair = InMemoryTransport.createLinkedPair();
  void server.connect(pair[0]);
  client = new Client({ name: "test", version: "1" });
  void client.connect(pair[1]);
  return app.config.workspaces.resolve(ws).name;
}

function errText(res: unknown): string {
  const content = (res as { content?: { type: string; text: string }[] })
    .content;
  return content?.[0]?.text ?? "";
}

beforeEach(() => {
  client = undefined;
});
afterEach(async () => {
  if (client) await client.close();
  if (ws) rmSync(ws, { recursive: true, force: true });
});

describe("name-based workspace binding (specs/008 T5+T7, AC-2)", () => {
  it("registered name starts a session; workspaceRoot (exact root) still accepted (deprecation)", async () => {
    setup();
    const byName = await client!.callTool({
      name: "start_workflow",
      arguments: { workspace: "main", request: "r" },
    });
    expect(byName.isError ?? false).toBe(false);
    const byRoot = await client!.callTool({
      name: "start_workflow",
      arguments: { workspaceRoot: ws, request: "r" },
    });
    expect(byRoot.isError ?? false).toBe(false);
  });

  it("unknown workspace name and foreign path rejected with workspace_not_registered", async () => {
    setup();
    for (const args of [
      { workspace: "niyama", request: "r" },
      { workspaceRoot: "/etc", request: "r" },
    ]) {
      const res = await client!.callTool({
        name: "start_workflow",
        arguments: args,
      });
      expect(res.isError).toBe(true);
      expect(errText(res)).toMatch(/workspace_not_registered|not registered/);
    }
  });

  it("AC-2 matrix: traversal, sub-path, case mismatch rejected; symlink alias accepted", async () => {
    setup();
    const rejections = [
      { workspaceRoot: join(ws, "../../etc"), request: "r" },
      { workspaceRoot: join(ws, "sub"), request: "r" }, // A1: sub-path
      { workspaceRoot: ws.toUpperCase(), request: "r" }, // case mismatch (fail-closed on case-sensitive fs)
      { workspace: "../../etc", request: "r" }, // name/path confusion
    ];
    for (const args of rejections) {
      const res = await client!.callTool({
        name: "start_workflow",
        arguments: args,
      });
      expect(res.isError).toBe(true);
      expect(errText(res)).toMatch(/workspace_not_registered|not registered/);
    }
    // Symlink alias of a registered root collapses via realpath → accepted.
    const alias = join(ws, "alias");
    symlinkSync(other, alias, "junction");
    const res = await client!.callTool({
      name: "start_workflow",
      arguments: { workspaceRoot: alias, request: "r" },
    });
    expect(res.isError ?? false).toBe(false);
  });
});
