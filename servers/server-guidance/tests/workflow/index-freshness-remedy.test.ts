/**
 * Remedy regression for the index-freshness gate: every failure prints an
 * agent-facing REMEDY line to stderr (surfaced VERBATIM in
 * exposedOpResult.errors[0].message). The product script is
 * deployment-agnostic: it prints the workspace-rendered command from
 * .guidance/guidance.json (gitnexus.reindexCommand) when present, otherwise
 * a generic local-CLI hint — never a deployment path. Success must NOT
 * print the remedy.
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { execFile } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const SCRIPT = join(
  import.meta.dirname,
  "../../scripts/check-index-freshness.mjs",
);

let repo: string;

/** Minimal git-shaped dir: .git/HEAD -> refs/heads/main + one source file. */
function initRepo(): void {
  mkdirSync(join(repo, ".git/refs/heads"), { recursive: true });
  writeFileSync(join(repo, ".git/HEAD"), "ref: refs/heads/main\n");
  writeFileSync(
    join(repo, ".git/refs/heads/main"),
    "0123456789abcdef0123456789abcdef01234567\n",
  );
  mkdirSync(join(repo, "src"), { recursive: true });
  writeFileSync(join(repo, "src/a.ts"), "export {};\n");
}

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), "guidance-freshness-"));
});

afterEach(() => {
  rmSync(repo, { recursive: true, force: true });
});

/** Runs the script; normalizes success (no code field) and failure (exit code). */
async function runScript(): Promise<{ code: number; stderr: string }> {
  return execFileAsync(process.execPath, [SCRIPT, repo]).then(
    (r) => ({ code: 0, stderr: r.stderr ?? "" }),
    (err) => ({ code: err.code as number, stderr: err.stderr as string }),
  );
}

describe("check-index-freshness remedy output (deployment-agnostic)", () => {
  it("stale index, reindexCommand configured: exit 1, REMEDY prints the workspace command VERBATIM", async () => {
    initRepo();
    mkdirSync(join(repo, ".guidance"), { recursive: true });
    writeFileSync(
      join(repo, ".guidance", "guidance.json"),
      JSON.stringify({
        version: 2,
        project: { name: "x" },
        gitnexus: {
          state: "required",
          mode: "compose-container",
          reindexCommand:
            "docker compose -f /somewhere/docker-compose.yml exec gitnexus-server gitnexus analyze --no-stats",
        },
      }),
    );
    const run = await runScript();
    expect(run.code).toBe(1);
    expect(run.stderr).toContain("INDEX NOT FRESH");
    expect(run.stderr).toContain("REMEDY:");
    expect(run.stderr).toContain(
      "docker compose -f /somewhere/docker-compose.yml exec gitnexus-server gitnexus analyze --no-stats",
    );
    expect(run.stderr).toContain("retry_operation");
    // deployment-agnostic: no baked-in pool path may leak
    expect(run.stderr).not.toContain("/workspaces/");
  }, 30_000);

  it("stale index, no guidance.json: generic local-CLI hint, no deployment paths", async () => {
    initRepo();
    const run = await runScript();
    expect(run.code).toBe(1);
    expect(run.stderr).toContain("REMEDY:");
    expect(run.stderr).toContain("gitnexus analyze --no-stats");
    expect(run.stderr).not.toContain("/workspaces/");
    expect(run.stderr).not.toContain("docker compose -f");
    expect(run.stderr).not.toContain("wsl.exe");
  }, 30_000);

  it("not a git repository: still fails loudly with the REMEDY line", async () => {
    writeFileSync(join(repo, "loose-file.txt"), "x\n");
    const run = await runScript();
    expect(run.code).toBe(1);
    expect(run.stderr).toContain("REMEDY:");
  }, 30_000);

  it("fresh index (mtime signal): exit 0 and NO remedy line", async () => {
    initRepo();
    mkdirSync(join(repo, ".gitnexus"), { recursive: true });
    const now = new Date();
    const later = new Date(now.getTime() + 60_000);
    const ph = join(repo, ".gitnexus/placeholder");
    writeFileSync(ph, "{}");
    utimesSync(ph, now, later); // newer than every source file
    const run = await runScript();
    expect(run.code).toBe(0);
    expect(run.stderr).not.toContain("REMEDY");
  }, 30_000);
});
