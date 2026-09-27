/**
 * specs/009 batch 1: instructions.global slot (FR-904/905, AC-2/AC-7) +
 * adopt-reference validation helper (FR-902, AC-6).
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { composeApplication } from "../../src/main.js";
import { validateAdoptReference } from "../../src/setup/ConfigAssistant.js";

let ws: string;

function scaffoldWorkspace(withGlobalSlot?: string): ReturnType<typeof composeApplication> {
  ws = mkdtempSync(join(tmpdir(), "ws009-"));
  const fixture = join(import.meta.dirname, "../workflow/fixtures/guidance");
  const cfgDir = join(ws, ".guidance");
  mkdirSync(cfgDir, { recursive: true });
  for (const f of ["workflow.json", "responses.json", "operations.json", "downstream-servers.json", "policies.json"]) {
    let content = readFileSync(join(fixture, f), "utf-8");
    if (f === "workflow.json" && withGlobalSlot !== undefined) {
      const wf = JSON.parse(content) as Record<string, unknown>;
      wf["instructions"] = { global: withGlobalSlot };
      content = JSON.stringify(wf, null, 2);
    }
    writeFileSync(join(cfgDir, f), content);
  }
  const guidance = JSON.parse(readFileSync(join(fixture, "guidance.json"), "utf-8")) as Record<string, unknown>;
  writeFileSync(join(cfgDir, "guidance.json"), JSON.stringify(guidance, null, 2));
  mkdirSync(join(cfgDir, "schemas"), { recursive: true });
  for (const f of readdirSync(join(fixture, "schemas"))) {
    writeFileSync(join(cfgDir, "schemas", f), readFileSync(join(fixture, "schemas", f)));
  }
  return composeApplication(ws, cfgDir, join(cfgDir, "state"));
}

beforeEach(() => { ws = ""; });
afterEach(() => { if (ws) rmSync(ws, { recursive: true, force: true }); });

describe("instructions.global slot (specs/008 FR-904/905)", () => {
  it("AC-7: workflow.json WITHOUT the slot loads unchanged; session starts", async () => {
    const app = scaffoldWorkspace();
    const started = await app.engine.startWorkflow({ workspaceRoot: ws, request: "r" }) as unknown as { sessionId: string };
    const sid = started.sessionId;
    void app;
    expect(sid).toBeTruthy();
  });

  it("AC-7: invalid slot values (non-string, empty, >512) fail closed", () => {
    for (const bad of [123, "", "x".repeat(513)]) {
      const ws2 = mkdtempSync(join(tmpdir(), "ws009bad-"));
      try {
        const fixture = join(import.meta.dirname, "../workflow/fixtures/guidance");
        const cfgDir = join(ws2, ".guidance");
        mkdirSync(cfgDir, { recursive: true });
        for (const f of ["workflow.json", "responses.json", "operations.json", "downstream-servers.json", "policies.json"]) {
          let content = readFileSync(join(fixture, f), "utf-8");
          if (f === "workflow.json") {
            const wf = JSON.parse(content) as Record<string, unknown>;
            wf["instructions"] = { global: bad };
            content = JSON.stringify(wf, null, 2);
          }
          writeFileSync(join(cfgDir, f), content);
        }
        const guidanceFixture = JSON.parse(readFileSync(join(fixture, "guidance.json"), "utf-8")) as Record<string, unknown>;
        writeFileSync(join(cfgDir, "guidance.json"), JSON.stringify(guidanceFixture, null, 2));
        expect(() => composeApplication(ws2, cfgDir, join(cfgDir, "state"))).toThrowError(/instructions\.global/);
      } finally {
        rmSync(ws2, { recursive: true, force: true });
      }
    }
  });

  it("AC-2: guidanceForPublic prepends the global instruction in EVERY phase", async () => {
    const app = scaffoldWorkspace("GLOBAL SHELL SENTENCE");
    const started = await app.engine.startWorkflow({ workspaceRoot: ws, request: "r" }) as unknown as { sessionId: string };
    const sid = started.sessionId;
    void app;
    const phases = (app.config.workflow as { phases: Record<string, unknown> }).phases;
    for (const key of Object.keys(phases)) {
      const instr = app.engine.guidanceForPublic(app.engine.getSession(sid), key);
      expect(instr.instruction.startsWith("GLOBAL SHELL SENTENCE")).toBe(true);
    }
  });

  it("no slot set → instructions unchanged (prefix absent)", async () => {
    const app = scaffoldWorkspace();
    const started = await app.engine.startWorkflow({ workspaceRoot: ws, request: "r" }) as unknown as { sessionId: string };
    const sid = started.sessionId;
    void app;
    const instr = app.engine.guidanceForPublic(app.engine.getSession(sid));
    expect(instr.instruction.startsWith("GLOBAL SHELL SENTENCE")).toBe(false);
  });
});

describe("validateAdoptReference (specs/008 FR-902, AC-6)", () => {
  function makeReference(dir: string, opts?: { guidance?: Record<string, unknown> }): void {
    for (const f of ["guidance.json", "workflow.json", "policies.json", "operations.json", "downstream-servers.json"]) {
      writeFileSync(join(dir, f), JSON.stringify(opts?.guidance ?? {}));
    }
    mkdirSync(join(dir, "schemas"), { recursive: true });
  }

  it("missing reference file → configuration_invalid with adopt source pattern", () => {
    const dir = mkdtempSync(join(tmpdir(), "adoptref-"));
    try {
      writeFileSync(join(dir, "guidance.json"), "{}");
      expect(() => validateAdoptReference(dir)).toThrowError(/adopt source: missing\/unreadable file workflow\.json/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("valid reference (incl. non-plain profile file) passes", () => {
    const dir = mkdtempSync(join(tmpdir(), "adoptref-"));
    try {
      makeReference(dir);
      mkdirSync(join(dir, "profiles"), { recursive: true });
      writeFileSync(join(dir, "guidance.json"), JSON.stringify({ profile: "spec-kit" }));
      writeFileSync(join(dir, "profiles", "spec-kit.json"), "{}");
      expect(() => validateAdoptReference(dir)).not.toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("AC-5 groundwork: state/ and workspaces[] of the reference are irrelevant to validation (never copied)", () => {
    const dir = mkdtempSync(join(tmpdir(), "adoptref-"));
    try {
      makeReference(dir, { guidance: { workspaces: [{ name: "foreign", root: "/somewhere" }] } });
      mkdirSync(join(dir, "state"), { recursive: true });
      expect(() => validateAdoptReference(dir)).not.toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
