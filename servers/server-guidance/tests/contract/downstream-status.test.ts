/**
 * GDS-1: get_downstream_status on-demand probe (stateless HTTP transport).
 * The status tool must report the REAL downstream state, never the useless
 * per-request default "disconnected" for http-transport servers.
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, mkdirSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../../src/config.js";
import { WorkflowEngine } from "../../src/workflow/WorkflowEngine.js";

let ws: string;
let configDir: string;

const FIXTURE = join(import.meta.dirname, "../workflow/fixtures/guidance");

beforeEach(() => {
  ws = mkdtempSync(join(tmpdir(), "gds1-status-"));
  configDir = join(ws, ".guidance");
  mkdirSync(configDir, { recursive: true });
  for (const f of ["guidance.json", "workflow.json", "responses.json", "operations.json", "downstream-servers.json", "policies.json"]) {
    writeFileSync(join(configDir, f), readFileSync(join(FIXTURE, f)));
  }
  mkdirSync(join(configDir, "schemas"), { recursive: true });
  for (const f of readdirSync(join(FIXTURE, "schemas"))) {
    writeFileSync(join(configDir, "schemas", f), readFileSync(join(FIXTURE, "schemas", f)));
  }
});

afterEach(() => { rmSync(ws, { recursive: true, force: true }); });

function makeEngine(): WorkflowEngine {
  const config = loadConfig(configDir);
  return new WorkflowEngine({ config, stateDir: join(ws, "state") });
}

describe("GDS-1: get_downstream_status on-demand probe", () => {
  it("reports failed (with error) for an unreachable http endpoint - never disconnected", async () => {
    writeFileSync(join(configDir, "policies.json"), JSON.stringify({ version: 2, egress: { httpHostAllowlist: ["127.0.0.1", "127.0.0.1:9", "localhost"] } }));
    writeFileSync(join(configDir, "downstream-servers.json"), JSON.stringify({
      version: 2,
      servers: {
        dead: {
          displayName: "Dead",
          enabled: true,
          required: false,
          trustLevel: "trusted",
          transport: { type: "http", http: { url: "http://127.0.0.1:9/mcp" } },
          capabilities: { allow: { tools: ["x"], resources: [], prompts: [] } },
          connection: { startupTimeoutSeconds: 1 },
        },
      },
    }));
    const engine = makeEngine();
    const out = await engine.getDownstreamStatus();
    expect(out).toHaveLength(1);
    expect(out[0]!.id).toBe("dead");
    expect(out[0]!.status).toBe("failed");
    expect(out[0]!.error).toBeTruthy();
  }, 30_000);

  it("does not probe non-http transports (stays disconnected)", async () => {
    writeFileSync(join(configDir, "policies.json"), JSON.stringify({ version: 2, egress: { httpHostAllowlist: ["127.0.0.1", "127.0.0.1:9", "localhost"] } }));
    writeFileSync(join(configDir, "downstream-servers.json"), JSON.stringify({
      version: 2,
      servers: {
        local: {
          displayName: "Local",
          enabled: true,
          required: false,
          trustLevel: "restricted",
          transport: { type: "stdio", command: { executable: "definitely-missing-cmd-gds1", args: [] } },
          capabilities: { allow: { tools: ["x"], resources: [], prompts: [] } },
          connection: { startupTimeoutSeconds: 1 },
        },
      },
    }));
    const engine = makeEngine();
    const out = await engine.getDownstreamStatus();
    expect(out).toHaveLength(1);
    expect(out[0]!.id).toBe("local");
    expect(out[0]!.status).toBe("disconnected");
  }, 30_000);

  it("returns [] when no downstream config exists", async () => {
    writeFileSync(join(configDir, "downstream-servers.json"), '{"version":2,"servers":{}}');
    const engine = makeEngine();
    expect(await engine.getDownstreamStatus()).toEqual([]);
  });
});
