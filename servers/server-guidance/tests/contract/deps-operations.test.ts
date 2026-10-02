/**
 * specs/015 US2 (T007): contract tests for the dependency-bootstrap
 * operations deps-install / deps-reinstall (FR-1211..1216).
 *
 * Behavior tests run the real shipped operation definitions against real
 * (offline, dependency-free) npm installs in temp workspaces. Catalog-shape
 * tests assert the shipped templates expose the operations with the
 * spec-mandated attributes.
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { OperationEngine } from "../../src/orchestration/OperationEngine.js";
import type { OperationConfig } from "../../src/types/index.js";
import { warnNodeDeps } from "../../src/config-truth.js";
import { loadConfig } from "../../src/config.js";
import { WorkflowEngine } from "../../src/workflow/WorkflowEngine.js";

const FIXTURE = join(import.meta.dirname, "../workflow/fixtures/guidance");

let ws: string;

beforeEach(() => {
  ws = mkdtempSync(join(tmpdir(), "guidance-deps-"));
  // local file: dependency so offline installs actually materialize
  // node_modules (a dependency-free package installs nothing at all)
  mkdirSync(join(ws, "deps", "tiny"), { recursive: true });
  writeFileSync(
    join(ws, "deps", "tiny", "package.json"),
    JSON.stringify({ name: "tiny", version: "1.0.0" }),
  );
  writeFileSync(
    join(ws, "package.json"),
    JSON.stringify({
      name: "flat-ws",
      version: "1.0.0",
      private: true,
      dependencies: { tiny: "file:./deps/tiny" },
    }),
  );
});

afterEach(() => {
  rmSync(ws, { recursive: true, force: true });
});

/** npm knobs that keep installs hermetic (no network, no audit telemetry). */
const HERMETIC_ENV: Record<string, string> = {
  npm_config_offline: "true",
  npm_config_audit: "false",
  npm_config_fund: "false",
};

/** The shipped deps-install definition (mirrors the catalog templates). */
function depsInstallConfig(): OperationConfig {
  const cfg = {
    operationId: "deps-install",
    description:
      "Install Node dependencies: npm ci clean semantics with fallback to npm install when no lockfile exists (audit via the via label). FR-053 approval, exposure-filtered output.",
    type: "composite",
    strategy: "firstAvailable",
    required: false,
    invocableByAgent: true,
    timeoutSeconds: 900,
    riskClass: "workspace_write",
    env: HERMETIC_ENV,
    steps: [
      {
        type: "process",
        capability: "npm-ci-lockfile",
        executable: "npm",
        args: ["ci"],
      },
      {
        type: "process",
        capability: "npm-install-fallback",
        executable: "npm",
        args: ["install"],
      },
    ],
    validation: { exitCodeMustBeZero: true },
    output: { returnToAgent: "summary_and_errors", retainRawResult: true },
  };
  return cfg as unknown as OperationConfig;
}

/** The shipped deps-reinstall definition (mirrors the catalog templates). */
function depsReinstallConfig(): OperationConfig {
  return {
    operationId: "deps-reinstall",
    description:
      "Clean Node dependencies: delete node_modules (lockfile preserved), then reinstall. Workspace-scoped (cwd = workspace root). FR-053 approval, exposure-filtered output.",
    type: "process",
    executable: "node",
    args: [
      "-e",
      "const cp=require('node:child_process'),fs=require('node:fs');fs.rmSync('node_modules',{recursive:true,force:true});const r=cp.spawnSync('npm',['install'],{stdio:'inherit'});process.exit(r.status??1)",
    ],
    required: false,
    invocableByAgent: true,
    timeoutSeconds: 900,
    riskClass: "workspace_write",
    env: HERMETIC_ENV,
    validation: { exitCodeMustBeZero: true },
    output: { returnToAgent: "summary_and_errors", retainRawResult: true },
  };
}

function makeOpEngine(): OperationEngine {
  const engine = new OperationEngine();
  engine.setDownstreamInvoker({
    invokeTool: async () => ({ kind: "success", content: [] }),
  });
  return engine;
}

describe("specs/015 US2 deps-install (FR-1211)", () => {
  it(
    "falls back to npm install when no lockfile exists (audit via = npm-install-fallback)",
    { timeout: 120_000 },
    async () => {
      const result = await makeOpEngine().execute(
        depsInstallConfig(),
        {
          workspaceRoot: ws,
        },
        1,
      );
      expect(result.status).toBe("succeeded");
      expect(result.data.via).toBe("npm-install-fallback");
      expect(existsSync(join(ws, "node_modules", "tiny"))).toBe(true);
      expect(existsSync(join(ws, "package-lock.json"))).toBe(true);
    },
  );

  it(
    "uses npm ci clean semantics when a lockfile exists (via = npm-ci-lockfile)",
    { timeout: 120_000 },
    async () => {
      // generate a REAL lockfile (hand-written ones are fragile), then wipe
      // node_modules so npm ci has clean semantics to prove
      spawnSync("npm", ["install"], {
        cwd: ws,
        env: { ...process.env, ...HERMETIC_ENV },
      });
      rmSync(join(ws, "node_modules"), { recursive: true, force: true });
      expect(existsSync(join(ws, "package-lock.json"))).toBe(true);
      const result = await makeOpEngine().execute(
        depsInstallConfig(),
        {
          workspaceRoot: ws,
        },
        1,
      );
      expect(result.status).toBe("succeeded");
      expect(result.data.via).toBe("npm-ci-lockfile");
      expect(existsSync(join(ws, "node_modules", "tiny"))).toBe(true);
    },
  );
});

describe("specs/015 US2 deps-reinstall (FR-1212, AC-8)", () => {
  it(
    "deletes node_modules only (lockfile preserved), workspace-scoped, then reinstalls",
    { timeout: 120_000 },
    async () => {
      // seed a "broken" tree + lockfile, plus a sibling sentinel workspace
      const nm = join(ws, "node_modules", "native-pkg");
      mkdirSync(nm, { recursive: true });
      writeFileSync(join(nm, "addon.node"), "garbage");
      writeFileSync(join(ws, "package-lock.json"), "{}");
      const sibling = join(ws, "..", "sibling-ws");
      mkdirSync(join(sibling, "node_modules"), { recursive: true });
      writeFileSync(join(sibling, "node_modules", "sentinel.txt"), "keep");
      try {
        const result = await makeOpEngine().execute(
          depsReinstallConfig(),
          {
            workspaceRoot: ws,
          },
          1,
        );
        expect(result.status).toBe("succeeded");
        // sentinel broken-addon removed by the clean reinstall, deps restored
        expect(existsSync(join(nm, "addon.node"))).toBe(false);
        expect(existsSync(join(ws, "node_modules", "tiny"))).toBe(true);
        // lockfile preserved through the clean reinstall
        expect(existsSync(join(ws, "package-lock.json"))).toBe(true);
        // scoping: sibling workspace untouched
        expect(existsSync(join(sibling, "node_modules", "sentinel.txt"))).toBe(
          true,
        );
      } finally {
        rmSync(sibling, { recursive: true, force: true });
      }
    },
  );
});

describe("specs/015 US2 reactive detection (AC-9, FR-1213)", () => {
  it("appends a deps-install hint for 'Cannot find module' failures", async () => {
    const result = await makeOpEngine().execute(
      {
        operationId: "lint",
        description: "d",
        type: "process",
        executable: "node",
        required: true,
        args: [
          "-e",
          "console.error(\"Cannot find module 'x'\"); process.exit(1)",
        ],
        timeoutSeconds: 30,
        validation: { exitCodeMustBeZero: true },
        output: { returnToAgent: "summary_and_errors" },
      },
      { workspaceRoot: ws },
      1,
    );
    expect(result.status).toBe("failed");
    const hint = result.warnings.find((w) => w.code === "node_deps_hint");
    expect(hint).toBeDefined();
    expect(hint?.message).toMatch(/deps-install/);
  });

  it("appends a deps-reinstall hint for ERR_DLOPEN_FAILED failures", async () => {
    const result = await makeOpEngine().execute(
      {
        operationId: "test",
        description: "d",
        type: "process",
        executable: "node",
        required: true,
        args: [
          "-e",
          "console.error('ERR_DLOPEN_FAILED at addon.node'); process.exit(1)",
        ],
        timeoutSeconds: 30,
        validation: { exitCodeMustBeZero: true },
        output: { returnToAgent: "summary_and_errors" },
      },
      { workspaceRoot: ws },
      1,
    );
    expect(result.status).toBe("failed");
    const hint = result.warnings.find((w) => w.code === "node_deps_hint");
    expect(hint).toBeDefined();
    expect(hint?.message).toMatch(/deps-reinstall/);
  });

  it("does not hint for unrelated failures", async () => {
    const result = await makeOpEngine().execute(
      {
        operationId: "lint",
        description: "d",
        type: "process",
        executable: "node",
        required: true,
        args: [
          "-e",
          "console.error('syntax error somewhere'); process.exit(1)",
        ],
        timeoutSeconds: 30,
        validation: { exitCodeMustBeZero: true },
        output: { returnToAgent: "summary_and_errors" },
      },
      { workspaceRoot: ws },
      1,
    );
    expect(result.status).toBe("failed");
    expect(
      result.warnings.find((w) => w.code === "node_deps_hint"),
    ).toBeUndefined();
  });

  it("REV-US2-F3: a failing composite gate keeps its step warnings (node_deps_hint survives the failure merge)", async () => {
    const result = await makeOpEngine().execute(
      {
        operationId: "gate",
        description: "d",
        type: "composite",
        strategy: "firstAvailable",
        required: true,
        steps: [
          {
            type: "process",
            capability: "step-a",
            executable: "node",
            args: [
              "-e",
              "console.error(\"Cannot find module 'x'\"); process.exit(1)",
            ],
          },
        ],
        timeoutSeconds: 30,
        validation: { exitCodeMustBeZero: true },
        output: { returnToAgent: "summary_and_errors" },
      } as unknown as OperationConfig,
      { workspaceRoot: ws },
      1,
    );
    expect(result.status).toBe("failed");
    const hint = result.warnings.find((w) => w.code === "node_deps_hint");
    expect(hint).toBeDefined();
    expect(hint?.message).toMatch(/deps-install/);
  });
});

describe("specs/015 US2 root scoping (AC-8 negative)", () => {
  it("run_operation with a foreign/unknown operation id fails closed (operation_not_configured)", async () => {
    const configDir = join(ws, ".guidance");
    mkdirSync(configDir, { recursive: true });
    for (const f of [
      "guidance.json",
      "workflow.json",
      "responses.json",
      "operations.json",
      "downstream-servers.json",
      "policies.json",
    ]) {
      writeFileSync(join(configDir, f), readFileSync(join(FIXTURE, f)));
    }
    mkdirSync(join(configDir, "schemas"), { recursive: true });
    for (const f of readdirSync(join(FIXTURE, "schemas"))) {
      writeFileSync(
        join(configDir, "schemas", f),
        readFileSync(join(FIXTURE, "schemas", f)),
      );
    }
    const engine = new WorkflowEngine({
      config: loadConfig(configDir),
      stateDir: join(ws, "state"),
      operationEngine: makeOpEngine(),
    });
    const start = await engine.startWorkflow({
      workspaceRoot: ws,
      request: "r",
    });
    await expect(
      engine.runOperation(start.sessionId, "deps-install?root=../../etc"),
    ).rejects.toMatchObject({ code: "operation_not_configured" });
  });
});

describe("specs/015 US2 proactive probe flag (AC-10, FR-1214)", () => {
  it("warnNodeDeps default messages keep the plain npm remedy (flag OFF)", () => {
    const out: string[] = [];
    warnNodeDeps(
      { workspaces: { list: () => [{ name: "zed", root: ws }] } } as never,
      ws,
      (m) => out.push(m),
      () => false,
    );
    expect(out.join("\n")).toMatch(/npm install/);
    expect(out.join("\n")).not.toMatch(/deps-install/);
  });

  it("warnNodeDeps operational mode references the guidance deps operations (flag ON)", () => {
    const out: string[] = [];
    warnNodeDeps(
      { workspaces: { list: () => [{ name: "zed", root: ws }] } } as never,
      ws,
      (m) => out.push(m),
      () => false,
      { operational: true },
    );
    expect(out.join("\n")).toMatch(/deps-install/);
  });
});

describe("specs/015 US2 catalog shapes (FR-1215)", () => {
  it("scaffold template exposes deps operations with workspace_write + invocableByAgent", async () => {
    const { scaffoldIfMissing } = await import("../../src/scaffold.js");
    const configDir = join(ws, ".guidance");
    mkdirSync(configDir, { recursive: true });
    scaffoldIfMissing(configDir, ws);
    const ops = JSON.parse(
      readFileSync(join(configDir, "operations.json"), "utf8"),
    ) as {
      operations: Record<string, Record<string, unknown>>;
    };
    for (const id of ["deps-install", "deps-reinstall"]) {
      const op = ops.operations[id];
      expect(op, `scaffold template misses ${id}`).toBeDefined();
      expect(op?.riskClass).toBe("workspace_write");
      expect(op?.required).toBe(false);
      expect(op?.invocableByAgent).toBe(true);
      expect(op?.timeoutSeconds).toBe(900);
    }
    expect(ops.operations["deps-install"]?.type).toBe("composite");
    expect(ops.operations["deps-reinstall"]?.type).toBe("process");
  });

  it("example catalog (default-guidance) exposes deps operations", () => {
    const examplePath = join(
      import.meta.dirname,
      "../../examples/default-guidance/operations.json",
    );
    const ops = JSON.parse(readFileSync(examplePath, "utf8")) as {
      operations: Record<string, Record<string, unknown>>;
    };
    for (const id of ["deps-install", "deps-reinstall"]) {
      const op = ops.operations[id];
      expect(op, `example catalog misses ${id}`).toBeDefined();
      expect(op?.riskClass).toBe("workspace_write");
      expect(op?.invocableByAgent).toBe(true);
    }
  });

  it("REV-US2-F4: the three deps-op catalogs are field-identical (no template drift)", async () => {
    // scaffold catalog
    const { scaffoldIfMissing } = await import("../../src/scaffold.js");
    const scaffoldDir = join(ws, "scaffold-.guidance");
    mkdirSync(scaffoldDir, { recursive: true });
    scaffoldIfMissing(scaffoldDir, ws);
    const scaffoldOps = JSON.parse(
      readFileSync(join(scaffoldDir, "operations.json"), "utf8"),
    ) as { operations: Record<string, Record<string, unknown>> };
    // ConfigAssistant catalog (fresh generation)
    const { generateFiles } =
      await import("../../src/setup/ConfigAssistant.js");
    const { files } = generateFiles({
      configSource: "fresh",
      projectName: "drift-guard",
      transport: "stdio",
      shell: "sh",
      profile: "plain",
      insight: false,
      gitnexus: false,
      gates: "minimal",
    });
    const caOps = JSON.parse(
      files.find((f) => f.path === "operations.json")!.content,
    ) as { operations: Record<string, Record<string, unknown>> };
    // shipped example catalog
    const exampleOps = JSON.parse(
      readFileSync(
        join(
          import.meta.dirname,
          "../../examples/default-guidance/operations.json",
        ),
        "utf8",
      ),
    ) as { operations: Record<string, Record<string, unknown>> };

    const FIELDS = [
      "description",
      "type",
      "strategy",
      "steps",
      "validation",
      "output",
      "riskClass",
      "invocableByAgent",
      "timeoutSeconds",
      "required",
    ] as const;
    for (const id of ["deps-install", "deps-reinstall"]) {
      const s = scaffoldOps.operations[id];
      const c = caOps.operations[id];
      const e = exampleOps.operations[id];
      expect(s, `scaffold misses ${id}`).toBeDefined();
      expect(c, `ConfigAssistant misses ${id}`).toBeDefined();
      expect(e, `example catalog misses ${id}`).toBeDefined();
      for (const field of FIELDS) {
        expect(
          c![field],
          `ConfigAssistant vs scaffold drift on ${id}.${field}`,
        ).toEqual(s![field]);
        expect(
          e![field],
          `example vs scaffold drift on ${id}.${field}`,
        ).toEqual(s![field]);
      }
      // F2: the deps-install description must state the REAL fallback semantics.
      if (id === "deps-install") {
        expect(String(s!["description"])).toContain("fails for ANY reason");
      }
    }
  });
});
