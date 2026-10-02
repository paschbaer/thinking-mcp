/**
 * seed-lessons.mjs gate semantics (capture-session-lessons contract):
 * - MISSING lessons file  -> exit 1 with an explicit "review step skipped"
 *   message (fail-closed: the agent must ALWAYS create the file)
 * - EMPTY array ([]->     -> exit 0 no-op, without contacting any server
 * Both paths are exercised BEFORE the MCP transport is opened, so no server
 * is needed here.
 */
import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SCRIPT = join(import.meta.dirname, "../../scripts/seed-lessons.mjs");

function run(file: string) {
  return spawnSync(process.execPath, [SCRIPT, file], {
    encoding: "utf-8",
    timeout: 30_000,
  });
}

describe("seed-lessons.mjs gate semantics", () => {
  it("fails with an explicit message when the lessons file is MISSING", () => {
    const dir = mkdtempSync(join(tmpdir(), "seed-lessons-"));
    const missing = join(dir, "session-lessons.json");
    const r = run(missing);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/lessons file not found/);
    expect(r.stderr).toMatch(/ALWAYS create/);
    expect(r.stdout).not.toMatch(/DONE/);
  });

  it("treats an empty array as a no-op success without contacting a server", () => {
    const dir = mkdtempSync(join(tmpdir(), "seed-lessons-"));
    const file = join(dir, "session-lessons.json");
    writeFileSync(file, "[]");
    const r = run(file);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/empty lessons file/);
  });
});
