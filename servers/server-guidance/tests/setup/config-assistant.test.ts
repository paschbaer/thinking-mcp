import { describe, expect, it } from "vitest";
import { catalogOverview, generateFiles, nextQuestion } from "../../src/setup/ConfigAssistant.js";

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
    expect(overview.questions.length).toBe(11);
  });

  it("advances question by question and reports done when complete", () => {
    const acc: Record<string, string> = {};
    let guard = 0;
    while (guard++ < 20) {
      const overview = catalogOverview(acc);
      if (overview.done) break;
      const q = overview.nextQuestion!;
      acc[q.id] = (q.default as string) ?? (q.options ? q.options[0] : "answer-" + q.id);
    }
    const final = catalogOverview(acc);
    expect(final.done).toBe(true);
    expect(final.nextTool).toBe("setup_guidance_generate");
    expect(guard).toBeLessThanOrEqual(8);
  });

  it("nextQuestion skips optional questions (shell has a default)", () => {
    const q = nextQuestion({ configSource: "fresh", projectName: "p", transport: "stdio", profile: "plain" });
    // shell is optional and unanswered → not blocking; insight is the next required one
    expect(q?.id).toBe("insight");
  });

  it("generate requires the mandatory answers", () => {
    expect(() => generateFiles({})).toThrowError(/incomplete, missing: (configSource, )?projectName/);
  });

  it("generate produces parseable config files with expected content (http-docker)", () => {
    const { files, notes } = generateFiles(FULL_ANSWERS);
    const byPath: Record<string, string> = Object.fromEntries(files.map((f) => [f.path, f.content]));
    const content = (p: string): string => byPath[p]!;
    expect(Object.keys(byPath)).toContain("guidance.json");
    expect(Object.keys(byPath)).toContain("workflow.json");
    expect(Object.keys(byPath)).toContain("policies.json");
    expect(files.some((f) => f.path === "schemas/understand.schema.json")).toBe(true);

    const guidance = JSON.parse(content("guidance.json"));
    expect(guidance.project.name).toBe("my-project");
    expect(guidance.security.restrictWorkingDirectory).toBe(true);

    const downstream = JSON.parse(content("downstream-servers.json"));
    expect(downstream.servers.insight.transport.http.url).toContain("host.docker.internal:3002");
    expect(downstream.servers.gitnexus.transport.http.url).toContain("host.docker.internal:4747");

    const policies = JSON.parse(content("policies.json"));
    expect(policies.egress.httpHostAllowlist).toContain("host.docker.internal:4747");

    const operations = JSON.parse(content("operations.json"));
    expect(operations.operations.build.required).toBe(true);
    expect(operations.operations["repository-analysis"]).toBeDefined();
    expect(operations.operations["capture-session-lessons"].required).toBe(false);

    const responses = JSON.parse(content("responses.json"));
    expect(responses.responses.understand.instruction).not.toContain("wsl.exe -e bash");
    expect(responses.responses.plan.instruction).toContain("report_blocker");

    expect(notes.some((n) => n.includes("configuration is snapshotted per session"))).toBe(true);
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
    const byPath: Record<string, string> = Object.fromEntries(files.map((f) => [f.path, f.content]));
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

  it("WA-1: without workspace answers no workspaces[] block is emitted (status quo)", () => {
    const { files } = generateFiles(FULL_ANSWERS);
    const guidance = JSON.parse(
      (Object.fromEntries(files.map((f) => [f.path, f.content])))["guidance.json"]!,
    );
    expect(guidance.workspaces).toBeUndefined();
  });

  it("WA-1: workspaceRoot emits a workspaces[] block with the default entry", () => {
    const { files, notes } = generateFiles({ ...FULL_ANSWERS, workspaceRoot: "/workspace" });
    const guidance = JSON.parse(
      (Object.fromEntries(files.map((f) => [f.path, f.content])))["guidance.json"]!,
    );
    expect(guidance.workspaces).toEqual([
      { name: "default", root: "/workspace", projectName: "my-project" },
    ]);
    expect(notes.some((n) => n.includes("workspaces[] registry block"))).toBe(true);
  });

  it("WA-1: extraWorkspaces are parsed and appended after the default entry", () => {
    const { files } = generateFiles({
      ...FULL_ANSWERS,
      workspaceRoot: "/workspace",
      extraWorkspaces: "zed=/workspace-zed; niyama=/workspace-niyama",
    });
    const guidance = JSON.parse(
      (Object.fromEntries(files.map((f) => [f.path, f.content])))["guidance.json"]!,
    );
    expect(guidance.workspaces).toEqual([
      { name: "default", root: "/workspace", projectName: "my-project" },
      { name: "zed", root: "/workspace-zed", projectName: "zed" },
      { name: "niyama", root: "/workspace-niyama", projectName: "niyama" },
    ]);
  });

  it("WA-1: extraWorkspaces without workspaceRoot is rejected", () => {
    expect(() =>
      generateFiles({ ...FULL_ANSWERS, extraWorkspaces: "zed=/workspace-zed" }),
    ).toThrowError(/extraWorkspaces requires workspaceRoot/);
  });

  it("WA-1: invalid extraWorkspaces answers fail closed at generation time", () => {
    const base = { ...FULL_ANSWERS, workspaceRoot: "/workspace" };
    const cases: Array<[string, RegExp]> = [
      ["Zed=/workspace-zed", /invalid name/],
      ["zed=workspace-zed", /must be an absolute path/],
      ["default=/workspace-zed", /invalid name/],
      ["zed=/a;zed=/b", /duplicate name/],
      ["zed=/a;niyama=/a", /duplicate root/],
      ["zed", /invalid name/],
    ];
    for (const [value, pattern] of cases) {
      expect(() => generateFiles({ ...base, extraWorkspaces: value }), `case: ${value}`).toThrowError(
        pattern,
      );
    }
  });
});
