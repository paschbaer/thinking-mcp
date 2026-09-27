/**
 * specs/008 T11+T12 (FR-804): workspace-op locks are scoped per workspace
 * identity (realpath-based key, FR-502/L-4) — different workspaces make
 * progress in parallel, the same workspace stays mutually exclusive.
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, basename } from "node:path";
import { WorkspaceOpLock, workspaceLockFile } from "../../src/workflow/workspace-lock.js";

let stateDir: string;
let wsA: string;
let wsB: string;

beforeEach(() => {
  stateDir = mkdtempSync(join(tmpdir(), "lockscope-"));
  wsA = mkdtempSync(join(tmpdir(), "wsa-"));
  wsB = mkdtempSync(join(tmpdir(), "wsb-"));
});

afterEach(() => {
  rmSync(stateDir, { recursive: true, force: true });
  rmSync(wsA, { recursive: true, force: true });
  rmSync(wsB, { recursive: true, force: true });
});

describe("per-workspace lock scoping (specs/008 FR-804)", () => {
  it("T11: distinct roots produce distinct lock files; realpath-equal aliases share one", () => {
    const fileA = workspaceLockFile(stateDir, wsA);
    const fileB = workspaceLockFile(stateDir, wsB);
    expect(fileA).not.toBe(fileB);
    expect(basename(fileA)).toMatch(/^workspace-ops\.[0-9a-f]{16}\.lock$/);
    // Symlink alias collapses onto wsA's key (L-4 realpath).
    const alias = join(stateDir, "alias-a");
    symlinkSync(wsA, alias, "junction");
    expect(workspaceLockFile(stateDir, alias)).toBe(fileA);
  });

  it("T12: different workspaces make parallel progress (no cross-workspace exclusion)", () => {
    const lockA = new WorkspaceOpLock(workspaceLockFile(stateDir, wsA), "workspace-ops", 60000);
    const lockB = new WorkspaceOpLock(workspaceLockFile(stateDir, wsB), "workspace-ops", 60000);
    lockA.acquire();
    // Acquiring B while A is held must succeed → parallel progress (AC-1).
    expect(() => lockB.acquire()).not.toThrow();
    lockB.release();
    lockA.release();
  });

  it("T12: same workspace stays mutually exclusive across lock instances", () => {
    const lockA1 = new WorkspaceOpLock(workspaceLockFile(stateDir, wsA), "workspace-ops", 60000);
    const lockA2 = new WorkspaceOpLock(workspaceLockFile(stateDir, wsA), "workspace-ops", 60000);
    lockA1.acquire();
    const second = new WorkspaceOpLock(workspaceLockFile(stateDir, wsA), "workspace-ops", 60000);
    expect(() => second.acquire()).toThrow();
    lockA1.release();
  });

  it("T11: child-engine state dirs (child workspace) get their own key space", () => {
    const childState = join(wsB, '.guidance', 'state');
    mkdirSync(childState, { recursive: true });
    const fileParent = workspaceLockFile(stateDir, wsB);
    const fileChild = workspaceLockFile(childState, wsB);
    // Different stateDirs (parent vs child repo) never share a lock file;
    // within one stateDir the key is purely the workspace root.
    expect(fileParent).not.toBe(fileChild);
    expect(workspaceLockFile(childState, wsB)).toBe(fileChild);
  });
});
