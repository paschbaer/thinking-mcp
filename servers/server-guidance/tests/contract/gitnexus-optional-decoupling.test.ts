/**
 * Optional-decoupling phase 1 (gitnexus tri-state + deployment mode):
 * - ALONE-TEST: a gitnexus=off generation carries ZERO gitnexus references
 *   across operations/responses/downstream/workflow/guidance.json — guidance
 *   is GitNexus-agnostic unless a deployment opts in.
 * - MATRIX: pins the renderings for 3 states x 2 modes (gate presence,
 *   required flags, reindex step text, guidance.json block).
 */
import { describe, expect, it } from "vitest";
import { generateFiles } from "../../src/setup/ConfigAssistant.js";

const BASE_ANSWERS = {
  configSource: "fresh",
  projectName: "matrix-repo",
  transport: "stdio",
  insight: "no",
  gates: "minimal",
  packageManager: "npm",
  registerWorkspace: "no",
};

function generate(overrides: Record<string, unknown>) {
  const files = generateFiles({ ...BASE_ANSWERS, ...overrides }).files;
  const byPath = Object.fromEntries(files.map((f) => [f.path, f.content]));
  return {
    ops: JSON.parse(byPath["operations.json"]).operations as Record<
      string,
      { required?: boolean; description?: string }
    >,
    responses: JSON.parse(byPath["responses.json"]) as {
      responses: Record<string, { instruction: string }>;
    },
    downstream: JSON.parse(byPath["downstream-servers.json"]) as {
      servers: Record<string, { required?: boolean }>;
    },
    workflow: JSON.parse(byPath["workflow.json"]) as {
      phases: Record<string, { lifecycle?: { beforeExit?: string[] } }>;
    },
    guidance: JSON.parse(byPath["guidance.json"]) as {
      gitnexus?: { state: string; mode: string; reindexCommand?: string };
    },
  };
}

function countGitnexusMentions(g: ReturnType<typeof generate>): number {
  const blobs = [
    JSON.stringify(g.ops),
    JSON.stringify(g.responses),
    JSON.stringify(g.downstream),
    JSON.stringify(g.workflow),
  ];
  return blobs.reduce(
    (n, b) => n + (b.toLowerCase().split("gitnexus").length - 1),
    0,
  );
}

describe("gitnexus optional-decoupling (phase 1)", () => {
  it("ALONE-TEST: gitnexus=off generates ZERO gitnexus references anywhere", () => {
    const g = generate({ gitnexus: "off" });
    expect(g.ops["repository-analysis"]).toBeUndefined();
    expect(g.downstream.servers.gitnexus).toBeUndefined();
    expect(g.guidance.gitnexus).toBeUndefined();
    expect(
      g.workflow.phases.complete.lifecycle?.beforeExit ?? [],
    ).not.toContain("repository-analysis");
    expect(g.responses.responses.complete.instruction).not.toContain(
      "GitNexus",
    );
    expect(countGitnexusMentions(g)).toBe(0);
  });

  it("legacy answers stay compatible: yes->required, no->off", () => {
    const yes = generate({ gitnexus: "yes" });
    expect(yes.ops["repository-analysis"]?.required).toBe(true);
    expect(yes.guidance.gitnexus?.state).toBe("required");
    const no = generate({ gitnexus: "no" });
    expect(no.ops["repository-analysis"]).toBeUndefined();
    expect(no.guidance.gitnexus).toBeUndefined();
  });

  it("state=required: blocking gate, required downstream, guidance block carries mode+command", () => {
    const g = generate({
      gitnexus: "required",
      gitnexusMode: "compose-container",
      gitnexusReindexCommand:
        "docker compose -f x.yml exec gitnexus-server gitnexus analyze --no-stats",
    });
    expect(g.ops["repository-analysis"]?.required).toBe(true);
    expect(g.downstream.servers.gitnexus?.required).toBe(true);
    expect(g.guidance.gitnexus).toEqual({
      state: "required",
      mode: "compose-container",
      reindexCommand:
        "docker compose -f x.yml exec gitnexus-server gitnexus analyze --no-stats",
    });
    expect(g.responses.responses.complete.instruction).toContain(
      "docker compose -f x.yml exec gitnexus-server gitnexus analyze --no-stats",
    );
  });

  it("state=optional: advisory gate (required:false), tolerated downstream, advisory step text", () => {
    const g = generate({ gitnexus: "optional" });
    expect(g.ops["repository-analysis"]?.required).toBe(false);
    expect(g.downstream.servers.gitnexus?.required).toBe(false);
    expect(g.guidance.gitnexus?.state).toBe("optional");
    expect(g.responses.responses.complete.instruction).toContain(
      "advisory in this configuration",
    );
  });

  it("mode=local-cli renders the plain shell command (no deployment paths)", () => {
    const g = generate({ gitnexus: "required" });
    expect(g.responses.responses.complete.instruction).toContain(
      "'gitnexus analyze --no-stats'",
    );
    expect(g.responses.responses.complete.instruction).not.toContain(
      "docker compose",
    );
    expect(g.guidance.gitnexus?.mode).toBe("local-cli");
    expect(g.guidance.gitnexus?.reindexCommand).toBeUndefined();
  });

  it("mode=local-cli guidance block omits an empty reindexCommand", () => {
    const g = generate({ gitnexus: "optional" });
    expect(g.guidance.gitnexus).toEqual({
      state: "optional",
      mode: "local-cli",
    });
  });
});
