import { describe, expect, it } from "vitest";
import {
  catalogOverview,
  generateFiles,
  nextQuestion,
} from "../../src/setup/ConfigAssistant.js";

const FULL_ANSWERS = {
  configSource: "fresh",
  projectName: "my-project",
  transport: "http-docker",
  profile: "plain",
  shell: "wsl.exe -e bash",
  insight: "yes",
  gitnexus: "yes",
  gates: "standard",
};

describe("configuration assistant (stateless wizard)", () => {
  it("starts with the first required question (projectName)", () => {
    const overview = catalogOverview({});
    expect(overview.done).toBe(false);
    expect(overview.nextQuestion?.id).toBe("configSource");
    expect(overview.nextTool).toBe("setup_guidance_answer");
    expect(overview.questions.length).toBe(12);
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
    // shell is optional and unanswered → not blocking; insight is the next required one
    expect(q?.id).toBe("insight");
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

  it("specs/014: repo-config without workspace answers emits no workspaces[] block (process truth = repo)", () => {
    const { files } = generateFiles(FULL_ANSWERS);
    const guidance = JSON.parse(
      Object.fromEntries(files.map((f) => [f.path, f.content]))[
        "guidance.json"
      ]!,
    );
    expect(guidance.workspaces).toBeUndefined();
  });

  it("specs/014 AC-8: repo-config rejects workspaceRoot/extraWorkspaces (registry is the instance's concern)", () => {
    expect(() =>
      generateFiles({ ...FULL_ANSWERS, workspaceRoot: "/workspace" }),
    ).toThrowError(/only apply to target "registry-edit"/);
    expect(() =>
      generateFiles({ ...FULL_ANSWERS, extraWorkspaces: "zed=/workspace-zed" }),
    ).toThrowError(/only apply to target "registry-edit"/);
  });

  it("specs/014 AC-6: registry-edit emits ONLY a minimal registry guidance.json", () => {
    const { files, notes } = generateFiles({
      ...FULL_ANSWERS,
      target: "registry-edit",
      workspaceRoot: "/workspaces",
    });
    const byPath = Object.fromEntries(files.map((f) => [f.path, f.content]));
    // exactly one file — no repo-level process config in registry-edit
    expect(Object.keys(byPath)).toEqual(["guidance.json"]);
    const guidance = JSON.parse(byPath["guidance.json"]!);
    expect(guidance.workspaces).toEqual([
      { name: "default", root: "/workspaces", projectName: "my-project" },
    ]);
    expect(guidance.workflow).toBeUndefined();
    expect(guidance.operations).toBeUndefined();
    expect(notes.some((n) => n.includes("registry-edit"))).toBe(true);
    // workspace mode hint present (GUIDANCE_REMOTE_MODE unset)
    expect(notes.some((n) => n.includes("Workspace mode"))).toBe(true);
  });

  it("specs/014 AC-6: registry-edit parses extraWorkspaces after the default entry", () => {
    const { files } = generateFiles({
      ...FULL_ANSWERS,
      target: "registry-edit",
      workspaceRoot: "/workspaces",
      extraWorkspaces: "zed=/workspaces/zed; niyama=/workspaces/niyama",
    });
    const guidance = JSON.parse(
      Object.fromEntries(files.map((f) => [f.path, f.content]))[
        "guidance.json"
      ]!,
    );
    expect(guidance.workspaces).toEqual([
      { name: "default", root: "/workspaces", projectName: "my-project" },
      { name: "zed", root: "/workspaces/zed", projectName: "zed" },
      { name: "niyama", root: "/workspaces/niyama", projectName: "niyama" },
    ]);
  });

  it("specs/014: registry-edit without workspaceRoot is rejected", () => {
    expect(() =>
      generateFiles({ ...FULL_ANSWERS, target: "registry-edit" }),
    ).toThrowError(/registry-edit requires workspaceRoot/);
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

  it("specs/014: registry-edit is rejected in remote mode (registry lives per session)", () => {
    process.env.GUIDANCE_REMOTE_MODE = "1";
    try {
      expect(() =>
        generateFiles({
          ...FULL_ANSWERS,
          target: "registry-edit",
          workspaceRoot: "/workspaces",
        }),
      ).toThrowError(/not applicable in remote mode.*init_session/s);
    } finally {
      delete process.env.GUIDANCE_REMOTE_MODE;
    }
  });

  it("specs/014: invalid extraWorkspaces answers fail closed at generation time (registry-edit)", () => {
    const base = {
      ...FULL_ANSWERS,
      target: "registry-edit",
      workspaceRoot: "/workspaces",
    };
    const cases: Array<[string, RegExp]> = [
      ["Zed=/workspaces-zed", /invalid name/],
      ["zed=workspaces-zed", /must be an absolute path/],
      ["default=/workspaces-zed", /invalid name/],
      ["zed=/a;zed=/b", /duplicate name/],
      ["zed=/a;niyama=/a", /duplicate root/],
      // WW-1: an extra root duplicating the default workspaceRoot fails at
      // generation time (not first at container load), also when only
      // resolve-normalization (trailing separator) makes them equal.
      ["zed=/workspaces", /duplicate root/],
      ["zed=/workspaces/", /duplicate root/],
      ["zed", /invalid name/],
    ];
    for (const [value, pattern] of cases) {
      expect(
        () => generateFiles({ ...base, extraWorkspaces: value }),
        `case: ${value}`,
      ).toThrowError(pattern);
    }
  });
});
