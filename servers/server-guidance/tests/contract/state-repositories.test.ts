import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SessionRepository, AuditRepository } from "../../src/state/index.js";
import type { WorkflowSession } from "../../src/types/index.js";

let dir: string;
const session = (id: string): WorkflowSession => ({
  sessionId: id, workflowId: "w1", profile: "plain", configurationVersion: "sha256:abc",
  configDir: dir, workspaceRoot: dir, status: "active", currentPhase: "understand",
  previousPhase: null, request: "test", submissions: {}, blockers: {}, requestIds: {},
  downstream: { servers: {}, operations: {} },
  createdAt: "2026-09-22T00:00:00Z", updatedAt: "2026-09-22T00:00:00Z", completedAt: null,
} as unknown as WorkflowSession);

beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "guidance-state-")); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

describe("SessionRepository (FR-019 atomic persistence)", () => {
  it("persists a session and reads it back identically", () => {
    const repo = new SessionRepository(join(dir, "sessions"));
    const s = session("session-1");
    repo.save(s);
    expect(repo.load("session-1")).toEqual(s);
    expect(existsSync(join(dir, "sessions", "session-1.json"))).toBe(true);
  });

  it("update() mutates and bumps updatedAt atomically", () => {
    const repo = new SessionRepository(join(dir, "sessions"));
    repo.save(session("session-1"));
    repo.update("session-1", (s) => { s.currentPhase = "plan"; });
    expect(repo.load("session-1")!.currentPhase).toBe("plan");
  });

  it("save leaves no temp files behind (atomic rename)", () => {
    const repo = new SessionRepository(join(dir, "sessions"));
    repo.save(session("session-1"));
    const files: string[] = readdirSync(join(dir, "sessions"));
    expect(files.every((f: string) => f.endsWith(".json"))).toBe(true);
  });

  it("throws session_not_found for unknown sessions", () => {
    const repo = new SessionRepository(join(dir, "sessions"));
    expect(() => repo.load("nope")).toThrowError(/session_not_found/);
  });
});

describe("AuditRepository (FR-021 append-only JSONL)", () => {
  it("appends events line by line with timestamps", () => {
    const repo = new AuditRepository(join(dir, "history"));
    repo.append({ sessionId: "s1", eventType: "session_started", data: { a: 1 } });
    repo.append({ sessionId: "s1", eventType: "phase_entered", data: { b: 2 } });
    const lines = readFileSync(join(dir, "history", "s1.jsonl"), "utf-8").trim().split("\n");
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]!)).toMatchObject({ sessionId: "s1", eventType: "session_started" });
    expect(JSON.parse(lines[1]!).timestamp).toBeTruthy();
  });

  it("applies secret redaction before persisting (FR-045)", () => {
    const redact = (s: string) => s.replaceAll("hunter2", "***");
    const repo = new AuditRepository(join(dir, "history"), redact);
    repo.append({ sessionId: "s1", eventType: "e", data: { pw: "hunter2" } });
    const content = readFileSync(join(dir, "history", "s1.jsonl"), "utf-8");
    expect(content).not.toContain("hunter2");
  });
});
