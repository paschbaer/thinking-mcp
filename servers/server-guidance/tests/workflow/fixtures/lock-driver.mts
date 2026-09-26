/**
 * Driver for the workspace-lock multi-process race test (R-011).
 * Usage: tsx lock-driver.mts <lockFile> <basename> <ttlMs> <doneSentinel>
 * Acquires the lock, reports ACQUIRED/CONTENTION:<msg>, then — while holding —
 * waits for the done sentinel (created by the parent once every racer has
 * reported), releases, and reports RELEASED.
 */
import { existsSync } from "node:fs";
import { WorkspaceOpLock } from "../../../src/workflow/workspace-lock.js";

const [file, basename, ttl, sentinel] = process.argv.slice(2) as [string, string, string, string];
const lock = new WorkspaceOpLock(file, basename, Number(ttl));
try {
  lock.acquire();
  console.log("ACQUIRED");
  const started = Date.now();
  while (!existsSync(sentinel) && Date.now() - started < 10_000) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
  }
  lock.release();
  console.log("RELEASED");
} catch (err) {
  console.log(`CONTENTION:${(err as Error).message}`);
}
