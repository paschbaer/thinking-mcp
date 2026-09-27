import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, symlinkSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WorkspaceRegistry } from "../../src/workspace-registry.js";
import { GuidanceError } from "../../src/types/errors.js";
import { loadConfig } from "../../src/config.js";

let ws: string;
beforeEach(() => { ws = mkdtempSync(join(tmpdir(), "wsreg-")); });
afterEach(() => { rmSync(ws, { recursive: true, force: true }); });

describe("WorkspaceRegistry (specs/008 FR-801/802/806)", () => {
  it("default fallback: missing workspaces[] yields exactly one 'default' entry on the workspace root (AC-3)", () => {
    const reg = WorkspaceRegistry.build(undefined, ws);
    expect(reg.default.name).toBe("default");
    expect(reg.default.root).toBe(realpathSync(ws));
    expect(reg.resolve(ws).name).toBe("default");
  });

  it("resolves by name and by realpath-exact root; projectName defaults to name", () => {
    const other = join(ws, "other");
    mkdirSync(other);
    const reg = WorkspaceRegistry.build([
      { name: "main", root: ws },
      { name: "other", root: other, projectName: "Other Project" },
    ], ws);
    expect(reg.resolve("other")).toMatchObject({ projectName: "Other Project" });
    expect(reg.resolve(other).name).toBe("other");
    expect(reg.list()).toHaveLength(2);
  });

  it("rejects unknown names/paths with workspace_not_registered (AC-2)", () => {
    const reg = WorkspaceRegistry.build(undefined, ws);
    expect(() => reg.resolve("niyama")).toThrow(GuidanceError);
    expect(() => reg.resolve("niyama")).toThrow(/not registered/);
    const foreign = mkdtempSync(join(tmpdir(), "foreign-"));
    try { expect(() => reg.resolve(foreign)).toThrow(/not registered/); } finally { rmSync(foreign, { recursive: true, force: true }); }
  });

  it("A1 hardening: sub-paths of a registered root are rejected (old check accepted them)", () => {
    const sub = join(ws, "sub");
    mkdirSync(sub);
    const reg = WorkspaceRegistry.build(undefined, ws);
    expect(() => reg.resolve(sub)).toThrow(/not registered/);
  });

  it("fail-closed build: invalid name, relative root, missing root, duplicate name, duplicate root via symlink", () => {
    expect(() => WorkspaceRegistry.build([{ name: "Bad_Name", root: ws }], ws)).toThrow(/invalid name/);
    expect(() => WorkspaceRegistry.build([{ name: "x", root: "./rel" }], ws)).toThrow(/absolute/);
    expect(() => WorkspaceRegistry.build([{ name: "x", root: join(ws, "missing") }], ws)).toThrow(/does not exist/);
    expect(() => WorkspaceRegistry.build([
      { name: "a", root: ws }, { name: "a", root: ws },
    ], ws)).toThrow(/duplicate name/);
    const link = join(ws, "link");
    symlinkSync(ws, link, "junction");
    expect(() => WorkspaceRegistry.build([
      { name: "a", root: ws }, { name: "b", root: link },
    ], ws)).toThrow(/duplicate root/);
  });

  it("configurationVersion: registry content feeds the hash (AC-5 prefix); identical config → identical hash", () => {
    const cfgDir = join(ws, ".guidance");
    mkdirSync(cfgDir);
    const other = join(ws, "other");
    mkdirSync(other);
    const write = (workspaces: unknown) =>
      writeFileSync(join(cfgDir, "guidance.json"), JSON.stringify({ version: 2, project: { name: "t" }, workspaces }));
    write(undefined);
    const without = loadConfig(cfgDir, { workspaceRoot: ws });
    write([{ name: "other", root: other }]);
    const withReg = loadConfig(cfgDir, { workspaceRoot: ws });
    const again = loadConfig(cfgDir, { workspaceRoot: ws });
    expect(withReg.configVersion).not.toBe(without.configVersion);
    expect(again.configVersion).toBe(withReg.configVersion);
    expect(withReg.workspaces.resolve("other").name).toBe("other");
  });
});
