import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

/**
 * Final-Review Evidence Gate (amendment 003, FR-120/121) — drives the real
 * script as a process, exactly like the guidance operation does:
 * `node check-final-review.mjs <repoRoot> <evidencePath>`.
 * The repo root carries .git (repo copy in the container, checkout on CI);
 * the evidence file lives in a per-test tmp state dir (absolute path is
 * accepted by the script via resolve()).
 */
const REPO_ROOT = resolve(import.meta.dirname, "../../../..");
const SCRIPT = join(import.meta.dirname, "../../scripts/check-final-review.mjs");

let ws: string;
let evidencePath: string;

/** Resolve HEAD without git binary (mirrors the script's readGitHead). */
function readHead(): string {
  const gitDir = join(REPO_ROOT, ".git");
  const head = readFileSync(join(gitDir, "HEAD"), "utf8").trim();
  if (!head.startsWith("ref: ")) return head;
  const ref = head.slice(5).trim();
  const loose = join(gitDir, ref);
  if (existsSync(loose)) return readFileSync(loose, "utf8").trim();
  const packed = readFileSync(join(gitDir, "packed-refs"), "utf8");
  for (const line of packed.split("\n")) {
    if (line.endsWith(` ${ref}`)) return line.split(" ")[0]!.trim();
  }
  throw new Error(`cannot resolve ${ref}`);
}

function validEvidence(head: string, overrides: Record<string, unknown> = {}) {
  return {
    formatVersion: 1,
    sessionId: "session-test",
    reviewerRef: "reviewer-session-abc",
    reviewScope: "git diff base..head + governing spec",
    baseCommit: "1".repeat(40),
    headCommit: head,
    commits: ["1".repeat(40), head],
    reviewedAt: new Date().toISOString(),
    openHighCritical: 0,
    findings: [
      { id: "R-100", severity: "medium", status: "tracked", evidence: "file:line — repro" },
      { id: "R-101", severity: "high", status: "fixed", evidence: "fixed in fix-commit, regression test added" },
    ],
    ...overrides,
  };
}

function runGate(evidence: object): ReturnType<typeof spawnSync> {
  writeFileSync(evidencePath, JSON.stringify(evidence));
  return spawnSync("node", [SCRIPT, REPO_ROOT, evidencePath], { encoding: "utf-8" });
}

beforeEach(() => {
  ws = mkdtempSync(join(tmpdir(), "guidance-fre-"));
  mkdirSync(join(ws, ".guidance", "state"), { recursive: true });
  evidencePath = join(ws, ".guidance", "state", "final-review.json");
});

afterEach(() => {
  rmSync(ws, { recursive: true, force: true });
});

describe("final-review evidence gate (amendment 003 FR-120/121)", () => {
  it("fails closed when the evidence file is missing", () => {
    const res = spawnSync("node", [SCRIPT, REPO_ROOT, evidencePath], { encoding: "utf-8" });
    expect(res.status).toBe(1);
    expect(res.stderr).toMatch(/evidence file missing/);
  });

  it("fails when headCommit does not match HEAD (commit after review, FR-122)", () => {
    const res = runGate(validEvidence("0".repeat(40)));
    expect(res.status).toBe(1);
    expect(res.stderr).toMatch(/stale review/);
  });

  it("fails on open HIGH/CRITICAL findings (not fixed)", () => {
    const res = runGate(validEvidence(readHead(), {
      openHighCritical: 1,
      findings: [
        { id: "R-1", severity: "medium", status: "tracked", evidence: "ok" },
        { id: "R-2", severity: "high", status: "tracked", evidence: "open defect" },
      ],
    }));
    expect(res.status).toBe(1);
    expect(res.stderr).toMatch(/open HIGH\/CRITICAL/);
  });

  it("fails when the declared count does not match the computed one", () => {
    const res = runGate(validEvidence(readHead(), {
      openHighCritical: 5,
      findings: [{ id: "R-1", severity: "low", status: "accepted", evidence: "cosmetic" }],
    }));
    expect(res.status).toBe(1);
    expect(res.stderr).toMatch(/does not match computed/);
  });

  it("fails strict on unknown top-level fields and missing fields", () => {
    const res1 = runGate(validEvidence(readHead(), { extra: true }));
    expect(res1.stderr).toMatch(/unknown evidence fields: extra/);
    const ev = validEvidence(readHead()) as Record<string, unknown>;
    delete ev.reviewerRef;
    const res2 = runGate(ev);
    expect(res2.stderr).toMatch(/missing evidence field: reviewerRef/);
  });

  it("passes with a valid evidence file for the real HEAD; evidence survives (read-only gate)", () => {
    const head = readHead();
    const res = runGate(validEvidence(head));
    expect(res.status).toBe(0);
    expect(res.stdout).toMatch(/FINAL REVIEW EVIDENCE OK/);
    expect(existsSync(evidencePath)).toBe(true);
  });
});
