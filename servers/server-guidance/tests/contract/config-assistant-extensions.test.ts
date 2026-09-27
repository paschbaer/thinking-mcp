/**
 * specs/009 batch 1: instructions.global slot (FR-904/905, AC-2/AC-7) +
 * adopt-reference validation helper (FR-902, AC-6).
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  mkdtempSync,
  rmSync,
  mkdirSync,
  writeFileSync,
  readdirSync,
  readFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { composeApplication } from "../../src/main.js";
import {
  catalogOverview,
  generateFiles,
  validateAdoptReference,
} from "../../src/setup/ConfigAssistant.js";

let ws: string;

function scaffoldWorkspace(
  withGlobalSlot?: string,
): ReturnType<typeof composeApplication> {
  ws = mkdtempSync(join(tmpdir(), "ws009-"));
  const fixture = join(import.meta.dirname, "../workflow/fixtures/guidance");
  const cfgDir = join(ws, ".guidance");
  mkdirSync(cfgDir, { recursive: true });
  for (const f of [
    "workflow.json",
    "responses.json",
    "operations.json",
    "downstream-servers.json",
    "policies.json",
  ]) {
    let content = readFileSync(join(fixture, f), "utf-8");
    if (f === "workflow.json" && withGlobalSlot !== undefined) {
      const wf = JSON.parse(content) as Record<string, unknown>;
      wf["instructions"] = { global: withGlobalSlot };
      content = JSON.stringify(wf, null, 2);
    }
    writeFileSync(join(cfgDir, f), content);
  }
  const guidance = JSON.parse(
    readFileSync(join(fixture, "guidance.json"), "utf-8"),
  ) as Record<string, unknown>;
  writeFileSync(
    join(cfgDir, "guidance.json"),
    JSON.stringify(guidance, null, 2),
  );
  mkdirSync(join(cfgDir, "schemas"), { recursive: true });
  for (const f of readdirSync(join(fixture, "schemas"))) {
    writeFileSync(
      join(cfgDir, "schemas", f),
      readFileSync(join(fixture, "schemas", f)),
    );
  }
  return composeApplication(ws, cfgDir, join(cfgDir, "state"));
}

beforeEach(() => {
  ws = "";
});
afterEach(() => {
  if (ws) rmSync(ws, { recursive: true, force: true });
});

describe("instructions.global slot (specs/008 FR-904/905)", () => {
  it("AC-7: workflow.json WITHOUT the slot loads unchanged; session starts", async () => {
    const app = scaffoldWorkspace();
    const started = (await app.engine.startWorkflow({
      workspaceRoot: ws,
      request: "r",
    })) as unknown as { sessionId: string };
    const sid = started.sessionId;
    void app;
    expect(sid).toBeTruthy();
  });

  it("AC-7: invalid slot values (non-string, empty, >512) fail closed", () => {
    for (const bad of [123, "", "x".repeat(513)]) {
      const ws2 = mkdtempSync(join(tmpdir(), "ws009bad-"));
      try {
        const fixture = join(
          import.meta.dirname,
          "../workflow/fixtures/guidance",
        );
        const cfgDir = join(ws2, ".guidance");
        mkdirSync(cfgDir, { recursive: true });
        for (const f of [
          "workflow.json",
          "responses.json",
          "operations.json",
          "downstream-servers.json",
          "policies.json",
        ]) {
          let content = readFileSync(join(fixture, f), "utf-8");
          if (f === "workflow.json") {
            const wf = JSON.parse(content) as Record<string, unknown>;
            wf["instructions"] = { global: bad };
            content = JSON.stringify(wf, null, 2);
          }
          writeFileSync(join(cfgDir, f), content);
        }
        const guidanceFixture = JSON.parse(
          readFileSync(join(fixture, "guidance.json"), "utf-8"),
        ) as Record<string, unknown>;
        writeFileSync(
          join(cfgDir, "guidance.json"),
          JSON.stringify(guidanceFixture, null, 2),
        );
        expect(() =>
          composeApplication(ws2, cfgDir, join(cfgDir, "state")),
        ).toThrowError(/instructions\.global/);
      } finally {
        rmSync(ws2, { recursive: true, force: true });
      }
    }
  });

  it("AC-2: guidanceForPublic prepends the global instruction in EVERY phase", async () => {
    const app = scaffoldWorkspace("GLOBAL SHELL SENTENCE");
    const started = (await app.engine.startWorkflow({
      workspaceRoot: ws,
      request: "r",
    })) as unknown as { sessionId: string };
    const sid = started.sessionId;
    void app;
    const phases = (app.config.workflow as { phases: Record<string, unknown> })
      .phases;
    for (const key of Object.keys(phases)) {
      const instr = app.engine.guidanceForPublic(
        app.engine.getSession(sid),
        key,
      );
      expect(instr.instruction.startsWith("GLOBAL SHELL SENTENCE")).toBe(true);
    }
  });

  it("no slot set → instructions unchanged (prefix absent)", async () => {
    const app = scaffoldWorkspace();
    const started = (await app.engine.startWorkflow({
      workspaceRoot: ws,
      request: "r",
    })) as unknown as { sessionId: string };
    const sid = started.sessionId;
    void app;
    const instr = app.engine.guidanceForPublic(app.engine.getSession(sid));
    expect(instr.instruction.startsWith("GLOBAL SHELL SENTENCE")).toBe(false);
  });
});

describe("validateAdoptReference (specs/008 FR-902, AC-6)", () => {
  function makeReference(
    dir: string,
    opts?: { guidance?: Record<string, unknown> },
  ): void {
    for (const f of [
      "guidance.json",
      "workflow.json",
      "policies.json",
      "operations.json",
      "downstream-servers.json",
    ]) {
      writeFileSync(join(dir, f), JSON.stringify(opts?.guidance ?? {}));
    }
    mkdirSync(join(dir, "schemas"), { recursive: true });
  }

  it("missing reference file → configuration_invalid with adopt source pattern", () => {
    const dir = mkdtempSync(join(tmpdir(), "adoptref-"));
    try {
      writeFileSync(join(dir, "guidance.json"), "{}");
      expect(() => validateAdoptReference(dir)).toThrowError(
        /adopt source: missing\/unreadable file workflow\.json/,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("valid reference (incl. non-plain profile file) passes", () => {
    const dir = mkdtempSync(join(tmpdir(), "adoptref-"));
    try {
      makeReference(dir);
      mkdirSync(join(dir, "profiles"), { recursive: true });
      writeFileSync(
        join(dir, "guidance.json"),
        JSON.stringify({ profile: "spec-kit" }),
      );
      writeFileSync(join(dir, "profiles", "spec-kit.json"), "{}");
      expect(() => validateAdoptReference(dir)).not.toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("AC-5 groundwork: state/ and workspaces[] of the reference are irrelevant to validation (never copied)", () => {
    const dir = mkdtempSync(join(tmpdir(), "adoptref-"));
    try {
      makeReference(dir, {
        guidance: { workspaces: [{ name: "foreign", root: "/somewhere" }] },
      });
      mkdirSync(join(dir, "state"), { recursive: true });
      expect(() => validateAdoptReference(dir)).not.toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("configSource adopt flow (specs/009 T4, FR-901/903/909/910)", () => {
  function makeReference(dir: string): void {
    for (const f of [
      "guidance.json",
      "workflow.json",
      "policies.json",
      "operations.json",
      "downstream-servers.json",
    ]) {
      writeFileSync(
        join(dir, f),
        JSON.stringify({
          profile: "plain",
          project: { name: "reference-project" },
          operations: {
            lint: { type: "process" },
            test: { type: "process" },
            build: { type: "process" },
            "capture-session-lessons": { type: "mcpTool" },
            "repository-analysis": { type: "composite" },
            "legacy-custom-op": {
              type: "process",
              args: ["x", { repo: "thinking-mcp" }],
            },
          },
          instructions: { global: "OLD REFERENCE SHELL" },
        }),
      );
    }
    mkdirSync(join(dir, "schemas"), { recursive: true });
    writeFileSync(join(dir, "schemas", "understand.schema.json"), "{}");
  }

  it("catalog exposes configSource with fresh/adopt", () => {
    void ws;
    const cat = catalogOverview({});
    const q = cat.questions.find((x) => x.id === "configSource");
    expect(q).toBeTruthy();
    expect((q as { options?: string[] }).options).toEqual(["fresh", "adopt"]);
  });

  it("adopt: reference workflow adopted + shell in instructions.global; legacy ops on adaptation list (AC-1/AC-9)", () => {
    void ws;
    const ref = mkdtempSync(join(tmpdir(), "adoptref-"));
    const target = mkdtempSync(join(tmpdir(), "adopter-"));
    makeReference(ref);
    try {
      const { files, notes } = generateFiles({
        configSource: "adopt",
        referencePath: ref,
        projectName: "target-repo",
        transport: "stdio",
        shell: "TARGET SHELL",
      });
      const byPath = Object.fromEntries(files.map((f) => [f.path, f.content]));
      const wf = JSON.parse(byPath["workflow.json"]!) as {
        instructions?: { global?: string };
      };
      expect(wf.instructions?.global).toBe("TARGET SHELL");
      expect(byPath["workflow.json"]).not.toContain("OLD REFERENCE SHELL");
      // AC-9: reference project name must not leak into regenerated files
      expect(byPath["guidance.json"]!).toContain("target-repo");
      expect(byPath["guidance.json"]).not.toContain("reference-project");
      // AD-1: non-generic reference ops are now COPIED with an adoption marker
      expect(byPath["operations.json"]!).toContain("legacy-custom-op");
      expect(byPath["operations.json"]!).toContain(
        "[adopted from reference — review args/paths]",
      );
      expect(notes.join(" ")).toContain("legacy-custom-op");
      // adoption block present
      const guidance = JSON.parse(byPath["guidance.json"]!) as {
        adoption?: Record<string, unknown>;
      };
      expect(guidance.adoption).toBeTruthy();
    } finally {
      rmSync(ref, { recursive: true, force: true });
      rmSync(target, { recursive: true, force: true });
    }
  });

  it("AD-1/RV-M1: reference op without valid type is rejected fail-closed", () => {
    void ws;
    const ref = mkdtempSync(join(tmpdir(), "adoptref-"));
    try {
      for (const f of ["guidance.json", "policies.json", "downstream-servers.json"]) writeFileSync(join(ref, f), "{}");
      mkdirSync(join(ref, "schemas"), { recursive: true });
      writeFileSync(join(ref, "guidance.json"), JSON.stringify({ profile: "plain" }));
      writeFileSync(join(ref, "workflow.json"), "{}");
      writeFileSync(join(ref, "operations.json"), JSON.stringify({
        operations: { "broken-op": { description: "no type field" } },
      }));
      expect(() => generateFiles({
        configSource: "adopt",
        referencePath: ref,
        projectName: "t",
        transport: "stdio",
      })).toThrowError(/adopt source: reference op broken-op has no valid type/);
    } finally {
      rmSync(ref, { recursive: true, force: true });
    }
  });

  it("adopt coherence: workflow op missing from regenerated operations fails closed (N-2)", () => {
    void ws;
    const ref = mkdtempSync(join(tmpdir(), "adoptref-"));
    try {
      for (const f of [
        "guidance.json",
        "policies.json",
        "downstream-servers.json",
      ])
        writeFileSync(join(ref, f), "{}");
      mkdirSync(join(ref, "schemas"), { recursive: true });
      writeFileSync(
        join(ref, "workflow.json"),
        JSON.stringify({
          phases: {
            understand: { lifecycle: { beforeExit: ["nonexistent-op"] } },
          },
        }),
      );
      // op is NOT in the reference operations.json → cannot be copied → coherence still fails closed (AD-1)
      writeFileSync(
        join(ref, "operations.json"),
        JSON.stringify({ operations: {} }),
      );
      expect(() =>
        generateFiles({
          configSource: "adopt",
          referencePath: ref,
          projectName: "t",
          transport: "stdio",
          gates: "minimal",
          insight: false,
          gitnexus: false,
        }),
      ).toThrowError(
        /adopt coherence: workflow references unknown op nonexistent-op/,
      );
    } finally {
      rmSync(ref, { recursive: true, force: true });
    }
  });

  it("AD-1: realistic reference (beforeExit with non-generic gates) generates without configuration_invalid — ops copied with marker", () => {
    void ws;
    const ref = mkdtempSync(join(tmpdir(), "adoptref-"));
    try {
      for (const f of [
        "guidance.json",
        "policies.json",
        "downstream-servers.json",
      ])
        writeFileSync(join(ref, f), "{}");
      mkdirSync(join(ref, "schemas"), { recursive: true });
      writeFileSync(
        join(ref, "guidance.json"),
        JSON.stringify({ profile: "plain" }),
      );
      writeFileSync(
        join(ref, "workflow.json"),
        JSON.stringify({
          phases: {
            complete: {
              lifecycle: {
                beforeExit: [
                  "docs-drift",
                  "final-review-gate",
                  "index-freshness",
                ],
              },
            },
          },
        }),
      );
      writeFileSync(
        join(ref, "operations.json"),
        JSON.stringify({
          operations: {
            "docs-drift": {
              type: "process",
              executable: "node",
              args: ["scripts/check-docs-drift.mjs", "."],
              description: "Docs drift gate",
            },
            "final-review-gate": {
              type: "process",
              executable: "node",
              args: ["scripts/check-final-review.mjs", "."],
            },
            "index-freshness": {
              type: "process",
              executable: "node",
              args: ["scripts/check-index-freshness.mjs", "."],
            },
          },
        }),
      );
      const { files } = generateFiles({
        configSource: "adopt",
        referencePath: ref,
        projectName: "t",
        transport: "stdio",
      });
      const byPath = Object.fromEntries(files.map((f) => [f.path, f.content]));
      const ops = JSON.parse(byPath["operations.json"]!) as {
        operations: Record<string, { description?: string }>;
      };
      for (const opId of [
        "docs-drift",
        "final-review-gate",
        "index-freshness",
      ]) {
        expect(ops.operations[opId], `op ${opId} copied`).toBeTruthy();
        expect(ops.operations[opId]!.description).toContain(
          "[adopted from reference",
        );
      }
      // generic ops survive regeneration untouched (no marker)
      expect(ops.operations["build"]).toBeTruthy();
      expect(ops.operations["build"]!.description ?? "").not.toContain(
        "[adopted from reference",
      );
    } finally {
      rmSync(ref, { recursive: true, force: true });
    }
  });
});
