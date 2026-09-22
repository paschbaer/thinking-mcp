import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FeatureLockRegistry } from "../../src/state/locks.js";

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "guidance-locks-")); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

describe("FeatureLockRegistry (FR-061 exclusive feature lock)", () => {
  it("acquires and releases a feature lock", () => {
    const locks = new FeatureLockRegistry(dir);
    locks.acquire("/ws/specs/001-x", "session-1");
    locks.release("/ws/specs/001-x", "session-1");
    expect(locks.holderOf("/ws/specs/001-x")).toBeUndefined();
  });

  it("rejects a second session with feature_in_use naming the holder", () => {
    const locks = new FeatureLockRegistry(dir);
    locks.acquire("/ws/specs/001-x", "session-1");
    expect(() => locks.acquire("/ws/specs/001-x", "session-2")).toThrowError(/feature_in_use.*session-1/);
  });

  it("only the holder may release the lock", () => {
    const locks = new FeatureLockRegistry(dir);
    locks.acquire("/ws/specs/001-x", "session-1");
    expect(() => locks.release("/ws/specs/001-x", "session-2")).toThrowError(/feature_in_use/);
  });

  it("persists locks across registry instances (restart survival)", () => {
    const locks1 = new FeatureLockRegistry(dir);
    locks1.acquire("/ws/specs/001-x", "session-1");
    const locks2 = new FeatureLockRegistry(dir);
    expect(locks2.holderOf("/ws/specs/001-x")).toBe("session-1");
  });

  it("reclaims stale locks of dead sessions at sweep", () => {
    const locks = new FeatureLockRegistry(dir);
    locks.acquire("/ws/specs/001-x", "session-1");
    locks.sweepDeadSessions(new Set(["session-2"]));
    expect(locks.holderOf("/ws/specs/001-x")).toBeUndefined();
  });
});
