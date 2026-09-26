import { describe, expect, it } from "vitest";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * R-011 (final review feature 003): concurrent multi-process acquisition of
 * a stale (dead-owner) workspace lock must yield EXACTLY one holder — the
 * old blind-unlink steal allowed two processes to hold simultaneously.
 */
const DRIVER = join(import.meta.dirname, "fixtures/lock-driver.mts");

function race(lockFile: string, ttlMs: number, racers: number, sentinel: string): Promise<{ out: string[] }[]> {
  const children = Array.from({ length: racers }, () =>
    spawn("npx", ["tsx", DRIVER, lockFile, "workspace-ops.lock", String(ttlMs), sentinel], {
      cwd: join(import.meta.dirname, "../.."),
    }),
  );
  const collected = children.map(
    (child) =>
      new Promise<{ out: string[] }>((resolveChild) => {
        const out: string[] = [];
        let buffer = "";
        child.stdout?.on("data", (chunk: Buffer | string) => {
          buffer += chunk.toString();
          let idx: number;
          while ((idx = buffer.indexOf("\n")) !== -1) {
            const line = buffer.slice(0, idx).trim();
            buffer = buffer.slice(idx + 1);
            if (line) out.push(line);
          }
        });
        child.on("close", () => resolveChild({ out }));
      }),
  );
  // once every racer reported its first line, let the winner release
  return Promise.all(collected).then((results) => {
    writeFileSync(sentinel, "done");
    return results;
  });
}

describe("workspace lock race safety (R-011, multi-process)", () => {
  it("exactly one of N concurrent racers holds a dead-owner lock; no double-hold, no residue", async () => {
    const dir = mkdtempSync(join(tmpdir(), "guidance-lock-race-"));
    const lockFile = join(dir, "workspace-ops.lock");
    writeFileSync(lockFile, "999999999"); // dead owner → stale
    const sentinel = join(dir, "done.sentinel");
    const RACERS = 6;
    const results = await race(lockFile, 120_000, RACERS, sentinel);
    const acquired = results.filter((r) => r.out.includes("ACQUIRED")).length;
    const contention = results.filter((r) => r.out.some((l) => l.startsWith("CONTENTION:"))).length;
    expect(acquired).toBe(1);
    expect(contention).toBe(RACERS - 1);
    // winner releases after sentinel → lock gone, no quarantine residue
    expect(existsSync(lockFile)).toBe(false);
    const residue = readdirSync(dir).filter((f) => f.includes(".stolen."));
    expect(residue).toEqual([]);
    rmSync(dir, { recursive: true, force: true });
  }, 60_000);
});
