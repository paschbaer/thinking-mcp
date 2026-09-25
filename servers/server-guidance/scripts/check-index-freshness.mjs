#!/usr/bin/env node
/**
 * Index freshness check (GUID-6): verifies that the GitNexus index covers the
 * current git HEAD. GitNexus stores per-branch indexes under
 * `.gitnexus/branches/<branch>-<hash>/meta.json` with a `lastCommit` field;
 * the index is fresh when one of them matches `git HEAD`.
 *
 * Pure Node: no git binary and no dependencies (runs in the alpine guidance
 * container against the repo mount). NOTE: the root `.gitnexus/meta.json` is
 * NOT a freshness source — incremental analyze runs update the per-branch
 * directories, not the root file.
 *
 * Usage: node check-index-freshness.mjs [repoRoot=cwd]
 *
 * Exit codes:
 *   0  an index covers the current HEAD commit
 *   1  no index for HEAD (stale/missing) — details on stderr
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const repoRoot = process.argv[2] ?? process.cwd();
const gitDir = join(repoRoot, ".git");

function fail(message) {
  console.error(`INDEX NOT FRESH: ${message}`);
  process.exit(1);
}

function readGitHead(gitDir) {
  const headPath = join(gitDir, "HEAD");
  if (!existsSync(headPath)) fail(`no .git/HEAD at ${gitDir} — not a git repository?`);
  const head = readFileSync(headPath, "utf8").trim();
  if (!head.startsWith("ref: ")) {
    // detached HEAD: raw hash
    return { commit: head, branch: null };
  }
  const ref = head.slice(5).trim();
  const loose = join(gitDir, ref);
  if (existsSync(loose)) {
    return { commit: readFileSync(loose, "utf8").trim(), branch: ref.replace("refs/heads/", "") };
  }
  const packedPath = join(gitDir, "packed-refs");
  if (existsSync(packedPath)) {
    for (const line of readFileSync(packedPath, "utf8").split("\n")) {
      if (line.endsWith(` ${ref}`)) {
        return { commit: line.split(" ")[0].trim(), branch: ref.replace("refs/heads/", "") };
      }
    }
  }
  fail(`cannot resolve ${ref} (loose ref and packed-refs)`);
}

const head = readGitHead(gitDir);
const branchesDir = join(repoRoot, ".gitnexus", "branches");
if (!existsSync(branchesDir)) {
  fail(`no GitNexus index found (${branchesDir} missing) — run: gitnexus analyze --no-stats`);
}

const commits = new Set();
for (const dir of readdirSync(branchesDir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name)) {
  const metaPath = join(branchesDir, dir, "meta.json");
  if (!existsSync(metaPath)) continue;
  try {
    const meta = JSON.parse(readFileSync(metaPath, "utf8"));
    if (meta.lastCommit) commits.add(meta.lastCommit);
  } catch {
    // unreadable branch index → skip, other branch indexes may still match
  }
}

if (!commits.has(head.commit)) {
  fail(
    `no GitNexus index covers HEAD ${head.commit}` +
    (head.branch ? ` (branch ${head.branch})` : "") +
    ` — indexed commits: ${[...commits].join(", ") || "none"}. Run: gitnexus analyze --no-stats (host-side)`,
  );
}
console.log(`INDEX FRESH: HEAD ${head.commit} is covered by the GitNexus index${head.branch ? ` (branch ${head.branch})` : ""}.`);
