#!/usr/bin/env node
/**
 * Index freshness check (GUID-6): verifies that the GitNexus index covers the
 * current git HEAD. Pure Node: no git binary and no dependencies (runs in the
 * alpine guidance container against the repo mount).
 *
 * Two freshness signals — EITHER one suffices:
 *   (a) mtime: no source file is newer than the newest file in .gitnexus
 *   (b) commit coverage: any meta.json under .gitnexus (root or
 *       branches/<branch>-<hash>/) has lastCommit == HEAD
 * Fails only when BOTH are stale/missing. Known quirk (validated): the root
 * .gitnexus/meta.json is NOT updated by incremental analyze runs — per-branch
 * dirs are — so relying on the root meta alone reports false staleness.
 *
 * Usage: node check-index-freshness.mjs [repoRoot=cwd]
 *
 * Exit codes:
 *   0  index is fresh (mtime or commit coverage)
 *   1  stale/missing — details on stderr
 */
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const repoRoot = process.argv[2] ?? process.cwd();
const SKIP_DIRS = new Set([".git", ".gitnexus", "node_modules", "dist", ".chats", ".yarn", "coverage"]);
const SKIP_PREFIXES = [".guidance/state"];

function isSkipped(rel) {
  if (SKIP_DIRS.has(rel.split("/")[0])) return true;
  return SKIP_PREFIXES.some((p) => rel === p || rel.startsWith(`${p}/`));
}

function fail(message) {
  console.error(`INDEX NOT FRESH: ${message}`);
  process.exit(1);
}

function readGitHead(repoRoot) {
  const gitPath = join(repoRoot, ".git");
  if (!existsSync(gitPath)) fail(`no .git at ${gitPath} — not a git repository?`);
  let gitDir = gitPath;
  // linked worktrees: .git is a FILE with 'gitdir: <path>' pointing at the
  // per-worktree git dir. Worktree .git files written by Windows git carry
  // host paths (D:/...) while WSL-git worktrees carry /mnt/d/... — the main
  // repo is mounted at /workspace in the guidance container, so map both.
  if (statSync(gitPath).isFile()) {
    const pointer = readFileSync(gitPath, "utf8").trim();
    if (!pointer.startsWith("gitdir:")) fail(`cannot parse ${gitPath} (.git file without gitdir pointer)`);
    gitDir = resolve(repoRoot, pointer.slice("gitdir:".length).trim());
    const mappings = [
      ["D:/repos/Thinking-MCP", "/workspace"],
      ["/mnt/d/repos/Thinking-MCP", "/workspace"],
    ];
    for (const [from, to] of mappings) {
      if (gitDir.startsWith(from)) {
        gitDir = to + gitDir.slice(from.length);
        break;
      }
    }
    if (!existsSync(gitDir)) fail(`worktree git dir does not exist in this container: ${gitDir}`);
  }
  const headPath = join(gitDir, "HEAD");
  if (!existsSync(headPath)) fail(`no HEAD at ${headPath}`);
  const head = readFileSync(headPath, "utf8").trim();
  if (!head.startsWith("ref: ")) {
    return { commit: head, branch: null, gitDir }; // detached HEAD
  }
  const ref = head.slice(5).trim();
  const candidates = [join(gitDir, ref)];
  let commonDir = null;
  const commondirFile = join(gitDir, "commondir");
  if (existsSync(commondirFile)) {
    commonDir = resolve(gitDir, readFileSync(commondirFile, "utf8").trim());
    candidates.push(join(commonDir, ref));
  }
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return { commit: readFileSync(candidate, "utf8").trim(), branch: ref.replace("refs/heads/", ""), gitDir };
    }
  }
  const packedDirs = [join(gitDir, "packed-refs"), commonDir ? join(commonDir, "packed-refs") : null].filter(Boolean);
  for (const packedPath of packedDirs) {
    if (existsSync(packedPath)) {
      for (const line of readFileSync(packedPath, "utf8").split("\n")) {
        if (line.endsWith(` ${ref}`)) {
          return { commit: line.split(" ")[0].trim(), branch: ref.replace("refs/heads/", ""), gitDir };
        }
      }
    }
  }
  fail(`cannot resolve ${ref} (loose ref and packed-refs)`);
}

let newestSource = { mtime: 0, file: "" };
function scanSource(dir, depth, relBase) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const full = join(dir, e.name);
    const rel = relBase ? `${relBase}/${e.name}` : e.name;
    if (depth === 0 && SKIP_DIRS.has(e.name)) continue;
    if (isSkipped(rel)) continue;
    if (e.isDirectory()) {
      if (depth > 12) continue;
      scanSource(full, depth + 1, rel);
    } else if (e.isFile()) {
      let mtime = 0;
      try {
        mtime = statSync(full).mtimeMs;
      } catch {
        mtime = Number.MAX_SAFE_INTEGER; // unreadable → fail-safe stale
      }
      if (mtime > newestSource.mtime) newestSource = { mtime, file: full };
    }
  }
}

let indexMtime = 0;
function scanIndex(dir, depth) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) scanIndex(full, depth + 1);
    else {
      try {
        const m = statSync(full).mtimeMs;
        if (m > indexMtime) indexMtime = m;
      } catch {
        // unreadable → ignore for mtime purposes
      }
    }
  }
}

let commitCovered = false;
function collectCommitCoverage(metaPath) {
  if (commitCovered || !existsSync(metaPath)) return;
  try {
    const meta = JSON.parse(readFileSync(metaPath, "utf8"));
    if (meta.lastCommit === head.commit) commitCovered = true;
  } catch {
    // unparsable meta file → ignore
  }
}

/* ---------- main ---------- */

const head = readGitHead(repoRoot);
scanSource(repoRoot, 0, "");

const indexRoot = join(repoRoot, ".gitnexus");
scanIndex(indexRoot, 0);
collectCommitCoverage(indexRoot);
const branchesRoot = join(indexRoot, "branches");
if (existsSync(branchesRoot)) {
  for (const b of readdirSync(branchesRoot, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name)) {
    if (commitCovered) break;
    collectCommitCoverage(join(branchesRoot, b));
  }
}

const rel = (p) => (p.startsWith(repoRoot) ? p.slice(repoRoot.length + 1) : p);
const indexFreshByMtime = newestSource.mtime <= indexMtime;
if (indexFreshByMtime || commitCovered) {
  console.log(
    `INDEX FRESH: HEAD ${head.commit} covered` +
    (commitCovered ? " (commit coverage)" : " (mtime)") +
    `. Newest source: ${rel(newestSource.file) || "(none)"} (${new Date(newestSource.mtime).toISOString()}).`,
  );
} else {
  fail(
    `source files are newer than the index: newest source "${rel(newestSource.file)}" (${new Date(newestSource.mtime).toISOString()})` +
    ` vs. index from ${new Date(indexMtime).toISOString()} — run: gitnexus analyze --no-stats`,
  );
}
