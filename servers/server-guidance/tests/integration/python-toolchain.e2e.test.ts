import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readdirSync, readFileSync, copyFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// spec 003 US2: Python toolchain bootstrap E2E. Requires a real `uv` binary
// (guidance container image or any host with uv). Skips deterministically
// otherwise (CI-safe); set RUN_PY_E2E=1 to force-enable in prepared envs.
const hasUv = (() => {
  if (process.env.RUN_PY_E2E === "1") return true;
  try {
    return spawnSync("uv", ["--version"], { encoding: "utf-8" }).status === 0;
  } catch {
    return false;
  }
})();

const EXAMPLE = join(import.meta.dirname, "../../examples/python-guidance");
const FIXTURE_WS = join(import.meta.dirname, "../fixtures/python-ws");

let ws: string;
let cfgDir: string;
let stateDir: string;
let serverMod: typeof import("../../src/server.js");

async function boot(): Promise<number> {
  serverMod ??= await import("../../src/server.js");
  const { port } = await serverMod.startHttpServer("127.0.0.1", 0);
  return port;
}

function call(port: number, id: number, name: string, args: Record<string, unknown>): Promise<{ accepted?: boolean; id?: string; status?: string; summary?: string; error?: { code: string; message: string }; rawError?: string }> {
  return (async () => {
    const res = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } }),
    });
    const text = ((await res.json()) as { result?: { content?: { text: string }[] } }).result?.content?.[0]?.text ?? "{}";
    try {
      return JSON.parse(text);
    } catch {
      // GuidanceErrors surface as raw error-text content (isError), not JSON
      return { rawError: text };
    }
  })();
}

function seedWorkspace(opts: { withLock: boolean; stale?: boolean }): void {
  ws = mkdtempSync(join(tmpdir(), "guidance-py-e2e-"));
  cfgDir = join(ws, ".guidance");
  stateDir = join(ws, ".guidance", "state");
  mkdirSync(cfgDir, { recursive: true });
  for (const f of ["guidance.json", "workflow.json", "responses.json", "operations.json", "policies.json"]) {
    copyFileSync(join(EXAMPLE, f), join(cfgDir, f));
  }
  mkdirSync(join(cfgDir, "schemas"), { recursive: true });
  for (const f of readdirSync(join(EXAMPLE, "schemas"))) {
    copyFileSync(join(EXAMPLE, "schemas", f), join(cfgDir, "schemas", f));
  }
  for (const f of ["pyproject.toml", "demo.py", "test_demo.py", ...(opts.withLock ? ["uv.lock"] : [])]) {
    copyFileSync(join(FIXTURE_WS, f), join(ws, f));
  }
  process.env.GUIDANCE_WORKSPACE_ROOT = ws;
  if (opts.stale) {
    // change pyproject AFTER the lockfile was copied → lock is now stale
    const py = readFileSync(join(ws, "pyproject.toml"), "utf-8");
    writeFileSync(join(ws, "pyproject.toml"), py.replace('"six>=1.16"', '"six>=1.16", "idna"'));
  }
}

beforeEach(() => {
  if (!hasUv) return;
  seedWorkspace({ withLock: true });
});

afterEach(() => {
  delete process.env.GUIDANCE_WORKSPACE_ROOT;
  if (ws && existsSync(ws)) rmSync(ws, { recursive: true, force: true });
});

describe.skipIf(!hasUv)("python toolchain bootstrap E2E (spec 003 SC-001..SC-004)", () => {
  it("SC-001: fresh workspace — toolchain-sync succeeds, then test runs real pytest", async () => {
    const port = await boot();
    const start = await call(port, 1, "start_workflow", { workspaceRoot: ws, request: "bootstrap" });
    expect(start.accepted).toBe(true);
    const sid = (start as { sessionId?: string }).sessionId!;
    const sync = await call(port, 2, "run_operation", { sessionId: sid, operationId: "toolchain-sync" });
    expect(sync.status).toBe("succeeded");
    const test = await call(port, 3, "run_operation", { sessionId: sid, operationId: "test" });
    expect(test.status).toBe("succeeded");
    expect(test.summary).not.toContain("npm");
  }, 180_000);

  it("SC-003: missing uv.lock fails closed — nothing installed", async () => {
    rmSync(ws, { recursive: true, force: true });
    seedWorkspace({ withLock: false });
    const port = await boot();
    const start = await call(port, 1, "start_workflow", { workspaceRoot: ws, request: "bootstrap" });
    const sync = await call(port, 2, "run_operation", { sessionId: (start as { sessionId?: string }).sessionId!, operationId: "toolchain-sync" });
    expect(sync.status).toBe("failed");
    // uv creates the venv dir before failing on the missing lockfile — the
    // fail-closed guarantee is that NOTHING gets installed into it.
    const venvRoot = join(ws, ".venv");
    expect(existsSync(join(venvRoot, "bin", "pytest"))).toBe(false);
    const libDir = join(venvRoot, "lib");
    const pyVers = existsSync(libDir) ? readdirSync(libDir) : [];
    expect(pyVers.every((d) => !existsSync(join(libDir, d, "site-packages", "six")))).toBe(true);
  }, 120_000);

  it("SC-003: stale uv.lock (pyproject changed after lock) fails closed", async () => {
    rmSync(ws, { recursive: true, force: true });
    seedWorkspace({ withLock: true, stale: true });
    const port = await boot();
    const start = await call(port, 1, "start_workflow", { workspaceRoot: ws, request: "bootstrap" });
    const sync = await call(port, 2, "run_operation", { sessionId: (start as { sessionId?: string }).sessionId, operationId: "toolchain-sync" });
    expect(sync.status).toBe("failed");
  }, 120_000);

  it("run_operation rejects unmarked operations (SC-002 contract holds in E2E)", async () => {
    const port = await boot();
    const start = await call(port, 1, "start_workflow", { workspaceRoot: ws, request: "bootstrap" });
    const res = await call(port, 2, "run_operation", { sessionId: (start as { sessionId?: string }).sessionId!, operationId: "nope" });
    expect(res.rawError ?? res.error?.message ?? "").toMatch(/operation_not_configured|not configured/);
  });
});
