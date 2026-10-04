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
  warnNodeDeps,
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

  it("FR-1101 regression: default-root alphabetical fallback — the first registered workspace with a full process config is startable", async () => {
    // Without an explicit "default" entry, WorkspaceRegistry.default falls
    // back to the FIRST ALPHABETICAL entry, so defaultRoot === alpha's root.
    // engineForWorkspace must compose alpha (full config) instead of throwing
    // the pool-root guard at it.
    const alpha = join(pool, "alpha");
    const beta = join(pool, "beta");
    mkdirSync(alpha, { recursive: true });
    mkdirSync(beta, { recursive: true });
    scaffoldFullConfig(alpha);
    writeRegistry(pool, [
      { name: "alpha", root: alpha, projectName: "alpha" },
      { name: "beta", root: beta, projectName: "beta" },
    ]);
    const app = compose();
    const res = await app.engine.startWorkflow({
      workspace: "alpha",
      request: "r",
    });
    expect(res.sessionId).toBeTruthy();
    // the session must live in the workspace's own state dir
    expect(
      existsSync(
        join(
          alpha,
          ".guidance",
          "state",
          "sessions",
          `${res.sessionId}.json`,
        ),
      ),
    ).toBe(true);
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

describe("specs/014: legacy monolith child composition (CT-2)", () => {
  it("E2E: full config at the instance root + registered extra workspace with its own .guidance composes the session from the workspace root", async () => {
    const zed = join(pool, "zed");
    mkdirSync(zed, { recursive: true });
    // Legacy monolith: FULL process config at the pool root carrying a
    // workspaces[] registry (FR-1103 boot warning path) ...
    scaffoldFullConfig(pool, [
      { name: "default", root: pool, projectName: "pool" },
      { name: "zed", root: zed, projectName: "zed" },
    ]);
    // ... plus the registered extra workspace carrying ITS OWN full config.
    scaffoldFullConfig(zed);
    const guidanceBefore = readdirSync(join(zed, ".guidance")).sort();

    const app = compose();
    const res = await app.engine.startWorkflow({
      workspace: "zed",
      request: "r",
    });
    expect(res.sessionId).toBeTruthy();

    // The session is composed from the WORKSPACE config, not the pool config:
    // its persisted configurationVersion equals the zed root's config hash and
    // differs from the pool (legacy monolith) instance hash.
    const zedConfig = loadConfig(join(zed, ".guidance"), {
      workspaceRoot: zed,
    });
    const sessionJson = JSON.parse(
      readFileSync(
        join(zed, ".guidance", "state", "sessions", `${res.sessionId}.json`),
        "utf-8",
      ),
    ) as { configurationVersion: string };
    expect(sessionJson.configurationVersion).toBe(zedConfig.configVersion);
    expect(zedConfig.configVersion).not.toBe(app.config.configVersion);

    // No config files copied into the workspace (state dir may appear).
    const guidanceAfter = readdirSync(join(zed, ".guidance")).sort();
    expect(guidanceAfter.filter((f) => f !== "state")).toEqual(guidanceBefore);
  });
});

describe("specs/014: legacy monolith + dormancy boot diagnostics", () => {
  it("FR-1105/F-5: a registry-only instance guidance.json round-trips through loadConfig", () => {
    const zed = join(pool, "zed");
    mkdirSync(zed, { recursive: true });
    scaffoldFullConfig(zed);
    // WIZ-1: the registry guidance.json is authored by the AGENT (merge of
    // the assistant's snippet) — the test writes it inline, mirroring that
    // contract (generateFiles never emits a registry file anymore).
    const registry = {
      version: 2,
      project: { name: "pool" },
      workspaces: [
        { name: "pool", root: pool, projectName: "pool" },
        { name: "zed", root: zed, projectName: "zed" },
      ],
      registryRegister: { enabled: true },
      state: { directory: "state", persistAfterEveryOperation: true },
    };
    mkdirSync(join(pool, ".guidance"), { recursive: true });
    writeFileSync(
      join(pool, ".guidance", "guidance.json"),
      JSON.stringify(registry, null, 2) + "\n",
    );
    const cfg = loadConfig(join(pool, ".guidance"), { workspaceRoot: pool });
    expect(cfg.registryOnly).toBe(true);
    expect(cfg.workspaces.list().map((w) => w.name)).toEqual(["pool", "zed"]);
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

describe("specs/014 DB-1 (slim): node deps boot warnings", () => {
  function nodeRepo(dir: string): void {
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({ name: "x", version: "1.0.0" }),
    );
  }

  it("warns when a Node workspace has a package.json but no node_modules", () => {
    const zed = join(pool, "zed");
    nodeRepo(zed);
    writeRegistry(pool, [{ name: "zed", root: zed, projectName: "zed" }]);
    const cfg = loadConfig(join(pool, ".guidance"), { workspaceRoot: pool });
    const out: string[] = [];
    warnNodeDeps(cfg, pool, (m) => out.push(m));
    expect(out.join("\n")).toMatch(/no node_modules/);
    expect(out.join("\n")).toMatch(/npm install/);
  });

  it("warns when node_modules contains an UNLOADABLE native addon (platform/ABI mismatch)", () => {
    const zed = join(pool, "zed");
    nodeRepo(zed);
    const nm = join(zed, "node_modules", "native-pkg", "build", "Release");
    mkdirSync(nm, { recursive: true });
    // garbage .node file — require() on it fails => incompatible
    writeFileSync(join(nm, "addon.node"), "not a real addon");
    writeRegistry(pool, [{ name: "zed", root: zed, projectName: "zed" }]);
    const cfg = loadConfig(join(pool, ".guidance"), { workspaceRoot: pool });
    const out: string[] = [];
    warnNodeDeps(cfg, pool, (m) => out.push(m));
    expect(out.join("\n")).toMatch(/native addon that does NOT load.*npm ci/s);
  });

  it("stays silent when node_modules has no native addons (pure-JS tree)", () => {
    const zed = join(pool, "zed");
    nodeRepo(zed);
    mkdirSync(join(zed, "node_modules", "some-pkg"), { recursive: true });
    writeFileSync(
      join(zed, "node_modules", "some-pkg", "index.js"),
      "module.exports = 1;",
    );
    writeRegistry(pool, [{ name: "zed", root: zed, projectName: "zed" }]);
    const cfg = loadConfig(join(pool, ".guidance"), { workspaceRoot: pool });
    const out: string[] = [];
    warnNodeDeps(cfg, pool, (m) => out.push(m));
    expect(out).toEqual([]);
  });

  it("stays silent for workspaces without package.json (e.g. Rust)", () => {
    const zed = join(pool, "zed");
    mkdirSync(zed, { recursive: true });
    writeRegistry(pool, [{ name: "zed", root: zed, projectName: "zed" }]);
    const cfg = loadConfig(join(pool, ".guidance"), { workspaceRoot: pool });
    const out: string[] = [];
    warnNodeDeps(cfg, pool, (m) => out.push(m));
    expect(out).toEqual([]);
  });
});
