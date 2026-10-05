/**
 * Package-manager awareness of the Config Assistant: the optional
 * `packageManager` answer (npm|pnpm|yarn, default npm) selects the PM used by
 * generated gate operations and dependency operations. Detection itself is
 * agent-side (wizard help text encodes the lockfile rule) — generateFiles
 * stays stateless and only validates the value.
 */
import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  catalogOverview,
  generateFiles,
  nextQuestion,
} from "../../src/setup/ConfigAssistant.js";

const BASE_ANSWERS = {
  configSource: "fresh",
  projectName: "pm-project",
  transport: "http-docker",
  insight: "yes",
  gitnexus: "yes",
  gates: "standard",
  registerWorkspace: "no",
};

function operationsFor(pm?: string): Record<
  string,
  {
    executable?: string;
    args?: string[];
    steps?: Array<{
      executable?: string;
      capability?: string;
      args?: string[];
    }>;
    description?: string;
  }
> {
  const answers =
    pm === undefined ? BASE_ANSWERS : { ...BASE_ANSWERS, packageManager: pm };
  const { files } = generateFiles(answers as Record<string, string>);
  const ops = files.find((f) => f.path === "operations.json")!.content;
  return (JSON.parse(ops) as { operations: typeof ops }).operations as never;
}

describe("packageManager wizard answer", () => {
  it("the optional question is in the catalog with detection rule, but never blocks completion", () => {
    const overview = catalogOverview({});
    const q = overview.questions.find((x) => x.id === "packageManager");
    expect(q).toBeDefined();
    expect(q!.required).toBe(false);
    expect(q!.default).toBe("npm");
    expect(q!.help).toMatch(/pnpm-lock\.yaml/);
    expect(q!.help).toMatch(/yarn\.lock/);
    // not required: completion does not demand it
    expect(nextQuestion(BASE_ANSWERS)).toBeNull();
  });

  it("omitting the answer equals explicit npm (default npm, regression)", () => {
    expect(operationsFor()).toEqual(operationsFor("npm"));
  });

  it("pnpm: gates run via pnpm, deps-install uses frozen-lockfile -> install fallback", () => {
    const ops = operationsFor("pnpm");
    expect(ops.build!.executable).toBe("pnpm");
    expect(ops.build!.args).toEqual(["run", "build"]);
    expect(ops.lint!.args).toEqual(["run", "lint"]);
    expect(ops.test!.args).toEqual(["run", "test"]);
    const steps = ops["deps-install"]!.steps!;
    expect(steps[0]).toMatchObject({
      capability: "pnpm-install-frozen",
      executable: "pnpm",
      args: ["install", "--frozen-lockfile"],
    });
    expect(steps[1]).toMatchObject({
      capability: "pnpm-install-fallback",
      executable: "pnpm",
      args: ["install"],
    });
    expect(ops["deps-install"]!.description).toMatch(
      /pnpm install --frozen-lockfile/,
    );
    expect(ops["deps-reinstall"]!.description).toMatch(/reinstall with pnpm/);
  });

  it("yarn: gates run scripts directly, deps-install uses immutable -> install fallback (yarn 4+)", () => {
    const ops = operationsFor("yarn");
    expect(ops.build!.executable).toBe("yarn");
    expect(ops.build!.args).toEqual(["build"]);
    expect(ops.lint!.args).toEqual(["lint"]);
    expect(ops.test!.args).toEqual(["test"]);
    const steps = ops["deps-install"]!.steps!;
    expect(steps[0]).toMatchObject({
      capability: "yarn-install-immutable",
      executable: "yarn",
      args: ["install", "--immutable"],
    });
    expect(steps[1]).toMatchObject({
      capability: "yarn-install-fallback",
      executable: "yarn",
      args: ["install"],
    });
  });

  it("npm stays on the historical shapes (npm ci -> npm install, npm test without run)", () => {
    const ops = operationsFor("npm");
    expect(ops.build!.args).toEqual(["run", "build"]);
    expect(ops.lint!.args).toEqual(["run", "lint"]);
    expect(ops.test!.args).toEqual(["test"]); // no "run" — npm quirk, pinned
    const steps = ops["deps-install"]!.steps!;
    expect(steps[0]).toMatchObject({
      capability: "npm-ci-lockfile",
      executable: "npm",
      args: ["ci"],
    });
    expect(steps[1]).toMatchObject({
      capability: "npm-install-fallback",
      executable: "npm",
      args: ["install"],
    });
  });

  it("unknown packageManager value fails closed with configuration_invalid", () => {
    expect(() => operationsFor("bun")).toThrowError(
      /unsupported packageManager/,
    );
  });

  it("registration notes: registry_register is the PRIMARY path, manual merge only the fallback", () => {
    const wsRoot = mkdtempSync(join(tmpdir(), "pm-ws-"));
    try {
      const { notes } = generateFiles({
        ...BASE_ANSWERS,
        registerWorkspace: "yes",
        workspaceRoot: wsRoot,
      });
      const registration = notes.filter((n) =>
        n.includes("WIZ-1 workspace registration"),
      );
      expect(registration).toHaveLength(1);
      expect(registration[0]).toMatch(
        /PRIMARY: register via the registry_register MCP tool/,
      );
      expect(registration[0]).toContain(`root: "${wsRoot}"`);
      const fallback = notes.filter((n) => n.includes("WIZ-1 FALLBACK"));
      expect(fallback).toHaveLength(1);
      expect(fallback[0]).toMatch(
        /merge this entry into the "workspaces" array/,
      );
      const verify = notes.find((n) => n.includes("VERIFY the registration"));
      expect(verify).toMatch(/fallback only/i);
      expect(
        notes.some((n) =>
          n.includes(
            "registry_register MCP tool against the serving pool instance",
          ),
        ),
      ).toBe(true);
    } finally {
      rmSync(wsRoot, { recursive: true, force: true });
    }
  });

  it("pm values are normalized (case/whitespace); empty string falls back to npm", () => {
    const yarn = operationsFor("yarn");
    expect(operationsFor(" YARN ").build!.executable).toBe(
      yarn.build!.executable,
    );
    expect(operationsFor("PNPM").build!.executable).toBe("pnpm");
    expect(operationsFor("")).toEqual(operationsFor("npm"));
  });
});
