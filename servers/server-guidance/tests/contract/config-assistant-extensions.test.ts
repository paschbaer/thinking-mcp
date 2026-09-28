/**
 * specs/009 batch 1: instructions.global slot (FR-904/905, AC-2/AC-7) +
 * adopt-reference validation helper (FR-902, AC-6).
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  rmSync,
  mkdirSync,
  writeFileSync,
  readdirSync,
  readFileSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { composeApplication } from "../../src/main.js";
import {
  buildResponses,
  catalogOverview,
  generateFiles,
  nextQuestion,
  resolveBuiltinReferencePath,
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
      "responses.json",
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
      "responses.json",
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
      writeFileSync(join(ref, "workflow.json"), "{}");
      writeFileSync(join(ref, "responses.json"), "{}");
      writeFileSync(
        join(ref, "operations.json"),
        JSON.stringify({
          operations: { "broken-op": { description: "no type field" } },
        }),
      );
      expect(() =>
        generateFiles({
          configSource: "adopt",
          referencePath: ref,
          projectName: "t",
          transport: "stdio",
        }),
      ).toThrowError(/adopt source: reference op broken-op has no valid type/);
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
      writeFileSync(
        join(ref, "responses.json"),
        JSON.stringify({ version: 2, responses: { understand: {} } }),
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
        join(ref, "responses.json"),
        JSON.stringify({ version: 2, responses: { complete: {} } }),
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

describe("builtin adopt template (specs/011 FR-971..974, AC-1..AC-4)", () => {
  const ENV_KEY = "GUIDANCE_BUILTIN_TEMPLATE_DIR";
  let savedEnv: string | undefined;

  beforeEach(() => {
    savedEnv = process.env[ENV_KEY];
    delete process.env[ENV_KEY];
  });
  afterEach(() => {
    if (savedEnv === undefined) delete process.env[ENV_KEY];
    else process.env[ENV_KEY] = savedEnv;
  });

  it("FR-971: resolveBuiltinReferencePath defaults to PKG_ROOT/examples/default-guidance (exists)", () => {
    const p = resolveBuiltinReferencePath();
    expect(p.replace(/\\/g, "/")).toContain("examples/default-guidance");
    expect(existsSync(p)).toBe(true);
  });

  it("FR-971: env override GUIDANCE_BUILTIN_TEMPLATE_DIR is honored", () => {
    const dir = mkdtempSync(join(tmpdir(), "builtin-override-"));
    try {
      process.env[ENV_KEY] = dir;
      expect(resolveBuiltinReferencePath()).toBe(dir);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('FR-971: validateAdoptReference("builtin") passes against the shipped template', () => {
    expect(() => validateAdoptReference("builtin")).not.toThrow();
  });

  it("FR-971/F-01: env override also governs embedded schemas (generateFiles)", () => {
    void ws;
    const dir = mkdtempSync(join(tmpdir(), "builtin-override-schemas-"));
    try {
      mkdirSync(join(dir, "schemas"), { recursive: true });
      for (const s of [
        "understand",
        "plan",
        "review-plan",
        "implement",
        "review-implementation",
        "verify",
        "complete",
      ])
        writeFileSync(
          join(dir, "schemas", `${s}.schema.json`),
          JSON.stringify({ marker: "override-template" }),
        );
      process.env[ENV_KEY] = dir;
      const { files } = generateFiles({
        configSource: "fresh",
        projectName: "t",
        transport: "stdio",
        profile: "plain",
        insight: false,
        gitnexus: false,
        gates: "standard",
      });
      const understand = files.find(
        (f) => f.path === "schemas/understand.schema.json",
      );
      expect(understand).toBeTruthy();
      expect(understand!.content).toContain("override-template");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("FR-973: builtin fail-closed when the template is missing (env override to empty dir)", () => {
    const dir = mkdtempSync(join(tmpdir(), "builtin-missing-"));
    try {
      process.env[ENV_KEY] = dir;
      expect(() => validateAdoptReference("builtin")).toThrowError(
        /adopt source: missing\/unreadable file guidance\.json/,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  function generateBuiltin(referencePath?: string) {
    return generateFiles({
      configSource: "adopt",
      ...(referencePath !== undefined ? { referencePath } : {}),
      projectName: "target-repo",
      transport: "stdio",
    });
  }

  it("AC-1: adopt WITHOUT referencePath uses builtin (full file set, audit block)", () => {
    void ws;
    const { files, notes } = generateBuiltin();
    const byPath = Object.fromEntries(files.map((f) => [f.path, f.content]));
    for (const f of [
      "guidance.json",
      "workflow.json",
      "policies.json",
      "responses.json",
      "operations.json",
      "downstream-servers.json",
    ])
      expect(byPath[f], `${f} generated`).toBeTruthy();
    const guidance = JSON.parse(byPath["guidance.json"]!) as {
      adoption?: Record<string, unknown>;
    };
    expect(guidance.adoption?.["source"]).toBe("builtin");
    expect(String(guidance.adoption?.["resolvedPath"])).toContain(
      "default-guidance",
    );
    expect(notes.join(" ")).toContain("builtin");
  });

  it("AC-2: explicit referencePath='builtin' is equivalent to omitting it", () => {
    void ws;
    const implicit = generateBuiltin();
    const explicit = generateBuiltin("builtin");
    const strip = (r: ReturnType<typeof generateBuiltin>) =>
      JSON.stringify(
        Object.fromEntries(
          r.files.map((f) => [
            f.path,
            f.path.endsWith(".json")
              ? JSON.parse(f.content, (k, v) =>
                  k === "date" || k === "resolvedPath" ? undefined : v,
                )
              : f.content,
          ]),
        ),
      );
    expect(strip(explicit)).toBe(strip(implicit));
  });

  it("AC-3: adoption block documents source='builtin'; mounted adopt keeps source=path (AC-4)", () => {
    void ws;
    const { files } = generateBuiltin();
    const byPath = Object.fromEntries(files.map((f) => [f.path, f.content]));
    const guidance = JSON.parse(byPath["guidance.json"]!) as {
      adoption?: Record<string, unknown>;
    };
    expect(guidance.adoption?.["source"]).toBe("builtin");

    // AC-4 regression: mounted reference keeps the previous behavior
    const ref = mkdtempSync(join(tmpdir(), "adoptref-"));
    try {
      for (const f of [
        "guidance.json",
        "workflow.json",
        "responses.json",
        "policies.json",
        "operations.json",
        "downstream-servers.json",
      ])
        writeFileSync(join(ref, f), JSON.stringify({ profile: "plain" }));
      mkdirSync(join(ref, "schemas"), { recursive: true });
      const mounted = generateFiles({
        configSource: "adopt",
        referencePath: ref,
        projectName: "t",
        transport: "stdio",
      });
      const mountedByPath = Object.fromEntries(
        mounted.files.map((f) => [f.path, f.content]),
      );
      const mountedGuidance = JSON.parse(mountedByPath["guidance.json"]!) as {
        adoption?: Record<string, unknown>;
      };
      expect(mountedGuidance.adoption?.["source"]).toBe(ref);
      // AC-4: mounted block keeps the previous shape (no resolvedPath field)
      expect("resolvedPath" in (mountedGuidance.adoption ?? {})).toBe(false);
    } finally {
      rmSync(ref, { recursive: true, force: true });
    }
  });

  it("AC-1 e2e: generated builtin config loads and boots a workflow (container-only layout)", async () => {
    const ws2 = mkdtempSync(join(tmpdir(), "ws011-"));
    try {
      const { files } = generateBuiltin();
      const cfgDir = join(ws2, ".guidance");
      mkdirSync(cfgDir, { recursive: true });
      for (const f of files) {
        mkdirSync(join(cfgDir, f.path, ".."), { recursive: true });
        // AC-6: no renderer leftovers reach the target config
        if (f.path === "responses.json")
          expect(f.content).not.toMatch(/\{\{[#A-Z_]/);
        writeFileSync(join(cfgDir, f.path), f.content);
      }
      const app = composeApplication(ws2, cfgDir, join(cfgDir, "state"));
      const started = (await app.engine.startWorkflow({
        workspaceRoot: ws2,
        request: "r",
      })) as unknown as { sessionId: string };
      expect(started.sessionId).toBeTruthy();
    } finally {
      rmSync(ws2, { recursive: true, force: true });
    }
  });
});

describe("adopt-mode wizard UX + default profile (specs/011 follow-ups)", () => {
  it("derived questions (profile/insight/gitnexus/gates) are NOT asked in adopt mode", () => {
    const adopt = {
      configSource: "adopt",
      projectName: "t",
      transport: "stdio",
    };
    expect(nextQuestion(adopt as never)).toBeNull();
    const cat = catalogOverview(adopt as never);
    expect(cat.done).toBe(true);
    expect(cat.nextTool).toBe("setup_guidance_generate");
  });

  it("fresh mode still asks the derived questions", () => {
    const fresh = {
      configSource: "fresh",
      projectName: "t",
      transport: "stdio",
    };
    const next = nextQuestion(fresh as never);
    expect(next?.id).toBe("profile");
  });

  it("clearthought is predefined in generated downstream-servers (fresh + adopt)", () => {
    void ws;
    for (const answers of [
      {
        configSource: "fresh",
        projectName: "t",
        transport: "stdio",
        profile: "plain",
        insight: false,
        gitnexus: false,
        gates: "minimal",
      },
      { configSource: "adopt", projectName: "t", transport: "stdio" },
    ]) {
      const { files } = generateFiles(answers as never);
      const byPath = Object.fromEntries(files.map((f) => [f.path, f.content]));
      const downstream = JSON.parse(byPath["downstream-servers.json"]!) as {
        servers: Record<
          string,
          {
            displayName?: string;
            enabled?: boolean;
            transport?: { http?: { url?: string } };
          }
        >;
      };
      expect(
        downstream.servers.clearthought,
        JSON.stringify(Object.keys(downstream.servers)),
      ).toBeTruthy();
      expect(downstream.servers.clearthought!.enabled).toBe(true);
      expect(downstream.servers.clearthought!.transport?.http?.url).toContain(
        ":3000/mcp",
      );
      // policies egress allowlist must include the clearthought host
      const policies = JSON.parse(byPath["policies.json"]!) as {
        egress: { httpHostAllowlist: string[] };
      };
      expect(
        policies.egress.httpHostAllowlist.some((h) => h.endsWith(":3000")),
      ).toBe(true);
    }
  });

  it("shipped builtin template defines clearthought in its downstream-servers.json", () => {
    const tpl = JSON.parse(
      readFileSync(
        join(resolveBuiltinReferencePath(), "downstream-servers.json"),
        "utf8",
      ),
    ) as { servers: Record<string, unknown> };
    expect(tpl.servers.clearthought).toBeTruthy();
  });
});

describe("container-only self-containment (specs/011 follow-up, niyama finding)", () => {
  const OFFENDER = /servers\/(server-guidance|server-insight)\//;

  function assertSelfContained(r: ReturnType<typeof generateFiles>) {
    const byPath = Object.fromEntries(r.files.map((f) => [f.path, f.content]));
    // embedded helper scripts are part of the generated fileset
    expect(byPath[".guidance/scripts/check-final-review.mjs"]).toBeTruthy();
    expect(byPath[".guidance/scripts/seed-lessons.mjs"]).toBeTruthy();
    // seeder must be dependency-free (target repo has no node_modules for the SDK)
    expect(byPath[".guidance/scripts/seed-lessons.mjs"]).not.toMatch(
      /from ["']@modelcontextprotocol/,
    );
    // NO generated file may reference guidance-package-internal paths as a
    // dependency. Exception: adoption.resolvedPath in guidance.json is
    // provenance metadata only (nothing reads or executes it).
    for (const [p, c] of Object.entries(byPath)) {
      const check =
        p === "guidance.json"
          ? JSON.stringify(
              JSON.parse(c, (k, v) => (k === "resolvedPath" ? undefined : v)),
            )
          : c;
      expect(check, p).not.toMatch(OFFENDER);
    }
    for (const n of r.notes) expect(n).not.toMatch(OFFENDER);
    return byPath;
  }

  it("fresh generation embeds gate scripts and references no package-internal paths", () => {
    void ws;
    assertSelfContained(
      generateFiles({
        configSource: "fresh",
        projectName: "t",
        transport: "stdio",
        profile: "plain",
        insight: true,
        gitnexus: true,
        gates: "standard",
      }),
    );
  });

  it("builtin adopt embeds gate scripts and references no package-internal paths", () => {
    void ws;
    assertSelfContained(
      generateFiles({
        configSource: "adopt",
        projectName: "t",
        transport: "stdio",
      }),
    );
  });

  it("mounted reference with legacy package paths gets a loud warning note", () => {
    void ws;
    const ref = mkdtempSync(join(tmpdir(), "adoptref-"));
    try {
      for (const f of [
        "guidance.json",
        "workflow.json",
        "policies.json",
        "operations.json",
        "downstream-servers.json",
      ])
        writeFileSync(join(ref, f), JSON.stringify({ profile: "plain" }));
      mkdirSync(join(ref, "schemas"), { recursive: true });
      writeFileSync(
        join(ref, "workflow.json"),
        JSON.stringify({
          phases: {
            complete: {
              lifecycle: { beforeExit: ["legacy-gate"] },
            },
          },
        }),
      );
      writeFileSync(
        join(ref, "responses.json"),
        JSON.stringify({ version: 2, responses: { complete: {} } }),
      );
      writeFileSync(
        join(ref, "operations.json"),
        JSON.stringify({
          operations: {
            "legacy-gate": {
              type: "process",
              executable: "node",
              args: ["servers/server-guidance/scripts/old-gate.mjs"],
            },
          },
        }),
      );
      const { notes } = generateFiles({
        configSource: "adopt",
        referencePath: ref,
        projectName: "t",
        transport: "stdio",
      });
      expect(
        notes.some((n) => n.includes("WARNING: copied reference operations")),
      ).toBe(true);
    } finally {
      rmSync(ref, { recursive: true, force: true });
    }
  });
});

describe("responses adoption + hardening (specs/012 FR-981/982/985)", () => {
  function makeAdoptRef(opts?: {
    wisdomMarker?: boolean;
    refShell?: string;
    omitResponses?: boolean;
    responsesWithoutComplete?: boolean;
  }): string {
    const ref = mkdtempSync(join(tmpdir(), "adoptref-"));
    for (const f of [
      "guidance.json",
      "workflow.json",
      "policies.json",
      "operations.json",
      "downstream-servers.json",
    ])
      writeFileSync(join(ref, f), JSON.stringify({ profile: "plain" }));
    mkdirSync(join(ref, "schemas"), { recursive: true });
    writeFileSync(
      join(ref, "workflow.json"),
      JSON.stringify({
        phases: {
          understand: {},
          complete: { lifecycle: { beforeExit: [] } },
        },
      }),
    );
    if (!opts?.omitResponses) {
      const responses: Record<string, unknown> = {
        version: 2,
        responses: opts?.responsesWithoutComplete
          ? { understand: {} }
          : {
              understand: {},
              complete: {
                title: "c",
                instruction: opts?.wisdomMarker
                  ? "REFERENCE WISDOM MARKER do the thing"
                  : "generic",
                requiredActions: [],
              },
            },
      };
      if (opts?.refShell) responses["instructions"] = { global: opts.refShell };
      writeFileSync(join(ref, "responses.json"), JSON.stringify(responses));
    }
    return ref;
  }

  it("AC-1: reference response wisdom is adopted (marker survives)", () => {
    void ws;
    const ref = makeAdoptRef({ wisdomMarker: true, refShell: "OLD REF SHELL" });
    try {
      const { files } = generateFiles({
        configSource: "adopt",
        referencePath: ref,
        projectName: "t",
        transport: "stdio",
        shell: "NEW TARGET SHELL",
      });
      const byPath = Object.fromEntries(files.map((f) => [f.path, f.content]));
      expect(byPath["responses.json"]!).toContain("REFERENCE WISDOM MARKER");
      expect(byPath["responses.json"]!).toContain("NEW TARGET SHELL");
      expect(byPath["responses.json"]!).not.toContain("OLD REF SHELL");
    } finally {
      rmSync(ref, { recursive: true, force: true });
    }
  });

  it("AC-2: empty shell answer removes the instructions slot", () => {
    void ws;
    const ref = makeAdoptRef();
    try {
      const { files } = generateFiles({
        configSource: "adopt",
        referencePath: ref,
        projectName: "t",
        transport: "stdio",
      });
      const byPath = Object.fromEntries(files.map((f) => [f.path, f.content]));
      const responses = JSON.parse(byPath["responses.json"]!) as {
        instructions?: unknown;
      };
      expect(responses.instructions).toBeUndefined();
    } finally {
      rmSync(ref, { recursive: true, force: true });
    }
  });

  it("FR-982: missing responses.json fails closed", () => {
    void ws;
    const ref = makeAdoptRef({ omitResponses: true });
    try {
      expect(() =>
        generateFiles({
          configSource: "adopt",
          referencePath: ref,
          projectName: "t",
          transport: "stdio",
        }),
      ).toThrowError(/adopt source: missing\/unreadable file responses\.json/);
    } finally {
      rmSync(ref, { recursive: true, force: true });
    }
  });

  it("FR-982: workflow phase without response fails closed", () => {
    void ws;
    const ref = makeAdoptRef({ responsesWithoutComplete: true });
    try {
      expect(() =>
        generateFiles({
          configSource: "adopt",
          referencePath: ref,
          projectName: "t",
          transport: "stdio",
        }),
      ).toThrowError(/adopt source: responses missing phase complete/);
    } finally {
      rmSync(ref, { recursive: true, force: true });
    }
  });

  it("FR-984/AC-5: builtin adopt embeds check-spec-drift and wires docs-drift first", () => {
    void ws;
    const { files } = generateFiles({
      configSource: "adopt",
      projectName: "t",
      transport: "stdio",
    });
    const byPath = Object.fromEntries(files.map((f) => [f.path, f.content]));
    expect(byPath[".guidance/scripts/check-spec-drift.mjs"]).toBeTruthy();
    const wf = JSON.parse(byPath["workflow.json"]!) as {
      phases: Record<string, { lifecycle?: { beforeExit?: string[] } }>;
    };
    expect(wf.phases.complete!.lifecycle!.beforeExit![0]).toBe("docs-drift");
    const ops = JSON.parse(byPath["operations.json"]!) as {
      operations: Record<string, { args?: string[] }>;
    };
    expect(ops.operations["docs-drift"]!.args).toContain(
      ".guidance/scripts/check-spec-drift.mjs",
    );
  });

  it("FR-982: malformed responses.json fails closed with the documented contract", () => {
    void ws;
    const ref = makeAdoptRef();
    try {
      writeFileSync(join(ref, "responses.json"), "{ not json");
      expect(() =>
        generateFiles({
          configSource: "adopt",
          referencePath: ref,
          projectName: "t",
          transport: "stdio",
        }),
      ).toThrowError(/adopt source: unreadable file responses\.json/);
    } finally {
      rmSync(ref, { recursive: true, force: true });
    }
  });

  it("FR-984: check-spec-drift detects Draft-with-done-tasks and honors the override", () => {
    const ws2 = mkdtempSync(join(tmpdir(), "specdrift-"));
    const script = join(
      resolveBuiltinReferencePath(),
      "..",
      "..",
      "scripts",
      "embedded",
      "check-spec-drift.mjs",
    );
    try {
      mkdirSync(join(ws2, "specs", "demo"), { recursive: true });
      writeFileSync(
        join(ws2, "specs", "demo", "spec.md"),
        "**Status:** Draft\n",
      );
      writeFileSync(
        join(ws2, "specs", "demo", "tasks.md"),
        "- [x] done thing\n",
      );
      expect(() =>
        execFileSync("node", [script, ws2], { stdio: "pipe" }),
      ).toThrow();
      writeFileSync(
        join(ws2, "specs", "demo", "spec.md"),
        "**Status:** Implemented\n<!-- docs-drift: status ok -->\n",
      );
      expect(() =>
        execFileSync("node", [script, ws2], { stdio: "pipe" }),
      ).not.toThrow();
    } finally {
      rmSync(ws2, { recursive: true, force: true });
    }
  });

  it("AC-3/AC-4 golden: generation is deterministic (fresh + mounted adopt), stripped of timestamps", () => {
    void ws;
    const strip = (r: ReturnType<typeof generateFiles>) =>
      JSON.stringify(
        Object.fromEntries(
          r.files.map((f) => [
            f.path,
            f.path.endsWith(".json")
              ? JSON.parse(f.content, (k, v) =>
                  k === "date" || k === "resolvedPath" ? undefined : v,
                )
              : f.content,
          ]),
        ),
      );
    const fresh1 = generateFiles({
      configSource: "fresh",
      projectName: "t",
      transport: "stdio",
      profile: "plain",
      insight: true,
      gitnexus: true,
      gates: "standard",
    });
    const fresh2 = generateFiles({
      configSource: "fresh",
      projectName: "t",
      transport: "stdio",
      profile: "plain",
      insight: true,
      gitnexus: true,
      gates: "standard",
    });
    expect(strip(fresh1)).toBe(strip(fresh2));

    const ref = makeAdoptRef({ wisdomMarker: true, refShell: "OLD SHELL" });
    try {
      const mounted1 = generateFiles({
        configSource: "adopt",
        referencePath: ref,
        projectName: "t",
        transport: "stdio",
        shell: "SHELL",
      });
      const mounted2 = generateFiles({
        configSource: "adopt",
        referencePath: ref,
        projectName: "t",
        transport: "stdio",
        shell: "SHELL",
      });
      expect(strip(mounted1)).toBe(strip(mounted2));
    } finally {
      rmSync(ref, { recursive: true, force: true });
    }
  });

  it("FR-985/AC-7: whitespace referencePath trims to builtin; whitespace env falls back to default", () => {
    void ws;
    const ENV_KEY = "GUIDANCE_BUILTIN_TEMPLATE_DIR";
    const saved = process.env[ENV_KEY];
    try {
      process.env[ENV_KEY] = "   ";
      expect(resolveBuiltinReferencePath()).not.toBe("   ");
      const { files } = generateFiles({
        configSource: "adopt",
        referencePath: "   ",
        projectName: "t",
        transport: "stdio",
      });
      expect(files.length).toBeGreaterThan(0);
    } finally {
      if (saved === undefined) delete process.env[ENV_KEY];
      else process.env[ENV_KEY] = saved;
    }
  });
});

describe("wisdom baseline (specs/013 FR-991..995)", () => {
  const GENERIC_KEY_TOKEN = /\{\{[A-Z_]+\}\}/;

  it('AC-1: template responses.json === buildResponses("") (drift guard)', () => {
    void ws;
    const tpl = readFileSync(
      join(resolveBuiltinReferencePath(), "responses.json"),
      "utf8",
    ).replace(/\r\n/g, "\n");
    expect(tpl).toBe(buildResponses(""));
  });

  it("FR-992: wisdom baseline exists, covers all phases, differs from generic, only defined tokens", () => {
    void ws;
    const wisdomPath = join(
      resolveBuiltinReferencePath(),
      "responses-wisdom.json",
    );
    const wisdom = JSON.parse(readFileSync(wisdomPath, "utf8")) as {
      responses: Record<string, unknown>;
    };
    const generic = JSON.parse(
      readFileSync(
        join(resolveBuiltinReferencePath(), "responses.json"),
        "utf8",
      ),
    ) as { responses: Record<string, unknown> };
    expect(Object.keys(wisdom.responses).sort()).toEqual(
      Object.keys(generic.responses).sort(),
    );
    expect(JSON.stringify(wisdom)).not.toBe(JSON.stringify(generic));
    const tokens = [
      ...JSON.stringify(wisdom).matchAll(/\{\{([A-Z_]+)\}\}/g),
    ].map((m) => m[1]);
    for (const t of tokens)
      expect([
        "CLEARTHOUGHT_URL",
        "INSIGHT_URL",
        "GITNEXUS_URL",
        "PROJECT_NAME",
      ]).toContain(t);
    const blocks = [
      ...JSON.stringify(wisdom).matchAll(/\{\{#server:([a-z-]+)\}\}/g),
    ].map((m) => m[1]);
    for (const b of blocks)
      expect(["clearthought", "insight", "gitnexus"]).toContain(b);
  });

  function makeWisdomRef(
    wisdomResponses: Record<string, unknown>,
    opts?: { insight?: boolean },
  ): string {
    const ref = mkdtempSync(join(tmpdir(), "adoptref-"));
    const operations: Record<string, unknown> = opts?.insight
      ? {
          "capture-session-lessons": {
            type: "mcpTool",
            server: "insight",
            capability: "experience_seed_lessons",
            arguments: { mode: "template", value: { lessons: [] } },
          },
        }
      : {};
    for (const f of [
      "guidance.json",
      "workflow.json",
      "responses.json",
      "policies.json",
      "downstream-servers.json",
    ])
      writeFileSync(join(ref, f), JSON.stringify({ profile: "plain" }));
    writeFileSync(join(ref, "operations.json"), JSON.stringify({ operations }));
    mkdirSync(join(ref, "schemas"), { recursive: true });
    writeFileSync(
      join(ref, "responses-wisdom.json"),
      JSON.stringify({ version: 2, responses: wisdomResponses }),
    );
    return ref;
  }

  it("AC-2: builtin adopt renders wisdom with transport-correct URLs, no leftover tokens", () => {
    void ws;
    for (const transport of ["stdio", "http-docker"] as const) {
      const { files } = generateFiles({
        configSource: "adopt",
        projectName: "my-project",
        transport,
      });
      const byPath = Object.fromEntries(files.map((f) => [f.path, f.content]));
      expect(byPath["responses.json"]!).not.toMatch(/\{\{[A-Z_]+\}\}/);
      expect(byPath["responses.json"]!).toContain(
        transport === "stdio"
          ? "http://localhost:3000/mcp"
          : "http://host.docker.internal:3000/mcp",
      );
    }
  });

  it("AC-3: server-conditional blocks follow the insight answer", () => {
    void ws;
    const wisdom = {
      understand: {
        instruction:
          "{{#server:insight}}INSIGHT PRESENT {{INSIGHT_URL}}{{/server:insight}}BASE",
      },
      complete: {},
    };
    // insight=false (no insight op in reference) → block removed
    const refOff = makeWisdomRef(wisdom);
    try {
      const off = generateFiles({
        configSource: "adopt",
        referencePath: refOff,
        projectName: "t",
        transport: "stdio",
      });
      const a = Object.fromEntries(off.files.map((f) => [f.path, f.content]));
      expect(a["responses.json"]!).not.toContain("INSIGHT PRESENT");
      expect(a["responses.json"]!).toContain("BASE");
    } finally {
      rmSync(refOff, { recursive: true, force: true });
    }
    // insight=true (store-completion-insight op) → block rendered with URL
    const refOn = makeWisdomRef(wisdom, { insight: true });
    try {
      const on = generateFiles({
        configSource: "adopt",
        referencePath: refOn,
        projectName: "t",
        transport: "stdio",
      });
      const b = Object.fromEntries(on.files.map((f) => [f.path, f.content]));
      expect(b["responses.json"]!).toContain("INSIGHT PRESENT");
      expect(b["responses.json"]!).toContain("http://localhost:3002/mcp");
    } finally {
      rmSync(refOn, { recursive: true, force: true });
    }
  });

  it("AC-4: mounted reference WITHOUT wisdom file adopts its responses.json (012 behavior)", () => {
    void ws;
    const ref = mkdtempSync(join(tmpdir(), "adoptref-"));
    try {
      for (const f of [
        "guidance.json",
        "workflow.json",
        "responses.json",
        "policies.json",
        "operations.json",
        "downstream-servers.json",
      ])
        writeFileSync(
          join(ref, f),
          JSON.stringify({
            profile: "plain",
            responses: {
              understand: { instruction: "MOUNTED 012 WISDOM" },
              complete: {},
            },
          }),
        );
      mkdirSync(join(ref, "schemas"), { recursive: true });
      const { files } = generateFiles({
        configSource: "adopt",
        referencePath: ref,
        projectName: "t",
        transport: "stdio",
      });
      const byPath = Object.fromEntries(files.map((f) => [f.path, f.content]));
      expect(byPath["responses.json"]!).toContain("MOUNTED 012 WISDOM");
    } finally {
      rmSync(ref, { recursive: true, force: true });
    }
  });

  it("FR-993: unknown placeholder token fails closed", () => {
    void ws;
    const ref = makeWisdomRef({
      understand: { instruction: "oops {{BOGUS_TOKEN}}" },
      complete: {},
    });
    try {
      expect(() =>
        generateFiles({
          configSource: "adopt",
          referencePath: ref,
          projectName: "t",
          transport: "stdio",
        }),
      ).toThrowError(/unknown responses placeholder \{\{BOGUS_TOKEN\}\}/);
    } finally {
      rmSync(ref, { recursive: true, force: true });
    }
  });

  it("FR-993: unbalanced conditional block fails closed", () => {
    void ws;
    const ref = makeWisdomRef({
      understand: { instruction: "oops {{#server:insight}}never closed" },
      complete: {},
    });
    try {
      expect(() =>
        generateFiles({
          configSource: "adopt",
          referencePath: ref,
          projectName: "t",
          transport: "stdio",
        }),
      ).toThrowError(/unbalanced server-conditional block/);
    } finally {
      rmSync(ref, { recursive: true, force: true });
    }
  });
});
