/**
 * Authoritative workflow state machine (FR-001–005, FR-019, FR-022, FR-028).
 * Phase guidance and transitions come exclusively from configuration.
 */
import { randomUUID, createHash } from "node:crypto";
import { createRequire } from "node:module";
import {
  existsSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
} from "node:fs";
import { resolve, join } from "node:path";
import { GuidanceError } from "../types/errors.js";
import { loadConfig, type ChainConfig, type LoadedConfig } from "../config.js";
import { WorkspaceRegistry } from "../workspace-registry.js";
import type {
  OperationConfig,
  OperationStatus,
  PhaseInstruction,
  TrustLevel,
  WorkflowDefinition,
  WorkflowSession,
} from "../types/index.js";
import { WorkspaceOpLock, workspaceLockFile } from "./workspace-lock.js";
import type { NormalizedResult } from "../types/index.js";
import {
  MetricsRepository,
  type MetricsSnapshot,
  type OperationOutcome,
} from "../metrics/MetricsRepository.js";
import type {
  DownstreamInvoker,
  ExecuteFn,
} from "../orchestration/OperationEngine.js";
import { SessionRepository } from "../state/SessionRepository.js";
import { AuditRepository } from "../state/SessionRepository.js";
import { createValidator, type SchemaValidator } from "./schema-validator.js";
import {
  OperationEngine,
  type OperationContext,
} from "../orchestration/OperationEngine.js";
import { ClientManager } from "../mcp-client/ClientManager.js";
import { PolicyEngine } from "../policy/PolicyEngine.js";
import { createRedactor } from "../policy/redaction.js";
import {
  TemplateError,
  resolveTemplate,
} from "../orchestration/template-resolver.js";

/** Shared with the config validator (WC-1): one normalization semantics. */
import { toTrustLevel } from "../trust-level.js";

/** 2e (L264): Capability-Pins über Restarts retten — vorher in-memory, Drift
 *  nach einem Restart wurde stillschweigend akzeptiert (Re-Pin beim ersten
 *  Call). Merge-on-save: mehrere Engine-Instanzen teilen sich den stateDir
 *  (Remote-Modus: eine Composition je Session). */
const CAPABILITY_PIN_FILE = "capability-hashes.json";

/** Exported for the persistence-contract tests (restart semantics). */
export function loadCapabilityPins(stateDir: string): Record<string, string> {
  const file = join(stateDir, CAPABILITY_PIN_FILE);
  if (!existsSync(file)) return {};
  try {
    return JSON.parse(readFileSync(file, "utf-8")) as Record<string, string>;
  } catch {
    return {}; // korrupte Datei: neu pinnen statt hart zu failen
  }
}

/** Exported for the persistence-contract tests (restart semantics). */
export function saveCapabilityPins(
  stateDir: string,
  pins: Map<string, string>,
): void {
  const file = join(stateDir, CAPABILITY_PIN_FILE);
  let merged: Record<string, string> = {};
  try {
    if (existsSync(file))
      merged = JSON.parse(readFileSync(file, "utf-8")) as Record<
        string,
        string
      >;
  } catch {
    merged = {}; // korrupte Datei ersetzen
  }
  for (const [key, hash] of pins) merged[key] = hash;
  // Atomic write (tmp+rename, wie Audit-/Session-Writes): ein Crash zwischen
  // Truncate und Flush darf keine korrupte/leere Pin-Datei hinterlassen.
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(merged, null, 2));
  renameSync(tmp, file);
}

/** GDS-4: full exposure-filtered operation result as returned to the agent
 *  (run_operation, phase-activation ops, submit/complete operations arrays). */
export interface ExposedOpResult {
  id: string;
  status: string;
  summary: string;
  content?: unknown[];
  data?: Record<string, unknown>;
  errors?: { code?: string; message: string }[];
  warnings?: { code?: string; message?: string }[];
  /** GDS-5: original MCP structuredContent (mcpTool ops, raw mode only). */
  structuredContent?: unknown;
  /** FR-404: one-time token for awaiting_client results. */
  opToken?: string;
}

export interface StartResult {
  accepted: true;
  sessionId: string;
  workflowId: string;
  currentPhase: string;
  status: string;
  guidance: PhaseInstruction;
  operations: ExposedOpResult[];
}

export interface ChainStep {
  request: string;
  workflowId?: string;
}

export interface ChainStepFailure {
  reason: "chain_depth_exceeded" | "chain_template_unresolved";
  error: string;
}

/** Amendment 002 (FR-117): pending spec-kit tasks in tasks.md order (State-Brücke). */
export interface PendingSpecKitTask {
  id: string;
  title?: string;
  featureId?: string;
  status?: string;
}

export interface SubmitResult {
  accepted: boolean;
  sessionId: string;
  previousPhase?: string;
  currentPhase: string;
  status: string;
  guidance?: PhaseInstruction;
  operations?: ExposedOpResult[];
  error?: { code: string; message: string; recoverable: boolean };
  /** Amendment 002: set when a chain successor was created for this completion. */
  nextSessionId?: string;
  /** RID-1: present when this result is a replay of an already-registered requestId. */
  replayed?: true;
  /** RID-1: the requestId whose cached result is being replayed. */
  duplicateOf?: string;
  /** RID-1: agent guidance for requestId hygiene. */
  warning?: string;
  /** RID-1: set (warn mode) when the replay payload differs from the first submission. */
  payloadMismatch?: true;
  chain?: {
    sessionId: string;
    request: string;
    status: string;
    error?: string;
  }[];
}

export interface EngineDeps {
  config: LoadedConfig;
  stateDir: string;
  operationEngine?: OperationEngine;
  /** spec 007 FR-701 (Amendment 004): client-side executor for remote
   *  sessions — ops with server/capability route to the downstream path,
   *  everything else to this engine (token binding). */
  clientOperationEngine?: OperationEngine;
  /** FR-117 bridge: pending spec-kit tasks of a session, tasks.md order. */
  specKitTasks?: (sessionId: string) => PendingSpecKitTask[];
  /** specs/008 T8: child engines (per non-default workspace) never re-route. */
  isChild?: boolean;
}

interface ResponsesFile {
  responses: Record<string, PhaseInstruction>;
}

interface OperationsFile {
  operations: Record<string, OperationConfig>;
}

export class WorkflowEngine {
  readonly sessions: SessionRepository;
  readonly audit: AuditRepository;
  readonly operationEngine: OperationEngine;
  private readonly definition: WorkflowDefinition;
  private readonly instructions: Record<string, PhaseInstruction>;
  private readonly operations: Record<string, OperationConfig>;
  config: LoadedConfig;
  /** specs/008 T8/T9: per-workspace child engines + session routing. */
  private readonly childEngines = new Map<string, WorkflowEngine>();
  /** Fingerprint of the config files at composition time (specs/015 AC-14:
   *  live engines must notice on-disk config changes, not only restarts). */
  private configFingerprint: string;
  /** Serializes registry read-modify-write cycles (specs/015 review F3). */
  private static registryWriteLock: Promise<unknown> = Promise.resolve();
  private readonly sessionRoutes = new Map<string, WorkflowEngine>();
  private readonly isChild: boolean;
  private readonly defaultRoot: string;
  private readonly deps: EngineDeps;
  private readonly chain: ChainConfig;
  private readonly specKitTasks?: (sessionId: string) => PendingSpecKitTask[];
  private readonly validators = new Map<string, SchemaValidator>();

  constructor(deps: EngineDeps) {
    this.config = deps.config;
    this.configFingerprint = WorkflowEngine.fingerprintConfigDir(
      deps.config.configDir,
    );
    this.isChild = deps.isChild ?? false;
    this.deps = deps;
    this.defaultRoot = deps.config.workspaces.default.root;
    this.chain = deps.config.chain ?? {
      enabled: false,
      maxChainDepth: 8,
      maxStepsPerManifest: 16,
    };
    this.specKitTasks = deps.specKitTasks;
    this.sessions = new SessionRepository(join(deps.stateDir, "sessions"));
    this.archiveDir = join(deps.stateDir, "archive");
    this.metrics = new MetricsRepository(join(deps.stateDir, "metrics.jsonl"));
    const redactionPatterns = (
      this.config.policies as
        { redaction?: { patterns?: string[] } } | undefined
    )?.redaction?.patterns ?? [
      "\\bapi[_-]?key\\b",
      "\\btoken\\b",
      "\\bsecret\\b",
      "\\bpassword\\b",
      "\\bauthorization\\b",
    ];
    this.redactionPatterns = redactionPatterns;
    this.redactor = createRedactor(redactionPatterns);
    const redact = (serialized: string): string => {
      let out = serialized;
      for (const pattern of redactionPatterns) {
        try {
          out = out.replace(
            new RegExp(
              `(["']?)(${pattern})\\1\\s*[:=]\\s*("[^"]*"|'[^']*'|[^\\s,}]+)`,
              "gi",
            ),
            `$1$2$1: "[REDACTED]"`,
          );
        } catch {
          // invalid pattern: skip (fail-open verhindern wäre Verstärkung; Muster sind config-kontrolliert)
        }
      }
      return out;
    };
    this.audit = new AuditRepository(join(deps.stateDir, "history"), redact);
    this.stateDir = deps.stateDir;
    // 2e: persistierte Capability-Pins laden (Drift-Detection überlebt Restarts)
    for (const [key, hash] of Object.entries(
      loadCapabilityPins(deps.stateDir),
    )) {
      this.pinnedHashes.set(key, hash);
    }
    this.operationEngine = deps.operationEngine ?? new OperationEngine();
    if (this.config.registryOnly) {
      // specs/014 FR-1101: registry-only instance config — no process engine.
      // Sessions MUST be started against a registered workspace whose root
      // carries its own full process config (<root>/.guidance).
      this.definition = {
        workflowId: "registry-only",
        profile: this.config.profile,
        initialPhase: "understand",
        terminalStates: ["completed", "cancelled"],
        phases: {},
      };
    } else {
      // CT-1: a config referencing operations but missing (or incompletely
      // loading) workflow.file is a valid schema document but unusable as a
      // process config — fail closed with a classified error instead of an
      // unguarded dereference (an empty workflow object is truthy, so a
      // falsiness check alone would not be sufficient).
      const wfFile = this.config.workflow as
        { workflow?: { id?: string; initialPhase?: string } } | undefined;
      if (
        !wfFile?.workflow?.id ||
        typeof wfFile.workflow.initialPhase !== "string"
      ) {
        throw new GuidanceError(
          "configuration_invalid",
          "guidance.json is missing workflow.file (or its workflow.id/initialPhase) — required when registryOnly=false",
          { recoverable: false },
        );
      }
      const file = this.config.workflow as unknown as {
        version: number;
        workflow: {
          id: string;
          profile?: string;
          initialPhase: string;
          terminalStates?: string[];
        };
        phases: WorkflowDefinition["phases"];
      };
      this.definition = {
        workflowId: file.workflow.id,
        profile: this.config.profile,
        initialPhase: file.workflow.initialPhase,
        terminalStates: file.workflow.terminalStates ?? [
          "completed",
          "cancelled",
        ],
        phases: file.phases,
      };
    }
    const responses =
      (this.config.responses as unknown as ResponsesFile | undefined)
        ?.responses ?? {};
    this.instructions = responses;
    const opsRaw =
      (this.config.operations as unknown as OperationsFile | undefined)
        ?.operations ?? {};
    this.operations = Object.fromEntries(
      Object.entries(opsRaw).map(([id, cfg]) => [
        id,
        { ...cfg, operationId: id },
      ]),
    );
    // FR-109/R-012a: TTL = 2× die längste konfigurierbare Op-Laufzeit — ein
    // Live-Holder kann das TTL damit nie überschreiten; TTL-Stale impliziert
    // garantiert toten Halter.
    const maxTimeoutSeconds = Math.max(
      0,
      ...Object.values(this.operations).map((o) => o.timeoutSeconds ?? 0),
    );
    this.lockTtlMs = Math.max(120_000, 2 * maxTimeoutSeconds * 1000);
    const downstream = this.config.downstreamServers as
      | {
          servers?: Record<
            string,
            {
              enabled?: boolean;
              required?: boolean;
              trustLevel?: string;
              transport?: {
                type?: string;
                command?: { executable: string; args: string[]; cwd?: string };
                http?: { url: string; headers?: Record<string, string> };
              };
              connection?: {
                requestTimeoutSeconds?: number;
                startupTimeoutSeconds?: number;
                reconnect?: {
                  enabled?: boolean;
                  maximumAttempts?: number;
                  delayMilliseconds?: number;
                };
              };
              capabilities?: { allow?: { tools?: string[] } };
            }
          >;
        }
      | undefined;
    const servers = downstream?.servers ?? {};
    const enabled = Object.entries(servers).filter(
      ([, v]) => v.enabled !== false,
    );
    // spec 007 FR-701 (Amendment 004, Option A): Remote-Sessions injizieren
    // einen ClientOpEngine — Ops mit server/capability laufen über den
    // regulären Downstream-Pfad (isolierter ClientManager, Q3), alle
    // übrigen Ops bleiben client-seitig (Token-Binding). Ohne Remote-
    // ClientEngine gilt das bisherige Verhalten.
    const downstreamEnabled = enabled.length > 0;
    if (downstreamEnabled) {
      this.clientManager = new ClientManager({
        requiredServers: enabled
          .filter(([, v]) => v.required)
          .map(([id]) => id),
      });
      this.allowlists = new Map(
        enabled.map(([id, v]) => [id, v.capabilities?.allow?.tools ?? []]),
      );
      // GDS-1: keep enabled server configs for on-demand status probes.
      this.downstreamServers = new Map(
        enabled as [string, Record<string, unknown>][],
      );
    }
    if (deps.clientOperationEngine) {
      const clientEngine = deps.clientOperationEngine;
      let downstreamEngine: OperationEngine | undefined;
      if (downstreamEnabled) {
        downstreamEngine = new OperationEngine();
        downstreamEngine.setDownstreamInvoker({
          invokeTool: this.buildInvokerClosure(servers, deps.stateDir),
        });
        // spec 005 F3/M2 (final review feature 007): Lifecycle-Pfade laufen
        // über executeRequired — Metrics auch dort aufzeichnen, sonst zählt
        // remote nur der direkte execute-Pfad (run_operation).
        const deRaw = downstreamEngine.execute.bind(downstreamEngine);
        downstreamEngine.execute = (config, ctx, attempt, signal) => {
          const t0 = Date.now();
          return Promise.resolve(deRaw(config, ctx, attempt, signal)).then(
            (res) => {
              this.metrics.recordOperation(
                config.operationId,
                res.status as OperationOutcome,
                Date.now() - t0,
              );
              return res;
            },
            (err) => {
              this.metrics.recordOperation(
                config.operationId,
                "failed",
                Date.now() - t0,
              );
              throw err;
            },
          );
        };
      }
      // Router: Downstream-Ops (server-Feld) → regulärer Executor,
      // client-seitige Ops → ClientOpEngine (executeRequired-only).
      const isDownstreamOp = (c: OperationConfig): boolean => Boolean(c.server);
      const clientExecuteSingle = async (
        config: OperationConfig,
        ctx: OperationContext,
        attempt: number,
        signal?: AbortSignal,
      ): Promise<NormalizedResult> => {
        const r = await clientEngine.executeRequired([config], ctx);
        return r.results[0]!;
      };
      const routerExecute: ExecuteFn = (config, ctx, attempt, signal) =>
        isDownstreamOp(config) && downstreamEngine
          ? downstreamEngine.execute(config, ctx, attempt, signal)
          : clientExecuteSingle(config, ctx, attempt, signal);
      const routerExecuteRequired = async (
        configs: OperationConfig[],
        ctx: OperationContext,
      ): Promise<{ allSucceeded: boolean; results: NormalizedResult[] }> => {
        if (!downstreamEngine)
          return clientEngine.executeRequired(configs, ctx);
        const down = configs.filter(isDownstreamOp);
        const rest = configs.filter((c) => !isDownstreamOp(c));
        const downRun = down.length
          ? await downstreamEngine.executeRequired(down, ctx)
          : { allSucceeded: true, results: [] as NormalizedResult[] };
        const restRun = rest.length
          ? await clientEngine.executeRequired(rest, ctx)
          : { allSucceeded: true, results: [] as NormalizedResult[] };
        return {
          allSucceeded: downRun.allSucceeded && restRun.allSucceeded,
          results: [...downRun.results, ...restRun.results],
        };
      };
      // LR-2 (LOW-Residue-Closure, ex-"FR-802"): Proxy — unbekannte Member-Zugriffe werden funktionsgebunden
      // an die Downstream-Engine weitergeleitet (Robustheit gegen künftige
      // Member-Nutzung; L-3-Rest aus Feature 007). Thenable-Eigenschaften
      // bleiben auf dem Target (Promise-Semantik).
      const routerTarget = {
        execute: routerExecute,
        executeRequired: routerExecuteRequired,
      };
      const forwardedCache = new Map<string, unknown>();
      this.operationEngine = new Proxy(
        routerTarget as unknown as OperationEngine,
        {
          get(target, prop, receiver) {
            if (prop === "then" || prop === "catch" || prop === "finally")
              return Reflect.get(target, prop, receiver);
            if (prop in target) return Reflect.get(target, prop, receiver);
            if (typeof prop === "string") {
              if (forwardedCache.has(prop)) return forwardedCache.get(prop);
              const value = (
                downstreamEngine as unknown as Record<string, unknown>
              )[prop];
              const stable =
                typeof value === "function"
                  ? (value as (...a: unknown[]) => unknown).bind(
                      downstreamEngine,
                    )
                  : value;
              forwardedCache.set(prop, stable);
              return stable;
            }
            return undefined;
          },
        },
      ) as unknown as OperationEngine;
    } else if (downstreamEnabled && !deps.operationEngine) {
      this.operationEngine.setDownstreamInvoker({
        invokeTool: this.buildInvokerClosure(servers, deps.stateDir),
      });
    }
    // spec 005 FR-403: metrics recording wrapper — records every operation
    // execution (lifecycle + runOperation + composite steps) without touching
    // any result semantics. Guard: der Remote-ClientOpEngine hat kein
    // execute (nur executeRequired) — dort gibt es nichts aufzuzeichnen.
    const rawExecute = (
      this.operationEngine as { execute?: ExecuteFn }
    ).execute?.bind(this.operationEngine);
    if (rawExecute) {
      const metrics = this.metrics;
      this.operationEngine.execute = (config, ctx, attempt, signal) => {
        const t0 = Date.now();
        return Promise.resolve(rawExecute(config, ctx, attempt, signal)).then(
          (res) => {
            metrics.recordOperation(
              config.operationId,
              res.status as OperationOutcome,
              Date.now() - t0,
            );
            return res;
          },
          (err) => {
            // final review F6: crash-style rejections count as failed runs
            metrics.recordOperation(
              config.operationId,
              "failed",
              Date.now() - t0,
            );
            throw err;
          },
        );
      };
    }
  }

  private clientManager?: ClientManager;
  private allowlists?: Map<string, string[]>;
  /** GDS-1: enabled downstream server configs for on-demand status probes. */
  private downstreamServers?: Map<string, Record<string, unknown>>;
  private readonly stateDir: string;
  private readonly workspaceLocks = new Map<string, WorkspaceOpLock>();
  private readonly lockTtlMs: number;
  private readonly runningOps = new Set<string>();
  private readonly activeOpControllers = new Map<
    string,
    Set<AbortController>
  >();
  private readonly redactionPatterns: string[];
  private pinnedHashes = new Map<string, string>();
  private readonly policyEngine = new PolicyEngine();
  private readonly archiveDir: string;
  private readonly redactor: ReturnType<typeof createRedactor>;
  private readonly metrics: MetricsRepository;

  /** Persists downstream op/server state into the session (FR-044). */
  recordDownstreamState(
    sessionId: string,
    opId: string,
    status: OperationStatus,
    summary: string,
  ): void {
    if (!this.sessions.exists(sessionId)) return;
    this.sessions.update(sessionId, (s) => {
      s.downstream.operations[opId] = {
        latestExecutionId: `operation-${Date.now()}`,
        status,
        attempts: (s.downstream.operations[opId]?.attempts ?? 0) + 1,
        ...(summary ? { summary } : {}),
      };
    });
  }

  /** specs/015 AC-14 helper: mtime/size fingerprint over the process config
   *  files (cheap drift probe; the authoritative validation is loadConfig). */
  private static fingerprintConfigDir(dir: string): string {
    let out = "";
    for (const f of [
      "guidance.json",
      "workflow.json",
      "responses.json",
      "operations.json",
      "downstream-servers.json",
      "policies.json",
    ]) {
      const p = join(dir, f);
      if (existsSync(p)) {
        const st = statSync(p);
        out += `${f}:${st.size}:${st.mtimeMs};`;
      }
    }
    return out;
  }

  /**
   * specs/015 US1 (FR-1201..1210, Alternative B): register/remove ONE root at
   * runtime via the same WorkspaceRegistry.build validation path — fail-closed
   * on any invalid input (FR-1203), atomic persistent write (FR-1204), audit
   * event (FR-1205), new configurationVersion (FR-1206). Tool availability is
   * gated by config (FR-1207, registryRegister.enabled, default OFF). Only the
   * instance/pool engine may mutate the registry (not child engines).
   */
  async registerWorkspace(input: {
    name: string;
    root: string;
    projectName?: string;
    remove?: boolean;
  }): Promise<{
    configurationVersion: string;
    registry: { name: string; root: string; projectName?: string }[];
  }> {
    if (this.isChild) {
      throw new GuidanceError(
        "configuration_invalid",
        "registry-register is only available on the instance engine",
        { recoverable: false },
      );
    }
    // FR-1201: profile-gated (defense in depth with the tool-list gate).
    if (this.config.profile !== "spec-kit") {
      throw new GuidanceError(
        "configuration_invalid",
        "registry-register requires the spec-kit profile (FR-1201)",
        { recoverable: true },
      );
    }
    if (!this.config.registryRegister.enabled) {
      throw new GuidanceError(
        "configuration_invalid",
        "registry-register is disabled (registryRegister.enabled: false; FR-1207)",
        { recoverable: true },
      );
    }
    // Review F3: serialize the read-modify-write cycle — concurrent calls
    // must not lose entries (last-write-wins on the shared guidance.json).
    const run = (): {
      configurationVersion: string;
      registry: { name: string; root: string; projectName?: string }[];
    } => this.registerWorkspaceLocked(input);
    const next = WorkflowEngine.registryWriteLock.then(run, run);
    WorkflowEngine.registryWriteLock = next.catch(() => undefined);
    return next;
  }

  private registerWorkspaceLocked(input: {
    name: string;
    root: string;
    projectName?: string;
    remove?: boolean;
  }): {
    configurationVersion: string;
    registry: { name: string; root: string; projectName?: string }[];
  } {
    const registryPath = join(this.config.configDir, "guidance.json");
    let raw: {
      workspaces?: { name: string; root: string; projectName?: string }[];
      [k: string]: unknown;
    };
    try {
      raw = JSON.parse(readFileSync(registryPath, "utf8"));
    } catch (err) {
      throw new GuidanceError(
        "configuration_invalid",
        `registry-register: unreadable registry file (${err instanceof Error ? err.message : String(err)})`,
        { recoverable: false },
      );
    }
    const entries = [...(raw.workspaces ?? [])];
    const existingIdx = entries.findIndex((e) => e.name === input.name);
    if (input.remove) {
      if (existingIdx < 0) {
        throw new GuidanceError(
          "configuration_invalid",
          `registry-register: unknown workspace ${input.name}`,
          { recoverable: true },
        );
      }
      entries.splice(existingIdx, 1);
    } else {
      const entry: { name: string; root: string; projectName?: string } = {
        name: input.name,
        root: input.root,
        ...(input.projectName ? { projectName: input.projectName } : {}),
      };
      if (existingIdx >= 0) entries[existingIdx] = entry;
      else entries.push(entry);
    }
    // FR-1202/FR-1203: validate the COMPLETE new registry via the same build
    // path (existsSync, name pattern, duplicate roots) — any invalid input
    // fails closed BEFORE the file is touched.
    WorkspaceRegistry.build(entries, this.defaultRoot);
    // FR-1204: atomic write (tmp file + rename in the same directory).
    const tmpPath = `${registryPath}.tmp-${process.pid}-${Date.now()}`;
    try {
      writeFileSync(
        tmpPath,
        JSON.stringify({ ...raw, workspaces: entries }, null, 2),
      );
      renameSync(tmpPath, registryPath);
    } catch (err) {
      if (existsSync(tmpPath)) rmSync(tmpPath, { force: true });
      throw new GuidanceError(
        "configuration_invalid",
        `registry-register: persist failed (${err instanceof Error ? err.message : String(err)})`,
        { recoverable: true },
      );
    }
    // FR-1206: recompose; runtime engines are invalidated so the next access
    // composes from the new registry (pool composition feeds the hash —
    // specs/008 FR-801). Review F1: removed/changed roots must ALSO purge
    // sessionRoutes entries pointing at stale child engines — otherwise
    // already-routed sessions silently keep the old composition.
    this.config = loadConfig(this.config.configDir, {
      workspaceRoot: this.defaultRoot,
    });
    this.configFingerprint = WorkflowEngine.fingerprintConfigDir(
      this.config.configDir,
    );
    for (const [root, eng] of this.childEngines) {
      if (entries.some((e) => resolve(e.root) === resolve(root))) continue;
      this.childEngines.delete(root);
      for (const [sid, route] of this.sessionRoutes) {
        if (route === eng) this.sessionRoutes.delete(sid);
      }
      void eng;
    }
    this.audit.append({
      sessionId: "instance",
      eventType: "registry_changed",
      data: {
        name: input.name,
        root: input.root,
        removed: input.remove === true,
        configurationVersion: this.config.configVersion,
      },
    });
    return {
      configurationVersion: this.config.configVersion,
      registry: entries,
    };
  }

  /**
   * specs/008 T8: lazily load and cache the composition of a non-default
   * workspace (config from <root>/.guidance, state at <root>/.guidance/state,
   * own configurationVersion). The default workspace keeps the boot
   * composition (AC-3). The spec-kit tasks bridge is parent-only (documented
   * limitation — chaining across non-default workspaces is out of scope).
   */
  private engineForWorkspace(root: string): WorkflowEngine {
    if (this.isChild || root === this.defaultRoot) {
      // specs/014 FR-1101/FR-1102: a registry-only instance has no process
      // config at the boot root — sessions must target a registered workspace
      // whose root carries its own full process config.
      if (this.config.registryOnly && root === this.defaultRoot) {
        throw new GuidanceError(
          "workspace_process_config_missing",
          'registry-only instance: the default workspace (pool root) has no process config — start a registered workspace by name (e.g. workspace: "zed"). Run the config assistant in that repo (setup_guidance_start) to create its .guidance/, and target "registry-edit" to manage this instance\'s workspaces[] registry',
          { recoverable: false },
        );
      }
      return this;
    }
    // specs/014 FR-1102 (no-copy): a registered workspace MUST carry its own
    // process config — the former silent cpSync of the boot config manufactured
    // divergent copies (audit F2/MC-2).
    const cfgDir = join(root, ".guidance");
    if (!existsSync(join(cfgDir, "guidance.json"))) {
      throw new GuidanceError(
        "workspace_process_config_missing",
        `workspace ${root} has no process config (.guidance/guidance.json) — run the config assistant in that repo (setup_guidance_start/answer/generate) or create the config manually`,
        { recoverable: false },
      );
    }
    let eng = this.childEngines.get(root);
    if (!eng) {
      const cfg = loadConfig(join(root, ".guidance"), { workspaceRoot: root });
      const stateDir = join(root, ".guidance", "state");
      mkdirSync(stateDir, { recursive: true });
      eng = new WorkflowEngine({
        config: cfg,
        stateDir,
        operationEngine: this.deps?.operationEngine,
        clientOperationEngine: this.deps?.clientOperationEngine,
        isChild: true,
      });
      this.childEngines.set(root, eng);
    }
    return eng;
  }

  /** specs/008 AC-5: after a restart the in-memory routes are gone — probe
   *  registered (non-default) workspace state dirs for the session file. */
  private probeWorkspaceRoutes(sessionId: string): void {
    if (this.sessionRoutes.has(sessionId)) return;
    for (const w of this.config.workspaces.list()) {
      if (w.root === this.defaultRoot) continue;
      if (
        existsSync(
          join(w.root, ".guidance", "state", "sessions", `${sessionId}.json`),
        )
      ) {
        this.sessionRoutes.set(sessionId, this.engineForWorkspace(w.root));
        return;
      }
    }
  }

  private routedFor(sessionId: string): WorkflowEngine | undefined {
    const eng = this.sessionRoutes.get(sessionId);
    return eng && eng !== this ? eng : undefined;
  }

  async getWorkflowState(sessionId: string): Promise<WorkflowSession> {
    const routed = this.routedFor(sessionId);
    if (routed) return routed.getWorkflowState(sessionId);
    return await this.sessions.withLock(sessionId, () => {
      // Amendment 002: getSession includes the fail-closed 'activating' check.
      // getSession may PROBE-and-route a workspace session (specs/008 T8) —
      // in that case the ENTIRE guard runs on the routing target: this
      // engine's configurationVersion is the boot/pool composition and must
      // never be applied to a repo-workspace session (AC-16 fix — a probe-
      // routed chain successor was born-invalid otherwise).
      const probeRouted = !this.isChild && !this.sessionRoutes.has(sessionId);
      const session = this.reconcileRunningOperations(
        this.getSession(sessionId),
      );
      const route = this.sessionRoutes.get(sessionId);
      if (probeRouted && route && route !== this) {
        return route.getWorkflowState(sessionId);
      }
      // specs/015 AC-14 (live-engine path): if the config files changed on
      // disk since this engine composed, recompose FIRST — otherwise a
      // long-lived engine would silently serve stale config and the guard
      // below would pass on an outdated hash (review F2).
      const fp = WorkflowEngine.fingerprintConfigDir(this.config.configDir);
      if (fp !== this.configFingerprint) {
        this.config = loadConfig(this.config.configDir, {
          workspaceRoot: session.workspaceRoot,
        });
        this.configFingerprint = fp;
      }
      // specs/008 AC-5 (FR-019 enforcement, agent-facing path) with the R2
      // rebind semantics (specs/015 addendum AC-13..17):
      //   completed sessions survive a config change (AC-13);
      //   active/blocked sessions re-validate against the CURRENT config of
      //   their own workspace and rebind on success (AC-14), audited
      //   (AC-17); failed re-validation stays fail-closed (AC-15).
      if (session.configurationVersion !== this.config.configVersion) {
        if (session.status === "completed") return session; // AC-13
        try {
          // AC-14 re-validation: full fresh composition of the session's own
          // workspace config (throws configuration_invalid on any invalid
          // registry/config input — that throw IS the AC-15 fail-closed path).
          const fresh = loadConfig(session.configDir, {
            workspaceRoot: session.workspaceRoot,
          });
          if (fresh.configVersion !== this.config.configVersion) {
            throw new GuidanceError(
              "configuration_invalid",
              `re-validation raced for session ${sessionId}: fresh ${fresh.configVersion} != engine ${this.config.configVersion}`,
              { recoverable: false },
            );
          }
          this.audit.append({
            sessionId,
            eventType: "session_rebound",
            data: {
              from: session.configurationVersion,
              to: this.config.configVersion,
            },
          });
          this.sessions.update(sessionId, (s) => {
            s.configurationVersion = this.config.configVersion;
          });
          session.configurationVersion = this.config.configVersion;
        } catch (err) {
          if (
            err instanceof GuidanceError &&
            err.code === "configuration_invalid"
          ) {
            throw err; // AC-15 fail-closed
          }
          throw new GuidanceError(
            "configuration_invalid",
            `session ${sessionId} failed re-validation against current configuration (specs/015 AC-15): ${err instanceof Error ? err.message : String(err)}`,
            { recoverable: false },
          );
        }
      }
      return session;
    });
  }

  getOrchestrationStatus(sessionId: string): {
    sessionId: string;
    currentPhase: string;
    operations: {
      id: string;
      status?: string;
      required?: boolean;
      summary?: string;
    }[];
  } {
    const routed = this.routedFor(sessionId);
    if (routed) return routed.getOrchestrationStatus(sessionId);
    const s = this.sessions.load(sessionId);
    const phaseDef = this.definition.phases[s.currentPhase];
    const ids = [
      ...(phaseDef?.lifecycle?.beforeExit ?? []),
      ...(phaseDef?.lifecycle?.afterEnter ?? []),
    ];
    return {
      sessionId,
      currentPhase: s.currentPhase,
      operations: ids.map((id) => ({
        id,
        status: s.downstream.operations[id]?.status ?? "pending",
        required: this.operations[id]?.required,
        summary: (
          s.downstream.operations[id] as unknown as
            { summary?: string } | undefined
        )?.summary,
      })),
    };
  }

  listConfiguredOperations(): {
    id: string;
    description?: string;
    type: string;
    required: boolean;
  }[] {
    return Object.values(this.operations).map((o) => ({
      id: o.operationId,
      description: o.description,
      type: o.type,
      required: o.required,
    }));
  }

  async getDownstreamStatus(): Promise<
    {
      id: string;
      status?: string;
      required?: boolean;
      lastSuccessfulRequestAt?: string;
      error?: string;
    }[]
  > {
    if (!this.clientManager) return [];
    const out: {
      id: string;
      status?: string;
      required?: boolean;
      lastSuccessfulRequestAt?: string;
      error?: string;
    }[] = [];
    for (const id of this.allowlists?.keys() ?? []) {
      // GDS-1: the HTTP transport is stateless (fresh engine+ClientManager
      // per request), so in-memory status is always empty. Probe enabled
      // http-transport servers on demand for the REAL state; non-http
      // transports are not probed (no process spawning).
      const cfg = this.downstreamServers?.get(id);
      const transport = cfg?.transport as
        | {
            type?: string;
            http?: { url?: string; headers?: Record<string, string> };
            command?: { executable?: string; args?: string[]; cwd?: string };
          }
        | undefined;
      if (transport?.type === "http") {
        const conn = cfg?.connection as
          { startupTimeoutSeconds?: number } | undefined;
        try {
          // GDS-1: ensureReady expects the flattened transport config
          // (same mapping as the invoker closure).
          const probeCfg =
            transport.type === "http" && transport.http
              ? {
                  type: "http",
                  url: transport.http.url,
                  headers: transport.http.headers,
                }
              : undefined;
          await this.clientManager.ensureReady(id, probeCfg as never, {
            handshakeTimeoutSeconds: Math.min(
              5,
              conn?.startupTimeoutSeconds ?? 5,
            ),
          });
        } catch {
          /* ensureReady records failed status itself */
        }
      }
      const st = this.clientManager.statusOf(id);
      out.push({
        id,
        status: st?.status ?? "disconnected",
        required: st?.required,
        lastSuccessfulRequestAt: st?.lastSuccessfulRequestAt,
        ...(st?.error ? { error: st.error } : {}),
      });
    }
    return out;
  }

  /** spec 005 FR-402: read-only metrics snapshot; live connection status
   *  merged over persisted snapshots. */
  async getMetrics(): Promise<MetricsSnapshot> {
    const snap = this.metrics.snapshot();
    const live = await this.getDownstreamStatus();
    for (const c of live) {
      const prev = snap.connections.find((x) => x.serverId === c.id);
      this.metrics.recordConnection(
        c.id,
        c.status ?? "unknown",
        c.lastSuccessfulRequestAt ?? prev?.lastSuccessfulRequestAt,
      );
      const existing = snap.connections.find((x) => x.serverId === c.id);
      if (existing) {
        existing.status = c.status ?? existing.status;
        existing.lastSuccessfulRequestAt =
          c.lastSuccessfulRequestAt ?? prev?.lastSuccessfulRequestAt;
      } else
        snap.connections.push({
          serverId: c.id,
          status: c.status ?? "unknown",
          lastSuccessfulRequestAt: c.lastSuccessfulRequestAt,
        });
    }
    // specs/008 T17 (FR-808): aggregate child-workspace metrics with a
    // per-workspace breakdown; top-level counters become cross-workspace sums.
    if (this.childEngines.size > 0) {
      snap.perWorkspace = {};
      for (const [root, child] of this.childEngines) {
        const name = this.config.workspaces.resolve(root).name;
        const childSnap = await child.getMetrics();
        snap.perWorkspace[name] = {
          operations: childSnap.operations,
          connections: childSnap.connections,
        };
        for (const [opId, m] of Object.entries(childSnap.operations)) {
          const agg = (snap.operations[opId] ??= {
            runs: 0,
            succeeded: 0,
            failed: 0,
            cancelled: 0,
            timedOut: 0,
            durationMs: { count: 0, sum: 0, max: 0 },
          });
          agg.runs += m.runs;
          agg.succeeded += m.succeeded;
          agg.failed += m.failed;
          agg.cancelled += m.cancelled;
          agg.timedOut += m.timedOut;
          agg.durationMs.count += m.durationMs.count;
          agg.durationMs.sum += m.durationMs.sum;
          agg.durationMs.max = Math.max(agg.durationMs.max, m.durationMs.max);
        }
        for (const c of childSnap.connections) {
          if (!snap.connections.some((x) => x.serverId === c.serverId))
            snap.connections.push(c);
        }
      }
    }
    return snap;
  }

  /** spec 006 FR-502 (R-008a): Lock je workspaceRoot — verschiedene
   *  Workspaces serialisieren sich nicht mehr gegenseitig. */
  /** spec 006 FR-705 (L-5): Cap für die Lock-Map — ältester Eintrag wird
   *  entfernt (Locks sind zustandslos nach release, Neuaufbau billig). */
  private lockFor(workspaceRoot: string): WorkspaceOpLock {
    const file = workspaceLockFile(this.stateDir, workspaceRoot);
    let lock = this.workspaceLocks.get(file);
    if (!lock) {
      if (this.workspaceLocks.size >= 64) {
        const oldest = this.workspaceLocks.keys().next().value;
        if (
          oldest !== undefined &&
          !this.workspaceLocks.get(oldest)?.isHeld()
        ) {
          this.workspaceLocks.delete(oldest);
        }
      }
      lock = new WorkspaceOpLock(file, "workspace-ops", this.lockTtlMs);
      this.workspaceLocks.set(file, lock);
    }
    return lock;
  }

  private acquireWorkspaceOpLock(workspaceRoot: string): void {
    this.lockFor(workspaceRoot).acquire();
  }

  private releaseWorkspaceOpLock(workspaceRoot: string): void {
    this.lockFor(workspaceRoot).release();
  }

  /** spec 007 FR-702: the downstream invoker closure — EXAKT die Logik aus
   *  dem bisherigen Konstruktor-Inline (Allowlist → Egress → ensureReady →
   *  Pins → invoke), als Methode, damit lokal und remote denselben Code
   *  nutzen. */
  private buildInvokerClosure(
    servers: Record<
      string,
      {
        enabled?: boolean;
        required?: boolean;
        trustLevel?: string;
        transport?: {
          type?: string;
          command?: { executable: string; args: string[]; cwd?: string };
          http?: { url: string; headers?: Record<string, string> };
        };
        connection?: {
          requestTimeoutSeconds?: number;
          startupTimeoutSeconds?: number;
          reconnect?: {
            enabled?: boolean;
            maximumAttempts?: number;
            delayMilliseconds?: number;
          };
        };
        containerRoute?: {
          url: string;
          headers?: Record<string, string>;
        };
        capabilities?: { allow?: { tools?: string[] } };
      }
    >,
    stateDir: string,
  ): DownstreamInvoker["invokeTool"] {
    return async (serverId, toolName, args) => {
      const allow = this.allowlists?.get(serverId) ?? [];
      this.clientManager!.assertAllowed(serverId, toolName, allow);
      const serverCfgE = servers[serverId];
      const opForEgress = Object.values(this.operations).find(
        (o) => o.server === serverId && o.capability === toolName,
      );
      // WC-1-B: an unconfigured tool on a wildcard server has no risk class,
      // so the FR-053 gate below could never fire — require explicit
      // approval instead of letting it run unexamined.
      this.policyEngine.assertUnconfiguredWildcard(
        serverId,
        toolName,
        allow,
        opForEgress !== undefined,
      );
      this.policyEngine.evaluateEgress({
        serverId,
        // Unrecognized configured values fall back to "trusted" (documented
        // default), keeping the egress check type-safe instead of cast.
        trustLevel: toTrustLevel(serverCfgE?.trustLevel, serverId),
        riskClass: opForEgress?.riskClass,
        args,
        approved: opForEgress?.approved === true,
      });
      const serverCfg = servers[serverId];
      const transportCfg = serverCfg?.transport;
      const conn = serverCfg?.connection;
      const connectionOpts =
        conn &&
        (conn.startupTimeoutSeconds !== undefined ||
          conn.reconnect !== undefined)
          ? {
              ...(conn.startupTimeoutSeconds !== undefined
                ? { handshakeTimeoutSeconds: conn.startupTimeoutSeconds }
                : {}),
              ...(conn.reconnect !== undefined
                ? { reconnect: conn.reconnect }
                : {}),
            }
          : undefined;
      const status = await this.clientManager!.ensureReady(
        serverId,
        serverCfg && transportCfg?.type === "http" && transportCfg.http
          ? {
              type: "http",
              url: transportCfg.http.url,
              headers: transportCfg.http.headers,
            }
          : serverCfg && transportCfg?.command
            ? {
                type: "stdio",
                executable: transportCfg.command.executable ?? "",
                args: transportCfg.command.args ?? [],
                cwd: transportCfg.command.cwd,
              }
            : undefined,
        connectionOpts,
      );
      const tool = status.tools.find((t) => t.name === toolName);
      const pinnedHash = this.pinnedHashes.get(`${serverId}:${toolName}`);
      if (pinnedHash && tool && tool.inputSchemaHash !== pinnedHash) {
        this.clientManager!.assertNotDrifted(serverId, toolName, pinnedHash);
      }
      if (tool) {
        this.pinnedHashes.set(`${serverId}:${toolName}`, tool.inputSchemaHash);
        saveCapabilityPins(stateDir, this.pinnedHashes); // 2e: Pin persistieren
      }
      const requestTimeoutSeconds =
        serverCfg?.connection?.requestTimeoutSeconds;
      const result = await this.clientManager!.invokeTool(
        serverId,
        toolName,
        args,
        requestTimeoutSeconds,
      );
      // FR-035 amendment: after a read-only/idempotent call timed out on the
      // primary transport, make exactly ONE automatic attempt over the
      // server's configured containerRoute before surfacing the failure.
      // Non-timeout transport failures keep the reconnect path; non-idempotent
      // risk classes never auto-replay (the call may already have run).
      if (
        result.kind === "transport" &&
        result.timedOut === true &&
        opForEgress?.riskClass === "read_only"
      ) {
        const cr = serverCfg?.containerRoute;
        if (cr?.url) {
          const fb = await this.clientManager!.invokeOnTransientHttpRoute(
            { url: cr.url, headers: cr.headers },
            toolName,
            args,
            requestTimeoutSeconds,
            `__containerRoute__${serverId}`,
          );
          const succeeded =
            fb.kind === "success" || fb.kind === "tool_reported";
          this.metrics.recordContainerRouteFallback(serverId, succeeded);
          // FR-035 review F5: keep FR-704 connection-status recording symmetric
          // with the primary path (the early return below must not skip it).
          const stFb = this.clientManager!.statusOf(serverId);
          this.metrics.recordConnection(
            serverId,
            stFb?.status ?? "connected",
            stFb?.lastSuccessfulRequestAt,
          );
          if (fb.kind !== "transport") return fb;
          return {
            kind: "transport",
            message: `${result.message}; containerRoute fallback failed: ${fb.message}`,
            timedOut: true,
          };
        }
      }
      // spec 005 F3/FR-704: Verbindungs-Status je Downstream-Invoke messen.
      const st = this.clientManager!.statusOf(serverId);
      this.metrics.recordConnection(
        serverId,
        st?.status ?? "connected",
        st?.lastSuccessfulRequestAt,
      );
      return result;
    };
  }

  /** spec 004 FR-202: bricht alle laufenden Operationen der Session ab
   *  (Hard-Kill: Abort → SIGTERM → SIGKILL nach Grace). */
  private abortActiveOperations(sessionId: string): void {
    const controllers = this.activeOpControllers.get(sessionId);
    if (!controllers) return;
    for (const c of controllers) c.abort();
  }

  /** spec 003 US1 (FR-101..110): on-demand execution of agent-invocable
   *  operations through the trusted lifecycle pipeline (OperationEngine →
   *  exposure → downstream state → audit). Fail-closed: nur Operationen mit
   *  invocableByAgent:true sind aufrufbar. */
  async runOperation(
    sessionId: string,
    operationId: string,
  ): Promise<ExposedOpResult> {
    const routed = this.routedFor(sessionId);
    if (routed) return routed.runOperation(sessionId, operationId);

    const session = this.getSession(sessionId);
    const auditDenial = (data: Record<string, unknown>): void =>
      this.audit.append({
        sessionId,
        eventType: "operation_invocation_denied",
        data,
      });
    const op = this.operations[operationId];
    if (!op) {
      auditDenial({ operationId, reason: "operation_not_configured" });
      throw new GuidanceError(
        "operation_not_configured",
        `operation ${operationId} is not configured`,
        { recoverable: false },
      );
    }
    if (op.invocableByAgent !== true) {
      auditDenial({ operationId, reason: "agent_invocation_denied" });
      throw new GuidanceError(
        "agent_invocation_denied",
        `operation ${operationId} is not marked invocableByAgent`,
        { recoverable: true },
      );
    }
    if (this.runningOps.has(sessionId)) {
      auditDenial({ operationId, reason: "operation_in_progress" });
      throw new GuidanceError(
        "operation_in_progress",
        `an operation is already running for session ${sessionId}`,
        { recoverable: true },
      );
    }
    this.acquireWorkspaceOpLock(session.workspaceRoot);
    this.runningOps.add(sessionId);
    // spec 004 FR-202: AbortController je Ausführung — cancel_workflow bricht
    // alle Controller der Session ab (Hard-Kill SIGTERM→SIGKILL).
    const controller = new AbortController();
    let controllers = this.activeOpControllers.get(sessionId);
    if (!controllers) {
      controllers = new Set();
      this.activeOpControllers.set(sessionId, controllers);
    }
    controllers.add(controller);
    const startedAt = Date.now();
    try {
      if (session.status !== "active") {
        this.audit.append({
          sessionId,
          eventType: "operation_invocation_denied",
          data: { operationId, reason: `session_${session.status}` },
        });
        return {
          id: operationId,
          status: "failed",
          summary: `session is ${session.status}`,
        };
      }
      const run = await this.operationEngine.execute(
        op,
        this.ctxFor(session),
        1,
        controller.signal,
      );
      // FR-202 (Hard-Kill seit Feature 004): Cancel/Timeout bricht den Child
      // via Abort ab (SIGTERM→SIGKILL); das Ergebnis wird verworfen und als
      // cancelled auditiert.
      const wasCancelled =
        this.sessions.load(sessionId).status === "cancelled" ||
        run.status === "cancelled";
      if (wasCancelled) {
        this.audit.append({
          sessionId,
          eventType: "operation_invoked",
          data: {
            operationId,
            status: "cancelled",
            durationMs: Date.now() - startedAt,
            via: "run_operation",
          },
        });
        return {
          id: operationId,
          status: "failed",
          summary: "session cancelled during operation; result discarded",
        };
      }
      this.recordDownstreamState(
        sessionId,
        run.operationId,
        run.status,
        run.summary,
      );
      this.audit.append({
        sessionId,
        eventType: "operation_invoked",
        data: {
          operationId,
          status: run.status,
          durationMs: Date.now() - startedAt,
          via: "run_operation",
        },
      });
      return this.exposeOpResult(run, op);
    } catch (err) {
      this.audit.append({
        sessionId,
        eventType: "operation_invoked",
        data: {
          operationId,
          status: "failed",
          durationMs: Date.now() - startedAt,
          via: "run_operation",
        },
      });
      throw err;
    } finally {
      this.runningOps.delete(sessionId);
      const controllers = this.activeOpControllers.get(sessionId);
      controllers?.delete(controller);
      if (controllers && controllers.size === 0)
        this.activeOpControllers.delete(sessionId);
      this.releaseWorkspaceOpLock(session.workspaceRoot);
    }
  }

  private ctxFor(session: {
    workspaceRoot: string;
    request: string;
  }): OperationContext {
    return {
      workspaceRoot: session.workspaceRoot,
      redactionPatterns: this.redactionPatterns,
      templateVars: {
        "session.request": session.request,
        "project.name": this.config.project.name,
      },
    };
  }

  async startWorkflow(input: {
    workspaceRoot?: string;
    workspace?: string;
    request: string;
    workflowId?: string;
    metadata?: Record<string, unknown>;
    chain?: unknown;
  }): Promise<StartResult> {
    // specs/008 FR-802: resolve the target workspace (name or exact root).
    // Membership enforcement lives at the MCP tool layer (assertWorkspaceRegistered).
    // The engine stays tolerant for sentinel/legacy callers (remote boot, tests):
    // an unregistered candidate keeps the boot composition instead of failing.
    const candidate =
      input.workspace ?? input.workspaceRoot ?? this.defaultRoot;
    let targetRoot: string;
    let target: WorkflowEngine = this;
    try {
      targetRoot = this.config.workspaces.resolve(candidate).root;
      target = this.engineForWorkspace(targetRoot);
    } catch (err) {
      if (
        !(err instanceof GuidanceError) ||
        err.code !== "workspace_not_registered"
      )
        throw err;
      targetRoot = resolve(candidate);
    }
    // specs/014 review F-1: a registry-only boot engine must never accept a
    // session itself — including the unregistered-candidate fallback above,
    // which bypasses engineForWorkspace's default-root guard.
    if (target === this && this.config.registryOnly && !this.isChild) {
      throw new GuidanceError(
        "workspace_process_config_missing",
        'registry-only instance: sessions must target a registered workspace whose root carries its own process config (e.g. workspace: "zed") — run the config assistant in that repo (setup_guidance_start)',
        { recoverable: false },
      );
    }
    if (target !== this) {
      const child = await target.startWorkflow({
        ...input,
        workspaceRoot: targetRoot,
        workspace: undefined,
      });
      this.sessionRoutes.set(child.sessionId, target);
      return child;
    }
    input = { ...input, workspaceRoot: targetRoot, workspace: undefined };
    const sessionId = `session-${randomUUID()}`;
    const now = new Date().toISOString();
    const chainSpec =
      input.chain !== undefined
        ? this.validateChainManifest(input.chain)
        : undefined;
    // CHAIN-Replay (remaining-work-plan L19-34): a top-level request that
    // duplicates steps[0] runs step 0 twice (session-0 under the top-level
    // request, successor-0 under steps[0]). Fail closed instead of guessing
    // intent; generic-context chains (request != steps[0]) stay valid.
    const firstStep = chainSpec?.steps?.[0];
    if (firstStep && input.request.trim() === firstStep.request.trim()) {
      throw new GuidanceError(
        "configuration_invalid",
        "chain manifest: the top-level request duplicates steps[0] — step 0 would run twice (session head + first successor). Remove the duplicated step or give the head request its own scope",
        { recoverable: true },
      );
    }
    const session: WorkflowSession = {
      sessionId,
      workflowId: input.workflowId ?? this.definition.workflowId,
      profile: this.config.profile,
      configurationVersion: this.config.configVersion,
      configDir: this.config.configDir,
      workspaceRoot: input.workspaceRoot!,
      status: "active",
      currentPhase: this.definition.initialPhase,
      previousPhase: null,
      request: input.request,
      submissions: {},
      blockers: [],
      requestIds: {},
      downstream: { servers: {}, operations: {} },
      createdAt: now,
      updatedAt: now,
      completedAt: null,
      ...(chainSpec
        ? { chainSpec, chainFrom: null, chainIndex: 0, chainUpNext: 0 }
        : {}),
    };
    this.sessions.save(session);
    this.audit.append({
      sessionId,
      eventType: "session_started",
      data: { workflowId: session.workflowId },
    });
    const activation = await this.activateSession(
      sessionId,
      session.currentPhase,
    );
    // CHN-6: read the POST-activation state fresh — the local `session`
    // snapshot predates activateSession (stale status; NIT-7).
    const fresh = this.sessions.load(sessionId);
    return {
      accepted: true,
      sessionId,
      workflowId: session.workflowId,
      currentPhase: session.currentPhase,
      status: fresh.status,
      guidance: this.guidanceFor(fresh),
      operations: activation.operations,
    };
  }

  /**
   * Amendment 002: validates the start_workflow chain manifest (FR-110/112,
   * maxStepsPerManifest). Throws configuration_invalid on violation.
   */
  private validateChainManifest(
    chain: unknown,
  ): NonNullable<WorkflowSession["chainSpec"]> {
    if (!this.chain.enabled) {
      throw new GuidanceError(
        "configuration_invalid",
        "workflow chaining is disabled (chain.enabled: false)",
        { recoverable: true },
      );
    }
    // Amendment 002 v1.1 (CHN-3): mixed manifest — steps and source are both
    // optional but at least one must be present; Form B parts stay gated to
    // the spec-kit profile.
    const c = chain as {
      steps?: unknown;
      source?: unknown;
      requestTemplate?: unknown;
      featureId?: string;
      taskFilter?: { statuses?: string[] };
    };
    const hasSteps = Array.isArray(c.steps);
    const hasSource = c.source !== undefined;
    if (!hasSteps && !hasSource) {
      throw new GuidanceError(
        "configuration_invalid",
        "chain requires either steps or source",
        { recoverable: true },
      );
    }
    const spec: NonNullable<WorkflowSession["chainSpec"]> = {};
    if (hasSource) {
      if (this.config.profile !== "spec-kit") {
        throw new GuidanceError(
          "configuration_invalid",
          'chain.source "spec_kit_tasks" requires the spec-kit profile',
          { recoverable: true },
        );
      }
      if (
        typeof c.requestTemplate !== "string" ||
        c.requestTemplate.length === 0
      ) {
        throw new GuidanceError(
          "configuration_invalid",
          "chain.source requires a non-empty requestTemplate",
          { recoverable: true },
        );
      }
      spec.source = "spec_kit_tasks";
      spec.requestTemplate = c.requestTemplate;
      spec.featureId = c.featureId;
      spec.taskFilter = c.taskFilter;
      spec.chainedTaskIds = [];
    }
    if (hasSteps) {
      if ((c.steps as unknown[]).length > this.chain.maxStepsPerManifest) {
        throw new GuidanceError(
          "configuration_invalid",
          `chain.steps exceeds maxStepsPerManifest (${this.chain.maxStepsPerManifest})`,
          { recoverable: true },
        );
      }
      spec.steps = (
        c.steps as { request?: unknown; workflowId?: unknown }[]
      ).map((st) => {
        if (typeof st.request !== "string" || st.request.length === 0) {
          throw new GuidanceError(
            "configuration_invalid",
            "chain step requires a non-empty request",
            { recoverable: true },
          );
        }
        return {
          request: st.request,
          workflowId:
            typeof st.workflowId === "string" ? st.workflowId : undefined,
        };
      });
    }
    return spec;
  }

  /**
   * Amendment 002 (FR-111/117): resolves the next chain step for a completed
   * session. Returns null for a silent chain end, or a failure descriptor.
   */
  private resolveChainStep(
    session: WorkflowSession,
    report: Record<string, unknown>,
  ):
    | {
        step: ChainStep;
        spec: NonNullable<WorkflowSession["chainSpec"]>;
        upNext: number;
        taskId?: string;
        featureId?: string;
      }
    | { failure: ChainStepFailure }
    | null {
    const spec = session.chainSpec;
    if (!spec) return null;
    const templateCtx = {
      chain: {
        parentRequest: session.request,
        completionSummary:
          typeof report.summary === "string" ? report.summary : "",
        changedFiles: this.collectChangedFiles(session),
      },
      project: { name: this.config.project.name },
      session: { request: session.request },
    };
    // Amendment 002 v1.1 (CHN-3): mixed chains run explicit steps FIRST and
    // fall through to Form B task derivation once steps are exhausted.
    const steps = spec.steps ?? [];
    const idx = session.chainUpNext ?? 0;
    if (idx < steps.length) {
      // Form A: exhaustion check BEFORE the depth gate (review LOW-4): a
      // manifest with steps.length >= maxChainDepth must end SILENTLY after
      // its last step (Spec §3.2), not with a chain_depth_exceeded failure.
      if ((session.chainIndex ?? 0) >= this.chain.maxChainDepth) {
        return {
          failure: {
            reason: "chain_depth_exceeded",
            error: `chainIndex ${session.chainIndex} reached maxChainDepth (${this.chain.maxChainDepth})`,
          },
        };
      }
      try {
        const request = resolveTemplate(
          steps[idx]!.request,
          templateCtx,
        ) as string;
        return {
          step: { request, workflowId: steps[idx]!.workflowId },
          spec,
          upNext: idx,
        };
      } catch (err) {
        if (err instanceof TemplateError) {
          return {
            failure: {
              reason: "chain_template_unresolved",
              error: err.message,
            },
          };
        }
        throw err;
      }
    }
    if (spec.source === "spec_kit_tasks") {
      // FR-111 (§11.4): the depth gate is the Form-B backstop (natural bound
      // = pending-task count), so it runs BEFORE candidate search here.
      if ((session.chainIndex ?? 0) >= this.chain.maxChainDepth) {
        return {
          failure: {
            reason: "chain_depth_exceeded",
            error: `chainIndex ${session.chainIndex} reached maxChainDepth (${this.chain.maxChainDepth})`,
          },
        };
      }
      const statuses = spec.taskFilter?.statuses ?? ["pending"];
      const done = new Set(spec.chainedTaskIds ?? []);
      const candidate = (this.specKitTasks?.(session.sessionId) ?? []).find(
        (t) =>
          !done.has(t.id) &&
          (t.status === undefined || statuses.includes(t.status)),
      );
      if (!candidate) return null;
      try {
        const request = resolveTemplate(spec.requestTemplate ?? "", {
          ...templateCtx,
          chain: {
            ...templateCtx.chain,
            taskId: candidate.id,
            taskTitle: candidate.title ?? candidate.id,
            featureId: candidate.featureId ?? spec.featureId ?? "",
          },
        }) as string;
        return {
          step: { request },
          spec,
          // HIGH-1 fix (CHN-3 review): report the EXHAUSTED index so the
          // successor's chainUpNext stays >= steps.length — otherwise the
          // successor re-enters Form A at steps[1] after every task step.
          upNext: steps.length,
          taskId: candidate.id,
          featureId: candidate.featureId ?? spec.featureId ?? "",
        };
      } catch (err) {
        if (err instanceof TemplateError) {
          return {
            failure: {
              reason: "chain_template_unresolved",
              error: err.message,
            },
          };
        }
        throw err;
      }
    }
    return null; // steps exhausted (or absent) and no source → silent end
  }

  /** Changed files of the predecessor's implement submission (chain template context). */
  private collectChangedFiles(session: WorkflowSession): string {
    const impl = session.submissions?.implement as
      { payload?: { changedFiles?: unknown } } | undefined;
    const files = Array.isArray(impl?.payload?.changedFiles)
      ? impl.payload.changedFiles.filter(
          (f): f is string => typeof f === "string",
        )
      : [];
    return files.join(", ");
  }
  /**
   * Lifecycle activation (beforeEnter + afterEnter) for a freshly created
   * session — used by startWorkflow AND chain successor creation (T004
   * refactor; behavior-neutral, FR-040 blocking semantics preserved).
   * Persists status transitions on the session.
   */
  private async activateSession(
    sessionId: string,
    phase: string,
  ): Promise<{
    operations: { id: string; status: string; summary: string }[];
    blocked: boolean;
  }> {
    const opResultsStart: { id: string; status: string; summary: string }[] =
      [];
    let blocked = false;
    for (const id of this.definition.phases[phase]?.lifecycle?.beforeEnter ??
      []) {
      const op = this.operations[id];
      if (!op)
        throw new GuidanceError(
          "operation_not_configured",
          `operation ${id} is not configured`,
          { recoverable: false },
        );
      const run = await this.operationEngine.executeRequired([op], {
        workspaceRoot: this.sessions.load(sessionId).workspaceRoot,
        redactionPatterns: this.redactionPatterns,
      });
      for (const r of run.results) {
        opResultsStart.push(this.exposeOpResult(r, op));
        this.recordDownstreamState(
          sessionId,
          r.operationId,
          r.status,
          r.summary,
        );
      }
      if (op.required && !run.allSucceeded) {
        blocked = true;
        this.sessions.update(sessionId, (s) => {
          s.status = "blocked";
          s.blockers.push({
            blockerId: `blocker-${randomUUID()}`,
            category: "required_operation_failed",
            description: `beforeEnter operation ${id} failed at session start`,
            requiresUserDecision: false,
          });
        });
        this.audit.append({
          sessionId,
          eventType: "hook_failed",
          phase,
          data: { lifecycle: "beforeEnter", operationId: id, blocked: true },
        });
        // Symmetrie zum Submit-Pfad: ein required failure blockiert sofort;
        // weitere beforeEnter/afterEnter-Ops laufen nicht mehr (fail-fast).
        break;
      }
    }
    this.audit.append({
      sessionId,
      eventType: "phase_entered",
      phase,
      data: {},
    });
    const afterEnterResults = blocked
      ? []
      : await this.runAfterEnter(this.sessions.load(sessionId), phase);
    const operations = [...opResultsStart, ...afterEnterResults];
    // requiredFailed must be computed over afterEnter results ONLY — failed
    // required beforeEnter start-ops already blocked the session above.
    const requiredFailed =
      afterEnterResults.length > 0 &&
      afterEnterResults.some((o) => o.status !== "succeeded") &&
      (this.definition.phases[phase]?.lifecycle?.afterEnter ?? []).some(
        (id) => this.operations[id]?.required,
      );
    if (requiredFailed) {
      // FR-040: a required afterEnter failure blocks the session at start.
      blocked = true;
      this.sessions.update(sessionId, (s) => {
        s.status = "blocked";
        s.previousPhase = s.currentPhase;
        s.blockers.push({
          blockerId: `blocker-${randomUUID()}`,
          category: "required_operation_failed",
          description:
            "a required afterEnter operation failed at session start",
          requiresUserDecision: false,
        });
      });
      this.audit.append({
        sessionId,
        eventType: "hook_failed",
        phase,
        data: { blocked: true },
      });
    }
    return { operations, blocked };
  }

  /** Runs afterEnter operations for a phase; required failures are audited (FR-040). */
  private async runAfterEnter(
    session: WorkflowSession,
    phase: string,
  ): Promise<{ id: string; status: string; summary: string }[]> {
    const ids = this.definition.phases[phase]?.lifecycle?.afterEnter ?? [];
    const out: { id: string; status: string; summary: string }[] = [];
    for (const id of ids) {
      const op = this.operations[id];
      if (!op)
        throw new GuidanceError(
          "operation_not_configured",
          `operation ${id} is not configured`,
          { recoverable: false },
        );
      const run = await this.operationEngine.executeRequired(
        [op],
        this.ctxFor(session),
      );
      for (const r of run.results) {
        out.push(this.exposeOpResult(r, op));
        if (op.required && r.status !== "succeeded") {
          this.audit.append({
            sessionId: session.sessionId,
            eventType: "hook_failed",
            phase,
            data: { operationId: id },
          });
        }
      }
    }
    return out;
  }

  getSession(sessionId: string): WorkflowSession {
    // Public entry may address a child-workspace session (specs/008 T8);
    // internal callers always pass locally-known ids, so the fallback path
    // keeps internal semantics untouched.
    if (!this.isChild) this.probeWorkspaceRoutes(sessionId);
    if (this.sessionRoutes.has(sessionId)) {
      return this.sessionRoutes.get(sessionId)!.getSession(sessionId);
    }
    // Pure read — running-op reconciliation happens under the session lock
    // via getWorkflowState (write-on-read outside the lock caused a
    // lost-update window, review Phase 10-12 Finding 1).
    const session = this.sessions.load(sessionId);
    // Amendment 002 (Crash-Fenster-Fix, Plan-Review F1): eine Successor-Session,
    // deren Lifecycle-Aktivierung nie abgeschlossen hat, wird fail-closed
    // abgelehnt — stiller Gate-Bypass (beforeEnter lief nie) ist ausgeschlossen.
    if (session.status === "activating") {
      throw new GuidanceError(
        "chain_activation_incomplete",
        "chain successor activation did not complete; use retry_operation or report_blocker",
        { recoverable: true },
      );
    }
    return session;
  }

  /**
   * FR-043 crash recovery: operations recorded as `running` at load time were
   * interrupted — reconcile them to `unknown` (state-changing ops block rather
   * than re-run). Read-only/idempotent ops may be retried by policy later.
   */
  private reconcileRunningOperations(
    session: WorkflowSession,
  ): WorkflowSession {
    let changed = false;
    for (const [opId, entry] of Object.entries(session.downstream.operations)) {
      if (entry.status === "running") {
        session.downstream.operations[opId] = { ...entry, status: "unknown" };
        changed = true;
      }
    }
    if (changed) this.sessions.save(session);
    return session;
  }

  /** FR-029: archive/delete finished sessions older than the retention period. */
  pruneFinishedSessions(
    maxAgeDays: number,
    mode: "archive" | "delete" = "archive",
  ): number {
    const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
    let pruned = 0;
    for (const id of this.sessions.list()) {
      const s = this.sessions.load(id);
      if (s.status !== "completed" && s.status !== "cancelled") continue;
      const ref = s.completedAt ?? s.updatedAt;
      if (new Date(ref).getTime() < cutoff) {
        const target = join(this.archiveDir, `${id}.json`);
        mkdirSync(this.archiveDir, { recursive: true });
        if (mode === "archive") {
          writeFileSync(target, JSON.stringify(s, null, 2));
        }
        this.sessions.remove(id);
        this.audit.append({
          sessionId: id,
          eventType:
            mode === "archive" ? "session_archived" : "session_deleted",
          data: { retentionDays: maxAgeDays },
        });
        pruned += 1;
      }
    }
    return pruned;
  }

  submit(
    sessionId: string,
    phase: string,
    payload: Record<string, unknown>,
    requestId?: string,
  ): Promise<SubmitResult> {
    const routed = this.routedFor(sessionId);
    if (routed) return routed.submit(sessionId, phase, payload, requestId);
    return this.sessions.withLock(sessionId, () =>
      this.submitLocked(sessionId, phase, payload, requestId),
    );
  }

  /** FR-037/§30: op result filtered per returnToAgent exposure before agent-facing use.
   *  GDS-4: the full exposure-filtered payload (content, data, errors, warnings)
   *  is forwarded — never just {id,status,summary}. Downstream content is
   *  redacted upstream (OperationEngine), so this is a projection, not a
   *  sanitization step. */
  private exposeOpResult(
    r: {
      operationId: string;
      status: string;
      summary: string;
      content?: unknown[];
      data?: Record<string, unknown>;
      errors?: { code?: string; message?: string }[];
      warnings?: { code?: string; message?: string }[];
      protocolMetadata?: { structuredContent?: unknown } | null;
    },
    config?: OperationConfig,
  ): ExposedOpResult {
    // GDS-5: raw is the DEFAULT - the container route is a transparent
    // proxy (agent-facing response identical to a direct tool call).
    // Restriction modes are opt-out per operation.
    const mode = config?.output?.returnToAgent ?? "raw";
    const exposed = this.policyEngine.applyExposure(
      {
        ...r,
        content: r.content ?? [],
        data: r.data ?? {},
        errors: [],
        warnings: r.warnings ?? [],
      },
      mode,
    );
    const errorMessages: string[] =
      r.errors?.map((e) => this.redactor.redact(String(e.message ?? ""))) ?? [];
    const includeErrors =
      mode === "summary_and_errors" || mode === "normalized" || mode === "raw";
    const suffix =
      errorMessages.length > 0 && includeErrors
        ? `: ${errorMessages.join("; ").slice(0, 500)}`
        : "";
    // spec 005 FR-404: awaiting_client-Resultate tragen den One-Time-Token,
    // damit der Client beim report_operation_result das Binding erfüllen kann.
    const opToken = (r.data as { opToken?: string } | undefined)?.opToken;
    return {
      id: r.operationId,
      status: r.status,
      summary: exposed.summary + suffix,
      content: exposed.content as unknown[],
      ...(mode === "raw" &&
      exposed.protocolMetadata?.structuredContent !== undefined &&
      exposed.protocolMetadata?.structuredContent !== null
        ? { structuredContent: exposed.protocolMetadata.structuredContent }
        : {}),
      data: exposed.data as Record<string, unknown>,
      errors: includeErrors
        ? errorMessages.map((message) => ({ message }))
        : [],
      warnings: (exposed.warnings ?? []) as {
        code?: string;
        message?: string;
      }[],
      ...(opToken ? { opToken } : {}),
    };
  }

  /**
   * RID-1: requestId-reuse policy. Default "warn" keeps existing
   * idempotency-retries working (marker only); "reject-mismatch" additionally
   * rejects replays whose payload hash differs from the first submission.
   */
  private requestIdReuseMode(): "warn" | "reject-mismatch" {
    const mode = (
      this.config.policies as
        { submission?: { requestIdReuse?: unknown } } | undefined
    )?.submission?.requestIdReuse;
    return mode === "reject-mismatch" ? "reject-mismatch" : "warn";
  }

  /**
   * RID-1: replay of an already-registered requestId. The cached result is
   * NEVER mutated (the Amendment-002 successor-race logic relies on replays);
   * a shallow clone carries the additive replay fields. Same-payload replays
   * always pass; mismatched payloads are rejected under the strict policy and
   * flagged under the default.
   */
  private replaySubmitResult(
    session: import("../types/index.js").WorkflowSession,
    requestId: string,
    payload: Record<string, unknown>,
    cached: SubmitResult,
  ): SubmitResult {
    const stored = session.requestPayloadHashes?.[requestId];
    const payloadMismatch =
      stored !== undefined && stored !== stablePayloadHash(payload);
    // RID-1 review RID-3: count BEFORE the policy throw — rejected mismatches
    // are replay traffic too and must show up in the metrics.
    this.metrics.recordRequestIdReplay(payloadMismatch);
    // RID-1 review RID-4: persistent audit trail for replay traffic.
    this.audit.append({
      sessionId: session.sessionId,
      eventType: "request_replayed",
      phase: session.currentPhase,
      data: { requestId, payloadMismatch },
    });
    if (payloadMismatch && this.requestIdReuseMode() === "reject-mismatch") {
      throw new GuidanceError(
        "requestId_reuse_payload_mismatch",
        `requestId ${requestId} was already used with a different payload — issue a fresh requestId for a new submission`,
        { recoverable: true },
      );
    }
    return {
      ...cached,
      replayed: true,
      duplicateOf: requestId,
      warning:
        "requestId already used — phase unchanged; issue a fresh requestId per phase submission",
      ...(payloadMismatch ? { payloadMismatch: true } : {}),
    };
  }

  private async submitLocked(
    sessionId: string,
    phase: string,
    payload: Record<string, unknown>,
    requestId?: string,
  ): Promise<SubmitResult> {
    const session = this.getSession(sessionId);

    if (requestId && session.requestIds[requestId] !== undefined) {
      return this.replaySubmitResult(
        session,
        requestId,
        payload,
        session.requestIds[requestId] as SubmitResult,
      );
    }

    const fail = (
      code: import("../types/errors.js").ErrorCode,
      message: string,
    ): SubmitResult => {
      this.audit.append({
        sessionId,
        eventType: "submission_rejected",
        phase,
        data: { code },
      });
      const err = new GuidanceError(code, message, {
        recoverable: code !== "workflow_already_completed",
        currentPhase: session.currentPhase,
        workflowStatus: session.status,
      });
      return {
        ...err.toResponse(),
        sessionId,
        currentPhase: err.currentPhase ?? session.currentPhase,
        status: session.status,
      };
    };

    if (session.status === "blocked") {
      return fail(
        "workflow_blocked",
        "the session is blocked; use resume_workflow",
      );
    }
    if (session.status !== "active") {
      return fail("workflow_already_completed", `session is ${session.status}`);
    }
    if (session.currentPhase !== phase) {
      return fail(
        "invalid_active_phase",
        `expected ${session.currentPhase}, got ${phase}`,
      );
    }

    const phaseDef = this.definition.phases[session.currentPhase];
    if (phaseDef?.submissionSchema) {
      const validator = this.validatorFor(phaseDef.submissionSchema);
      const result = validator.validate(payload);
      if (!result.valid) {
        return fail("submission_invalid", result.errors.join("; "));
      }
    }

    // Persist submission (FR-019) and audit.
    session.submissions[phase] = {
      phaseId: phase,
      payload,
      acceptedAt: new Date().toISOString(),
      schemaRef: phaseDef?.submissionSchema ?? "inline",
    };
    this.audit.append({
      sessionId,
      eventType: "submission_received",
      phase,
      data: {},
    });

    // Required beforeExit operations gate the transition (FR-005/FR-040).
    const ops = (phaseDef?.lifecycle?.beforeExit ?? []).map((id) => {
      const op = this.operations[id];
      if (!op)
        throw new GuidanceError(
          "operation_not_configured",
          `operation ${id} is not configured`,
          { recoverable: false },
        );
      return op;
    });
    let opResults: { id: string; status: string; summary: string }[] = [];
    let opsSucceeded = true;
    if (ops.length > 0) {
      const ctx: OperationContext = this.ctxFor(session);
      for (const op of ops) {
        this.recordDownstreamState(sessionId, op.operationId, "running", "");
      }
      const run = await this.operationEngine.executeRequired(ops, ctx);
      opsSucceeded = run.allSucceeded;
      const opById = new Map(ops.map((op) => [op.operationId, op]));
      opResults = run.results.map((r) =>
        this.exposeOpResult(r, opById.get(r.operationId)),
      );
      for (const r of run.results) {
        this.recordDownstreamState(
          sessionId,
          r.operationId,
          r.status,
          r.summary,
        );
      }
    }

    // Transition selection: success path ignores reason-only alternatives.
    const target = this.selectTransition(
      phaseDef?.transitions ?? [],
      opsSucceeded,
      opsSucceeded ? undefined : "verification_failed",
    );
    if (!target) {
      this.audit.append({
        sessionId,
        eventType: "transition_rejected",
        phase,
        data: { opsSucceeded },
      });
      const err = new GuidanceError(
        "required_hook_failed",
        "required lifecycle operations failed; remaining in phase",
        {
          recoverable: true,
          currentPhase: session.currentPhase,
          workflowStatus: session.status,
        },
      );
      return {
        ...err.toResponse(),
        sessionId,
        status: session.status,
        operations: opResults,
      } as SubmitResult;
    }

    // FR-038: beforeEnter der Ziel-Phase VOR dem Betreten; Required-Failure
    // blockiert die Transition (Session bleibt in der alten Phase).
    const beforeEnterIds =
      this.definition.phases[target]?.lifecycle?.beforeEnter ?? [];
    for (const id of beforeEnterIds) {
      const op = this.operations[id];
      if (!op)
        throw new GuidanceError(
          "operation_not_configured",
          `operation ${id} is not configured`,
          { recoverable: false },
        );
      const run = await this.operationEngine.executeRequired(
        [op],
        this.ctxFor(session),
      );
      for (const r of run.results) {
        opResults.push(this.exposeOpResult(r, op));
        this.recordDownstreamState(
          sessionId,
          r.operationId,
          r.status,
          r.summary,
        );
      }
      if (op.required && !run.allSucceeded) {
        this.audit.append({
          sessionId,
          eventType: "hook_failed",
          phase: target,
          data: { lifecycle: "beforeEnter", operationId: id },
        });
        const err = new GuidanceError(
          "required_hook_failed",
          `beforeEnter operation ${id} failed; transition blocked`,
          {
            recoverable: true,
            currentPhase: session.currentPhase,
            workflowStatus: session.status,
          },
        );
        return {
          ...err.toResponse(),
          sessionId,
          status: session.status,
          operations: opResults,
        } as SubmitResult;
      }
    }

    const previousPhase = session.currentPhase;
    this.audit.append({
      sessionId,
      eventType: "phase_exited",
      phase: previousPhase,
      data: {},
    });
    session.previousPhase = previousPhase;
    session.currentPhase = target;
    this.audit.append({
      sessionId,
      eventType: "transition_accepted",
      phase: target,
      data: { from: previousPhase },
    });
    this.audit.append({
      sessionId,
      eventType: "phase_entered",
      phase: target,
      data: {},
    });

    // FR-038: afterExit der alten Phase nach dem Verlassen (nicht-blockierend,
    // Required-Failures werden auditiert).
    const afterExitIds =
      this.definition.phases[previousPhase]?.lifecycle?.afterExit ?? [];
    for (const id of afterExitIds) {
      const op = this.operations[id];
      if (!op)
        throw new GuidanceError(
          "operation_not_configured",
          `operation ${id} is not configured`,
          { recoverable: false },
        );
      const run = await this.operationEngine.executeRequired(
        [op],
        this.ctxFor(session),
      );
      for (const r of run.results) {
        opResults.push(this.exposeOpResult(r, op));
        this.recordDownstreamState(
          sessionId,
          r.operationId,
          r.status,
          r.summary,
        );
      }
      if (op.required && !run.allSucceeded) {
        this.audit.append({
          sessionId,
          eventType: "hook_failed",
          phase: previousPhase,
          data: { lifecycle: "afterExit", operationId: id },
        });
      }
    }

    opResults.push(...(await this.runAfterEnter(session, target)));
    const result: SubmitResult = {
      accepted: true,
      sessionId,
      previousPhase,
      currentPhase: target,
      status: session.status,
      guidance: this.guidanceFor(session, target),
      operations: opResults,
    };
    this.sessions.update(sessionId, (s) => {
      s.currentPhase = target;
      s.previousPhase = previousPhase;
      s.submissions[phase] = session.submissions[phase]!;
      if (requestId) {
        s.requestIds[requestId] = result;
        s.requestPayloadHashes ??= {};
        s.requestPayloadHashes[requestId] = stablePayloadHash(payload);
      }
    });
    return result;
  }

  async completeWorkflow(
    sessionId: string,
    report: Record<string, unknown>,
    requestId?: string,
  ): Promise<SubmitResult> {
    const routed = this.routedFor(sessionId);
    if (routed) return routed.completeWorkflow(sessionId, report, requestId);
    const result = await this.sessions.withLock(sessionId, () =>
      this.completeWorkflowLocked(sessionId, report, requestId),
    );
    return await this.activateSuccessor(result, requestId);
  }

  /** Amendment 002: Successor-Lifecycle OUTSIDE the predecessor lock (Spec §4.2).
   *  Guard "activating": replays (requestIds idempotency) return the cached
   *  result whose successor is already active/blocked — no double activation.
   *  Shared by completeWorkflow AND retryOperations (GDS-6 finalize). */
  private async activateSuccessor(
    result: SubmitResult,
    requestId?: string,
  ): Promise<SubmitResult> {
    if (result.nextSessionId) {
      // MEDIUM-3: activation runs under the SUCCESSOR's lock with an in-lock
      // re-check — a concurrent replay of the same requestId can only win the
      // race once; the loser sees status != activating and returns the result.
      await this.sessions.withLock(result.nextSessionId, async () => {
        const successor = this.sessions.load(result.nextSessionId!);
        if (successor.status !== "activating") return;
        const activation = await this.activateSession(
          successor.sessionId,
          successor.currentPhase,
        );
        this.sessions.update(successor.sessionId, (s) => {
          if (!activation.blocked) s.status = "active";
        });
        result.chain = [
          {
            sessionId: successor.sessionId,
            request: successor.request,
            status: activation.blocked ? "blocked" : "active",
          },
        ];
        if (requestId) {
          this.sessions.update(result.sessionId, (s) => {
            s.requestIds[requestId] = result;
          });
        }
      });
    }
    return result;
  }

  private async completeWorkflowLocked(
    sessionId: string,
    report: Record<string, unknown>,
    requestId?: string,
  ): Promise<SubmitResult> {
    const session = this.getSession(sessionId);
    if (requestId && session.requestIds[requestId] !== undefined) {
      return this.replaySubmitResult(
        session,
        requestId,
        report,
        session.requestIds[requestId] as SubmitResult,
      );
    }
    // RID-1: keep the first-seen payload hash per requestId up to date — the
    // hash must always reflect the LATEST attempt, otherwise a failed attempt
    // poisons the fingerprint and wrongfully flags the later successful
    // attempt's replays as mismatched (review RID-2). Overwrite on every
    // non-replay path; replays (registered requestIds) return above.
    if (requestId) {
      this.sessions.update(sessionId, (s) => {
        s.requestPayloadHashes ??= {};
        s.requestPayloadHashes[requestId] = stablePayloadHash(report);
      });
    }
    if (session.status === "completed") {
      const err = new GuidanceError(
        "workflow_already_completed",
        "session is already completed",
        { recoverable: false },
      );
      return {
        ...err.toResponse(),
        sessionId,
        currentPhase: err.currentPhase ?? session.currentPhase,
        status: session.status,
      };
    }
    if (session.status === "blocked") {
      const err = new GuidanceError(
        "workflow_blocked",
        "the session is blocked; use resume_workflow",
        { recoverable: true },
      );
      return {
        ...err.toResponse(),
        sessionId,
        currentPhase: err.currentPhase ?? session.currentPhase,
        status: session.status,
      };
    }
    if (session.currentPhase !== "complete") {
      const err = new GuidanceError(
        "invalid_active_phase",
        `completion requires phase 'complete' (active: ${session.currentPhase})`,
        {
          recoverable: true,
          currentPhase: session.currentPhase,
          workflowStatus: session.status,
        },
      );
      return {
        ...err.toResponse(),
        sessionId,
        currentPhase: err.currentPhase ?? session.currentPhase,
        status: session.status,
      };
    }
    const phaseDef = this.definition.phases["complete"];
    const schema = phaseDef?.submissionSchema;
    if (schema) {
      const result = this.validatorFor(schema).validate(report);
      if (!result.valid) {
        const err = new GuidanceError(
          "submission_invalid",
          result.errors.join("; "),
          { recoverable: true, currentPhase: "complete" },
        );
        return {
          ...err.toResponse(),
          sessionId,
          currentPhase: err.currentPhase ?? "complete",
          status: session.status,
        };
      }
    }

    const ops = (phaseDef?.lifecycle?.beforeExit ?? []).map((id) => {
      const op = this.operations[id];
      if (!op)
        throw new GuidanceError(
          "operation_not_configured",
          `operation ${id} is not configured`,
          { recoverable: false },
        );
      return op;
    });
    const run = await this.operationEngine.executeRequired(
      ops,
      this.ctxFor(session),
    );
    const opById = new Map(ops.map((op) => [op.operationId, op]));
    const opResults = run.results.map((r) =>
      this.exposeOpResult(r, opById.get(r.operationId)),
    );

    if (!run.allSucceeded) {
      this.audit.append({
        sessionId,
        eventType: "hook_failed",
        phase: "complete",
        data: { results: opResults },
      });
      // GDS-6: retain the completion report so a successful retry_operation
      // can finalize (status/audit/successor) instead of wedging the session
      // in status=active/phase=completed.
      this.sessions.update(sessionId, (s) => {
        s.pendingCompletion = { report, ...(requestId ? { requestId } : {}) };
      });
      const err = new GuidanceError(
        "required_hook_failed",
        "mandatory completion operations failed; the workflow cannot complete",
        {
          recoverable: true,
          currentPhase: "complete",
          workflowStatus: "active",
          allowedActions: [
            "retry_operation",
            "get_workflow_state",
            "report_blocker",
          ],
        },
      );
      return {
        ...err.toResponse(),
        sessionId,
        currentPhase: "complete",
        status: session.status,
        operations: opResults,
      } as SubmitResult;
    }

    const now = new Date().toISOString();
    const successResult: SubmitResult = {
      accepted: true,
      sessionId,
      currentPhase: "completed",
      status: "completed",
      operations: opResults,
    };
    this.sessions.update(sessionId, (s) => {
      s.status = "completed";
      s.currentPhase = "completed";
      s.completedAt = now;
    });
    this.audit.append({
      sessionId,
      eventType: "workflow_completed",
      phase: "completed",
      data: { operations: opResults },
    });
    // Amendment 002: chain successor creation (lazy, inside the predecessor
    // lock — the successor session is NEW, per-session locks ⇒ no inversion).
    // GDS-6: shared with retryOperations' finalize path (same semantics from
    // the retained completion report).
    return this.createChainSuccessorLocked(
      session,
      report,
      successResult,
      requestId,
    );
  }

  /** Chain successor creation for BOTH completion paths: completeWorkflow
   *  (direct success) and retryOperations finalize (GDS-6, from the retained
   *  pendingCompletion report). Runs inside the predecessor's session lock;
   *  activation happens OUTSIDE via activateSuccessor (Spec §4.2). */
  private createChainSuccessorLocked(
    session: WorkflowSession,
    report: Record<string, unknown>,
    successResult: SubmitResult,
    requestId?: string,
  ): SubmitResult {
    const resolved = this.resolveChainStep(session, report);
    if (resolved === null) {
      // CHN-4: a silent Form-B end (source set, no pending candidate) is the
      // normal termination but deserves a diagnostic marker so a broken
      // bridge is at least countable; pure Form-A exhaustion stays fully
      // silent per Spec §3.2.
      if (session.chainSpec?.source === "spec_kit_tasks") {
        this.audit.append({
          sessionId: session.sessionId,
          eventType: "chain_end",
          phase: "completed",
          data: {
            reason: "no_pending_tasks",
            chainedCount: (session.chainSpec.chainedTaskIds ?? []).length,
          },
        });
      }
      if (requestId) {
        this.sessions.update(session.sessionId, (s) => {
          s.requestIds[requestId] = successResult;
        });
      }
      return successResult;
    }
    if ("failure" in resolved) {
      this.audit.append({
        sessionId: session.sessionId,
        eventType: "chain_failed",
        phase: "completed",
        data: {
          chainIndex: (session.chainIndex ?? 0) + 1,
          reason: resolved.failure.reason,
          error: resolved.failure.error,
        },
      });
      successResult.chain = [
        {
          sessionId: "",
          request: "",
          status: "failed",
          error: `${resolved.failure.reason}: ${resolved.failure.error}`,
        },
      ];
      if (requestId) {
        this.sessions.update(session.sessionId, (s) => {
          s.requestIds[requestId] = successResult;
        });
      }
      return successResult;
    }
    const { step, spec, upNext, taskId, featureId } = resolved;
    const chainIndex = (session.chainIndex ?? 0) + 1;
    const succNow = new Date().toISOString();
    const successorSpec =
      spec.source === "spec_kit_tasks"
        ? {
            ...spec,
            // CHN-3: only task-derived steps append; a mixed manifest's
            // Form-A step (taskId undefined) must not push a null entry.
            chainedTaskIds: taskId
              ? [...(spec.chainedTaskIds ?? []), taskId]
              : [...(spec.chainedTaskIds ?? [])],
          }
        : { ...spec };
    const successor: WorkflowSession = {
      sessionId: `session-${randomUUID()}`,
      workflowId: step.workflowId ?? session.workflowId,
      profile: session.profile,
      configurationVersion: session.configurationVersion,
      configDir: session.configDir,
      workspaceRoot: session.workspaceRoot,
      status: "activating", // crash-window fix (Plan-Review F1): fail-closed until activateSession completes
      currentPhase: this.definition.initialPhase,
      previousPhase: null,
      request: step.request,
      submissions: {},
      blockers: [],
      requestIds: {},
      downstream: { servers: {}, operations: {} },
      createdAt: succNow,
      updatedAt: succNow,
      completedAt: null,
      chainFrom: session.sessionId,
      chainIndex,
      chainSpec: successorSpec,
      // CHN-3: always advance the Form-A marker — with a mixed manifest the
      // successor skips exhausted steps and falls through to Form B.
      chainUpNext: upNext + 1,
      ...(taskId
        ? { chainTaskScope: { taskId, featureId: featureId ?? "" } } // MEDIUM-1: per-task resolved featureId, not the manifest default
        : {}),
    };
    this.sessions.save(successor);
    this.audit.append({
      sessionId: successor.sessionId,
      eventType: "session_started",
      data: {
        workflowId: successor.workflowId,
        chainFrom: session.sessionId,
        chainIndex,
      },
    });
    this.audit.append({
      sessionId: session.sessionId,
      eventType: "chain_successor_created",
      phase: "completed",
      data: { from: session.sessionId, to: successor.sessionId, chainIndex },
    });
    successResult.nextSessionId = successor.sessionId;
    // CHN-5: cache the FULL result already in the lock (status 'activating')
    // — a crash before the wrapper finalizes still leaves replays a complete
    // chain entry; the wrapper overwrites with the final status.
    successResult.chain = [
      {
        sessionId: successor.sessionId,
        request: successor.request,
        status: "activating",
      },
    ];
    if (requestId) {
      this.sessions.update(session.sessionId, (s) => {
        s.requestIds[requestId] = successResult;
      });
    }
    return successResult;
  }

  /** Re-runs the current phase's required beforeExit operations (FR-040 retry). */
  async retryOperations(sessionId: string): Promise<SubmitResult> {
    const routed = this.routedFor(sessionId);
    if (routed) return routed.retryOperations(sessionId);

    const result = await this.sessions.withLock(sessionId, async () => {
      // CHN-1: a crash-orphaned 'activating' chain successor fails getSession
      // (chain_activation_incomplete) — this is the documented recovery path.
      // getSession would throw inside the lock, so load raw and re-activate.
      const raw = this.sessions.load(sessionId);
      if (raw.status === "activating") {
        const activation = await this.activateSession(
          sessionId,
          raw.currentPhase,
        );
        this.sessions.update(sessionId, (s) => {
          if (!activation.blocked) s.status = "active";
        });
        const status = activation.blocked ? "blocked" : "active";
        this.audit.append({
          sessionId,
          eventType: "chain_activation_recovered",
          phase: raw.currentPhase,
          data: { status },
        });
        if (activation.blocked) {
          const err = new GuidanceError(
            "required_hook_failed",
            "re-activation still failing; session stays blocked",
            {
              recoverable: true,
              currentPhase: raw.currentPhase,
              workflowStatus: "blocked",
            },
          );
          return {
            ...err.toResponse(),
            sessionId,
            status,
            operations: activation.operations,
          } as SubmitResult;
        }
        return {
          accepted: true,
          sessionId,
          currentPhase: raw.currentPhase,
          status,
          operations: activation.operations,
        };
      }
      const session = this.getSession(sessionId);
      if (session.status !== "active") {
        const err = new GuidanceError(
          "workflow_blocked",
          `session is ${session.status}`,
          { recoverable: false },
        );
        return {
          ...err.toResponse(),
          sessionId,
          status: session.status,
        } as SubmitResult;
      }
      const phaseDef = this.definition.phases[session.currentPhase];
      const ops = (phaseDef?.lifecycle?.beforeExit ?? []).map((id) => {
        const op = this.operations[id];
        if (!op)
          throw new GuidanceError(
            "operation_not_configured",
            `operation ${id} is not configured`,
            { recoverable: false },
          );
        return op;
      });
      const run = await this.operationEngine.executeRequired(
        ops,
        this.ctxFor(session),
      );
      const opById = new Map(ops.map((op) => [op.operationId, op]));
      const opResults = run.results.map((r) =>
        this.exposeOpResult(r, opById.get(r.operationId)),
      );
      if (!run.allSucceeded) {
        const err = new GuidanceError(
          "required_hook_failed",
          "retry still failing",
          {
            recoverable: true,
            currentPhase: session.currentPhase,
            workflowStatus: session.status,
          },
        );
        return {
          ...err.toResponse(),
          sessionId,
          operations: opResults,
        } as unknown as SubmitResult;
      }
      const target = this.selectTransition(phaseDef?.transitions ?? [], true);
      if (target) {
        const previousPhase = session.currentPhase;
        this.sessions.update(sessionId, (s) => {
          s.currentPhase = target;
          s.previousPhase = previousPhase;
        });
        this.audit.append({
          sessionId,
          eventType: "operation_retried",
          phase: target,
          data: { retried: true },
        });
        // GDS-6: a successful retry of the COMPLETION phase's hooks must
        // finalize the workflow — before this fix the session was left in
        // status=active/phase=completed with no workflow_completed audit,
        // no completedAt and no chain successor (wedged; a later
        // complete_workflow failed invalid_active_phase).
        if (previousPhase === "complete") {
          const now = new Date().toISOString();
          const finalResult: SubmitResult = {
            accepted: true,
            sessionId,
            previousPhase,
            currentPhase: target,
            status: "completed",
            operations: opResults,
          };
          this.sessions.update(sessionId, (s) => {
            s.status = "completed";
            s.completedAt = now;
          });
          this.audit.append({
            sessionId,
            eventType: "workflow_completed",
            phase: "completed",
            data: {
              operations: opResults,
              finalizedBy: "retry_operation",
            },
          });
          const pending = session.pendingCompletion;
          this.sessions.update(sessionId, (s) => {
            delete s.pendingCompletion;
          });
          if (pending) {
            return this.createChainSuccessorLocked(
              session,
              pending.report,
              finalResult,
              pending.requestId,
            );
          }
          return finalResult;
        }
        return {
          accepted: true,
          sessionId,
          previousPhase,
          currentPhase: target,
          status: session.status,
          operations: opResults,
        };
      }
      return {
        accepted: true,
        sessionId,
        currentPhase: session.currentPhase,
        status: session.status,
        operations: opResults,
      };
    });
    return await this.activateSuccessor(result);
  }

  reportBlocker(
    sessionId: string,
    input: {
      category: string;
      description: string;
      requiresUserDecision?: boolean;
      options?: string[];
    },
  ): Promise<SubmitResult> {
    const routed = this.routedFor(sessionId);
    if (routed) return routed.reportBlocker(sessionId, input);
    return this.sessions.withLock(sessionId, () => {
      const session = this.getSession(sessionId);
      if (session.status !== "active") {
        const err = new GuidanceError(
          "workflow_blocked",
          `session is ${session.status}`,
          { recoverable: false },
        );
        return {
          ...err.toResponse(),
          sessionId,
          currentPhase: err.currentPhase ?? session.currentPhase,
          status: session.status,
        };
      }
      const blockerId = `blocker-${randomUUID()}`;
      this.sessions.update(sessionId, (s) => {
        s.status = "blocked";
        s.previousPhase = s.currentPhase;
        s.blockers.push({
          blockerId,
          category: input.category,
          description: input.description,
          requiresUserDecision: input.requiresUserDecision ?? false,
          options: input.options,
        });
      });
      this.audit.append({
        sessionId,
        eventType: "blocker_reported",
        phase: session.currentPhase,
        data: { blockerId },
      });
      return {
        accepted: true,
        sessionId,
        currentPhase: session.currentPhase,
        status: "blocked",
      };
    });
  }

  resumeWorkflow(
    sessionId: string,
    input: { decision: string; notes?: string },
  ): Promise<SubmitResult> {
    const routed = this.routedFor(sessionId);
    if (routed) return routed.resumeWorkflow(sessionId, input);
    return this.sessions.withLock(sessionId, () => {
      const session = this.getSession(sessionId);
      if (session.status !== "blocked") {
        const err = new GuidanceError(
          "workflow_blocked",
          `session is not blocked (status: ${session.status})`,
          { recoverable: false },
        );
        return {
          ...err.toResponse(),
          sessionId,
          currentPhase: err.currentPhase ?? session.currentPhase,
          status: session.status,
        };
      }
      const target = session.previousPhase ?? session.currentPhase;
      this.sessions.update(sessionId, (s) => {
        s.status = "active";
        s.currentPhase = target;
        const open = [...s.blockers].reverse().find((b) => !b.resolution);
        if (open)
          open.resolution = {
            decision: input.decision,
            notes: input.notes,
            resolvedAt: new Date().toISOString(),
          };
      });
      this.audit.append({
        sessionId,
        eventType: "blocker_resolved",
        phase: target,
        data: { decision: input.decision },
      });
      return {
        accepted: true,
        sessionId,
        currentPhase: target,
        status: "active",
        guidance: this.guidanceFor(session, target),
      };
    });
  }

  private selectTransition(
    transitions: { to: string; when?: string; reason?: string }[],
    opsSucceeded: boolean,
    failureReason?: string,
  ): string | null {
    if (!opsSucceeded && failureReason) {
      return transitions.find((t) => t.reason === failureReason)?.to ?? null;
    }
    for (const t of transitions) {
      if (t.when === "submission_valid") return t.to;
      if (t.when === "required_operations_succeeded" && opsSucceeded)
        return t.to;
    }
    return null;
  }

  guidanceForPublic(
    session: WorkflowSession,
    phase?: string,
  ): PhaseInstruction {
    const instruction = this.guidanceFor(session, phase);
    // specs/008 FR-904: the global instruction slot (workflow.json
    // instructions.global) is prepended server-side to EVERY agent-facing
    // phase instruction — guaranteed by construction, no per-phase opt-out.
    const globalRaw = (
      this.config.workflow as { instructions?: { global?: string } } | undefined
    )?.instructions?.global;
    if (globalRaw) {
      return {
        ...instruction,
        instruction: globalRaw + "\n\n" + instruction.instruction,
      };
    }
    return instruction;
  }

  async cancelWorkflow(sessionId: string): Promise<SubmitResult> {
    const routed = this.routedFor(sessionId);
    if (routed) return routed.cancelWorkflow(sessionId);

    return this.sessions.withLock(sessionId, () => {
      const session = this.getSession(sessionId);
      if (session.status === "cancelled") {
        const err = new GuidanceError(
          "workflow_cancelled",
          "session is already cancelled",
          { recoverable: false },
        );
        return {
          ...err.toResponse(),
          sessionId,
          status: session.status,
        } as SubmitResult;
      }
      const now = new Date().toISOString();
      this.sessions.update(sessionId, (s) => {
        s.status = "cancelled";
        s.completedAt = now;
      });
      // spec 004 FR-202: hart abbrechen — alle laufenden Operationen der
      // Session erhalten Abort → Child SIGTERM/SIGKILL, Ergebnis wird im
      // runOperation-Discard-Pfad verworfen, Lock im finally released.
      this.abortActiveOperations(sessionId);
      this.audit.append({
        sessionId,
        eventType: "workflow_cancelled",
        phase: session.currentPhase,
        data: {},
      });
      return {
        accepted: true,
        sessionId,
        currentPhase: session.currentPhase,
        status: "cancelled",
      };
    });
  }

  private guidanceFor(
    session: WorkflowSession,
    phase?: string,
  ): PhaseInstruction {
    const key = phase ?? session.currentPhase;
    const phaseDef = this.definition.phases[key];
    const configured = this.instructions[phaseDef?.response ?? key];
    // Amendment 002 (FR-118): Form-B successors are scoped to exactly one
    // spec-kit task — the annex is appended to EVERY phase instruction.
    const scope = session.chainTaskScope
      ? ` CHAIN TASK SCOPE: This workflow is chained for spec-kit task ${session.chainTaskScope.taskId} of feature ${session.chainTaskScope.featureId} ONLY. Import the artifacts first (import_spec_kit_artifacts), then start/submit/complete exactly this task; do not touch other tasks.`
      : "";
    return {
      title: configured?.title ?? key,
      instruction: (configured?.instruction ?? "") + scope,
      requiredActions: configured?.requiredActions ?? [],
    };
  }

  private validatorFor(schemaRef: string): SchemaValidator {
    const cached = this.validators.get(schemaRef);
    if (cached) return cached;
    const path = join(this.config.configDir, schemaRef);
    if (!existsSync(path)) {
      throw new GuidanceError(
        "configuration_invalid",
        `submission schema missing: ${schemaRef}`,
        { recoverable: false },
      );
    }
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const require = createRequireShim();
    const validator = createValidator(require(path));
    this.validators.set(schemaRef, validator);
    return validator;
  }
}

function createRequireShim(): (id: string) => unknown {
  // ESM-safe: bare `require` is undefined here (see SpecKitEngine 2d-fix);
  // createRequire comes from a static import.
  return createRequire(import.meta.url);
}

export { AuditRepository };

/**
 * RID-1: deterministic payload fingerprint for requestId-reuse detection —
 * recursive key-sort so equivalent payloads (different insertion order)
 * hash identically.
 */
function stablePayloadHash(payload: Record<string, unknown>): string {
  const stable = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(stable);
    if (value && typeof value === "object") {
      const obj = value as Record<string, unknown>;
      return Object.fromEntries(
        Object.keys(obj)
          .sort()
          .map((k) => [k, stable(obj[k])]),
      );
    }
    return value;
  };
  return createHash("sha256")
    .update(JSON.stringify(stable(payload)))
    .digest("hex");
}
