import { describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  catalogOverview,
  generateFiles,
  nextQuestion,
} from "../../src/setup/ConfigAssistant.js";

// WIZ-1: the former target modes are merged — one run produces the repo
// process config AND (opt-in via registerWorkspace) a workspaces[] merge
// snippet in notes[]. Root existence is validated BEFORE emission (the agent
// must be able to access the path later), so the tests register a real
// temp dir as the repo root.
const REAL_DIR = mkdtempSync(join(tmpdir(), "wiz1-root-"));

const FULL_ANSWERS = {
  configSource: "fresh",
  projectName: "my-project",
  transport: "http-docker",
  profile: "plain",
  shell: "wsl.exe -e bash",
  insight: "yes",
  gitnexus: "yes",
  gates: "standard",
  registerWorkspace: "no",
};

describe("configuration assistant (stateless wizard)", () => {
  it("starts with the first required question (projectName)", () => {
    const overview = catalogOverview({});
    expect(overview.done).toBe(false);
    expect(overview.nextQuestion?.id).toBe("configSource");
    expect(overview.nextTool).toBe("setup_guidance_answer");
    expect(overview.questions.length).toBe(14);
  });

  it("advances question by question and reports done when complete", () => {
    const acc: Record<string, string> = {};
    let guard = 0;
    while (guard++ < 20) {
      const overview = catalogOverview(acc);
      if (overview.done) break;
      const q = overview.nextQuestion!;
      acc[q.id] =
        (q.default as string) ?? (q.options ? q.options[0] : "answer-" + q.id);
    }
    const final = catalogOverview(acc);
    expect(final.done).toBe(true);
    expect(final.nextTool).toBe("setup_guidance_generate");
    expect(guard).toBeLessThanOrEqual(9);
  });

  it("nextQuestion skips optional questions (shell has a default)", () => {
    const q = nextQuestion({
      configSource: "fresh",
      projectName: "p",
      transport: "stdio",
      profile: "plain",
    });
    // shell/workspaceRoot are optional and unanswered → not blocking;
    // registerWorkspace (required, WIZ-1) is the next one before insight
    expect(q?.id).toBe("registerWorkspace");
  });

  it("generate requires the mandatory answers", () => {
    expect(() => generateFiles({})).toThrowError(
      /incomplete, missing: (configSource, )?projectName/,
    );
  });

  it("generate produces parseable config files with expected content (http-docker)", () => {
    const { files, notes } = generateFiles(FULL_ANSWERS);
    const byPath: Record<string, string> = Object.fromEntries(
      files.map((f) => [f.path, f.content]),
    );
    const content = (p: string): string => byPath[p]!;
    expect(Object.keys(byPath)).toContain("guidance.json");
    expect(Object.keys(byPath)).toContain("workflow.json");
    expect(Object.keys(byPath)).toContain("policies.json");
    expect(files.some((f) => f.path === "schemas/understand.schema.json")).toBe(
      true,
    );

    const guidance = JSON.parse(content("guidance.json"));
    expect(guidance.project.name).toBe("my-project");
    expect(guidance.security.restrictWorkingDirectory).toBe(true);

    const downstream = JSON.parse(content("downstream-servers.json"));
    expect(downstream.servers.insight.transport.http.url).toContain(
      "host.docker.internal:3002",
    );
    expect(downstream.servers.gitnexus.transport.http.url).toContain(
      "host.docker.internal:4747",
    );

    const policies = JSON.parse(content("policies.json"));
    expect(policies.egress.httpHostAllowlist).toContain(
      "host.docker.internal:4747",
    );

    const operations = JSON.parse(content("operations.json"));
    expect(operations.operations.build.required).toBe(true);
    expect(operations.operations["repository-analysis"]).toBeDefined();
    expect(operations.operations["capture-session-lessons"].required).toBe(
      false,
    );

    const responses = JSON.parse(content("responses.json"));
    expect(responses.responses.understand.instruction).not.toContain(
      "wsl.exe -e bash",
    );
    expect(responses.responses.plan.instruction).toContain("report_blocker");

    expect(
      notes.some((n) => n.includes("configuration is snapshotted per session")),
    ).toBe(true);
  });

  it("generate without insight/gitnexus omits the dependent gates and downstream entries", () => {
    const { files } = generateFiles({
      configSource: "fresh",
      projectName: "p2",
      transport: "stdio",
      profile: "plain",
      insight: "no",
      gitnexus: "no",
      gates: "minimal",
      registerWorkspace: "no",
    });
    const byPath: Record<string, string> = Object.fromEntries(
      files.map((f) => [f.path, f.content]),
    );
    const content = (p: string): string => byPath[p]!;
    const operations = JSON.parse(content("operations.json"));
    expect(operations.operations["capture-session-lessons"]).toBeUndefined();
    expect(operations.operations["repository-analysis"]).toBeUndefined();
    expect(operations.operations.lint).toBeUndefined();
    const workflow = JSON.parse(content("workflow.json"));
    expect(workflow.phases.verify.lifecycle.beforeExit).toEqual(["build"]);
    expect(workflow.phases.complete.lifecycle.beforeExit).toEqual([]);
    const downstream = JSON.parse(content("downstream-servers.json"));
    // clearthought is part of the default profile (specs/011 follow-up):
    // always predefined, independent of insight/gitnexus answers.
    expect(Object.keys(downstream.servers)).toEqual(["clearthought"]);
  });

  it("WIZ-1: repo config never carries the workspaces[] registry (process truth = repo)", () => {
    const { files } = generateFiles(FULL_ANSWERS);
    const guidance = JSON.parse(
      Object.fromEntries(files.map((f) => [f.path, f.content]))[
        "guidance.json"
      ]!,
    );
    expect(guidance.workspaces).toBeUndefined();
  });

  it("WIZ-1: registerWorkspace is a mandatory wizard answer (absent → incomplete)", () => {
    const { registerWorkspace: _omitted, ...without } = FULL_ANSWERS;
    expect(() => generateFiles(without)).toThrowError(
      /missing: registerWorkspace/,
    );
  });

  it("WIZ-1: registerWorkspace=yes emits the workspaces[] merge snippet in notes (not as a file)", () => {
    const { files, notes } = generateFiles({
      ...FULL_ANSWERS,
      registerWorkspace: "yes",
      workspaceRoot: REAL_DIR,
    });
    const byPath = Object.fromEntries(files.map((f) => [f.path, f.content]));
    // the registry is NOT written as a file — it is a merge snippet
    expect(byPath["guidance.json"]).toBeDefined();
    const guidance = JSON.parse(byPath["guidance.json"]!);
    expect(guidance.workspaces).toBeUndefined();

    const snippet = notes.find((n) =>
      n.includes("WIZ-1 workspace registration"),
    )!;
    // PRIMARY note carries the entry inline (registry_register args)
    expect(snippet).toContain(`name: "my-project"`);
    expect(snippet).toContain(`root: "${REAL_DIR}"`);
    expect(snippet).toContain(`projectName: "my-project"`);
    expect(snippet).toContain("registry_register");
    // the pretty-printed JSON entry lives in the FALLBACK (manual merge) note
    const fallback = notes.find((n) => n.includes("WIZ-1 FALLBACK"))!;
    expect(fallback).toContain(`"name": "my-project"`);
    expect(fallback).toContain(`"root": "${REAL_DIR}"`);
    expect(fallback).toContain(`"projectName": "my-project"`);
    // decision 4: initial-creation branch is spelled out
    expect(notes.some((n) => n.includes("does not exist yet, CREATE it"))).toBe(
      true,
    );
    // decision: the name derives from projectName with confirmation duty
    expect(notes.some((n) => n.includes("CONFIRMS/OVERRIDES"))).toBe(true);
  });

  it("WIZ-1: registerWorkspace=yes without workspaceRoot is rejected", () => {
    expect(() =>
      generateFiles({ ...FULL_ANSWERS, registerWorkspace: "yes" }),
    ).toThrowError(/registerWorkspace=yes requires workspaceRoot/);
  });

  it("WIZ-1: registerWorkspace rejects a RELATIVE workspaceRoot at generation time", () => {
    expect(() =>
      generateFiles({
        ...FULL_ANSWERS,
        registerWorkspace: "yes",
        workspaceRoot: "workspaces/my-project",
      }),
    ).toThrowError(/must be an absolute path/);
  });

  it("WIZ-1 decision 3: a NON-EXISTENT workspaceRoot fails closed BEFORE emission", () => {
    expect(() =>
      generateFiles({
        ...FULL_ANSWERS,
        registerWorkspace: "yes",
        workspaceRoot: "/definitely/not/mounted/wiz1",
      }),
    ).toThrowError(/does not exist.*verify the mount\/path/s);
  });

  it("WIZ-1: the projectName doubles as the registry name — pattern + reserved enforced", () => {
    expect(() =>
      generateFiles({
        ...FULL_ANSWERS,
        registerWorkspace: "yes",
        workspaceRoot: REAL_DIR,
        projectName: "My Project",
      }),
    ).toThrowError(/used as the registry workspace name/);
    expect(() =>
      generateFiles({
        ...FULL_ANSWERS,
        registerWorkspace: "yes",
        workspaceRoot: REAL_DIR,
        projectName: "default",
      }),
    ).toThrowError(/used as the registry workspace name/);
  });

  it("WIZ-1: registration-flow name rules do NOT apply when registerWorkspace=no (odd names still generate)", () => {
    // the name pattern is a REGISTRY constraint — repo-config-only generation
    // must keep accepting free-form project names (regression guard against
    // hoisting the validation out of the registerWorkspace branch)
    for (const odd of ["default", "My Project", "UPPER"]) {
      const { files, notes } = generateFiles({
        ...FULL_ANSWERS,
        projectName: odd,
      });
      const guidance = JSON.parse(
        Object.fromEntries(files.map((f) => [f.path, f.content]))[
          "guidance.json"
        ]!,
      );
      expect(guidance.project.name).toBe(odd);
      expect(
        notes.some((n) => n.includes("WIZ-1 workspace registration")),
      ).toBe(false);
    }
  });

  it("WIZ-1 decision 2: remote mode replaces the registry step with an init_session hint (no throw)", () => {
    process.env.GUIDANCE_REMOTE_MODE = "1";
    try {
      const { files, notes } = generateFiles({
        ...FULL_ANSWERS,
        registerWorkspace: "yes",
        workspaceRoot: REAL_DIR,
      });
      // the repo config is still emitted in full
      expect(files.some((f) => f.path === "workflow.json")).toBe(true);
      expect(notes.some((n) => n.includes("Remote mode"))).toBe(true);
      expect(notes.some((n) => n.includes("init_session"))).toBe(true);
      expect(
        notes.some((n) => n.includes("WIZ-1 workspace registration")),
      ).toBe(false);
    } finally {
      delete process.env.GUIDANCE_REMOTE_MODE;
    }
  });

  it("specs/014 AC-7: remote mode hint appears when GUIDANCE_REMOTE_MODE=1 (repo-config → init_session)", () => {
    process.env.GUIDANCE_REMOTE_MODE = "1";
    try {
      const { notes } = generateFiles({
        ...FULL_ANSWERS,
      });
      expect(notes.some((n) => n.includes("Remote mode"))).toBe(true);
      expect(notes.some((n) => n.includes("init_session"))).toBe(true);
    } finally {
      delete process.env.GUIDANCE_REMOTE_MODE;
    }
  });
});
