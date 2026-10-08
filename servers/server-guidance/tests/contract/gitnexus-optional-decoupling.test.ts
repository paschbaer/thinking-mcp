/**
 * Optional-decoupling phase 1 (gitnexus tri-state + deployment mode):
 * - ALONE-TEST: a gitnexus=off generation carries ZERO gitnexus references
 *   across operations/responses/downstream/workflow/guidance.json — guidance
 *   is GitNexus-agnostic unless a deployment opts in.
 * - MATRIX: pins the renderings for 3 states x 2 modes (gate presence,
 *   required flags, reindex step text, guidance.json block).
 */
import { describe, expect, it } from "vitest";
import {
  deriveAdoptGn,
  generateFiles,
  parseGnSetup,
  validateGnSetup,
  type GitNexusSetup,
} from "../../src/setup/ConfigAssistant.js";

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
  const byPath = new Map(files.map((f) => [f.path, f.content] as const));
  const file = (p: string): string => {
    const c = byPath.get(p);
    if (c === undefined) throw new Error(`generated file missing: ${p}`);
    return c;
  };
  return {
    ops: JSON.parse(file("operations.json")).operations as Record<
      string,
      { required?: boolean; description?: string }
    >,
    responses: JSON.parse(file("responses.json")) as {
      responses: Record<string, { instruction: string }>;
    },
    downstream: JSON.parse(file("downstream-servers.json")) as {
      servers: Record<string, { required?: boolean }>;
    },
    workflow: JSON.parse(file("workflow.json")) as {
      phases: Record<string, { lifecycle?: { beforeExit?: string[] } }>;
    },
    guidance: JSON.parse(file("guidance.json")) as {
      gitnexus?: { state: string; mode: string; reindexCommand?: string };
    },
    guidanceRaw: file("guidance.json"),
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

function completeInstruction(g: ReturnType<typeof generate>): string {
  const instr = g.responses.responses["complete"]?.instruction;
  if (instr === undefined)
    throw new Error("generated responses missing complete instruction");
  return instr;
}

describe("gitnexus optional-decoupling (phase 1)", () => {
  it("ALONE-TEST: gitnexus=off generates ZERO gitnexus references anywhere", () => {
    const g = generate({ gitnexus: "off" });
    expect(g.ops["repository-analysis"]).toBeUndefined();
    expect(g.downstream.servers.gitnexus).toBeUndefined();
    expect(g.guidance.gitnexus).toBeUndefined();
    expect(
      g.workflow.phases["complete"]?.lifecycle?.beforeExit ?? [],
    ).not.toContain("repository-analysis");
    expect(g.responses.responses["complete"]?.instruction).not.toContain(
      "GitNexus",
    );
    expect(countGitnexusMentions(g)).toBe(0);
    // full-blob scan: the guidance.json itself must be reference-free too
    expect(g.guidanceRaw.toLowerCase()).not.toContain("gitnexus");
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
    expect(completeInstruction(g)).toContain(
      "docker compose -f x.yml exec gitnexus-server gitnexus analyze --no-stats",
    );
  });

  it("state=optional: advisory gate (required:false), tolerated downstream, advisory step text", () => {
    const g = generate({ gitnexus: "optional" });
    expect(g.ops["repository-analysis"]?.required).toBe(false);
    expect(g.downstream.servers.gitnexus?.required).toBe(false);
    expect(g.guidance.gitnexus?.state).toBe("optional");
    expect(completeInstruction(g)).toContain("advisory in this configuration");
  });

  it("mode=local-cli renders the plain shell command (no deployment paths)", () => {
    const g = generate({ gitnexus: "required" });
    expect(completeInstruction(g)).toContain("'gitnexus analyze --no-stats'");
    expect(completeInstruction(g)).not.toContain("docker compose");
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

  it("GENERATOR-URL TOPOLOGY: compose-container renders compose-DNS URL + egress entry; local-cli keeps the host gateway (http-docker)", () => {
    const files = generateFiles({
      ...BASE_ANSWERS,
      gitnexus: "required",
      gitnexusMode: "compose-container",
      gitnexusReindexCommand: "docker compose exec ...",
      transport: "http-docker",
    }).files;
    const byPath = new Map(files.map((f) => [f.path, f.content] as const));
    const ds = JSON.parse(byPath.get("downstream-servers.json") ?? "{}");
    expect(ds.servers.gitnexus.transport.http.url).toBe(
      "http://gitnexus-server:4747/api/mcp",
    );
    expect(ds.servers.gitnexus.containerRoute.url).toBe(
      "http://gitnexus-server:4747/api/mcp",
    );
    const pol = JSON.parse(byPath.get("policies.json") ?? "{}");
    expect(pol.egress.httpHostAllowlist).toContain("gitnexus-server:4747");
    expect(pol.egress.httpHostAllowlist).not.toContain(
      "host.docker.internal:4747",
    );
    const local = generateFiles({
      ...BASE_ANSWERS,
      gitnexus: "required",
      transport: "http-docker",
    }).files;
    const localBy = new Map(local.map((f) => [f.path, f.content] as const));
    const localDs = JSON.parse(localBy.get("downstream-servers.json") ?? "{}");
    expect(localDs.servers.gitnexus.transport.http.url).toBe(
      "http://host.docker.internal:4747/api/mcp",
    );
  });
});

describe("fail-closed validation (optional-decoupling phase 1)", () => {
  it("unknown non-empty gitnexus answer is rejected instead of silently weakening gates", () => {
    expect(() => parseGnSetup({ gitnexus: "reqiured" })).toThrowError(
      /unsupported gitnexus value/,
    );
  });

  it("validateGnSetup: compose-container without a reindexCommand is rejected; complete setups pass; off never rejects", () => {
    expect(() =>
      validateGnSetup({
        state: "required",
        mode: "compose-container",
        reindexCommand: "",
      }),
    ).toThrowError(/reindexCommand is required when mode=compose-container/);
    expect(() =>
      validateGnSetup({
        state: "optional",
        mode: "compose-container",
        reindexCommand: "  ",
      }),
    ).toThrowError(/reindexCommand is required/);
    expect(() =>
      validateGnSetup({
        state: "required",
        mode: "compose-container",
        reindexCommand: "docker compose exec ...",
      }),
    ).not.toThrow();
    expect(() =>
      validateGnSetup({
        state: "off",
        mode: "compose-container",
        reindexCommand: "",
      }),
    ).not.toThrow();
    expect(() =>
      validateGnSetup({
        state: "required",
        mode: "local-cli",
        reindexCommand: "",
      }),
    ).not.toThrow();
  });

  it("parse/validate split: leftover adopt answers cannot misfire during parsing", () => {
    // compose-container + empty command PARSES fine (validation deferred to
    // validateGnSetup after the adopt derivation) ...
    expect(() =>
      parseGnSetup({
        gitnexus: "yes",
        gitnexusMode: "compose-container",
        gitnexusReindexCommand: "",
      }),
    ).not.toThrow();
    // ... and the cross-check still fires via the single validation site
    expect(() =>
      validateGnSetup(
        parseGnSetup({
          gitnexus: "yes",
          gitnexusMode: "compose-container",
          gitnexusReindexCommand: "",
        }),
      ),
    ).toThrowError(/reindexCommand is required/);
  });

  it("compose-container without a reindexCommand is rejected (fresh answers, parse+validate)", () => {
    expect(() =>
      validateGnSetup(
        parseGnSetup({
          gitnexus: "required",
          gitnexusMode: "compose-container",
          gitnexusReindexCommand: "",
        }),
      ),
    ).toThrowError(/reindexCommand is required when mode=compose-container/);
  });

  it("REGRESSION (verbatim-executable reindexCommand): the generated command contains no prose parenthetical", () => {
    const g = generate({
      gitnexus: "required",
      gitnexusMode: "compose-container",
      gitnexusReindexCommand:
        "docker compose -f x.yml exec gitnexus-server gitnexus analyze --no-stats",
    });
    const cmd = g.guidance.gitnexus?.reindexCommand ?? "";
    // The rendered instruction embeds the command in single quotes: prose
    // would break copy-paste (the live-config HIGH fix).
    expect(cmd).not.toMatch(/\(workdir|\(note|\(case/i);
    expect(completeInstruction(g)).toContain(`'${cmd}'`);
  });
});

describe("adopt derivation (deriveAdoptGn)", () => {
  const base: GitNexusSetup = {
    state: "optional",
    mode: "local-cli",
    reindexCommand: "",
  };
  const ops = { "repository-analysis": { type: "mcpTool" } };

  it("unknown non-empty reference state fails closed instead of silently weakening", () => {
    expect(() =>
      deriveAdoptGn({ gitnexus: { state: "Required" } }, ops, base),
    ).toThrowError(/unknown gitnexus state/);
  });

  it("declared reference state is preserved (advisory does not upgrade to blocking)", () => {
    const gn = deriveAdoptGn({ gitnexus: { state: "optional" } }, ops, base);
    expect(gn.state).toBe("optional");
  });

  it("absent reference state derives from the ops map (present -> required)", () => {
    expect(deriveAdoptGn({}, ops, base).state).toBe("required");
    expect(deriveAdoptGn({}, {}, base).state).toBe("off");
  });

  it("reference mode and reindexCommand carry forward, trimmed", () => {
    const gn = deriveAdoptGn(
      {
        gitnexus: {
          state: "required",
          mode: "compose-container",
          reindexCommand: "  docker compose exec ...  ",
        },
      },
      ops,
      base,
    );
    expect(gn.mode).toBe("compose-container");
    expect(gn.reindexCommand).toBe("docker compose exec ...");
    expect(() => validateGnSetup(gn)).not.toThrow();
  });

  it("whitespace-only reference reindexCommand trims to empty and fails validation in compose-container mode", () => {
    const gn = deriveAdoptGn(
      {
        gitnexus: {
          state: "required",
          mode: "compose-container",
          reindexCommand: "   ",
        },
      },
      ops,
      base,
    );
    expect(gn.reindexCommand).toBe("");
    expect(() => validateGnSetup(gn)).toThrowError(
      /reindexCommand is required/,
    );
  });
});
