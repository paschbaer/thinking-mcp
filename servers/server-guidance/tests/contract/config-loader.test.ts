import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../../src/config.js";

let dir: string;

function write(name: string, content: string | object): void {
  writeFileSync(join(dir, name), typeof content === "string" ? content : JSON.stringify(content, null, 2));
}

const minimalGuidance = {
  version: 2,
  project: { name: "test-project" },
};

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "guidance-config-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("config loader (FR-009, FR-026, R15)", () => {
  it("loads a valid minimal plain config", () => {
    write("guidance.json", minimalGuidance);
    const cfg = loadConfig(dir);
    expect(cfg.project.name).toBe("test-project");
    expect(cfg.profile).toBe("plain");
    expect(cfg.configVersion).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("fails closed when guidance.json is missing", () => {
    expect(() => loadConfig(dir)).toThrowError(/configuration_not_found/);
  });

  it("fails closed on invalid JSON", () => {
    write("guidance.json", "{ not json");
    expect(() => loadConfig(dir)).toThrowError(/configuration_invalid/);
  });

  it("fails closed on unknown top-level keys (strict additionalProperties)", () => {
    write("guidance.json", { ...minimalGuidance, unknownKey: true });
    expect(() => loadConfig(dir)).toThrowError(/configuration_invalid/);
  });

  it("fails closed on wrong-typed values", () => {
    write("guidance.json", { version: "two", project: { name: "x" } });
    expect(() => loadConfig(dir)).toThrowError(/configuration_invalid/);
  });

  it("rejects YAML as a configuration format (JSON-only contract, FR-026)", () => {
    writeFileSync(join(dir, "guidance.yaml"), "version: 2\n");
    expect(() => loadConfig(dir)).toThrowError(/configuration_invalid|configuration_not_found/);
    write("guidance.json", "version: 2\nproject:\n  name: y\n");
    expect(() => loadConfig(dir)).toThrowError(/configuration_invalid/);
  });

  it("implied profile: spec-kit when integrations.specKit.enabled (FR-060)", () => {
    write("guidance.json", {
      ...minimalGuidance,
      integrations: { specKit: { enabled: true } },
    });
    expect(loadConfig(dir).profile).toBe("spec-kit");
  });

  it("implied profile: spec-kit when a feature root is configured (FR-060)", () => {
    write("guidance.json", {
      ...minimalGuidance,
      integrations: { specKit: { enabled: false, discovery: { featureRoot: "specs" } } },
    });
    expect(loadConfig(dir).profile).toBe("spec-kit");
  });

  it("explicit profile key wins over implication (FR-060)", () => {
    write("guidance.json", {
      ...minimalGuidance,
      profile: "plain",
      integrations: { specKit: { enabled: true } },
    });
    expect(loadConfig(dir).profile).toBe("plain");
  });

  it("explicit spec-kit profile loads the profile file (FR-060)", () => {
    write("guidance.json", {
      ...minimalGuidance,
      profile: "spec-kit",
      integrations: {
        specKit: {
          enabled: true,
          discovery: { featureRoot: "specs", strategy: "explicit", requireUniqueMatch: true },
          artifacts: {
            specification: { required: true, patterns: ["spec.md"] },
            plan: { required: true, patterns: ["plan.md"] },
            tasks: { required: true, patterns: ["tasks.md"] },
          },
        },
      },
    });
    const cfg = loadConfig(dir);
    expect(cfg.profile).toBe("spec-kit");
    expect(cfg.specKit?.discovery.featureRoot).toBe("specs");
  });

  it("referenced workflow file must exist and be JSON (fail closed, FR-009)", () => {
    write("guidance.json", {
      ...minimalGuidance,
      workflow: { file: "workflow.json" },
    });
    expect(() => loadConfig(dir)).toThrowError(/configuration_invalid/);
    write("workflow.json", { version: 2, workflow: { id: "w1", initialPhase: "understand" }, phases: {} });
    const cfg = loadConfig(dir);
    expect((cfg.workflow as { workflow?: { id: string } }).workflow?.id).toBe("w1");
  });

  it("configurationVersion is stable for identical content (hash pinning)", () => {
    write("guidance.json", minimalGuidance);
    const a = loadConfig(dir);
    const b = loadConfig(dir);
    expect(a.configVersion).toBe(b.configVersion);
  });

  it("configurationVersion changes when content changes", () => {
    write("guidance.json", minimalGuidance);
    const a = loadConfig(dir).configVersion;
    write("guidance.json", { ...minimalGuidance, project: { name: "changed" } });
    expect(loadConfig(dir).configVersion).not.toBe(a);
  });

  it("rejects a featureRoot that escapes the workspace (FR-061)", () => {
    write("guidance.json", {
      ...minimalGuidance,
      integrations: {
        specKit: { enabled: true, discovery: { featureRoot: "../outside" } },
      },
    });
    expect(() => loadConfig(dir)).toThrowError(/configuration_invalid/);
  });
});

describe("downstream http transports (fail-closed egress + secret resolution)", () => {
  let savedToken: string | undefined;
  beforeEach(() => { savedToken = process.env.INSIGHT_TEST_TOKEN; });
  afterEach(() => {
    if (savedToken === undefined) delete process.env.INSIGHT_TEST_TOKEN;
    else process.env.INSIGHT_TEST_TOKEN = savedToken;
  });

  function writeConfig(opts: {
    transport?: object;
    allowlist?: unknown;
    omitAllowlist?: boolean;
    policiesFile?: boolean;
  } = {}): void {
    write("downstream-servers.json", {
      version: 2,
      servers: {
        insight: { enabled: true, required: false, trustLevel: "trusted", transport: opts.transport },
      },
    });
    const guidance: Record<string, unknown> = {
      ...minimalGuidance,
      downstreamServers: { file: "downstream-servers.json" },
    };
    if (opts.policiesFile !== false) {
      const policies: Record<string, unknown> = {
        version: 2,
        trustLevels: { trusted: { dataEgress: "project_data" } },
      };
      if (!opts.omitAllowlist) policies.egress = { httpHostAllowlist: opts.allowlist ?? ["localhost:3002"] };
      write("policies.json", policies);
      guidance.policies = { file: "policies.json" };
    }
    write("guidance.json", guidance);
  }

  const httpTransport = (url = "http://localhost:3002/mcp", withAuth = true): object => ({
    type: "http",
    http: {
      url,
      ...(withAuth ? { headers: { Authorization: "Bearer ${INSIGHT_TEST_TOKEN}" } } : {}),
    },
  });

  it("resolves env-var headers at load time and keeps secrets out of configVersion", () => {
    process.env.INSIGHT_TEST_TOKEN = "secret-token-value";
    writeConfig({ transport: httpTransport(), allowlist: ["localhost:3002"] });
    const cfg = loadConfig(dir);
    const servers = cfg.downstreamServers as { servers: Record<string, { transport: { http: { headers: Record<string, string> } } }> };
    expect(servers.servers.insight!.transport.http.headers.Authorization).toBe("Bearer secret-token-value");
    // Hash stability: rotating the token must not change configVersion.
    process.env.INSIGHT_TEST_TOKEN = "other-token-value";
    const cfg2 = loadConfig(dir);
    expect(cfg2.configVersion).toBe(cfg.configVersion);
    expect(
      (cfg2.downstreamServers as typeof servers).servers.insight!.transport.http.headers.Authorization,
    ).toBe("Bearer other-token-value");
  });

  it("fails closed when the header env variable is unset", () => {
    delete process.env.INSIGHT_TEST_TOKEN;
    writeConfig({ transport: httpTransport(), allowlist: ["localhost:3002"] });
    expect(() => loadConfig(dir)).toThrowError(/INSIGHT_TEST_TOKEN/);
  });

  it("denies http hosts outside the egress allowlist", () => {
    process.env.INSIGHT_TEST_TOKEN = "t";
    writeConfig({ transport: httpTransport("http://evil.example.com/mcp"), allowlist: ["localhost:3002"] });
    expect(() => loadConfig(dir)).toThrowError(/not allowlisted/);
  });

  it("denies http transports entirely when no egress allowlist is configured", () => {
    process.env.INSIGHT_TEST_TOKEN = "t";
    writeConfig({ transport: httpTransport(), omitAllowlist: true });
    expect(() => loadConfig(dir)).toThrowError(/httpHostAllowlist/);
  });

  it("skips resolution and egress checks for disabled servers", () => {
    write("downstream-servers.json", {
      version: 2,
      servers: {
        insight: { enabled: false, transport: httpTransport("http://evil.example.com/mcp") },
      },
    });
    write("guidance.json", { ...minimalGuidance, downstreamServers: { file: "downstream-servers.json" } });
    expect(() => loadConfig(dir)).not.toThrow();
  });

  it("rejects unknown transport types and bad http urls", () => {
    process.env.INSIGHT_TEST_TOKEN = "t";
    writeConfig({ transport: { type: "grpc", http: { url: "http://localhost:3002/mcp" } }, allowlist: ["localhost:3002"] });
    expect(() => loadConfig(dir)).toThrowError(/transport.type/);
    writeConfig({ transport: { type: "http", http: { url: "ftp://localhost:3002" } }, allowlist: ["localhost:3002"] });
    expect(() => loadConfig(dir)).toThrowError(/http\(s\)/);
    writeConfig({ transport: { type: "http" }, allowlist: ["localhost:3002"] });
    expect(() => loadConfig(dir)).toThrowError(/transport.http.url/);
    writeConfig({ transport: { type: "stdio", command: {} }, allowlist: ["localhost:3002"] });
    expect(() => loadConfig(dir)).toThrowError(/command.executable/);
  });

  it("accepts stdio transports unchanged (backward compatibility)", () => {
    write("downstream-servers.json", {
      version: 2,
      servers: {
        gitnexus: {
          enabled: true,
          transport: { type: "stdio", command: { executable: "gitnexus", args: ["mcp"] } },
        },
      },
    });
    write("guidance.json", { ...minimalGuidance, downstreamServers: { file: "downstream-servers.json" } });
    expect(() => loadConfig(dir)).not.toThrow();
  });

  it("validates connection.startupTimeoutSeconds (HD-2 wiring)", () => {
    const cfgWithStartup = (startup: unknown): void => {
      write("downstream-servers.json", {
        version: 2,
        servers: {
          gitnexus: {
            enabled: true,
            transport: { type: "stdio", command: { executable: "gitnexus", args: ["mcp"] } },
            connection: { startupTimeoutSeconds: startup },
          },
        },
      });
      write("guidance.json", { ...minimalGuidance, downstreamServers: { file: "downstream-servers.json" } });
    };
    cfgWithStartup(30);
    expect(() => loadConfig(dir)).not.toThrow();
    cfgWithStartup(0);
    expect(() => loadConfig(dir)).toThrowError(/startupTimeoutSeconds/);
    cfgWithStartup(-5);
    expect(() => loadConfig(dir)).toThrowError(/startupTimeoutSeconds/);
    cfgWithStartup("fast");
    expect(() => loadConfig(dir)).toThrowError(/startupTimeoutSeconds/);
  });

  it("validates connection.reconnect shape (HD-1 wiring)", () => {
    const cfgWithReconnect = (reconnect: unknown): void => {
      write("downstream-servers.json", {
        version: 2,
        servers: {
          gitnexus: {
            enabled: true,
            transport: { type: "stdio", command: { executable: "gitnexus", args: ["mcp"] } },
            connection: { reconnect },
          },
        },
      });
      write("guidance.json", { ...minimalGuidance, downstreamServers: { file: "downstream-servers.json" } });
    };
    cfgWithReconnect({ enabled: true, maximumAttempts: 3, delayMilliseconds: 500 });
    expect(() => loadConfig(dir)).not.toThrow();
    cfgWithReconnect("yes");
    expect(() => loadConfig(dir)).toThrowError(/reconnect must be an object/);
    cfgWithReconnect({ maximumAttempts: 0 });
    expect(() => loadConfig(dir)).toThrowError(/maximumAttempts/);
    cfgWithReconnect({ delayMilliseconds: -1 });
    expect(() => loadConfig(dir)).toThrowError(/delayMilliseconds/);
    cfgWithReconnect({ enabled: "true" });
    expect(() => loadConfig(dir)).toThrowError(/enabled must be a boolean/);
  });
});
