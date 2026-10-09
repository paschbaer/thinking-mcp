/**
 * Contract test for the guidance-side auto-reindex operation script
 * (.guidance/scripts/reindex-api.mjs): runs the REAL script as a child
 * process against a stub gitnexus HTTP API (submit + poll) with a temp
 * repo-shaped directory, and verifies the stats-line + mtime restore that
 * keeps the tree clean (the API has no no-stats option).
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { execFile } from "node:child_process";
import { createServer } from "node:http";
import type { Server } from "node:http";
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
  readFileSync,
  utimesSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const SCRIPT = join(
  import.meta.dirname,
  "../../../../.guidance/scripts/reindex-api.mjs",
);

let dir: string;
let server: Server;
let port: number;
let calls: { method: string; url: string }[];

/** Repo-shaped dir with AGENTS.md carrying a stats line + fixed mtime. */
const PRE_LINE =
  "This repository is indexed by GitNexus as **thinking-mcp** with 100 nodes.";
const POST_LINE =
  "This repository is indexed by GitNexus as **thinking-mcp** with 200 nodes.";

function initRepo(): string {
  const root = join(dir, "repo");
  mkdirSync(join(root, ".guidance", "scripts"), { recursive: true });
  // the script resolves the repo root from ITS OWN location — copy it there
  writeFileSync(join(root, ".guidance", "scripts", "reindex-api.mjs"), readFileSync(SCRIPT, "utf8"));
  writeFileSync(
    join(root, "AGENTS.md"),
    `# Test\n\n${PRE_LINE}\n\nother content\n`,
  );
  const fixed = new Date("2026-01-01T00:00:00Z");
  utimesSync(join(root, "AGENTS.md"), fixed, fixed);
  return root;
}

/** Stub gitnexus API: job goes complete after one poll; POST rewrites stats. */
function startStub(repoRoot: string): Promise<Server> {
  return new Promise((resolve) => {
    let polls = 0;
    server = createServer((req, res) => {
      calls.push({ method: req.method ?? "?", url: req.url ?? "?" });
      if (req.method === "POST" && req.url === "/api/analyze") {
        // simulate the API rewriting the stats line (no no-stats option)
        const content = readFileSync(join(repoRoot, "AGENTS.md"), "utf8");
        writeFileSync(
          join(repoRoot, "AGENTS.md"),
          content.replace(PRE_LINE, POST_LINE),
        );
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ jobId: "job-1", status: "cloning" }));
        return;
      }
      if (req.method === "GET" && req.url === "/api/analyze/job-1") {
        polls += 1;
        res.setHeader("content-type", "application/json");
        res.end(
          JSON.stringify({
            id: "job-1",
            status: polls >= 2 ? "complete" : "analyzing",
            repoPath: "/mnt/d/repos/test",
            progress: { percent: polls >= 2 ? 100 : 10, phase: "parsing" },
          }),
        );
        return;
      }
      res.statusCode = 404;
      res.end("{}");
    });
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      port = typeof addr === "object" && addr ? addr.port : 0;
      resolve(server);
    });
  });
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "gn-reindex-op-"));
  calls = [];
});

afterEach(async () => {
  await new Promise((r) => {
    if (server?.listening) server.close(() => r(null));
    else r(null);
  });
  rmSync(dir, { recursive: true, force: true });
}, 15_000);

async function runScript(repoRoot: string): Promise<{ code: number; stderr: string }> {
  return execFileAsync(
    process.execPath,
    [join(repoRoot, ".guidance", "scripts", "reindex-api.mjs")],
    {
      env: {
        ...process.env,
        GITNEXUS_API_URL: `http://127.0.0.1:${port}`,
        REPO_PATH: "/mnt/d/repos/test",
      },
    },
  ).then(
    (r) => ({ code: 0, stderr: r.stderr ?? "" }),
    (err) => ({ code: err.code as number, stderr: err.stderr as string }),
  );
}

describe("reindex-api.mjs operation script (contract)", () => {
  it("happy path: submits, polls to complete, restores stats line AND mtime (tree stays clean)", async () => {
    const repoRoot = initRepo();
    const before = statSync(join(repoRoot, "AGENTS.md")).mtimeMs;
    await startStub(repoRoot);
    const run = await runScript(repoRoot);
    expect(run.code).toBe(0);
    // API rewrote the line; the script must have restored the pre-job line
    const content = readFileSync(join(repoRoot, "AGENTS.md"), "utf8");
    expect(content).toContain(PRE_LINE);
    expect(content).not.toContain(POST_LINE);
    // mtime restored to sub-second precision
    expect(statSync(join(repoRoot, "AGENTS.md")).mtimeMs).toBe(before);
    // API traffic: one submit + at least two polls
    const submits = calls.filter((c) => c.method === "POST").length;
    const polls = calls.filter((c) => c.method === "GET").length;
    expect(submits).toBe(1);
    expect(polls).toBeGreaterThanOrEqual(2);
  }, 30_000);

  it("failed job: exit 1 with the job status surfaced", async () => {
    const repoRoot = initRepo();
    // stub that fails on first poll
    await new Promise<void>((resolve) => {
      server = createServer((req, res) => {
        if (req.method === "POST" && req.url === "/api/analyze") {
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify({ jobId: "job-2", status: "cloning" }));
        } else {
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify({ id: "job-2", status: "failed", error: "boom" }));
        }
      });
      server.listen(0, "127.0.0.1", () => {
        const addr = server.address();
        port = typeof addr === "object" && addr ? addr.port : 0;
        resolve();
      });
    });
    const run = await runScript(repoRoot);
    expect(run.code).toBe(1);
    expect(run.stderr).toContain("failed");
    // restore must NOT have run on failure — the stub never rewrote the file,
    // but the invariant is: content unchanged either way
    expect(readFileSync(join(repoRoot, "AGENTS.md"), "utf8")).toContain(PRE_LINE);
  }, 30_000);

  it("unreachable server: submit failure exits 1 fast (no hang)", async () => {
    const repoRoot = initRepo();
    // no stub — point at a dead port
    port = 1;
    const run = await runScript(repoRoot);
    expect(run.code).toBe(1);
    expect(run.stderr).toContain("submit failed");
  }, 30_000);
});
