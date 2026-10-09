#!/usr/bin/env node
/**
 * guidance-side auto-reindex operation (design 1(b), incremental only):
 * submits an analyze job to the gitnexus HTTP API from INSIDE the guidance
 * container (compose DNS) and polls it to completion. Ports the stats-line +
 * mtime restore of scripts/reindex-via-api.sh (the API has no no-stats
 * option; AGENTS.md/CLAUDE.md stats lines and their mtimes are restored so
 * the tree stays clean and the job has zero net effect on those files).
 *
 * Runs as the `gitnexus-reindex` process operation (workspace root cwd);
 * repo root is derived from this script's location (.guidance/scripts/).
 * Incremental only — full rebuilds (--force) stay documented manual
 * procedures (CLI or API with force:true).
 *
 * Env overrides: REPO_PATH (server path world, default
 * /mnt/d/repos/thinking-mcp — the wsl-writer storage identity),
 * GITNEXUS_API_URL (default http://gitnexus-server:4747, compose DNS).
 * Exit 0 on job complete; 1 on submit failure / failed job / timeout.
 */
import { readFileSync, writeFileSync, utimesSync, existsSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_PATH = process.env.REPO_PATH ?? "/mnt/d/repos/thinking-mcp";
const BASE_URL = (
  process.env.GITNEXUS_API_URL ?? "http://gitnexus-server:4747"
).replace(/\/+$/, "");
const POLL_INTERVAL_MS = 5_000;
const OVERALL_TIMEOUT_MS = 1_700_000; // < op timeoutSeconds 1800
const STATS_MARKER = "indexed by GitNexus as";

const REPO_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);

const log = (msg) => console.log(`reindex-api: ${msg}`);
const die = (msg) => {
  console.error(`reindex-api: ${msg}`);
  process.exit(1);
};

// --- stats-line + mtime snapshot/restore (ported from reindex-via-api.sh) ----
const snapshotFile = (abs) => {
  if (!existsSync(abs)) return null;
  let line = null;
  for (const l of readFileSync(abs, "utf8").split("\n")) {
    if (l.includes(STATS_MARKER)) {
      line = l;
      break;
    }
  }
  return { line, mtimeMs: statSync(abs).mtimeMs };
};

const restoreFile = (abs, snap) => {
  if (!snap || !existsSync(abs)) return;
  const lines = readFileSync(abs, "utf8").split("\n");
  const idx = lines.findIndex((l) => l.includes(STATS_MARKER));
  if (snap.line !== null) {
    if (idx >= 0) lines[idx] = snap.line;
    else
      die(`internal: stats marker vanished from ${abs} during job — refusing blind restore`);
  } else if (idx >= 0) {
    lines.splice(idx, 1); // line did not exist pre-job -> remove it
  } else {
    return; // nothing to restore
  }
  writeFileSync(abs, lines.join("\n"));
  utimesSync(abs, new Date(snap.mtimeMs), new Date(snap.mtimeMs));
};

// --- minimal JSON field extraction (contract-pinned, like the sh script) ----
const fieldString = (body, key) => {
  const m = body.match(new RegExp(`"${key}"\\s*:\\s*"([^"]*)"`));
  return m ? m[1] : "";
};
const fieldNumber = (body, key) => {
  const m = body.match(new RegExp(`"${key}"\\s*:\\s*([0-9]+)`));
  return m ? m[1] : "";
};

const fetchWithTimeout = async (url, opts, ms) => {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
};

// --- main --------------------------------------------------------------------
const targets = ["AGENTS.md", "CLAUDE.md"].map((f) => ({
  file: join(REPO_ROOT, f),
  snap: null,
}));
for (const t of targets) t.snap = snapshotFile(t.file);

log(`submitting analyze job for ${REPO_PATH} to ${BASE_URL} ...`);
let res;
try {
  res = await fetchWithTimeout(
    `${BASE_URL}/api/analyze`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: REPO_PATH }),
    },
    15_000,
  );
} catch (e) {
  die(`submit failed: ${e?.message ?? e}`);
}
const submitBody = await res.text();
const jobId = fieldString(submitBody, "jobId");
if (!jobId) die(`no jobId in submit response (HTTP ${res.status}): ${submitBody.slice(0, 300)}`);
log(`job ${jobId} accepted`);

const startedAt = Date.now();
let lastLine = "";
for (;;) {
  if (Date.now() - startedAt > OVERALL_TIMEOUT_MS)
    die(`overall timeout after ${Math.round(OVERALL_TIMEOUT_MS / 1000)}s (job ${jobId} still running)`);
  await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  let body;
  try {
    const poll = await fetchWithTimeout(
      `${BASE_URL}/api/analyze/${jobId}`,
      {},
      30_000,
    );
    body = await poll.text();
  } catch (e) {
    log(`poll transient failure (${e?.message ?? e}), retrying`);
    continue;
  }
  const status = fieldString(body, "status");
  if (!status) die(`cannot parse job status, raw response: ${body.slice(0, 300)}`);
  const percent = fieldNumber(body, "percent");
  const phase = fieldString(body, "phase");
  const line = `${percent || "?"}% ${phase || status}`;
  if (line !== lastLine) {
    log(line);
    lastLine = line;
  }
  if (status === "complete") {
    for (const t of targets) restoreFile(t.file, t.snap);
    const secs = Math.round((Date.now() - startedAt) / 1000);
    log(`job ${jobId} complete in ${secs}s (stats lines + mtimes restored, tree clean)`);
    process.exit(0);
  }
  if (status === "failed" || status === "error")
    die(`job ${jobId} ${status}: ${body.slice(0, 300)}`);
}
