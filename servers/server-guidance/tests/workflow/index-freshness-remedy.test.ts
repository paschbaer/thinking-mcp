/**
 * CHFIX-2 regression: the index-freshness gate must fail LOUDLY — every
 * failure prints an agent-facing REMEDY line (exact host-side reindex
 * command) to stderr, which the OperationEngine surfaces VERBATIM in
 * exposedOpResult.errors[0].message. Success must NOT print the remedy.
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

describe("check-index-freshness remedy output (CHFIX-2)", () => {
  it("stale index (no .gitnexus): exit 1, stderr carries INDEX NOT FRESH and the exact host-side REMEDY command", async () => {
    initRepo();
    const run = await runScript();
    expect(run.code).toBe(1);
    expect(run.stderr).toContain("INDEX NOT FRESH");
    expect(run.stderr).toContain("REMEDY:");
    expect(run.stderr).toContain("wsl.exe");
    expect(run.stderr).toContain("gitnexus analyze --no-stats");
    expect(run.stderr).toContain("/mnt/d/repos/thinking-mcp");
    expect(run.stderr).toContain("retry_operation");
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
