import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadCapabilityPins, saveCapabilityPins } from "../../src/workflow/WorkflowEngine.js";

/** Restart semantics for the capability-pin file (2e persistence contract):
 *  a NEW engine instance reads what a PREVIOUS instance persisted. */
describe("capability pin persistence (2e, restart across engine instances)", () => {
  it("round-trips pins: what engine A saves, engine B loads", () => {
    const stateDir = mkdtempSync(join(tmpdir(), "guidance-pins-a-"));
    saveCapabilityPins(stateDir, new Map([["g:analyze", "sha256:aaa"]]));
    // simulate a fresh process
    const reloaded = loadCapabilityPins(stateDir);
    expect(reloaded).toEqual({ "g:analyze": "sha256:aaa" });
  });

  it("merges on save: a second engine instance keeps pins it did not write", () => {
    const stateDir = mkdtempSync(join(tmpdir(), "guidance-pins-b-"));
    saveCapabilityPins(stateDir, new Map([["g:analyze", "sha256:aaa"]]));
    saveCapabilityPins(stateDir, new Map([["g:format", "sha256:bbb"]]));
    const reloaded = loadCapabilityPins(stateDir);
    expect(reloaded["g:analyze"]).toBe("sha256:aaa");
    expect(reloaded["g:format"]).toBe("sha256:bbb");
  });

  it("overwrites drifted pins with the newly observed hash", () => {
    const stateDir = mkdtempSync(join(tmpdir(), "guidance-pins-c-"));
    saveCapabilityPins(stateDir, new Map([["g:analyze", "sha256:old"]]));
    saveCapabilityPins(stateDir, new Map([["g:analyze", "sha256:new"]]));
    expect(loadCapabilityPins(stateDir)["g:analyze"]).toBe("sha256:new");
  });

  it("treats a corrupt pin file as absent (re-pin instead of failing)", () => {
    const stateDir = mkdtempSync(join(tmpdir(), "guidance-pins-d-"));
    writeFileSync(join(stateDir, "capability-hashes.json"), "{not json");
    expect(loadCapabilityPins(stateDir)).toEqual({});
    // and saving recovers the file
    saveCapabilityPins(stateDir, new Map([["g:analyze", "sha256:aaa"]]));
    expect(loadCapabilityPins(stateDir)).toEqual({ "g:analyze": "sha256:aaa" });
  });

  it("atomic write: no .tmp residue, final file valid JSON", () => {
    const stateDir = mkdtempSync(join(tmpdir(), "guidance-pins-e-"));
    saveCapabilityPins(stateDir, new Map([["g:analyze", "sha256:aaa"]]));
    expect(existsSync(join(stateDir, "capability-hashes.json.pid.tmp"))).toBe(false);
    expect(() => JSON.parse(readFileSync(join(stateDir, "capability-hashes.json"), "utf-8"))).not.toThrow();
  });
});
