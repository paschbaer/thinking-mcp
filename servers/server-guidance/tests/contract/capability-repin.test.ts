/**
 * CHFIX-11: hybrid in-process capability re-pin.
 * - drift (schema changed / tool missing vs a pinned hash) still fails
 *   CLOSED, but audits capability_pin_drift (engine-level audit file) and
 *   the error message carries the release_capability_pins remedy;
 * - releaseCapabilityPins(confirm:true) removes pins in-process, persists
 *   the removal (merge keeps other keys) and audits capability_pins_reset;
 * - the next successful call re-pins automatically — no server restart.
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { randomUUID } from "node:crypto";
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  readFileSync,
  mkdirSync,
  readdirSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { loadConfig } from "../../src/config.js";
import {
  WorkflowEngine,
  saveCapabilityPins,
} from "../../src/workflow/WorkflowEngine.js";

const FIXTURE = join(import.meta.dirname, "../workflow/fixtures/guidance");

function startEchoMcpServer(): Promise<{
  server: ReturnType<typeof createServer>;
  url: string;
}> {
  const sessions = new Map<
    string,
    { transport: StreamableHTTPServerTransport; server: McpServer }
  >();

  const httpServer = createServer(
    async (req: IncomingMessage, res: ServerResponse) => {
      if (req.method !== "POST" || !req.url?.startsWith("/mcp")) {
        res.writeHead(405).end();
        return;
      }
      const chunks: Buffer[] = [];
      const bodyText = await new Promise<string>((resolveBody, rejectBody) => {
        req.on("data", (c: Buffer) => chunks.push(c));
        req.on("end", () =>
          resolveBody(Buffer.concat(chunks).toString("utf8")),
        );
        req.on("error", rejectBody);
      });
      let body: unknown;
      try {
        body = JSON.parse(bodyText);
      } catch {
        res.writeHead(400).end();
        return;
      }
      const header =
        (req.headers["mcp-session-id"] as string | undefined) ?? null;
      const method = (body as { method?: string }).method;

      if (method === "initialize" || !header) {
        const server = new McpServer({ name: "repin-stub", version: "1.0.0" });
        server.tool(
          "echo",
          "echoes the message",
          { message: z.string().optional() },
          async (args) => ({
            content: [
              {
                type: "text",
                text: `echo:${(args as { message?: string }).message ?? ""}`,
              },
            ],
          }),
        );
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          enableJsonResponse: true,
        });
        await server.connect(transport);
        await transport.handleRequest(req, res, body);
        const sid = transport.sessionId;
        if (sid) sessions.set(sid, { transport, server });
        return;
      }
      const entry = header ? sessions.get(header) : undefined;
      if (!entry) {
        res.writeHead(404).end();
        return;
      }
      try {
        await entry.transport.handleRequest(req, res, body);
      } catch (err) {
        if (!res.headersSent) res.writeHead(500).end(String(err));
      }
    },
  );

  return new Promise((resolveStub) => {
    httpServer.listen(0, "127.0.0.1", () => {
      const address = httpServer.address();
      const port = typeof address === "object" && address ? address.port : 0;
      resolveStub({ server: httpServer, url: `http://127.0.0.1:${port}/mcp` });
    });
  });
}

let ws: string;
let stateDir: string;
let configDir: string;
let stub: { server: ReturnType<typeof createServer>; url: string } | undefined;

function seedWorkspace(): void {
  ws = mkdtempSync(join(tmpdir(), "guidance-repin-"));
  stateDir = join(ws, "state");
  configDir = join(ws, ".guidance");
  mkdirSync(configDir, { recursive: true });
  for (const f of [
    "guidance.json",
    "workflow.json",
    "responses.json",
    "operations.json",
    "downstream-servers.json",
    "policies.json",
  ]) {
    writeFileSync(join(configDir, f), readFileSync(join(FIXTURE, f)));
  }
  mkdirSync(join(configDir, "schemas"), { recursive: true });
  for (const f of readdirSync(join(FIXTURE, "schemas"))) {
    writeFileSync(
      join(configDir, "schemas", f),
      readFileSync(join(FIXTURE, "schemas", f)),
    );
  }
  writeFileSync(
    join(configDir, "downstream-servers.json"),
    JSON.stringify(
      {
        version: 2,
        servers: {
          stub: {
            displayName: "stub",
            enabled: true,
            required: false,
            trustLevel: "trusted",
            transport: { type: "http", http: { url: stub!.url } },
            capabilities: {
              allow: { tools: ["*"], resources: [], prompts: [] },
            },
            connection: { requestTimeoutSeconds: 5 },
          },
        },
      },
      null,
      2,
    ),
  );
  const host = new URL(stub!.url).host;
  writeFileSync(
    join(configDir, "policies.json"),
    JSON.stringify(
      {
        version: 2,
        trustLevels: { trusted: { dataEgress: "project_data" } },
        egress: { httpHostAllowlist: [host] },
      },
      null,
      2,
    ),
  );
  // WC-1-B: unconfigured wildcard tools require explicit approval — give the
  // called tools operation entries (risk classes) like call-downstream.test.
  const fixtureOps = (
    JSON.parse(readFileSync(join(FIXTURE, "operations.json"), "utf8")) as {
      operations: Record<string, unknown>;
    }
  ).operations;
  writeFileSync(
    join(configDir, "operations.json"),
    JSON.stringify(
      {
        version: 2,
        operations: {
          ...fixtureOps,
          "stub-echo": {
            type: "mcpTool",
            server: "stub",
            capability: "echo",
            required: false,
            riskClass: "read_only",
          },
          "stub-gone": {
            type: "mcpTool",
            server: "stub",
            capability: "gone",
            required: false,
            riskClass: "read_only",
          },
        },
      },
      null,
      2,
    ),
  );
}

function makeEngine(): WorkflowEngine {
  return new WorkflowEngine({ config: loadConfig(configDir), stateDir });
}

const pinsFile = () => join(stateDir, "capability-hashes.json");
const readPins = (): Record<string, string> =>
  existsSync(pinsFile())
    ? (JSON.parse(readFileSync(pinsFile(), "utf8")) as Record<string, string>)
    : {};
const writePins = (pins: Record<string, string>) => {
  mkdirSync(stateDir, { recursive: true });
  writeFileSync(pinsFile(), JSON.stringify(pins, null, 2));
};
const driftAudit = (): unknown[] => {
  const p = join(stateDir, "history", "capability-pins.jsonl");
  return existsSync(p)
    ? readFileSync(p, "utf8")
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((l) => JSON.parse(l))
    : [];
};
const sessionAudit = (sessionId: string): unknown[] => {
  const p = join(stateDir, "history", `${sessionId}.jsonl`);
  return existsSync(p)
    ? readFileSync(p, "utf8")
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((l) => JSON.parse(l))
    : [];
};

beforeEach(async () => {
  stub = await startEchoMcpServer();
});

afterEach(async () => {
  await new Promise<void>((r) => (stub ? stub.server.close(() => r()) : r()));
  if (ws) rmSync(ws, { recursive: true, force: true });
});

describe("hybrid capability re-pin (CHFIX-11)", () => {
  it("drift fails closed, audits capability_pin_drift, names the remedy; release (confirm) clears + audits; retry succeeds and re-pins — no restart", async () => {
    seedWorkspace();
    // Phase 1: a successful call pins the real hash.
    const engineA = makeEngine();
    const start = await engineA.startWorkflow({
      workspaceRoot: ws,
      request: "r",
    });
    const ok1 = await engineA.callDownstream(start.sessionId, "stub", "echo", {
      message: "hi",
    });
    expect(ok1.status).toBe("succeeded");
    const realHash = readPins()["stub:echo"];
    expect(realHash).toBeTruthy();

    // Phase 2: poison the pin (simulated infra event: server changed) and
    // reload it through a FRESH engine over the same stateDir.
    writePins({ "stub:echo": "stale-deadbeef" });
    const engineB = makeEngine();
    // Message carries the conscious-release remedy (single drift call —
    // every drift detection appends an audit event).
    await expect(
      engineB.callDownstream(start.sessionId, "stub", "echo", {
        message: "hi",
      }),
    ).rejects.toMatchObject({
      code: "downstream_capability_changed",
      message: expect.stringContaining("release_capability_pins"),
    });
    // Engine-level drift audit with pinned vs live hashes.
    const drifts = driftAudit().filter(
      (e) => (e as { eventType?: string }).eventType === "capability_pin_drift",
    );
    expect(drifts).toHaveLength(1);
    expect(drifts[0]).toMatchObject({
      data: {
        serverId: "stub",
        toolName: "echo",
        kind: "schema-drift",
        pinnedHash: "stale-deadbeef",
        liveHash: realHash,
      },
    });

    // Phase 3: release without confirm is rejected (conscious step).
    expect(() =>
      engineB.releaseCapabilityPins(start.sessionId, {}),
    ).toThrowError(/confirm:true/);
    expect(() =>
      engineB.releaseCapabilityPins(start.sessionId, {
        confirm: false as unknown as true,
      }),
    ).toThrowError(/confirm:true/);

    // Phase 4: confirmed release clears the pin in-process AND on disk,
    // and audits capability_pins_reset on the calling session.
    const released = engineB.releaseCapabilityPins(start.sessionId, {
      serverId: "stub",
      confirm: true,
    });
    expect(released).toEqual({ released: 1 });
    expect(readPins()["stub:echo"]).toBeUndefined();
    expect(
      sessionAudit(start.sessionId).some(
        (e) =>
          (e as { eventType?: string }).eventType === "capability_pins_reset",
      ),
    ).toBe(true);

    // Phase 5: the retry succeeds and re-pins automatically (no restart).
    const ok2 = await engineB.callDownstream(start.sessionId, "stub", "echo", {
      message: "again",
    });
    expect(ok2.status).toBe("succeeded");
    expect(readPins()["stub:echo"]).toBe(realHash);
  });

  it("a pinned tool that no longer exists is drift too (tool-missing classification)", async () => {
    seedWorkspace();
    writePins({ "stub:gone": "some-old-hash" });
    const engine = makeEngine();
    const start = await engine.startWorkflow({
      workspaceRoot: ws,
      request: "r",
    });
    await expect(
      engine.callDownstream(start.sessionId, "stub", "gone", {}),
    ).rejects.toMatchObject({ code: "downstream_capability_changed" });
    const drifts = driftAudit().filter(
      (e) => (e as { eventType?: string }).eventType === "capability_pin_drift",
    );
    expect(drifts).toHaveLength(1);
    expect(drifts[0]).toMatchObject({
      data: { serverId: "stub", toolName: "gone", kind: "tool-missing" },
    });
  });

  it("saveCapabilityPins({remove}) deletes only the named keys (merge keeps the rest)", () => {
    const dir = mkdtempSync(join(tmpdir(), "repin-pins-"));
    try {
      const pins = new Map<string, string>([
        ["a:keep", "h1"],
        ["a:drop", "h2"],
      ]);
      saveCapabilityPins(dir, pins);
      saveCapabilityPins(dir, new Map<string, string>(), {
        remove: ["a:drop"],
      });
      const onDisk = JSON.parse(
        readFileSync(join(dir, "capability-hashes.json"), "utf8"),
      ) as Record<string, string>;
      expect(onDisk).toEqual({ "a:keep": "h1" });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("release filters are exact: a toolName never over-matches a colon-containing tool name (review F-1)", async () => {
    seedWorkspace();
    // Two pins: a colon-containing tool name on s1 and the plain name on s2.
    writePins({ "s1:thinking:analyze": "h1", "s2:analyze": "h2" });
    const engine = makeEngine();
    const start = await engine.startWorkflow({
      workspaceRoot: ws,
      request: "r",
    });
    const released = engine.releaseCapabilityPins(start.sessionId, {
      toolName: "analyze",
      confirm: true,
    });
    expect(released).toEqual({ released: 1 });
    expect(readPins()).toEqual({ "s1:thinking:analyze": "h1" });
    // The reset audit carries the payload fields (released + filter).
    const resets = sessionAudit(start.sessionId).filter(
      (e) =>
        (e as { eventType?: string }).eventType === "capability_pins_reset",
    );
    expect(resets).toHaveLength(1);
    expect(resets[0]).toMatchObject({
      data: { released: 1, toolName: "analyze" },
    });
  });
});
