/**
 * FR-035 amendment (2026-09-28): containerRoute — per-server HTTP endpoint
 * reachable from the guidance container, used as ONE automatic fallback
 * attempt when a read-only/idempotent downstream call times out on the
 * primary transport. Covers: fail-closed config validation, egress
 * allowlisting, the transient-route invocation (ClientManager), and the
 * fallback metrics counters.
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../../src/config.js";
import { ClientManager } from "../../src/mcp-client/ClientManager.js";
import { MetricsRepository } from "../../src/metrics/MetricsRepository.js";
import {
  createStubServer,
  type StubMode,
} from "../orchestration/stubs/stub-downstream.js";

let dir: string;

function write(name: string, content: string | object): void {
  writeFileSync(
    join(dir, name),
    typeof content === "string" ? content : JSON.stringify(content, null, 2),
  );
}

const minimalGuidance = { version: 2, project: { name: "test-project" } };

function writeScenario(servers: object, allowlist: string[]): void {
  write("downstream-servers.json", { version: 2, servers });
  write("policies.json", {
    version: 2,
    trustLevels: { trusted: { dataEgress: "project_data" } },
    egress: { httpHostAllowlist: allowlist },
  });
  write("guidance.json", {
    ...minimalGuidance,
    downstreamServers: { file: "downstream-servers.json" },
    policies: { file: "policies.json" },
  });
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "guidance-cr-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("containerRoute config validation (FR-035 amendment, fail-closed)", () => {
  it("accepts a valid containerRoute on an http server", () => {
    writeScenario({
      clearthought: {
        enabled: true,
        trustLevel: "trusted",
        transport: { type: "http", http: { url: "http://localhost:3000/mcp" } },
        containerRoute: { url: "http://localhost:3000/mcp" },
      },
    }, ["localhost:3000"]);
    expect(() => loadConfig(dir)).not.toThrow();
  });

  it("accepts containerRoute on a stdio server (second transport kind)", () => {
    writeScenario({
      gitnexus: {
        enabled: true,
        trustLevel: "trusted",
        transport: {
          type: "stdio",
          command: { executable: "gitnexus", args: ["mcp"] },
        },
        containerRoute: { url: "http://localhost:4747/api/mcp" },
      },
    }, ["localhost:4747"]);
    expect(() => loadConfig(dir)).not.toThrow();
  });

  it("rejects invalid containerRoute shapes", () => {
    const cases: unknown[] = [
      "http://localhost:3000/mcp", // not an object
      {}, // url missing
      { url: "ftp://localhost:3000/mcp" }, // bad scheme
      { url: "not a url" }, // not a URL
      { url: "http://localhost:3000/mcp", headers: { A: 1 } }, // header not string
    ];
    for (const containerRoute of cases) {
      writeScenario(
        {
          insight: {
            enabled: true,
            trustLevel: "trusted",
            transport: { type: "http", http: { url: "http://localhost:3002/mcp" } },
            containerRoute,
          },
        },
        ["localhost:3002", "localhost:3000"],
      );
      expect(() => loadConfig(dir), `case: ${JSON.stringify(containerRoute)}`).toThrowError(
        /containerRoute/,
      );
    }
  });

  it("fail-closed: containerRoute host must be allowlisted (SSRF guard)", () => {
    writeScenario({
      insight: {
        enabled: true,
        trustLevel: "trusted",
        transport: { type: "http", http: { url: "http://localhost:3002/mcp" } },
        containerRoute: { url: "http://evil.example.com/mcp" },
      },
    }, ["localhost:3002"]);
    expect(() => loadConfig(dir)).toThrowError(/containerRoute host.*not allowlisted/);
  });

  it("fail-closed: containerRoute on an enabled server requires an egress allowlist", () => {
    write("downstream-servers.json", {
      version: 2,
      servers: {
        insight: {
          enabled: true,
          trustLevel: "trusted",
          transport: {
            type: "stdio",
            command: { executable: "insight-mcp", args: ["serve"] },
          },
          containerRoute: { url: "http://localhost:3002/mcp" },
        },
      },
    });
    write("policies.json", {
      version: 2,
      trustLevels: { trusted: { dataEgress: "project_data" } },
    });
    write("guidance.json", {
      ...minimalGuidance,
      downstreamServers: { file: "downstream-servers.json" },
      policies: { file: "policies.json" },
    });
    expect(() => loadConfig(dir)).toThrowError(/httpHostAllowlist/);
  });

  it("resolves ${ENV} references in containerRoute.headers at load time", () => {
    process.env.CR_TEST_TOKEN = "cr-secret";
    writeScenario({
      insight: {
        enabled: true,
        trustLevel: "trusted",
        transport: { type: "http", http: { url: "http://localhost:3002/mcp" } },
        containerRoute: {
          url: "http://localhost:3002/mcp",
          headers: { Authorization: "Bearer ${CR_TEST_TOKEN}" },
        },
      },
    }, ["localhost:3002"]);
    const cfg = loadConfig(dir);
    const servers = cfg.downstreamServers as {
      servers: Record<
        string,
        { containerRoute: { headers: Record<string, string> } }
      >;
    };
    expect(servers.servers.insight!.containerRoute.headers.Authorization).toBe(
      "Bearer cr-secret",
    );
    delete process.env.CR_TEST_TOKEN;
  });

  it("fails closed when a containerRoute header env variable is unset", () => {
    delete process.env.CR_TEST_TOKEN;
    writeScenario({
      insight: {
        enabled: true,
        trustLevel: "trusted",
        transport: { type: "http", http: { url: "http://localhost:3002/mcp" } },
        containerRoute: {
          url: "http://localhost:3002/mcp",
          headers: { Authorization: "Bearer ${CR_TEST_TOKEN}" },
        },
      },
    }, ["localhost:3002"]);
    expect(() => loadConfig(dir)).toThrowError(/CR_TEST_TOKEN/);
  });
});

describe("ClientManager.invokeOnTransientHttpRoute (FR-035 amendment)", () => {
  it("invokes a tool over the transient route (success)", async () => {
    const stub = createStubServer("success" as StubMode);
    const mgr = new ClientManager();
    mgr.useTransport("__containerRoute__x", () => stub.clientTransport);
    const out = await mgr.invokeOnTransientHttpRoute(
      { url: "http://localhost:3000/mcp" },
      "analyze",
      {},
      undefined,
      "__containerRoute__x",
    );
    expect(out.kind).toBe("success");
    await mgr.shutdown();
  });

  it("classifies a route timeout as transport + timedOut (no retry)", async () => {
    const slow = createStubServer("timeout" as StubMode);
    const mgr = new ClientManager();
    mgr.useTransport("__containerRoute__x", () => slow.clientTransport);
    const out = await mgr.invokeOnTransientHttpRoute(
      { url: "http://localhost:3000/mcp" },
      "analyze",
      {},
      0.05,
      "__containerRoute__x",
    );
    expect(out.kind).toBe("transport");
    if (out.kind === "transport") expect(out.timedOut).toBe(true);
    await mgr.shutdown();
  });

  it("reports route connect failures as transport failures", async () => {
    const mgr = new ClientManager();
    const out = await mgr.invokeOnTransientHttpRoute(
      { url: "http://localhost:1/mcp" },
      "analyze",
      {},
      0.05,
      "__containerRoute__never",
    );
    expect(out.kind).toBe("transport");
    if (out.kind === "transport") {
      expect(out.message).toMatch(/containerRoute/);
      expect(out.timedOut).toBeUndefined();
    }
  });
});

describe("containerRoute fallback metrics (FR-035 amendment)", () => {
  it("counts attempted/succeeded/failed per server and surfaces in snapshot", () => {
    const metrics = new MetricsRepository(null);
    metrics.recordContainerRouteFallback("clearthought", true);
    metrics.recordContainerRouteFallback("clearthought", false);
    metrics.recordContainerRouteFallback("clearthought", true);
    const snap = metrics.snapshot();
    expect(snap.containerRouteFallbacks).toEqual({
      clearthought: { attempted: 3, succeeded: 2, failed: 1 },
    });
    // Absent servers must not appear (no zero-buckets noise).
    expect(snap.containerRouteFallbacks?.gitnexus).toBeUndefined();
  });
});
