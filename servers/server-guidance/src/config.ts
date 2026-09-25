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

const OPERATION_TYPES = ["process", "mcpTool", "mcpResource", "mcpPrompt", "sampling", "elicitation", "composite"];

/** Deterministic validation of the downstream servers file (T031, FR-039/041). */
const TRANSPORT_TYPES = ["stdio", "http"] as const;

function validateDownstreamServers(data: Record<string, unknown>): void {
  const servers = data["servers"];
  if (servers === undefined || servers === null) return;
  if (typeof servers !== "object" || Array.isArray(servers)) {
    throw new ConfigurationError("configuration_invalid", "downstreamServers.servers must be an object");
  }
  for (const [id, raw] of Object.entries(servers as Record<string, Record<string, unknown>>)) {
    const connection = raw["connection"] as { requestTimeoutSeconds?: unknown; startupTimeoutSeconds?: unknown; reconnect?: unknown } | undefined;
    for (const key of ["requestTimeoutSeconds", "startupTimeoutSeconds"] as const) {
      const t = connection?.[key];
      if (t !== undefined && (typeof t !== "number" || !Number.isFinite(t) || t <= 0)) {
        throw new ConfigurationError("configuration_invalid", `downstreamServers.${id}: connection.${key} must be a positive finite number`);
      }
    }
    const reconnect = connection?.reconnect;
    if (reconnect !== undefined) {
      if (typeof reconnect !== "object" || Array.isArray(reconnect)) {
        throw new ConfigurationError("configuration_invalid", `downstreamServers.${id}: connection.reconnect must be an object`);
      }
      const rc = reconnect as { enabled?: unknown; maximumAttempts?: unknown; delayMilliseconds?: unknown };
      if (rc.enabled !== undefined && typeof rc.enabled !== "boolean") {
        throw new ConfigurationError("configuration_invalid", `downstreamServers.${id}: connection.reconnect.enabled must be a boolean`);
      }
      if (rc.maximumAttempts !== undefined && (typeof rc.maximumAttempts !== "number" || !Number.isInteger(rc.maximumAttempts) || rc.maximumAttempts < 1)) {
        throw new ConfigurationError("configuration_invalid", `downstreamServers.${id}: connection.reconnect.maximumAttempts must be a positive integer`);
      }
      if (rc.delayMilliseconds !== undefined && (typeof rc.delayMilliseconds !== "number" || !Number.isInteger(rc.delayMilliseconds) || rc.delayMilliseconds < 0)) {
        throw new ConfigurationError("configuration_invalid", `downstreamServers.${id}: connection.reconnect.delayMilliseconds must be a non-negative integer`);
      }
    }
    const transport = raw["transport"];
    if (transport === undefined) continue;
    if (typeof transport !== "object" || Array.isArray(transport)) {
      throw new ConfigurationError("configuration_invalid", `downstreamServers.${id}: transport must be an object`);
    }
    const tr = transport as { type?: unknown; command?: unknown; http?: unknown };
    if (tr.type !== undefined && !TRANSPORT_TYPES.includes(tr.type as (typeof TRANSPORT_TYPES)[number])) {
      throw new ConfigurationError("configuration_invalid", `downstreamServers.${id}: transport.type must be one of ${TRANSPORT_TYPES.join(" | ")}`);
    }
    if ((tr.type ?? "stdio") === "stdio") {
      const command = tr.command as { executable?: unknown; args?: unknown } | undefined;
      if (typeof command?.executable !== "string" || command.executable.length === 0) {
        throw new ConfigurationError("configuration_invalid", `downstreamServers.${id}: transport.command.executable is required for stdio transport`);
      }
      if (command.args !== undefined && (!Array.isArray(command.args) || command.args.some((a) => typeof a !== "string"))) {
        throw new ConfigurationError("configuration_invalid", `downstreamServers.${id}: transport.command.args must be an array of strings`);
      }
    } else {
      const http = tr.http as { url?: unknown; headers?: unknown } | undefined;
      if (typeof http?.url !== "string" || http.url.length === 0) {
        throw new ConfigurationError("configuration_invalid", `downstreamServers.${id}: transport.http.url is required for http transport`);
      }
      let parsed: URL;
      try {
        parsed = new URL(http.url);
      } catch {
        throw new ConfigurationError("configuration_invalid", `downstreamServers.${id}: transport.http.url is not a valid URL`);
      }
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        throw new ConfigurationError("configuration_invalid", `downstreamServers.${id}: transport.http.url must use http(s)`);
      }
      if (http.headers !== undefined) {
        if (typeof http.headers !== "object" || Array.isArray(http.headers)) {
          throw new ConfigurationError("configuration_invalid", `downstreamServers.${id}: transport.http.headers must be an object of strings`);
        }
        for (const [k, v] of Object.entries(http.headers as Record<string, unknown>)) {
          if (typeof v !== "string") {
            throw new ConfigurationError("configuration_invalid", `downstreamServers.${id}: transport.http.headers.${k} must be a string`);
          }
        }
      }
    }
  }
}

/**
 * HTTP-transport post-processing (fail-closed egress + secret resolution).
 * For every *enabled* server with transport.type "http":
 * 1. the URL host must appear in policies.egress.httpHostAllowlist (an absent
 *    allowlist is a configuration error — HTTP egress is denied by default,
 *    unlike stdio which has no network egress by itself);
 * 2. `${ENV_VAR}` references in transport.http.headers are resolved from
 *    process.env — unset variables fail the config load.
 * Runs AFTER configVersion hashing, so resolved secrets never enter the
 * configuration hash; enabled=false servers are skipped entirely.
 */
function applyHttpTransports(loaded: Record<string, Record<string, unknown>>): void {
  const serversFile = loaded["downstreamServers"];
  if (!serversFile) return;
  const servers = serversFile["servers"] as Record<string, Record<string, unknown>> | undefined;
  if (!servers) return;
  const usesHttp = Object.entries(servers).some(
    ([id, raw]) =>
      raw["enabled"] !== false &&
      (raw["transport"] as { type?: string } | undefined)?.type === "http",
  );
  if (!usesHttp) return;
  const policies = loaded["policies"] as { egress?: { httpHostAllowlist?: unknown } } | undefined;
  const allowlistRaw = policies?.egress?.httpHostAllowlist;
  if (!Array.isArray(allowlistRaw) || allowlistRaw.some((e) => typeof e !== "string" || e.length === 0)) {
    throw new ConfigurationError(
      "configuration_invalid",
      "policies.egress.httpHostAllowlist must be a non-empty array of strings when any enabled server uses transport.type http (fail-closed egress)",
    );
  }
  const allowlist = allowlistRaw as string[];
  for (const [id, raw] of Object.entries(servers)) {
    if (raw["enabled"] === false) continue;
    const transport = raw["transport"] as { type?: string; http?: { url?: string; headers?: Record<string, string> } } | undefined;
    if (transport?.type !== "http") continue;
    const url = transport.http?.url ?? "";
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new ConfigurationError("configuration_invalid", `downstreamServers.${id}: transport.http.url is not a valid URL`);
    }
    if (!allowlist.includes(parsed.host)) {
      throw new ConfigurationError(
        "configuration_invalid",
        `downstreamServers.${id}: http host "${parsed.host}" is not allowlisted in policies.egress.httpHostAllowlist`,
      );
    }
    const headers = transport.http?.headers;
    if (headers) {
      const resolved: Record<string, string> = {};
      for (const [key, value] of Object.entries(headers)) {
        resolved[key] = value.replace(/\$\{([A-Z_][A-Z0-9_]*)\}/g, (_match, name: string) => {
          const env = process.env[name];
          if (env === undefined || env === "") {
            throw new ConfigurationError(
              "configuration_invalid",
              `downstreamServers.${id}: environment variable ${name} (transport.http.headers.${key}) is not set`,
            );
          }
          return env;
        });
      }
      transport.http!.headers = resolved;
    }
  }
}

function validateOperations(operationsFile: Record<string, unknown>): void {
  const ops = operationsFile["operations"];
  if (ops === undefined) return;
  if (ops === null || typeof ops !== "object" || Array.isArray(ops)) {
    throw new ConfigurationError("configuration_invalid", "operations.operations must be an object");
  }
  for (const [id, raw] of Object.entries(ops as Record<string, Record<string, unknown>>)) {
    const type = raw["type"];
    if (typeof type !== "string" || !OPERATION_TYPES.includes(type)) {
      throw new ConfigurationError("configuration_invalid", `operations.${id}: unknown type ${String(type)}`);
    }
    const sampling = raw["sampling"] as { purpose?: unknown; maxOutputTokens?: unknown; maximumAttempts?: unknown } | undefined;
    if (type === "sampling") {
      if (typeof sampling?.purpose !== "string" || sampling.purpose.length === 0) {
        throw new ConfigurationError("configuration_invalid", `operations.${id}: sampling requires a purpose`);
      }
      if (sampling.maxOutputTokens !== undefined && (typeof sampling.maxOutputTokens !== "number" || sampling.maxOutputTokens < 1)) {
        throw new ConfigurationError("configuration_invalid", `operations.${id}: sampling.maxOutputTokens must be a positive number`);
      }
      if (sampling.maximumAttempts !== undefined && (typeof sampling.maximumAttempts !== "number" || sampling.maximumAttempts < 1)) {
        throw new ConfigurationError("configuration_invalid", `operations.${id}: sampling.maximumAttempts must be a positive number`);
      }
    }
    if (raw["required"] !== true && raw["required"] !== false) {
      throw new ConfigurationError("configuration_invalid", `operations.${id}: required must be boolean`);
    }
  }
}

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
      if (key === "operations") validateOperations(data);
      if (key === "downstreamServers") validateDownstreamServers(data);
      loaded[key] = data;
      hashable.push(canonical(data));
    }
  }
  let specKit: SpecKitConfig | undefined;
  if (resolveProfile(cfg) === "spec-kit") {
    const profileFilePath = join(configDir, "profiles", "spec-kit.json");
    if (existsSync(profileFilePath)) {
      // T030: standalone profile file form (profiles/spec-kit.json) — deep-merged
      // over any inline integrations.specKit (guidance.json wins per key).
      const profileFile = readJsonFile(profileFilePath, "profiles/spec-kit.json") as {
        integrations?: GuidanceMainConfig["integrations"];
      };
      // Deep merge (review finding: shallow merge silently dropped profile-file
      // discovery/artifacts when guidance.json carried a partial specKit block).
      const p = profileFile.integrations?.specKit ?? {};
      const c = cfg.integrations?.specKit ?? {};
      const sk = {
        ...p,
        ...c,
        discovery: { ...p.discovery, ...c.discovery },
        artifacts: { ...p.artifacts, ...c.artifacts },
        taskExecution: {
          ...p.taskExecution,
          ...c.taskExecution,
          batch: { ...p.taskExecution?.batch, ...c.taskExecution?.batch },
        },
        changes: { ...p.changes, ...c.changes },
        completion: { ...p.completion, ...c.completion },
      };
      cfg.integrations = { specKit: sk };
    }
    specKit = buildSpecKitConfig(cfg);
    hashable.push(canonical(specKit));
  }

  const configVersion = `sha256:${hash.copy().update(hashable.join("\n")).digest("hex")}`;
  // Resolution happens AFTER the hash: secrets stay out of configVersion.
  applyHttpTransports(loaded);
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
