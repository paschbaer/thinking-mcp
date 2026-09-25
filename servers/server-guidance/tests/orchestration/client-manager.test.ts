import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ClientManager } from "../../src/mcp-client/ClientManager.js";
import { createStubServer, createCountingInvoker, type StubMode } from "./stubs/stub-downstream.js";

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "guidance-orch-")); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

describe("ClientManager (FR-031/033/034/042, SC-008)", () => {
  it("connects to a stub, becomes ready and discovers tools", async () => {
    const stub = createStubServer("success");
    const mgr = new ClientManager();
    mgr.useTransport("gitnexus", () => stub.clientTransport);
    const status = await mgr.ensureReady("gitnexus");
    expect(status.status).toBe("ready");
    expect(status.tools.map((t) => t.name)).toContain("analyze");
    await mgr.shutdown();
  });

  it("transport_failure mode keeps isolation: failed server does not affect others", async () => {
    const bad = createStubServer("transport_failure");
    const good = createStubServer("success");
    const mgr = new ClientManager();
    mgr.useTransport("bad", () => bad.clientTransport);
    mgr.useTransport("good", () => good.clientTransport);
    const sBad = await mgr.ensureReady("bad");
    const sGood = await mgr.ensureReady("good");
    expect(sBad.status).toBe("failed");
    expect(sGood.status).toBe("ready");
    await mgr.shutdown();
  });

  it("enforces requestTimeoutSeconds as a transport failure (FR-035, Review Finding M2)", async () => {
    const slow = createStubServer("timeout");
    const mgr = new ClientManager();
    mgr.useTransport("slow", () => slow.clientTransport);
    await mgr.ensureReady("slow");
    const out = await mgr.invokeTool("slow", "analyze", {}, 0.05);
    expect(out.kind).toBe("transport");
    if (out.kind === "transport") expect(out.message).toMatch(/timed out/);
    // Unconfigured = unbounded: the same stub without timeout must succeed,
    // proving the timeout is what produced the transport failure above.
    const ok = await mgr.invokeTool("slow", "analyze", {});
    expect(ok.kind).not.toBe("transport");
    await mgr.shutdown();
  });

  it("classifies tool-reported errors vs transport failures", async () => {
    const toolErr = createStubServer("tool_error");
    const mgr = new ClientManager({ requiredServers: ["x"] });
    mgr.useTransport("x", () => toolErr.clientTransport);
    await mgr.ensureReady("x");
    mgr.assertAllowed("x", "analyze", ["analyze"]);
    const out = await mgr.invokeTool("x", "analyze", {});
    expect(out.kind).toBe("tool_reported");
    const disconnected = await mgr.invokeTool("nope", "analyze", {});
    expect(disconnected.kind).toBe("transport");
    await mgr.shutdown();
  });

  it("detects capability drift against the pinned schema hash (FR-042)", async () => {
    const stub1 = createStubServer("success");
    const mgr = new ClientManager();
    mgr.useTransport("g", () => stub1.clientTransport);
    await mgr.ensureReady("g");
    const pinned = mgr.pinCapability("g", "analyze");
    // Reconnect with a drifted stub (different input schema ⇒ different hash).
    const stub2 = createStubServer("success");
    // build a drifted variant manually: register with different schema is not
    // possible post-registration, so simulate by comparing hashes directly.
    const driftedHash = "sha256:deadbeef";
    expect(() => mgr.assertNotDrifted("g", "analyze", driftedHash)).toThrowError(/drifted/);
    expect(() => mgr.assertNotDrifted("g", "analyze", pinned.inputSchemaHash)).not.toThrow();
    expect(pinned.inputSchemaHash).toMatch(/^sha256:/);
  });

  it("enforces capability allowlists (FR-048)", () => {
    const mgr = new ClientManager();
    expect(() => mgr.assertAllowed("g", "hiddenTool", ["analyze"])).toThrowError(/not allowlisted/);
  });
});

describe("ClientManager http transport (FR-031 HTTP extension)", () => {
  it("connects over streamable HTTP and discovers tools via the http config branch", async () => {
    const { createHttpApp } = await import("../../src/server.js");
    const app = createHttpApp({
      workspaceRoot: dir,
      configDir: join(dir, ".guidance"),
      stateDir: join(dir, ".guidance", "state"),
    });
    const httpServer = app.listen(0, "127.0.0.1");
    await new Promise<void>((r) => httpServer.once("listening", r));
    const port = (httpServer.address() as { port: number }).port;
    try {
      const mgr = new ClientManager();
      const status = await mgr.ensureReady("guidance-remote", {
        type: "http",
        url: `http://127.0.0.1:${port}/mcp`,
        headers: { "x-guidance-test": "1" },
      });
      expect(status.status, status.error).toBe("ready");
      expect(status.tools.length).toBeGreaterThan(0);
      await mgr.shutdown();
    } finally {
      httpServer.close();
    }
  });

  it("handshake timeout yields status failed for an unreachable http endpoint", async () => {
    const mgr = new ClientManager();
    mgr.handshakeTimeoutMs = 200;
    const status = await mgr.ensureReady("dark", { type: "http", url: "http://127.0.0.1:9/mcp" });
    expect(status.status).toBe("failed");
    expect(status.error).toBeDefined();
  });

  it("applies per-call handshakeTimeoutSeconds (HD-2: connection.startupTimeoutSeconds wiring)", async () => {
    // Hanging transport: connect never resolves — only the timeout can end it.
    const hanging = {
      start: () => new Promise<never>(() => {}),
      send: () => new Promise<never>(() => {}),
      close: async () => {},
      onclose: undefined as unknown as (() => void) | undefined,
      onerror: undefined as unknown as (() => void) | undefined,
      onmessage: undefined as unknown as (() => void) | undefined,
    };
    const mgr = new ClientManager();
    mgr.useTransport("hang", () => hanging as never);
    // Instance default stays high (10s); the per-call override must end it fast.
    const start = Date.now();
    const status = await mgr.ensureReady("hang", undefined, { handshakeTimeoutSeconds: 0.2 });
    const elapsed = Date.now() - start;
    expect(status.status).toBe("failed");
    expect(status.error).toMatch(/handshake timeout/);
    expect(elapsed).toBeLessThan(5_000);
  });

  it("invalid handshakeTimeoutSeconds yields failed status, not a crash", async () => {
    const mgr = new ClientManager();
    const status = await mgr.ensureReady("bad", { type: "http", url: "http://127.0.0.1:9/mcp" }, { handshakeTimeoutSeconds: -1 });
    expect(status.status).toBe("failed");
    expect(status.error).toMatch(/invalid handshakeTimeoutSeconds/);
  });

  describe("reconnect (HD-1: connection.reconnect)", () => {
    it("reconnects and retries the invocation after the downstream died", async () => {
      const mgr = new ClientManager();
      const stubs: ReturnType<typeof createStubServer>[] = [];
      let factoryCalls = 0;
      mgr.useTransport("r", () => {
        factoryCalls += 1;
        const stub = createStubServer("success");
        stubs.push(stub);
        return stub.clientTransport;
      });
      const status = await mgr.ensureReady("r", undefined, {
        reconnect: { enabled: true, maximumAttempts: 2, delayMilliseconds: 1 },
      });
      expect(status.status).toBe("ready");
      // Downstream dies: kill the first client-side transport.
      await stubs[0]!.clientTransport.close();
      const out = await mgr.invokeTool("r", "analyze", {});
      expect(out.kind).toBe("success");
      expect(factoryCalls).toBe(2);
      await mgr.shutdown();
    });

    it("does not retry when reconnect is disabled or unconfigured", async () => {
      const mgr = new ClientManager();
      let factoryCalls = 0;
      mgr.useTransport("plain", () => {
        factoryCalls += 1;
        return createStubServer("success").clientTransport;
      });
      await mgr.ensureReady("plain");
      const out = await mgr.invokeTool("plain", "analyze", {});
      expect(out.kind).not.toBe("transport");
      // Force a transport failure without a reconnect policy: unknown server id.
      const dead = await mgr.invokeTool("unknown-server", "analyze", {});
      expect(dead.kind).toBe("transport");
      expect(factoryCalls).toBe(1);
      await mgr.shutdown();
    });

    it("reports the last reconnect failure when all attempts are exhausted", async () => {
      const mgr = new ClientManager();
      const stubs: ReturnType<typeof createStubServer>[] = [];
      let factoryCalls = 0;
      mgr.useTransport("flaky", () => {
        factoryCalls += 1;
        // First call connects fine; every reconnect gets a dead-end stub.
        const stub = createStubServer(factoryCalls === 1 ? "success" : "transport_failure");
        stubs.push(stub);
        return stub.clientTransport;
      });
      const status = await mgr.ensureReady("flaky", undefined, {
        reconnect: { enabled: true, maximumAttempts: 2, delayMilliseconds: 1 },
        handshakeTimeoutSeconds: 0.2,
      });
      expect(status.status).toBe("ready");
      // Downstream dies: kill the first client-side transport.
      await stubs[0]!.clientTransport.close();
      const out = await mgr.invokeTool("flaky", "analyze", {});
      expect(out.kind).toBe("transport");
      if (out.kind === "transport") expect(out.message).toMatch(/reconnect attempt 2\/2/);
      expect(factoryCalls).toBe(3); // initial + 2 reconnect attempts
      await mgr.shutdown();
    });

    it("does not reconnect on invalid requestTimeoutSeconds (config error, not connectivity)", async () => {
      const mgr = new ClientManager();
      let factoryCalls = 0;
      mgr.useTransport("x", () => {
        factoryCalls += 1;
        return createStubServer("success").clientTransport;
      });
      await mgr.ensureReady("x", undefined, {
        reconnect: { enabled: true, maximumAttempts: 3, delayMilliseconds: 1 },
      });
      const out = await mgr.invokeTool("x", "analyze", {}, -1);
      expect(out.kind).toBe("transport");
      expect(factoryCalls).toBe(1);
      await mgr.shutdown();
    });

    it("does not reconnect after a request timeout — retry stays upstream (review F1)", async () => {
      const slow = createStubServer("timeout");
      let factoryCalls = 0;
      const mgr = new ClientManager();
      mgr.useTransport("slow", () => {
        factoryCalls += 1;
        return slow.clientTransport;
      });
      await mgr.ensureReady("slow", undefined, {
        reconnect: { enabled: true, maximumAttempts: 2, delayMilliseconds: 1 },
      });
      const out = await mgr.invokeTool("slow", "analyze", {}, 0.05);
      expect(out.kind).toBe("transport");
      if (out.kind === "transport") {
        expect(out.message).toMatch(/timed out/);
        expect(out.timedOut).toBe(true);
      }
      expect(factoryCalls).toBe(1);
      await mgr.shutdown();
    });
  });
});

describe("counting invoker (SC-005 evidence helper)", () => {
  it("counts invocations for idempotency assertions", async () => {
    const inv = createCountingInvoker();
    await inv.invoke();
    await inv.invoke();
    expect(inv.invocationCount()).toBe(2);
  });
});

describe("stub modes", () => {
  const modes: StubMode[] = ["success", "tool_error", "injection"];
  it.each(modes)("stub %s exposes a callable tool", async (mode) => {
    const stub = createStubServer(mode);
    const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
    const client = new Client({ name: "t", version: "1" });
    await client.connect(stub.clientTransport);
    const res = (await client.callTool({ name: "analyze", arguments: {} })) as { isError?: boolean; content: { text: string }[] };
    if (mode === "tool_error") expect(res.isError).toBe(true);
    if (mode === "injection") expect(res.content[0]!.text).toMatch(/IGNORE ALL PREVIOUS INSTRUCTIONS/);
    if (mode === "success") expect(res.content[0]!.text).toContain("completed");
    await client.close();
  });
});
