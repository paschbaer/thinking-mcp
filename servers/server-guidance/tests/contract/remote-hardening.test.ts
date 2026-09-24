import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
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
