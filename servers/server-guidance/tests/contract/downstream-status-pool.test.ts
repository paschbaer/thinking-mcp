/**
 * Pool-composition downstream status visibility: get_downstream_status must
 * surface the DECLARED downstream servers of registered workspaces even when
 * the instance itself is registry-only (FR-1101 — no process refs, no parent
 * ClientManager), without composing engines or opening connections.
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  mkdirSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../../src/config.js";
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
  const cfg = loadConfig(join(pool, ".guidance"), { workspaceRoot: pool });
  return new WorkflowEngine({
    config: cfg,
    stateDir: join(pool, ".guidance", "state"),
  });
}

beforeEach(() => {
  pool = mkdtempSync(join(tmpdir(), "pool-status-"));
});

afterEach(() => {
  rmSync(pool, { recursive: true, force: true });
});

describe("get_downstream_status under pool composition", () => {
  it("reports declared servers per workspace WITHOUT composing engines or connecting", async () => {
    const alpha = join(pool, "alpha");
    const beta = join(pool, "beta");
    mkdirSync(alpha, { recursive: true });
    mkdirSync(beta, { recursive: true });
    scaffoldFullConfig(alpha); // fixture declares gitnexus + insight (+ maybe more)
    writeRegistry(pool, [
      { name: "alpha", root: alpha, projectName: "alpha" },
      { name: "beta", root: beta, projectName: "beta" },
    ]);
    const engine = compose();
    const report = await engine.getDownstreamStatusReport();
    expect(report.mode).toBe("pool");
    expect(report.live).toEqual([]); // registry-only parent owns no ClientManager
    expect(report.workspaces).toBeDefined();
    const alphaEntry = report.workspaces!.find((w) => w.name === "alpha")!;
    expect(alphaEntry.declaredError).toBeUndefined();
    const ids = (alphaEntry.declaredServers ?? []).map((s) => s.id);
    expect(ids).toContain("gitnexus");
    // disabled servers are excluded from the declared list (fixture has
    // a disabled "memory" server)
    expect(ids).not.toContain("memory");
    const betaEntry = report.workspaces!.find((w) => w.name === "beta")!;
    expect(betaEntry.declaredError).toMatch(/no process config/);
    // read-only guarantee: engine composition would mkdir state dirs
    expect(existsSync(join(alpha, ".guidance", "state"))).toBe(false);
    expect(existsSync(join(beta, ".guidance", "state"))).toBe(false);
  });

  it("a workspace with an invalid downstream config yields declaredError, the report still succeeds", async () => {
    const alpha = join(pool, "alpha");
    const beta = join(pool, "beta");
    mkdirSync(alpha, { recursive: true });
    mkdirSync(beta, { recursive: true });
    scaffoldFullConfig(alpha);
    writeFileSync(
      join(alpha, ".guidance", "downstream-servers.json"),
      "{not json",
    );
    writeRegistry(pool, [
      { name: "alpha", root: alpha, projectName: "alpha" },
      { name: "beta", root: beta, projectName: "beta" },
    ]);
    const engine = compose();
    const report = await engine.getDownstreamStatusReport();
    const alphaEntry = report.workspaces!.find((w) => w.name === "alpha")!;
    expect(alphaEntry.declaredError).toBeTruthy();
    expect(report.mode).toBe("pool");
  });

  it("monolith mode: report degrades to the existing live-only shape", async () => {
    // full (monolith) config at the pool root — engine has its own process
    // config; the report must NOT gain workspaces[] (backward compatible)
    scaffoldFullConfig(pool);
    const cfg = loadConfig(join(pool, ".guidance"), { workspaceRoot: pool });
    const engine = new WorkflowEngine({
      config: cfg,
      stateDir: join(pool, ".guidance", "state"),
    });
    const report = await engine.getDownstreamStatusReport();
    expect(report.mode).toBe("monolith");
    expect(Array.isArray(report.live)).toBe(true);
    expect(report.workspaces).toBeUndefined();
  });

  it("a sessionId routed to a workspace session returns the child engine's live status", async () => {
    const alpha = join(pool, "alpha");
    const beta = join(pool, "beta");
    mkdirSync(alpha, { recursive: true });
    mkdirSync(beta, { recursive: true });
    scaffoldFullConfig(alpha);
    writeRegistry(pool, [
      { name: "alpha", root: alpha, projectName: "alpha" },
      { name: "beta", root: beta, projectName: "beta" },
    ]);
    const engine = compose();
    // simulate a persisted session in alpha's state dir so probeWorkspaceRoutes
    // routes to the composed alpha child engine
    const sessionsDir = join(alpha, ".guidance", "state", "sessions");
    mkdirSync(sessionsDir, { recursive: true });
    writeFileSync(join(sessionsDir, "session-alpha-1.json"), "{}\n");
    const report = await engine.getDownstreamStatusReport("session-alpha-1");
    expect(report.mode).toBe("pool");
    // live comes from the CHILD's ClientManager (alpha declares gitnexus et
    // al.) — not from the parent, whose live list is empty in pool mode
    expect(report.live.length).toBeGreaterThan(0);
    expect(report.live.map((s) => s.id)).toContain("gitnexus");
    expect(report.live.every((s) => typeof s.status === "string")).toBe(true);
  });

  it("an unrouted sessionId degrades to the instance-level report (no error)", async () => {
    const alpha = join(pool, "alpha");
    const beta = join(pool, "beta");
    mkdirSync(alpha, { recursive: true });
    mkdirSync(beta, { recursive: true });
    scaffoldFullConfig(alpha);
    writeRegistry(pool, [
      { name: "alpha", root: alpha, projectName: "alpha" },
      { name: "beta", root: beta, projectName: "beta" },
    ]);
    const engine = compose();
    const report = await engine.getDownstreamStatusReport(
      "session-does-not-exist",
    );
    expect(report.mode).toBe("pool");
    expect(report.workspaces).toBeDefined();
  });
});
