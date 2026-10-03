import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { composeApplication } from "../../src/main.js";
import { createConfiguredServer } from "../../src/server.js";
import type { HttpAppOptions } from "../../src/server.js";

// SKP-2 (review finding F-1): the pool-mode tests in speckit-pool-mode.test.ts
// wire registerSpecKitTools DIRECTLY, so they pin the resolver contract but NOT
// the production wiring in createConfiguredServer. These tests go through the
// REAL HTTP-entry wiring: reverting the getSessionWorkspace lines in
// src/server.ts must make the happy-path test FAIL (discovery falls back to the
// pool root and cannot find specs/).

let pool: string;
let wsB: string;
let dirs: string[] = [];
let server: ReturnType<typeof createConfiguredServer> | undefined;
let client: Client | undefined;

function scaffoldWorkspace(root: string, withSpecs: boolean): string {
  writeFileSync(join(root, "package.json"), JSON.stringify({ name: "ws" }));
  const fixture = join(import.meta.dirname, "../workflow/fixtures/guidance");
  const cfgDir = join(root, ".guidance");
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
  guidance.integrations = {
    specKit: {
      enabled: true,
      discovery: { featureRoot: "specs", strategy: "singleCandidate" },
    },
  };
  writeFileSync(
    join(cfgDir, "guidance.json"),
    JSON.stringify(guidance, null, 2),
  );
  mkdirSync(join(cfgDir, "schemas"), { recursive: true });
  for (const f of readdirSync(join(fixture, "schemas"))) {
    writeFileSync(join(cfgDir, "schemas", f), readFileSync(join(fixture, "schemas", f)));
  }
  if (withSpecs) {
    const feature = join(root, "specs", "001-demo");
    mkdirSync(feature, { recursive: true });
    writeFileSync(
      join(feature, "spec.md"),
      "# Feature\n\n## Acceptance Criteria\n\n- **SC-001**: works\n",
    );
    writeFileSync(join(feature, "plan.md"), "# Plan\n");
    writeFileSync(
      join(feature, "tasks.md"),
      "# Tasks\n\n- [ ] T001 First task\n- [ ] T002 Second task\n",
    );
  }
  return cfgDir;
}

function bootThroughHttpEntry(): void {
  const poolCfg = join(pool, ".guidance");
  const stateDir = join(pool, ".guidance", "state");
  const composed = composeApplication(pool, poolCfg, stateDir);
  // Mirror the ComposedApp view EXACTLY as createHttpApp builds it (drift
  // here would decouple the test from production wiring again).
  const opts: HttpAppOptions = {
    workspaceRoot: pool,
    configDir: poolCfg,
    stateDir,
  };
  server = createConfiguredServer(opts, {
    tools: composed.tools,
    configVersion: composed.config.configVersion,
    specKit: composed.config.specKit,
    engine: composed.engine,
    workspaces: composed.workspaces,
  });
}

async function connect(): Promise<void> {
  const pair = InMemoryTransport.createLinkedPair();
  await Promise.all([
    server!.connect(pair[0]),
    (client = new Client({ name: "test", version: "1" })).connect(pair[1]),
  ]);
}

function textOf(res: unknown): Record<string, unknown> {
  return JSON.parse(
    (res as { content: { type: string; text: string }[] }).content[0]!.text,
  ) as Record<string, unknown>;
}

async function errorText(res: unknown): Promise<string> {
  const r = res as { isError?: boolean; content: { text: string }[] };
  expect(r.isError).toBe(true);
  return String(r.content[0]!.text);
}

beforeEach(() => {
  pool = mkdtempSync(join(tmpdir(), "guidance-skpw-pool-"));
  wsB = mkdtempSync(join(tmpdir(), "guidance-skpw-wsb-"));
  dirs = [pool, wsB];
  scaffoldWorkspace(pool, false); // pool root has NO specs/
  scaffoldWorkspace(wsB, true); // workspace B owns the feature
});

afterEach(async () => {
  if (client) await client.close();
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

describe("Spec-Kit pool wiring through createConfiguredServer (SKP-2)", () => {
  it("session-rooted discovery through the HTTP entry resolves under the session workspace", async () => {
    bootThroughHttpEntry();
    await connect();
    const reg = textOf(
      await client!.callTool({
        name: "registry_register",
        arguments: { name: "wsb", root: wsB, projectName: "WSB" },
      }),
    );
    expect(reg["registered"] ?? reg["accepted"] ?? reg).toBeTruthy();
    const start = textOf(
      await client!.callTool({
        name: "start_workflow",
        arguments: { workspace: "wsb", request: "skp2" },
      }),
    );
    const sessionId = start["sessionId"] as string;
    expect(typeof sessionId).toBe("string");
    const disc = textOf(
      await client!.callTool({
        name: "discover_spec_kit_feature",
        arguments: { sessionId },
      }),
    );
    // Session root, NOT the pool root — reverting the server.ts wiring turns
    // this into spec_kit_feature_not_found (pool root has no specs/).
    expect(String(disc["directory"])).toContain(wsB);
  });

  it("unknown sessionId keeps the documented pool-root fallback (no crash)", async () => {
    bootThroughHttpEntry();
    await connect();
    const text = await errorText(
      await client!.callTool({
        name: "discover_spec_kit_feature",
        arguments: { sessionId: "ghost" },
      }),
    );
    expect(text).toContain("spec_kit_feature_not_found");
  });
});
