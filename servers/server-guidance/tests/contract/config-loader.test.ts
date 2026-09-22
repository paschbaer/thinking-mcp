import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../../src/config.js";

let dir: string;

function write(name: string, content: string | object): void {
  writeFileSync(join(dir, name), typeof content === "string" ? content : JSON.stringify(content, null, 2));
}

const minimalGuidance = {
  version: 2,
  project: { name: "test-project" },
};

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "guidance-config-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("config loader (FR-009, FR-026, R15)", () => {
  it("loads a valid minimal plain config", () => {
    write("guidance.json", minimalGuidance);
    const cfg = loadConfig(dir);
    expect(cfg.project.name).toBe("test-project");
    expect(cfg.profile).toBe("plain");
    expect(cfg.configVersion).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("fails closed when guidance.json is missing", () => {
    expect(() => loadConfig(dir)).toThrowError(/configuration_not_found/);
  });

  it("fails closed on invalid JSON", () => {
    write("guidance.json", "{ not json");
    expect(() => loadConfig(dir)).toThrowError(/configuration_invalid/);
  });

  it("fails closed on unknown top-level keys (strict additionalProperties)", () => {
    write("guidance.json", { ...minimalGuidance, unknownKey: true });
    expect(() => loadConfig(dir)).toThrowError(/configuration_invalid/);
  });

  it("fails closed on wrong-typed values", () => {
    write("guidance.json", { version: "two", project: { name: "x" } });
    expect(() => loadConfig(dir)).toThrowError(/configuration_invalid/);
  });

  it("rejects YAML as a configuration format (JSON-only contract, FR-026)", () => {
    writeFileSync(join(dir, "guidance.yaml"), "version: 2\n");
    expect(() => loadConfig(dir)).toThrowError(/configuration_invalid|configuration_not_found/);
    write("guidance.json", "version: 2\nproject:\n  name: y\n");
    expect(() => loadConfig(dir)).toThrowError(/configuration_invalid/);
  });

  it("implied profile: spec-kit when integrations.specKit.enabled (FR-060)", () => {
    write("guidance.json", {
      ...minimalGuidance,
      integrations: { specKit: { enabled: true } },
    });
    expect(loadConfig(dir).profile).toBe("spec-kit");
  });

  it("implied profile: spec-kit when a feature root is configured (FR-060)", () => {
    write("guidance.json", {
      ...minimalGuidance,
      integrations: { specKit: { enabled: false, discovery: { featureRoot: "specs" } } },
    });
    expect(loadConfig(dir).profile).toBe("spec-kit");
  });

  it("explicit profile key wins over implication (FR-060)", () => {
    write("guidance.json", {
      ...minimalGuidance,
      profile: "plain",
      integrations: { specKit: { enabled: true } },
    });
    expect(loadConfig(dir).profile).toBe("plain");
  });

  it("explicit spec-kit profile loads the profile file (FR-060)", () => {
    write("guidance.json", {
      ...minimalGuidance,
      profile: "spec-kit",
      integrations: {
        specKit: {
          enabled: true,
          discovery: { featureRoot: "specs", strategy: "explicit", requireUniqueMatch: true },
          artifacts: {
            specification: { required: true, patterns: ["spec.md"] },
            plan: { required: true, patterns: ["plan.md"] },
            tasks: { required: true, patterns: ["tasks.md"] },
          },
        },
      },
    });
    const cfg = loadConfig(dir);
    expect(cfg.profile).toBe("spec-kit");
    expect(cfg.specKit?.discovery.featureRoot).toBe("specs");
  });

  it("referenced workflow file must exist and be JSON (fail closed, FR-009)", () => {
    write("guidance.json", {
      ...minimalGuidance,
      workflow: { file: "workflow.json" },
    });
    expect(() => loadConfig(dir)).toThrowError(/configuration_invalid/);
    write("workflow.json", { version: 2, workflow: { id: "w1", initialPhase: "understand" }, phases: {} });
    const cfg = loadConfig(dir);
    expect((cfg.workflow as { workflow?: { id: string } }).workflow?.id).toBe("w1");
  });

  it("configurationVersion is stable for identical content (hash pinning)", () => {
    write("guidance.json", minimalGuidance);
    const a = loadConfig(dir);
    const b = loadConfig(dir);
    expect(a.configVersion).toBe(b.configVersion);
  });

  it("configurationVersion changes when content changes", () => {
    write("guidance.json", minimalGuidance);
    const a = loadConfig(dir).configVersion;
    write("guidance.json", { ...minimalGuidance, project: { name: "changed" } });
    expect(loadConfig(dir).configVersion).not.toBe(a);
  });

  it("rejects a featureRoot that escapes the workspace (FR-061)", () => {
    write("guidance.json", {
      ...minimalGuidance,
      integrations: {
        specKit: { enabled: true, discovery: { featureRoot: "../outside" } },
      },
    });
    expect(() => loadConfig(dir)).toThrowError(/configuration_invalid/);
  });
});
