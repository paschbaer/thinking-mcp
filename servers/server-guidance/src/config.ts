/**
 * Configuration loader (FR-009, FR-026, FR-060, R15).
 *
 * JSON-only, fail-closed: any loading or validation error throws
 * ConfigurationError("configuration_invalid" | "configuration_not_found").
 * The configurationVersion is a sha256 over the canonical content of all
 * loaded configuration files; sessions bind to it (FR-019).
 */
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { isAbsolute, join } from "node:path";
import Ajv2020 from "ajv/dist/2020.js";

export type ProfileId = "plain" | "spec-kit";

export interface GuidanceMainConfig {
  version: number;
  profile?: ProfileId;
  project: { name: string };
  workflow?: { file: string };
  responses?: { file: string };
  operations?: { file: string };
  downstreamServers?: { file: string };
  policies?: { file: string };
  state?: { directory: string; persistAfterEveryOperation?: boolean; retainRawMcpResponses?: boolean };
  orchestration?: {
    defaultTimeoutSeconds?: number;
    defaultRetryCount?: number;
    maximumConcurrentOperations?: number;
    failClosedForRequiredOperations?: boolean;
  };
  security?: {
    allowAgentDefinedServers?: boolean;
    allowAgentDefinedOperations?: boolean;
    allowAgentProvidedCommands?: boolean;
    restrictWorkingDirectory?: boolean;
    redactSensitiveOutput?: boolean;
  };
  integrations?: {
    specKit?: {
      enabled?: boolean;
      discovery?: {
        featureRoot?: string;
        strategy?: "explicit" | "currentBranch" | "mostRecentlyModified" | "singleCandidate" | "configuredDefault";
        allowFallbackStrategies?: string[];
        requireUniqueMatch?: boolean;
      };
      artifacts?: Record<string, { required?: boolean; patterns: string[] }>;
      taskExecution?: { mode?: "single" | "batch" | "allReady" | "phaseGroup"; batch?: { maximumTasks?: number; respectDependencies?: boolean; groupParallelTasks?: boolean } };
      markdownCheckboxPolicy?: "ignore" | "hint" | "implemented_claim" | "completed_only_with_evidence";
      changes?: { allowAutomaticMinorAdjustments?: boolean; requireArtifactUpdateFor?: string[] };
      completion?: Record<string, boolean>;
    };
  };
}

export interface SpecKitConfig {
  discovery: {
    featureRoot: string;
    strategy: "explicit" | "currentBranch" | "mostRecentlyModified" | "singleCandidate" | "configuredDefault";
    allowFallbackStrategies: string[];
    requireUniqueMatch: boolean;
  };
  artifacts: Record<string, { required: boolean; patterns: string[] }>;
  taskExecution: { mode: "single" | "batch" | "allReady" | "phaseGroup"; batch: { maximumTasks: number; respectDependencies: boolean; groupParallelTasks: boolean } };
  markdownCheckboxPolicy: "ignore" | "hint" | "implemented_claim" | "completed_only_with_evidence";
  changes: { allowAutomaticMinorAdjustments: boolean; requireArtifactUpdateFor: string[] };
  completion: Record<string, boolean>;
}

export interface LoadedConfig {
  configDir: string;
  project: { name: string };
  profile: ProfileId;
  configVersion: string;
  main: GuidanceMainConfig;
  workflow?: Record<string, unknown>;
  responses?: Record<string, unknown>;
  operations?: Record<string, unknown>;
  downstreamServers?: Record<string, unknown>;
  policies?: Record<string, unknown>;
  specKit?: SpecKitConfig;
}

const mainConfigSchema: Record<string, unknown> = {};
Object.assign(mainConfigSchema, {
  type: "object",
  additionalProperties: false,
  required: ["version", "project"],
  properties: {
    version: { type: "number", const: 2 },
    profile: { enum: ["plain", "spec-kit"] },
    project: {
      type: "object",
      additionalProperties: false,
      required: ["name"],
      properties: { name: { type: "string", minLength: 1 } },
    },
    workflow: { $ref: "#/$defs/fileRef" },
    responses: { $ref: "#/$defs/fileRef" },
    operations: { $ref: "#/$defs/fileRef" },
    downstreamServers: { $ref: "#/$defs/fileRef" },
    policies: { $ref: "#/$defs/fileRef" },
    state: {
      type: "object",
      additionalProperties: false,
      properties: {
        directory: { type: "string" },
        persistAfterEveryOperation: { type: "boolean" },
        retainRawMcpResponses: { type: "boolean" },
      },
    },
    orchestration: {
      type: "object",
      additionalProperties: false,
      properties: {
        defaultTimeoutSeconds: { type: "number", minimum: 1 },
        defaultRetryCount: { type: "number", minimum: 0 },
        maximumConcurrentOperations: { type: "number", minimum: 1 },
        failClosedForRequiredOperations: { type: "boolean" },
      },
    },
    security: {
      type: "object",
      additionalProperties: false,
      properties: {
        allowAgentDefinedServers: { type: "boolean" },
        allowAgentDefinedOperations: { type: "boolean" },
        allowAgentProvidedCommands: { type: "boolean" },
        restrictWorkingDirectory: { type: "boolean" },
        redactSensitiveOutput: { type: "boolean" },
      },
    },
    integrations: {
      type: "object",
      additionalProperties: false,
      properties: {
        specKit: {
          type: "object",
          additionalProperties: false,
          properties: {
            enabled: { type: "boolean" },
            discovery: {
              type: "object",
              additionalProperties: false,
              properties: {
                featureRoot: { type: "string" },
                strategy: { enum: ["explicit", "currentBranch", "mostRecentlyModified", "singleCandidate", "configuredDefault"] },
                allowFallbackStrategies: { type: "array", items: { type: "string" } },
                requireUniqueMatch: { type: "boolean" },
              },
            },
            artifacts: {
              type: "object",
              additionalProperties: {
                type: "object",
                additionalProperties: false,
                required: ["patterns"],
                properties: { required: { type: "boolean" }, patterns: { type: "array", items: { type: "string" } } },
              },
            },
            taskExecution: {
              type: "object",
              additionalProperties: false,
              properties: {
                mode: { enum: ["single", "batch", "allReady", "phaseGroup"] },
                batch: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    maximumTasks: { type: "number", minimum: 1 },
                    respectDependencies: { type: "boolean" },
                    groupParallelTasks: { type: "boolean" },
                  },
                },
              },
            },
            markdownCheckboxPolicy: { enum: ["ignore", "hint", "implemented_claim", "completed_only_with_evidence"] },
            changes: {
              type: "object",
              additionalProperties: false,
              properties: {
                allowAutomaticMinorAdjustments: { type: "boolean" },
                requireArtifactUpdateFor: { type: "array", items: { type: "string" } },
              },
            },
            completion: { type: "object", additionalProperties: { type: "boolean" } },
          },
        },
      },
    },
  },
  $defs: {
    fileRef: {
      type: "object",
      additionalProperties: false,
      required: ["file"],
      properties: { file: { type: "string", pattern: "\\.json$" } },
    },
  },
} as unknown);

export class ConfigurationError extends Error {
  readonly code: "configuration_not_found" | "configuration_invalid";
  constructor(code: "configuration_not_found" | "configuration_invalid", message: string) {
    super(`${code}: ${message}`);
    this.code = code;
    this.name = "ConfigurationError";
  }
}

type ValidateMain = (data: unknown) => boolean;
let cachedValidateMain: ValidateMain | null = null;
function getValidateMain(): ValidateMain {
  if (!cachedValidateMain) {
    const Ajv2020Ctor = Ajv2020 as unknown as new (opts: object) => { compile: (s: unknown) => ValidateMain };
    const ajv = new Ajv2020Ctor({ allErrors: true, strict: false });
    cachedValidateMain = ajv.compile(mainConfigSchema);
  }
  return cachedValidateMain;
}

function readJsonFile(path: string, label: string): Record<string, unknown> {
  if (!existsSync(path)) {
    throw new ConfigurationError("configuration_not_found", `${label} not found: ${path}`);
  }
  let raw: string;
  try {
    raw = readFileSync(path, "utf-8");
  } catch (err) {
    throw new ConfigurationError("configuration_invalid", `${label} unreadable: ${String(err)}`);
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("not a JSON object");
    }
    return parsed as Record<string, unknown>;
  } catch (err) {
    throw new ConfigurationError("configuration_invalid", `${label} is not valid JSON: ${String(err)}`);
  }
}

/** A relative path is safe when it stays inside the config directory (FR-061). */
function isSafeRelative(rel: string): boolean {
  if (rel === "" || isAbsolute(rel)) return false;
  const segments = rel.split(/[\\/]/);
  return !segments.includes("..") && segments.every((seg) => seg.length > 0 && seg !== ".");
}

function resolveProfile(main: GuidanceMainConfig): ProfileId {
  if (main.profile) return main.profile;
  const sk = main.integrations?.specKit;
  if (sk && (sk.enabled === true || sk.discovery?.featureRoot !== undefined)) return "spec-kit";
  return "plain";
}

function buildSpecKitConfig(main: GuidanceMainConfig): SpecKitConfig {
  const sk = main.integrations?.specKit ?? {};
  const root = sk.discovery?.featureRoot ?? "specs";
  if (!isSafeRelative(root)) {
    throw new ConfigurationError("configuration_invalid", `specKit discovery.featureRoot escapes the workspace: ${root}`);
  }
  return {
    discovery: {
      featureRoot: root,
      strategy: sk.discovery?.strategy ?? "explicit",
      allowFallbackStrategies: sk.discovery?.allowFallbackStrategies ?? [],
      requireUniqueMatch: sk.discovery?.requireUniqueMatch ?? true,
    },
    artifacts: Object.fromEntries(
      Object.entries(sk.artifacts ?? {}).map(([k, v]) => [
        k,
        { required: v.required ?? false, patterns: v.patterns },
      ]),
    ),
    taskExecution: {
      mode: sk.taskExecution?.mode ?? "batch",
      batch: {
        maximumTasks: sk.taskExecution?.batch?.maximumTasks ?? 3,
        respectDependencies: sk.taskExecution?.batch?.respectDependencies ?? true,
        groupParallelTasks: sk.taskExecution?.batch?.groupParallelTasks ?? true,
      },
    },
    markdownCheckboxPolicy: sk.markdownCheckboxPolicy ?? "hint",
    changes: {
      allowAutomaticMinorAdjustments: sk.changes?.allowAutomaticMinorAdjustments ?? false,
      requireArtifactUpdateFor: sk.changes?.requireArtifactUpdateFor ?? [],
    },
    completion: sk.completion ?? {},
  };
}

const hash = createHash("sha256");

/**
 * Load and validate the configuration in `configDir` (the `.guidance/`
 * directory). Deterministic: identical content ⇒ identical configVersion.
 */
export function loadConfig(configDir: string): LoadedConfig {
  const mainPath = join(configDir, "guidance.json");
  const main = readJsonFile(mainPath, "guidance.json") as unknown;
  const validateMain = getValidateMain();
  if (!validateMain(main)) {
    const details = (validateMain as { errors?: { instancePath: string; message?: string }[] }).errors ?? [];
    const details2 = details
      .map((e) => `${e.instancePath} ${e.message ?? ""}`.trim())
      .join("; ");
    throw new ConfigurationError("configuration_invalid", `guidance.json: ${details}`);
  }
  const cfg = main as GuidanceMainConfig;

  const canonical = (value: unknown): string =>
    JSON.stringify(value, (_k, v: unknown) =>
      v !== null && typeof v === "object" && !Array.isArray(v)
        ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : 1)))
        : v,
    );
  const hashable: string[] = [canonical(cfg)];
  const loaded: Record<string, Record<string, unknown>> = {};
  for (const key of ["workflow", "responses", "operations", "downstreamServers", "policies"] as const) {
    const ref = cfg[key];
    if (ref?.file) {
      const path = join(configDir, ref.file);
      if (!existsSync(path)) {
        throw new ConfigurationError("configuration_invalid", `${key}: referenced file missing: ${ref.file}`);
      }
      const data = readJsonFile(path, key);
      loaded[key] = data;
      hashable.push(canonical(data));
    }
  }
  let specKit: SpecKitConfig | undefined;
  if (resolveProfile(cfg) === "spec-kit") {
    specKit = buildSpecKitConfig(cfg);
    hashable.push(canonical(specKit));
  }

  const configVersion = `sha256:${hash.copy().update(hashable.join("\n")).digest("hex")}`;
  return {
    configDir,
    project: cfg.project,
    profile: resolveProfile(cfg),
    configVersion,
    main: cfg,
    workflow: loaded["workflow"],
    responses: loaded["responses"],
    operations: loaded["operations"],
    downstreamServers: loaded["downstreamServers"],
    policies: loaded["policies"],
    specKit,
  };
}
