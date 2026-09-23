import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assertLoopback, startHttpServer, GuidanceHttpError } from "../../src/server.js";

let ws: string;
let cfgDir: string;
let stateDir: string;
const FIXTURE = join(import.meta.dirname, "../workflow/fixtures/guidance");

beforeEach(() => {
  ws = mkdtempSync(join(tmpdir(), "guidance-http-"));
  cfgDir = join(ws, ".guidance");
  stateDir = join(ws, ".guidance", "state");
  mkdirSync(cfgDir, { recursive: true });
  for (const f of ["guidance.json", "workflow.json", "responses.json", "operations.json", "downstream-servers.json", "policies.json"]) {
    writeFileSync(join(cfgDir, f), readFileSync(join(FIXTURE, f)));
  }
  mkdirSync(join(cfgDir, "schemas"), { recursive: true });
  for (const f of readdirSync(join(FIXTURE, "schemas"))) {
    writeFileSync(join(cfgDir, "schemas", f), readFileSync(join(FIXTURE, "schemas", f)));
  }
});

afterEach(() => {
  rmSync(ws, { recursive: true, force: true });
});

describe("HTTP transport (FR-027 loopback-only)", () => {
  it("accepts 127.0.0.1 and localhost", () => {
    expect(() => assertLoopback("127.0.0.1")).not.toThrow();
    expect(() => assertLoopback("localhost")).not.toThrow();
  });

  it("refuses non-loopback hosts at startup (fail-closed)", () => {
    expect(() => assertLoopback("0.0.0.0")).toThrowError(/non-loopback/);
    expect(() => assertLoopback("192.168.1.5")).toThrow(GuidanceHttpError);
  });

  it("boots on a loopback port and reports health", async () => {
    const { startHttpServer: boot } = await import("../../src/server.js");
    const { port } = await boot("127.0.0.1", 0);
    expect(port).toBeGreaterThan(0);
    const res = await fetch(`http://127.0.0.1:${port}/health`);
    expect(res.status).toBe(200);
    expect(((await res.json()) as { status: string }).status).toBe("ok");
  });

  it("MCP endpoint: tools/list and start_workflow over streamable HTTP (stateless)", async () => {
    process.env.GUIDANCE_WORKSPACE_ROOT = ws;
    const { port } = await startHttpServer("127.0.0.1", 0);
    const call = async (body: Record<string, unknown>) =>
      (await fetch(`http://127.0.0.1:${port}/mcp`, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
        body: JSON.stringify(body),
      })) as { status: number; json: () => Promise<{ result?: { tools?: unknown[]; content?: { text: string }[] } }> };
    const list = await call({ jsonrpc: "2.0", id: 1, method: "tools/list" });
    expect(list.status).toBe(200);
    expect(((await list.json()).result?.tools as unknown[]).length).toBe(17);
    const start = await call({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "start_workflow", arguments: { workspaceRoot: ws, request: "http-demo" } } });
    expect(start.status).toBe(200);
    const parsed = JSON.parse((await start.json()).result?.content?.[0]?.text ?? "{}") as { accepted: boolean; currentPhase: string };
    expect(parsed.accepted).toBe(true);
    expect(parsed.currentPhase).toBe("understand");
  });
    delete process.env.GUIDANCE_WORKSPACE_ROOT;

  it("auth token enforced when GUIDANCE_AUTH_TOKEN option is set", async () => {
    const { createHttpApp } = await import("../../src/server.js");
    const app = createHttpApp({ workspaceRoot: ws, configDir: cfgDir, stateDir: stateDir, authToken: "s3cret" });
    const server = app.listen(0, "127.0.0.1");
    await new Promise<void>((r) => server.once("listening", r));
    const port = (server.address() as { port: number }).port;
    const denied = await fetch(`http://127.0.0.1:${port}/mcp`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) });
    expect(denied.status).toBe(401);
    const ok = await fetch(`http://127.0.0.1:${port}/mcp`, { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", authorization: "Bearer s3cret" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) });
    expect(ok.status).toBe(200);
    const health = await fetch(`http://127.0.0.1:${port}/health`);
    expect(health.status).toBe(200); // health bleibt offen
    server.close();
  });

  it("stateless mode rejects GET/DELETE on /mcp", async () => {
    const { port } = await startHttpServer("127.0.0.1", 0);
    expect((await fetch(`http://127.0.0.1:${port}/mcp`)).status).toBe(405);
    expect((await fetch(`http://127.0.0.1:${port}/mcp`, { method: "DELETE" })).status).toBe(405);
  });

  it("explicit GUIDANCE_BIND_HOST override allows non-loopback (container opt-in)", async () => {
    const { resolveBindHost } = await import("../../src/server.js");
    process.env.GUIDANCE_BIND_HOST = "0.0.0.0";
    expect(resolveBindHost()).toBe("0.0.0.0");
    delete process.env.GUIDANCE_BIND_HOST;
    expect(resolveBindHost()).toBe("127.0.0.1");
  });
});
