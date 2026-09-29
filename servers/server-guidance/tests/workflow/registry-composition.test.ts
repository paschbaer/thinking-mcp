/**
 * specs/014 config truth & composition v2: registry-only boot, read-through
 * composition (no cpSync), fail-closed missing process configs, legacy
 * monolith + dormancy warnings.
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  mkdtempSync,
  rmSync,
  mkdirSync,
  writeFileSync,
  readdirSync,
  readFileSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../../src/config.js";
import { generateFiles } from "../../src/setup/ConfigAssistant.js";
import {
  warnDormantGuidanceConfigs,
  warnLegacyMonolith,
} from "../../src/config-truth.js";
import { WorkflowEngine } from "../../src/workflow/WorkflowEngine.js";

const FIXTURE = join(import.meta.dirname, "../workflow/fixtures/guidance");

let pool: string;

function scaffoldFullConfig(dir: string, workspaces?: unknown): void {
  const cfgDir = join(dir, ".guidance");
  mkdirSync(cfgDir, { recursive: true });
  for (const f of [
    "workflow.json",
    "responses.json",
    "operations.json",
    "downstream-servers.json",
    "policies.json",
  ]) {
    writeFileSync(join(cfgDir, f), readFileSync(join(FIXTURE, f)));
  }
  const guidance = JSON.parse(
    readFileSync(join(FIXTURE, "guidance.json"), "utf-8"),
  ) as Record<string, unknown>;
  if (workspaces !== undefined) guidance.workspaces = workspaces;
  writeFileSync(
    join(cfgDir, "guidance.json"),
    JSON.stringify(guidance, null, 2),
  );
  mkdirSync(join(cfgDir, "schemas"), { recursive: true });
  for (const f of readdirSync(join(FIXTURE, "schemas"))) {
    writeFileSync(
      join(cfgDir, "schemas", f),
      readFileSync(join(FIXTURE, "schemas", f)),
    );
  }
}

function writeRegistry(
  dir: string,
  workspaces: Array<{ name: string; root: string; projectName?: string }>,
): void {
  const cfgDir = join(dir, ".guidance");
  mkdirSync(cfgDir, { recursive: true });
  writeFileSync(
    join(cfgDir, "guidance.json"),
    JSON.stringify(
      {
        version: 2,
        project: { name: "pool" },
        workspaces,
        state: { directory: "state", persistAfterEveryOperation: true },
      },
      null,
      2,
    ),
  );
}

function compose() {
  return composePool(pool);
}

function composePool(root: string) {
  const app = {
    config: loadConfig(join(root, ".guidance"), { workspaceRoot: root }),
    engine: null as unknown as WorkflowEngine,
  };
  app.engine = new WorkflowEngine({
    config: app.config,
    stateDir: join(root, ".guidance", "state"),
  });
  return app;
}

beforeEach(() => {
  pool = mkdtempSync(join(tmpdir(), "pool-"));
});

afterEach(() => {
  rmSync(pool, { recursive: true, force: true });
});

describe("specs/014: registry-only composition (FR-1101/FR-1102)", () => {
  it("AC-3/FR-1101: registry-only guidance.json loads with registryOnly=true", () => {
    const zed = join(pool, "zed");
    mkdirSync(zed, { recursive: true });
    scaffoldFullConfig(zed);
    writeRegistry(pool, [
      { name: "default", root: pool, projectName: "pool" },
      { name: "zed", root: zed, projectName: "zed" },
    ]);
    const cfg = loadConfig(join(pool, ".guidance"), { workspaceRoot: pool });
    expect(cfg.registryOnly).toBe(true);
    expect(cfg.workspaces.list().map((w) => w.name)).toEqual([
      "default",
      "zed",
    ]);
  });

  it("specs/014 review F-1: registry-only boot rejects an UNREGISTERED candidate (no hollow session)", async () => {
    const zed = join(pool, "zed");
    mkdirSync(zed, { recursive: true });
    scaffoldFullConfig(zed);
    writeRegistry(pool, [
      { name: "default", root: pool, projectName: "pool" },
      { name: "zed", root: zed, projectName: "zed" },
    ]);
    const app = compose();
    await expect(
      app.engine.startWorkflow({
        workspaceRoot: join(pool, "unknown-repo"),
        request: "r",
      }),
    ).rejects.toThrowError(
      /workspace_process_config_missing|registry-only instance/,
    );
  });

  it("AC-1: session in a registered workspace composes from <root>/.guidance without copying", async () => {
    const zed = join(pool, "zed");
    mkdirSync(zed, { recursive: true });
    scaffoldFullConfig(zed);
    writeRegistry(pool, [
      { name: "default", root: pool, projectName: "pool" },
      { name: "zed", root: zed, projectName: "zed" },
    ]);
    const before = readdirSync(join(zed, ".guidance")).sort();
    const app = compose();
    const res = await app.engine.startWorkflow({
      workspace: "zed",
      request: "r",
    });
    expect(res.sessionId).toBeTruthy();
    const after = readdirSync(join(zed, ".guidance")).sort();
    // no config files copied into the workspace (state dir may appear)
    expect(after.filter((f) => f !== "state")).toEqual(before);
  });

  it("AC-2/FR-1102: registered workspace without process config fails closed (no silent copy)", async () => {
    const other = join(pool, "other");
    mkdirSync(other, { recursive: true });
    writeRegistry(pool, [
      { name: "default", root: pool, projectName: "pool" },
      { name: "other", root: other, projectName: "other" },
    ]);
    const app = compose();
    await expect(
      app.engine.startWorkflow({ workspace: "other", request: "r" }),
    ).rejects.toThrowError(
      /workspace_process_config_missing|no process config/,
    );
    expect(existsSync(join(other, ".guidance"))).toBe(false);
  });

  it("FR-1101: starting the pool (default) root itself fails closed in registry-only mode", async () => {
    const zed = join(pool, "zed");
    mkdirSync(zed, { recursive: true });
    scaffoldFullConfig(zed);
    writeRegistry(pool, [
      { name: "default", root: pool, projectName: "pool" },
      { name: "zed", root: zed, projectName: "zed" },
    ]);
    const app = compose();
    await expect(
      app.engine.startWorkflow({ workspaceRoot: pool, request: "r" }),
    ).rejects.toThrowError(/registry-only instance/);
  });

  it("FR-1101: a repo whose own config is registry-only cannot start sessions either", async () => {
    const zed = join(pool, "zed");
    mkdirSync(join(zed, ".guidance"), { recursive: true });
    writeRegistry(zed, [{ name: "default", root: zed }]); // registry-only repo config
    writeRegistry(pool, [
      { name: "default", root: pool, projectName: "pool" },
      { name: "zed", root: zed, projectName: "zed" },
    ]);
    const app = compose();
    await expect(
      app.engine.startWorkflow({ workspace: "zed", request: "r" }),
    ).rejects.toThrowError(/workspace_process_config_missing|registry-only/);
  });
});

describe("specs/014: legacy monolith + dormancy boot diagnostics", () => {
  it("FR-1105/F-5: the registry-edit payload round-trips through loadConfig as a registry-only instance", () => {
    const zed = join(pool, "zed");
    mkdirSync(zed, { recursive: true });
    scaffoldFullConfig(zed);
    const { files } = generateFiles({
      configSource: "fresh",
      projectName: "pool",
      transport: "stdio",
      profile: "plain",
      insight: "no",
      gitnexus: "no",
      gates: "minimal",
      target: "registry-edit",
      workspaceRoot: pool,
      extraWorkspaces: `zed=${zed}`,
    });
    mkdirSync(join(pool, ".guidance"), { recursive: true });
    writeFileSync(join(pool, ".guidance", "guidance.json"), files[0]!.content);
    const cfg = loadConfig(join(pool, ".guidance"), { workspaceRoot: pool });
    expect(cfg.registryOnly).toBe(true);
    expect(cfg.workspaces.list().map((w) => w.name)).toEqual([
      "default",
      "zed",
    ]);
  });

  it("FR-1103/AC-4: legacy monolith (full config + extra workspaces) warns", () => {
    const zed = join(pool, "zed");
    mkdirSync(zed, { recursive: true });
    scaffoldFullConfig(pool, [
      { name: "main", root: pool },
      { name: "zed", root: zed },
    ]);
    const cfg = loadConfig(join(pool, ".guidance"), { workspaceRoot: pool });
    expect(cfg.registryOnly).toBe(false);
    const out: string[] = [];
    warnLegacyMonolith(cfg, (m) => out.push(m));
    const joined = out.join("\n");
    expect(joined).toMatch(/legacy monolith config detected/);
    expect(joined).toMatch(/specs\/014-config-truth-composition/);
    // AC-5: the warning names the detected process files
    expect(joined).toMatch(/workflow\.json.*operations\.json/s);
  });

  it("FR-1103: plain single-repo full config does NOT warn", () => {
    scaffoldFullConfig(pool);
    const cfg = loadConfig(join(pool, ".guidance"), { workspaceRoot: pool });
    const out: string[] = [];
    warnLegacyMonolith(cfg, (m) => out.push(m));
    expect(out).toEqual([]);
  });

  it("FR-1106/AC-10: registry-only pool warns about unregistered .guidance carriers", () => {
    const zed = join(pool, "zed");
    mkdirSync(zed, { recursive: true });
    scaffoldFullConfig(zed);
    const other = join(pool, "other");
    mkdirSync(join(other, ".guidance"), { recursive: true });
    writeFileSync(
      join(other, ".guidance", "guidance.json"),
      JSON.stringify({ version: 2, project: { name: "other" } }),
    );
    writeRegistry(pool, [
      { name: "default", root: pool, projectName: "pool" },
      { name: "zed", root: zed, projectName: "zed" },
    ]);
    const cfg = loadConfig(join(pool, ".guidance"), { workspaceRoot: pool });
    const out: string[] = [];
    warnDormantGuidanceConfigs(cfg, pool, (m) => out.push(m));
    const joined = out.join("\n");
    expect(joined).toMatch(/dormant .guidance/);
    expect(joined).toMatch(/other/);
    expect(joined).not.toMatch(/dormant .guidance at .*zed/); // registered → no warning
  });
});
