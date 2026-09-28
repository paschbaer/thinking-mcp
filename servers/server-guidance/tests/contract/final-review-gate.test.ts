import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync, readFileSync, statSync } from "node:fs";
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
  // GDS-5: linked worktrees carry .git as a FILE with "gitdir: <path>".
  const gitPath = join(REPO_ROOT, ".git");
  let gitDir: string;
  if (existsSync(gitPath) && statSync(gitPath).isFile()) {
    const pointer = readFileSync(gitPath, "utf8").trim();
    if (!pointer.startsWith("gitdir:")) throw new Error("cannot parse .git pointer");
    gitDir = resolve(REPO_ROOT, pointer.slice("gitdir:".length).trim());
    const driveIdx = gitDir.search(/[A-Za-z]:\//);
    if (driveIdx >= 0) {
      const rawWin = gitDir.slice(driveIdx).replace(/\\/g, "/");
      const dm = rawWin.match(/^([A-Za-z]):\/(.*)$/);
      const candidates = dm ? [
        "/mnt/" + dm[1]!.toLowerCase() + "/" + dm[2]!,
        "/workspace/" + dm[2],
        "/workspaces/" + dm[2],
      ] : [];
      gitDir = candidates.find((c) => existsSync(c)) ?? gitDir;
    }
  } else {
    gitDir = gitPath;
  }
  const head = readFileSync(join(gitDir, "HEAD"), "utf8").trim();
  if (!head.startsWith("ref: ")) return head;
  const ref = head.slice(5).trim();
  // GDS-5: loose refs may live in the worktree gitdir OR the common dir.
  const commonDirFile = join(gitDir, "commondir");
  const commonDir = existsSync(commonDirFile)
    ? resolve(gitDir, readFileSync(commonDirFile, "utf8").trim())
    : gitDir;
  const looseCandidates = [join(gitDir, ref), join(commonDir, ref)];
  for (const loose of looseCandidates) {
    if (existsSync(loose)) return readFileSync(loose, "utf8").trim();
  }

  // packed-refs live in the COMMON dir for linked worktrees
  const packedPaths = [join(commonDir, "packed-refs"), join(gitDir, "packed-refs")];
  const packed = packedPaths
    .filter((p) => existsSync(p))
    .map((p) => readFileSync(p, "utf8"))
    .find((c) => c.split("\n").some((line) => line.endsWith(" " + ref)));
  if (packed === undefined) throw new Error("cannot resolve " + ref);
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
