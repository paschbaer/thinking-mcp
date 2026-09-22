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
