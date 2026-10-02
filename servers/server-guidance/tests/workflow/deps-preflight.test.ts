import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../../src/config.js";
import { WorkflowEngine } from "../../src/workflow/WorkflowEngine.js";

/** T4 (specs/015 pre-flight): the automatic deps pre-flight before gates.
 *  nodeDepsStale is a pure fs predicate (tested via the static for the
 *  matrix); runDepsPreflight is exercised through the engine instance to
 *  cover the config gate, the reuse of the configured deps-install
 *  operation, and the audit trail. */

const FIXTURE = join(import.meta.dirname, "./fixtures/guidance");

let root: string;
let ws: string;
let poolDir: string;

function copyFixture(target: string): void {
  mkdirSync(target, { recursive: true });
  for (const f of [
    "guidance.json",
    "workflow.json",
    "responses.json",
    "operations.json",
    "downstream-servers.json",
    "policies.json",
  ]) {
    writeFileSync(join(target, f), readFileSync(join(FIXTURE, f)));
  }
  mkdirSync(join(target, "schemas"), { recursive: true });
  for (const f of readdirSync(join(FIXTURE, "schemas"))) {
    writeFileSync(join(target, "schemas", f), readFileSync(join(FIXTURE, "schemas", f)));
  }
}

function engine(opts?: { preFlight?: boolean }): WorkflowEngine {
  const config = loadConfig(poolDir, { workspaceRoot: root });
  if (opts?.preFlight !== undefined) {
    const cfgPath = join(poolDir, "guidance.json");
    const cfg = JSON.parse(readFileSync(cfgPath, "utf8")) as Record<string, unknown>;
    cfg.preFlight = { enabled: opts.preFlight };
    writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));
    return new WorkflowEngine({
      config: loadConfig(poolDir, { workspaceRoot: root }),
      stateDir: join(poolDir, "state"),
    });
  }
  return new WorkflowEngine({ config, stateDir: join(poolDir, "state") });
}

function privateOf<E>(engine: E, method: string): (arg: unknown) => unknown {
  // Bracket access to a private method — deliberate for this test file.
  // Bound to the instance: extracting a method loses its `this`.
  const fn = (
    engine as unknown as Record<string, (a: unknown) => unknown>
  )[method];
  if (!fn) throw new Error(`private method not found: ${method}`);
  return fn.bind(engine);
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "preflight-"));
  ws = join(root, "ws");
  mkdirSync(ws, { recursive: true });
  poolDir = join(root, "pool", ".guidance");
  copyFixture(poolDir);
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("nodeDepsStale trigger matrix", () => {
  const stale = (rootDir: string): boolean =>
    (
      WorkflowEngine as unknown as {
        nodeDepsStale: (r: string) => boolean;
      }
    ).nodeDepsStale(rootDir);

  it("no package.json -> not an npm workspace -> false", () => {
    expect(stale(ws)).toBe(false);
  });

  it("missing node_modules -> true (deterministic trigger)", () => {
    writeFileSync(join(ws, "package.json"), "{}");
    expect(stale(ws)).toBe(true);
  });

  it("fresh install -> false", () => {
    writeFileSync(join(ws, "package.json"), "{}");
    mkdirSync(join(ws, "node_modules"));
    expect(stale(ws)).toBe(false);
  });

  it("manifest newer than node_modules -> true", () => {
    writeFileSync(join(ws, "package.json"), "{}");
    mkdirSync(join(ws, "node_modules"));
    const past = new Date(Date.now() - 60_000);
    utimesSync(join(ws, "node_modules"), past, past);
    expect(stale(ws)).toBe(true);
  });
});

describe("runDepsPreflight", () => {
  function withDepsInstallOp(): void {
    const opsPath = join(poolDir, "operations.json");
    const ops = JSON.parse(readFileSync(opsPath, "utf8")) as {
      operations: Record<string, unknown>;
    };
    ops.operations["deps-install"] = {
      description: "test double: creates node_modules",
      type: "process",
      executable: "node",
      args: [
        "-e",
        "require('fs').mkdirSync('node_modules')",
      ],
      required: false,
      timeoutSeconds: 10,
    };
    writeFileSync(opsPath, JSON.stringify(ops, null, 2));
  }

  it("missing node_modules: runs deps-install and node_modules exists afterwards", async () => {
    withDepsInstallOp();
    writeFileSync(join(ws, "package.json"), "{}");
    const eng = engine();
    await privateOf(
      eng,
      "runDepsPreflight",
    )({ id: "s-test", workspaceRoot: ws } as never);
    expect(existsSync(join(ws, "node_modules"))).toBe(true);
    const audit = readFileSync(
      join(poolDir, "state", "history", "s-test.jsonl"),
      "utf8",
    );
    expect(audit).toContain("deps_preflight");
  });

  it("fresh workspace: no-op (no audit event, no deps-install run)", async () => {
    withDepsInstallOp();
    writeFileSync(join(ws, "package.json"), "{}");
    mkdirSync(join(ws, "node_modules"));
    const eng = engine();
    await privateOf(
      eng,
      "runDepsPreflight",
    )({ id: "s-test", workspaceRoot: ws } as never);
    const historyDir = join(poolDir, "state", "history");
    const written = existsSync(historyDir)
      ? readdirSync(historyDir).filter((f) => f.startsWith("s-test"))
      : [];
    expect(written).toEqual([]);
  });

  it("preFlight.enabled=false: no-op even when stale", async () => {
    withDepsInstallOp();
    writeFileSync(join(ws, "package.json"), "{}");
    const eng = engine({ preFlight: false });
    await privateOf(
      eng,
      "runDepsPreflight",
    )({ id: "s-test", workspaceRoot: ws } as never);
    expect(existsSync(join(ws, "node_modules"))).toBe(false);
  });

  it("fail-open: a FAILING deps-install does not throw and audits the failure", async () => {
    const opsPath = join(poolDir, "operations.json");
    const ops = JSON.parse(readFileSync(opsPath, "utf8")) as {
      operations: Record<string, unknown>;
    };
    ops.operations["deps-install"] = {
      description: "test double: always fails",
      type: "process",
      executable: "node",
      args: ["-e", "process.exit(1)"],
      required: false,
      timeoutSeconds: 10,
    };
    writeFileSync(opsPath, JSON.stringify(ops, null, 2));
    writeFileSync(join(ws, "package.json"), "{}");
    const eng = engine();
    await expect(
      privateOf(eng, "runDepsPreflight")({
        id: "s-test",
        workspaceRoot: ws,
      } as never),
    ).resolves.toBeUndefined();
    const audit = readFileSync(
      join(poolDir, "state", "history", "s-test.jsonl"),
      "utf8",
    );
    expect(audit).toContain("deps_preflight");
    expect(audit).toContain('"failed":true');
  });

  it("no configured deps-install: no-op (fail-open, nothing to reuse)", async () => {
    writeFileSync(join(ws, "package.json"), "{}");
    const eng = engine();
    await expect(
      privateOf(eng, "runDepsPreflight")({
        id: "s-test",
        workspaceRoot: ws,
      } as never),
    ).resolves.toBeUndefined();
    expect(existsSync(join(ws, "node_modules"))).toBe(false);
  });
});
