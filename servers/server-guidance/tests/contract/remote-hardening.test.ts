import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHttpApp } from "../../src/server.js";
import { RemoteSessionManager } from "../../src/remote/remote-session-manager.js";
import { PairStore } from "../../src/remote/pair-store.js";
import { RateLimiter } from "../../src/remote/rate-limiter.js";

let ws: string;
let server: import("node:http").Server | undefined;
let port: number;

// Vollständige Config MIT configFiles-Form (guidance.json als Datei inklusive),
// damit restore (loadConfig) nach "Restart" die Entry-Datei findet.
const MINIMAL_CONFIG: Record<string, unknown> = (() => {
  const guidance = JSON.parse(readFileSync(join(import.meta.dirname, "../workflow/fixtures/guidance/guidance.json"), "utf-8")) as Record<string, unknown>;
  const fixture = join(import.meta.dirname, "../workflow/fixtures/guidance");
  const configFiles: Record<string, string> = {
    "guidance.json": JSON.stringify(guidance),
    "workflow.json": readFileSync(join(fixture, "workflow.json"), "utf-8"),
    "responses.json": readFileSync(join(fixture, "responses.json"), "utf-8"),
    "operations.json": readFileSync(join(fixture, "operations.json"), "utf-8"),
    "downstream-servers.json": readFileSync(join(fixture, "downstream-servers.json"), "utf-8"),
    "policies.json": readFileSync(join(fixture, "policies.json"), "utf-8"),
  };
  for (const f of ["understand", "plan", "review-plan", "implement", "review-implementation", "verify", "complete"]) {
    configFiles[`schemas/${f}.schema.json`] = readFileSync(join(fixture, "schemas", `${f}.schema.json`), "utf-8");
  }
  return { ...guidance, configFiles };
})();

beforeEach(() => {
  ws = mkdtempSync(join(tmpdir(), "guidance-hardening-"));
  process.env.GUIDANCE_WORKSPACE_ROOT = ws;
});
afterEach(() => {
  server?.close();
  delete process.env.GUIDANCE_WORKSPACE_ROOT;
  rmSync(ws, { recursive: true, force: true });
});


async function boot(opts: { forceRemote?: boolean } = {}): Promise<void> {
  const stateDir = join(ws, ".guidance", "state");
  const app = createHttpApp({
    workspaceRoot: ws,
    configDir: join(ws, ".guidance"),
    stateDir,
    remote: opts.forceRemote ? { pairs: new PairStore([]) } : undefined,
  });
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((r) => server!.once("listening", r));
  port = (server!.address() as { port: number }).port;
}

function mcp(body: Record<string, unknown>) {
  return fetch(`http://127.0.0.1:${port}/mcp`, {
    method: "POST",
    headers: { "content-type": "application/json", "accept": "application/json, text/event-stream" },
    body: JSON.stringify(body),
  });
}

async function call(name: string, args: Record<string, unknown>) {
  const res = await mcp({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } });
  expect(res.status).toBe(200);
  return JSON.parse(((await res.json()) as { result: { content: { text: string }[] } }).result.content[0]!.text) as Record<string, unknown>;
}

describe("remote-mode hardening (review follow-ups)", () => {
  it("RateLimiter: 20/min ok, 21ste wirft rate_limited (Q4)", () => {
    const rl = new RateLimiter(20);
    for (let i = 0; i < 20; i++) expect(() => rl.check("1.2.3.4")).not.toThrow();
    expect(() => rl.check("1.2.3.4")).toThrowError(/rate_limited/);
    expect(() => rl.check("5.6.7.8")).not.toThrow(); // andere IP unabhängig
  });

  it("M2: init_session ist über Restart hinweg idempotent (persistenter canonical-Index)", async () => {
    const stateDir = join(ws, ".guidance", "state");
    const mgr1 = new RemoteSessionManager(stateDir, new PairStore([]));
    const s1 = mgr1.initSession({ config: MINIMAL_CONFIG });
    expect(s1.meta.sessionId).toBeTruthy();
    // Neuer Manager = simulierter Restart (gleicher stateDir)
    const mgr2 = new RemoteSessionManager(stateDir, new PairStore([]));
    const s2 = mgr2.initSession({ config: MINIMAL_CONFIG });
    expect(s2.meta.sessionId).toBe(s1.meta.sessionId);
  });

  it("M3: Per-Key-Limit gilt über Restarts (Disk-Count) und wirft Quota-Fehler", async () => {
    const stateDir = join(ws, ".guidance", "state");
    let variant = 0;
    const mkConfig = () => {
      variant += 1;
      return { ...MINIMAL_CONFIG, project: { name: `v${variant}` } };
    };
    const mgr1 = new RemoteSessionManager(stateDir, new PairStore([]));
    for (let i = 0; i < 10; i++) mgr1.initSession({ config: mkConfig() });
    expect(() => mgr1.initSession({ config: mkConfig() })).toThrowError(/quota_exceeded/);
    // Nach "Restart" weiterhin limitiert (Disk-Count)
    const mgr2 = new RemoteSessionManager(stateDir, new PairStore([]));
    expect(() => mgr2.initSession({ config: mkConfig() })).toThrowError(/quota_exceeded/);
  });
});

describe("remote-mode hardening fixes (F1-F3)", () => {
  it("F1: abgelehntes init_session hinterlaesst KEIN Disk-Artefakt", async () => {
    const stateDir = join(ws, ".guidance", "state");
    const mgr = new RemoteSessionManager(stateDir, new PairStore([]));
    let variant = 0;
    const mk = () => { variant += 1; return { ...MINIMAL_CONFIG, project: { name: `x${variant}` } }; };
    let firstConfig: Record<string, unknown> | undefined;
    let firstSessionId: string | undefined;
    for (let i = 0; i < 10; i++) {
      const cfgI = mk();
      if (firstConfig === undefined) {
        firstConfig = cfgI;
        firstSessionId = mgr.initSession({ config: cfgI }).meta.sessionId;
      } else {
        mgr.initSession({ config: cfgI });
      }
    }
    if (!firstConfig || !firstSessionId) throw new Error("test setup failed");
    const sessionsRoot = join(stateDir, "remote-sessions");
    const before = readdirSync(sessionsRoot).length;
    expect(() => mgr.initSession({ config: mk() })).toThrowError(/quota_exceeded/);
    expect(readdirSync(sessionsRoot).length).toBe(before);
    // Idempotent re-init nach Reject: identische Config wid die bestehende
    // Session via canonicalIndex wieder aufgenommen ( quota_quota_neutral).
    const idem = mgr.initSession({ config: firstConfig });
    expect(idem.meta.sessionId).toBe(firstSessionId);
  });

  it("F3: init_session wird pro Request nur EINMAL gezaehlt (HTTP-Layer)", async () => {
    await boot({ forceRemote: true });
    for (let i = 0; i < 20; i++) {
      const res = await mcp({ jsonrpc: "2.0", id: i, method: "tools/call", params: { name: "init_session", arguments: { config: { ...MINIMAL_CONFIG, project: { name: `p${i}` } } } } });
      expect(res.status).toBe(200);
    }
    const res21 = await mcp({ jsonrpc: "2.0", id: 99, method: "tools/call", params: { name: "init_session", arguments: { config: { ...MINIMAL_CONFIG, project: { name: "over" } } } } });
    expect(res21.status).toBe(429);
    const body = (await res21.json()) as { error?: { message?: string } };
    expect(body.error?.message).toMatch(/rate_limited/);
  });
});

describe("remote-mode hardening (CB-1/CB-2, Codebase-Review 2026-09-24)", () => {
  it("CB-1: resolve über Workflow-Sid aktualisiert lastAccessAt der Remote-Session (TTL-Refresh)", async () => {
    const stateDir = join(ws, ".guidance", "state");
    const mgr = new RemoteSessionManager(stateDir, new PairStore([]));
    const s = mgr.initSession({ config: MINIMAL_CONFIG });
    const sid = s.meta.sessionId;
    const wfSid = "wf-cb1-refresh-test";
    mgr.registerWorkflowSession(sid, wfSid);
    const metaPath = join(stateDir, "remote-sessions", sid, "meta.json");
    const readLastAccess = () => (JSON.parse(readFileSync(metaPath, "utf-8")) as { lastAccessAt: string }).lastAccessAt;
    const before = readLastAccess();
    await new Promise((r) => setTimeout(r, 15)); // ms-Unterschied sicherstellen
    const resolved = mgr.resolve(wfSid); // Cache-Pfad via Workflow-Sid
    expect(resolved.meta.sessionId).toBe(sid);
    expect(new Date(readLastAccess()).getTime()).toBeGreaterThan(new Date(before).getTime());
  });

  it("CB-2: Throw in configFiles-Validierung rollt Quota-Slot zurück und hinterlässt keine Orphans", () => {
    const stateDir = join(ws, ".guidance", "state");
    const mgr = new RemoteSessionManager(stateDir, new PairStore([]));
    const bad = { ...MINIMAL_CONFIG, project: { name: "cb2" }, configFiles: { "guidance.json": 42 } };
    const sessionsRoot = join(stateDir, "remote-sessions");
    // 12 > MAX_SESSIONS_PER_KEY (10): mit Slot-Leck würde ab Versuch 11 quota_exceeded fliegen
    for (let i = 0; i < 12; i++) {
      expect(() => mgr.initSession({ config: bad })).toThrowError(/configuration_invalid/);
    }
    expect(readdirSync(sessionsRoot).length).toBe(0); // keine Orphan-Verzeichnisse
    const ok = mgr.initSession({ config: MINIMAL_CONFIG }); // Slot nicht verbraucht
    expect(ok.meta.sessionId).toBeTruthy();
  });
});
