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
import { resolve, join, dirname } from "node:path";
import { GuidanceError } from "../types/errors.js";
import { warnDormantGuidanceConfigs } from "../config-truth.js";
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
import type { TransitionHooks, GateEvent } from "./transition-protocol.js";
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
import { redactUnknown } from "../policy/redaction.js";
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
import { evaluateReviewFindings } from "./review-findings.js";
import {
  WorkflowRegistry,
  type LoadedWorkflow,
  type PhaseBinding,
  type VariantLimits,
} from "./workflow-registry.js";

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

/** Exported for the persistence-contract tests (restart semantics).
 *  CHFIX-11: `remove` deletes keys from the persisted file (merge-on-save
 *  alone would keep released pins alive on disk); remaining keys merge as
 *  before so co-running engine instances keep their pins. */
export function saveCapabilityPins(
  stateDir: string,
  pins: Map<string, string>,
  opts: { remove?: string[] } = {},
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
  for (const key of opts.remove ?? []) delete merged[key];
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
  /** Chain fix (2026-10-08): non-blocking start-time warnings (e.g. the Form-B
   * depth pre-check) — the agent relays them to the user and waits for a
   * decision before driving the chain. */
  warnings?: string[];
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
  /** Chain fix (2026-10-08): copy the spec-kit state file from a completed
   * predecessor to its chain successor — without inheritance the FR-117
   * bridge returns [] for every successor (new sessionId, no state file) and
   * Form B ends silently after ONE task. Implemented in main.ts so the
   * engine stays free of spec-kit imports (WIZ-3). */
  inheritSpecKitState?: (fromSessionId: string, toSessionId: string) => void;
  /** Chain fix (2026-10-08): number of UNCHECKED spec-kit tasks of a feature
   * (tasks.md source of truth, no session state needed) — feeds the Form-B
   * depth pre-check at start_workflow time. null = not determinable. */
  specKitPendingTaskCount?: (featureId: string) => number | null;
  /** Chain fix (2026-10-08): builds the spec-kit bridges for a child engine
   * (per-workspace root/stateDir/config) — engineForWorkspace previously
   * dropped specKitTasks/specKitArtifactCheck for child engines, so Form B
   * could never work in pool deployments. */
  childBridges?: (
    workspaceRoot: string,
    stateDir: string,
    config: LoadedConfig,
  ) => {
    specKitTasks?: (sessionId: string) => PendingSpecKitTask[];
    specKitArtifactCheck?: (
      sessionId: string,
      pattern: string,
    ) => {
      present: boolean;
      reason?: string;
      sha256?: string;
      content?: string;
    };
    inheritSpecKitState?: (fromSessionId: string, toSessionId: string) => void;
    specKitPendingTaskCount?: (featureId: string) => number | null;
  };
  /** specs/017 FR-4/FR-8 bridge: artifact discovery/import validation for a
   *  session's feature (single source of truth with the spec-kit tools —
   *  SKP-1). Returns present/reason plus content hash/text for the gates. */
  specKitArtifactCheck?: (
    sessionId: string,
    pattern: string,
  ) => {
    present: boolean;
    reason?: string;
    sha256?: string;
    content?: string;
  };
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
  private readonly inheritSpecKitState?: (
    fromSessionId: string,
    toSessionId: string,
  ) => void;
  private readonly specKitPendingTaskCount?: (
    featureId: string,
  ) => number | null;
  private readonly validators = new Map<string, SchemaValidator>();
  /** specs/017 FR-1: per-workspace workflow variant registry (cached). */
  private readonly workflowRegistry = new WorkflowRegistry();

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
    this.inheritSpecKitState = deps.inheritSpecKitState;
    this.specKitPendingTaskCount = deps.specKitPendingTaskCount;
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
        // CT-ARGS-1: keep the gated invoker closure reachable for the
        // call_downstream passthrough — it carries WC-1/WC-1-B/FR-053 gating,
        // capability-pin drift checks and the read-only containerRoute
        // fallback. Built once, shared with the downstream OperationEngine.
        this.agentInvoker = this.buildInvokerClosure(servers, deps.stateDir);
        downstreamEngine.setDownstreamInvoker({
          invokeTool: this.agentInvoker,
        });
        // GN-D1: three-valued gates — inject the optional-capability server
        // set derived from the workspace config (see optionalCapabilityServerIds).
        downstreamEngine.setOptionalCapabilityServers(
          this.optionalCapabilityServerIds(),
        );
        // spec 005 F3/M2 (final review feature 007): Lifecycle-Pfade laufen
        // über executeRequired — Metrics auch dort aufzeichnen, sonst zählt
        // remote nur der direkte execute-Pfad (run_operation).
        const deRaw = downstreamEngine.execute.bind(downstreamEngine);
        downstreamEngine.execute = (
          config,
          ctx,
          attempt,
          signal,
          argumentOverrides,
        ) => {
          const t0 = Date.now();
          return Promise.resolve(
            deRaw(config, ctx, attempt, signal, argumentOverrides),
          ).then(
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
        argumentOverrides?: Record<string, unknown>,
      ): Promise<NormalizedResult> => {
        const r = await clientEngine.executeRequired([config], ctx);
        const result = r.results[0]!;
        // CT-ARGS-1: client-side ops (clientOpEngine) have no argument channel
        // — surface the same ignore-warning the OperationEngine uses instead
        // of silently dropping overrides.
        if (
          argumentOverrides !== undefined &&
          Object.keys(argumentOverrides).length > 0
        ) {
          result.warnings.push({
            code: "argument_overrides_ignored",
            message:
              "argument overrides are only supported for downstream mcpTool operations",
          });
        }
        return result;
      };
      const routerExecute: ExecuteFn = (
        config,
        ctx,
        attempt,
        signal,
        argumentOverrides,
      ) =>
        isDownstreamOp(config) && downstreamEngine
          ? downstreamEngine.execute(
              config,
              ctx,
              attempt,
              signal,
              argumentOverrides,
            )
          : clientExecuteSingle(
              config,
              ctx,
              attempt,
              signal,
              argumentOverrides,
            );
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
      this.agentInvoker = this.buildInvokerClosure(servers, deps.stateDir);
      this.operationEngine.setDownstreamInvoker({
        invokeTool: this.agentInvoker,
      });
      // GN-D1: three-valued gates — same injection on the local engine path.
      this.operationEngine.setOptionalCapabilityServers(
        this.optionalCapabilityServerIds(),
      );
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
      this.operationEngine.execute = (
        config,
        ctx,
        attempt,
        signal,
        argumentOverrides,
      ) => {
        const t0 = Date.now();
        return Promise.resolve(
          rawExecute(config, ctx, attempt, signal, argumentOverrides),
        ).then(
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
  /** CT-ARGS-1: gated invoker closure (buildInvokerClosure) reused by the
   *  call_downstream passthrough so agent-driven tool calls pass the exact
   *  same WC-1/WC-1-B/FR-053/pin/containerRoute stack as operations. */
  private agentInvoker?: DownstreamInvoker["invokeTool"];
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
   * gated by config only (FR-1207, registryRegister.enabled — default ON,
   * opt-out; profile-independent: registration is an instance-level concern,
   * the workflow type is chosen per session). Only the instance/pool engine
   * may mutate the registry (not child engines).
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
    // FR-1207: flag-gated (opt-out; defense in depth with the tool-list gate).
    // The former spec-kit profile gate was removed: workspace registration is
    // an instance/infrastructure concern, while the workflow type is chosen
    // per session — the two are independent.
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
    // Dormancy hint not only at boot (FR-1106): every registry change can
    // turn a repo dormant (remove) or newly registered (add) — re-scan so
    // agents see the current dormancy state without a container restart.
    if (!this.isChild && this.config.registryOnly) {
      warnDormantGuidanceConfigs(this.config, dirname(this.config.configDir));
    }
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
    if (this.isChild) {
      return this;
    }
    if (root === this.defaultRoot && !this.config.registryOnly) {
      return this;
    }
    // specs/014 FR-1101/FR-1102: a registry-only instance has no process
    // config at its boot root. NOTE: `workspaces.default` falls back to the
    // first alphabetically registered entry (WorkspaceRegistry.default), so
    // defaultRoot CAN be a registered workspace. Fail closed only when that
    // root truly carries no guidance.json (the real pool root); a configured
    // root composes its own engine below like any registered workspace.
    const cfgDir = join(root, ".guidance");
    if (
      this.config.registryOnly &&
      root === this.defaultRoot &&
      !existsSync(join(cfgDir, "guidance.json"))
    ) {
      throw new GuidanceError(
        "workspace_process_config_missing",
        'registry-only instance: the default workspace (pool root) has no process config — start a registered workspace by name (e.g. workspace: "zed"). Run the config assistant in that repo (setup_guidance_start) to create its .guidance/ — it emits a workspaces[] merge snippet for this instance\'s registry',
        { recoverable: false },
      );
    }
    // specs/014 FR-1102 (no-copy): a registered workspace MUST carry its own
    // process config — the former silent cpSync of the boot config manufactured
    // divergent copies (audit F2/MC-2).
    if (!existsSync(join(cfgDir, "guidance.json"))) {
      throw new GuidanceError(
        "workspace_process_config_missing",
        `workspace ${root} has no process config (.guidance/guidance.json) — run the config assistant in that repo (setup_guidance_start/answer/generate) or create the config manually`,
        { recoverable: false },
      );
    }
    let eng = this.childEngines.get(root);
    if (!eng) {
      const cfg = loadConfig(cfgDir, { workspaceRoot: root });
      if (cfg.registryOnly) {
        // FR-1101: a workspace whose own config is registry-only has no
        // process engine — starting a session on it would manufacture a
        // hollow session. Fail closed with the classified code.
        throw new GuidanceError(
          "workspace_process_config_missing",
          `workspace ${root} carries a registry-only instance config (no process files) — run the config assistant in that repo to create its full process config`,
          { recoverable: false },
        );
      }
      const stateDir = join(root, ".guidance", "state");
      mkdirSync(stateDir, { recursive: true });
      eng = new WorkflowEngine({
        config: cfg,
        stateDir,
        operationEngine: this.deps?.operationEngine,
        clientOperationEngine: this.deps?.clientOperationEngine,
        // Chain fix (2026-10-08): child engines previously DROPPED the spec-kit
        // bridges — Form B and the artifact gates could never work in pool
        // deployments (registry-only boot + per-workspace children).
        ...(this.deps?.childBridges
          ? this.deps.childBridges(root, stateDir, cfg)
          : {}),
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
      // registry-only instance: defaultRoot may BE a registered workspace
      // (alphabetical fallback) — its sessions must stay probe-routable.
      if (w.root === this.defaultRoot && !this.config.registryOnly) continue;
      if (
        existsSync(
          join(w.root, ".guidance", "state", "sessions", `${sessionId}.json`),
        )
      ) {
        // Fail-closed composition (FR-1101/FR-1102) must not break session
        // lookups for stale state dirs — skip unroutable entries.
        try {
          this.sessionRoutes.set(sessionId, this.engineForWorkspace(w.root));
          return;
        } catch {
          continue;
        }
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
      // specs/017 Final#1: observable degradation check — resolve the variant
      // definition (if any) so a file that disappeared or broke after creation
      // marks the session degraded on the first state read after a restart.
      // Resolve errors are already flagged+audited by variantFor; the read
      // path itself stays non-throwing (mutating paths remain fail-closed).
      if (session.variantResolved && !session.variantDegraded) {
        try {
          this.variantFor(session);
        } catch {
          // degradation flagged; surface the failure on the next submit
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
    const phaseDef = this.definitionFor(s).phases[s.currentPhase];
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

  /** Pool-composition downstream report: the instance-level view that plain
   *  getDownstreamStatus() cannot provide — a registry-only parent owns no
   *  ClientManager by design (FR-1101 counts downstreamServers as a process
   *  file ref), so the live list is empty even when every registered
   *  workspace declares downstream servers in its own process config.
   *  Declared entries are parsed READ-ONLY from <root>/.guidance: plain fs
   *  reads, no engine composition (a compose would mkdir state dirs), no
   *  ClientManager, no connection attempt. A workspace with an unreadable
   *  or invalid config yields a declaredError entry instead of failing the
   *  report. With a sessionId routed to a workspace child engine, `live`
   *  carries that engine's live ClientManager status instead. */
  async getDownstreamStatusReport(sessionId?: string): Promise<{
    mode: "pool" | "monolith";
    live: Awaited<ReturnType<WorkflowEngine["getDownstreamStatus"]>>;
    workspaces?: Array<{
      name: string;
      root: string;
      declaredServers?: Array<{
        id: string;
        transportType?: string;
        required?: boolean;
        trustLevel?: string;
      }>;
      declaredError?: string;
    }>;
  }> {
    let live = await this.getDownstreamStatus();
    if (sessionId) {
      const eng = await this.routedDownstreamEngine(sessionId);
      if (eng) live = await eng.getDownstreamStatus();
    }
    if (!(this.config.registryOnly && !this.isChild)) {
      return { mode: "monolith", live };
    }
    const workspaces: Array<{
      name: string;
      root: string;
      declaredServers?: Array<{
        id: string;
        transportType?: string;
        required?: boolean;
        trustLevel?: string;
      }>;
      declaredError?: string;
    }> = [];
    for (const w of this.config.workspaces.list()) {
      const cfgDir = join(w.root, ".guidance");
      if (!existsSync(join(cfgDir, "guidance.json"))) {
        workspaces.push({
          name: w.name,
          root: w.root,
          declaredError:
            "workspace has no process config (.guidance/guidance.json)",
        });
        continue;
      }
      try {
        const cfg = loadConfig(cfgDir, { workspaceRoot: w.root });
        const servers =
          (
            cfg.downstreamServers as
              | {
                  servers?: Record<
                    string,
                    {
                      enabled?: boolean;
                      required?: boolean;
                      trustLevel?: string;
                      transport?: { type?: string };
                    }
                  >;
                }
              | undefined
          )?.servers ?? {};
        const declaredServers = Object.entries(servers)
          .filter(([, v]) => v.enabled !== false)
          .map(([id, v]) => ({
            id,
            transportType: v.transport?.type,
            required: v.required,
            trustLevel: v.trustLevel,
          }));
        workspaces.push({ name: w.name, root: w.root, declaredServers });
      } catch (err) {
        workspaces.push({
          name: w.name,
          root: w.root,
          // Redacted: loadConfig error messages could carry config-derived
          // strings; never expose them unfiltered to the agent surface.
          declaredError: this.redactor.redact(String(err)).slice(0, 200),
        });
      }
    }
    return { mode: "pool", live, workspaces };
  }

  /** Resolve the child engine owning sessionId (probe + route map), or
   *  undefined when the session is not routed to a non-default workspace. */
  private async routedDownstreamEngine(
    sessionId: string,
  ): Promise<WorkflowEngine | undefined> {
    if (this.isChild) return undefined;
    this.probeWorkspaceRoutes(sessionId);
    const eng = this.routedFor(sessionId);
    return eng && eng !== this ? eng : undefined;
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
            skipped: 0,
            cancelled: 0,
            timedOut: 0,
            durationMs: { count: 0, sum: 0, max: 0 },
          });
          agg.runs += m.runs;
          agg.succeeded += m.succeeded;
          agg.failed += m.failed;
          agg.skipped += m.skipped;
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
  /** GN-D1 hybrid capability probe + three-valued gates: the serverId the
   *  generated config uses for the GitNexus downstream server. The engine
   *  stays product-generic — this is the ONLY place the product name is
   *  mapped to a serverId. */
  private static readonly GITNEXUS_SERVER_ID = "gitnexus";

  /** GN-D1 minimal additive read path for the gitnexus capability block:
   *  a workspace declaring gitnexus.state=optional gets its gitnexus
   *  mcpTool gates classified capability-absent (skipped) when the server
   *  is unreachable — instead of a tolerated failure. required/off behave
   *  exactly as before (fail-closed / not generated). */
  private optionalCapabilityServerIds(): Set<string> {
    return this.config.main.gitnexus?.state === "optional"
      ? new Set([WorkflowEngine.GITNEXUS_SERVER_ID])
      : new Set();
  }

  /** GN-D1 hybrid probe: the DECLARED capability state from guidance.json
   *  (null when the workspace declares no gitnexus block at all — legacy
   *  configs are fully unaffected by probe and skip semantics). */
  private declaredGitnexusState(): "required" | "optional" | "off" | null {
    return this.config.main.gitnexus?.state ?? null;
  }

  /** GN-D1: capability deviations already audited (per session + kind) —
   *  probe and gate-time signal share one guard so a deviation is audited
   *  exactly once per session no matter which detector fires first.
   *  Per-PROCESS guarantee: a server restart loses the guard, so a
   *  deviation can be re-audited once per process lifetime for the same
   *  session (accepted — cosmetic duplicate events in the audit log). */
  private capabilityDeviationsNoted = new Set<string>();

  /** Lower bound for the hybrid probe ping race (read-only initialize via
   *  ClientManager.ensureReady). Review F4: a server with a CONFIGURED
   *  handshake timeout above this floor gets its configured budget — the
   *  race cap is max(floor, configured handshake + 1s margin), so slow
   *  cold starts are never misclassified as unreachable. */
  private static readonly CAPABILITY_PROBE_TIMEOUT_MS = 5_000;

  /** GN-D1 hybrid probe (session start): declared state vs live availability.
   *  Deviations (configured-required but unreachable; configured-off but
   *  reachable via a leftover server entry) are audited as
   *  capability_state_deviation — once per session per kind. Read-only,
   *  non-blocking by contract (callers fire-and-forget). */
  private async probeCapabilityState(sessionId: string): Promise<void> {
    const declared = this.declaredGitnexusState();
    if (declared === null || declared === "optional") return; // nothing to compare
    // Review F5: for the off-but-reachable check, never SPAWN a declared-off
    // server — a leftover stdio entry is undetectable without starting its
    // process, which exceeds the read-only ping contract. HTTP leftovers
    // are pinged (no process is spawned for an http transport).
    if (
      declared === "off" &&
      (
        this.downstreamServers?.get(WorkflowEngine.GITNEXUS_SERVER_ID) as
          { transport?: { type?: string } } | undefined
      )?.transport?.type !== "http"
    ) {
      return;
    }
    let reachable: boolean | null;
    try {
      reachable = await this.pingGitnexusServer();
    } catch {
      // best-effort contract: the probe NEVER rejects (its caller
      // fire-and-forgets, but tests and future callers may await it)
      return;
    }
    if (reachable === null) return; // no server entry to ping (see off-case note)
    if (declared === "required" && !reachable) {
      this.noteCapabilityDeviation(sessionId, "required-unreachable", "probe");
    }
    if (declared === "off" && reachable) {
      this.noteCapabilityDeviation(sessionId, "off-reachable", "probe");
    }
  }

  /** Read-only liveness ping for the gitnexus downstream server via the
   *  shared ClientManager (initialize handshake only — no tool call).
   *  Returns null when no gitnexus server entry is configured (a clean
   *  off-config is undetectable by design: nothing to ping), true/false for
   *  reachable/unreachable. Bounded by CAPABILITY_PROBE_TIMEOUT_MS. */
  private async pingGitnexusServer(): Promise<boolean | null> {
    const id = WorkflowEngine.GITNEXUS_SERVER_ID;
    const serverCfg = this.downstreamServers?.get(id) as
      | {
          transport?: {
            type?: string;
            command?: { executable: string; args: string[]; cwd?: string };
            http?: { url: string; headers?: Record<string, string> };
          };
          connection?: {
            startupTimeoutSeconds?: number;
            reconnect?: {
              enabled?: boolean;
              maximumAttempts?: number;
              delayMilliseconds?: number;
            };
          };
        }
      | undefined;
    if (!this.clientManager || !serverCfg?.transport) return null;
    const conn = serverCfg.connection;
    const connectionOpts =
      conn &&
      (conn.startupTimeoutSeconds !== undefined || conn.reconnect !== undefined)
        ? {
            ...(conn.startupTimeoutSeconds !== undefined
              ? { handshakeTimeoutSeconds: conn.startupTimeoutSeconds }
              : {}),
            ...(conn.reconnect !== undefined
              ? { reconnect: conn.reconnect }
              : {}),
          }
        : undefined;
    const transport = serverCfg.transport;
    const config =
      transport.type === "http" && transport.http
        ? {
            type: "http" as const,
            url: transport.http.url,
            headers: transport.http.headers,
          }
        : transport.command
          ? {
              type: "stdio" as const,
              executable: transport.command.executable ?? "",
              args: transport.command.args ?? [],
              cwd: transport.command.cwd,
            }
          : undefined;
    const status = await Promise.race([
      this.clientManager.ensureReady(id, config, connectionOpts),
      new Promise<null>((resolve) =>
        setTimeout(
          () => resolve(null),
          Math.max(
            WorkflowEngine.CAPABILITY_PROBE_TIMEOUT_MS,
            (conn?.startupTimeoutSeconds ?? 0) * 1_000 + 1_000,
          ),
        ).unref?.(),
      ),
    ]);
    return status === null ? false : status.status === "ready";
  }

  /** Audits one capability_state_deviation event, at most once per session
   *  per deviation kind (probe and gate-time signal share the guard). */
  private noteCapabilityDeviation(
    sessionId: string,
    kind: "required-unreachable" | "off-reachable",
    source: "probe" | "gate",
  ): void {
    const key = `${sessionId}:${kind}`;
    if (this.capabilityDeviationsNoted.has(key)) return;
    this.capabilityDeviationsNoted.add(key);
    const [configured, live] =
      kind === "required-unreachable"
        ? ["required", "unreachable"]
        : ["off", "reachable"];
    this.audit.append({
      sessionId,
      eventType: "capability_state_deviation",
      data: {
        server: WorkflowEngine.GITNEXUS_SERVER_ID,
        configured,
        live,
        kind,
        source,
      },
    });
  }

  /** GN-D1 gate-time deviation signal: a gitnexus-targeting mcpTool gate
   *  that failed with a transport-level error while the workspace declares
   *  gitnexus.state=required means declared≠live — audit it (once per
   *  session; the probe guard is shared). Called from every gate loop next
   *  to recordDownstreamState. */
  private noteGateTransportFailure(
    sessionId: string,
    op: OperationConfig,
    result: { status: string; errors?: { code?: string; message?: string }[] },
  ): void {
    if (op.server !== WorkflowEngine.GITNEXUS_SERVER_ID) return;
    if (this.declaredGitnexusState() !== "required") return;
    if (result.status !== "failed") return;
    const transportFailure = (result.errors ?? []).some(
      (e) => e.code === "downstream_connection_failed",
    );
    if (!transportFailure) return;
    this.noteCapabilityDeviation(sessionId, "required-unreachable", "gate");
  }

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
      if (pinnedHash && (!tool || tool.inputSchemaHash !== pinnedHash)) {
        // CHFIX-11 hybrid re-pin (auto-detect leg): audit the drift in the
        // engine-level audit file (this invoker closure has no session
        // binding), keep failing CLOSED, and point the agent at the
        // conscious-release remedy in the message. A pinned tool that no
        // longer exists is drift too (previously unclassified — the call
        // proceeded and failed server-side).
        this.audit.append({
          sessionId: "capability-pins",
          eventType: "capability_pin_drift",
          data: {
            serverId,
            toolName,
            kind: !tool ? "tool-missing" : "schema-drift",
            pinnedHash,
            ...(!tool ? {} : { liveHash: tool.inputSchemaHash }),
          },
        });
        throw new GuidanceError(
          "downstream_capability_changed",
          `${
            !tool
              ? `tool ${toolName} disappeared from ${serverId}`
              : `tool ${toolName} schema drifted on ${serverId}`
          } — capability pins are safety checks: confirm the infra event (e.g. server upgrade/reindex), release the stale pin via the release_capability_pins tool (confirm:true), then retry — no server restart needed`,
          { recoverable: false },
        );
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
  /** FR-053 approval gate (REV-US2-F1 rework): ops whose riskClass resolves
   *  to 'require' in policies.approvals (defaults: destructive,
   *  credential_sensitive; everything else 'allow' — unattended) need a
   *  per-execution user grant. Grants are stored on the session via
   *  resume_workflow decision "approve <operation-id>" and are consumed
   *  AFTER a successful execution (a failed run keeps its grant so the
   *  retry ceremony works). Validation runs before ANY op of the batch
   *  executes (fail before side effects). */
  private assertApprovals(
    session: WorkflowSession,
    ops: OperationConfig[],
  ): void {
    const approvals = this.config.approvals;
    for (const op of ops) {
      if (!this.policyEngine.requiresApproval(op, approvals)) continue;
      if (!(session.approvedOperations ?? []).includes(op.operationId)) {
        this.audit.append({
          sessionId: session.sessionId,
          eventType: "operation_invocation_denied",
          data: { operationId: op.operationId, reason: "approval_required" },
        });
        throw new GuidanceError(
          "authorization_required",
          `operation ${op.operationId} (riskClass: ${op.riskClass}) requires explicit user approval (FR-053) — escalate via report_blocker { category: "approval", requiresUserDecision: true, options: ["approve ${op.operationId}", "deny"] } and then resume_workflow with decision "approve ${op.operationId}"`,
          { recoverable: true },
        );
      }
    }
  }

  /** One-shot consumption after a SUCCESSFUL execution (see assertApprovals). */
  private consumeApprovals(
    session: WorkflowSession,
    ops: OperationConfig[],
    results: { operationId: string; status: string }[],
  ): void {
    const approvals = this.config.approvals;
    for (const op of ops) {
      if (!this.policyEngine.requiresApproval(op, approvals)) continue;
      const result = results.find((r) => r.operationId === op.operationId);
      if (!result || result.status !== "succeeded") continue; // keep grant
      const approved = session.approvedOperations ?? [];
      const idx = approved.indexOf(op.operationId);
      if (idx === -1) continue;
      approved.splice(idx, 1);
      this.sessions.update(session.sessionId, (s) => {
        s.approvedOperations = approved;
      });
      this.audit.append({
        sessionId: session.sessionId,
        eventType: "approval_consumed",
        data: { operationId: op.operationId },
      });
    }
  }

  async runOperation(
    sessionId: string,
    operationId: string,
    argumentOverrides?: Record<string, unknown>,
  ): Promise<ExposedOpResult> {
    const routed = this.routedFor(sessionId);
    if (routed)
      return routed.runOperation(sessionId, operationId, argumentOverrides);

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
      this.assertApprovals(session, [op]);
      const run = await this.operationEngine.execute(
        op,
        this.ctxFor(session),
        1,
        controller.signal,
        argumentOverrides,
      );
      this.consumeApprovals(session, [op], [run]);
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

  /** CT-ARGS-1: agent-facing passthrough to a configured downstream tool.
   *  Transparent proxy (GDS-5, raw default) — but routed through the SAME
   *  gated invoker closure as operations (WC-1 allowlist, WC-1-B
   *  unconfigured-wildcard rejection, FR-053 egress/approval gate,
   *  capability-pin drift check, read-only containerRoute timeout fallback).
   *  Arguments are NOT schema-validated here — input validation stays with
   *  the downstream tool (MCP protocol); downstream content IS redacted
   *  before exposure (same redactUnknown seam as the operation path).
   *  Cancellation note: the in-flight HTTP call is not hard-cancellable
   *  (MCP callTool has no AbortSignal) — the controller bookkeeping below
   *  enables future signal threading; results issued before a cancel are
   *  discarded like runOperation does. */
  async callDownstream(
    sessionId: string,
    serverId: string,
    toolName: string,
    args: Record<string, unknown> = {},
  ): Promise<ExposedOpResult> {
    const routed = this.routedFor(sessionId);
    if (routed)
      return routed.callDownstream(sessionId, serverId, toolName, args);

    const session = this.getSession(sessionId);
    const auditDenial = (reason: string): void =>
      this.audit.append({
        sessionId,
        eventType: "operation_invocation_denied",
        data: {
          operationId: `call_downstream:${serverId}:${toolName}`,
          reason,
        },
      });
    if (!this.agentInvoker || !this.downstreamServers?.has(serverId)) {
      auditDenial("downstream_server_not_configured");
      throw new GuidanceError(
        "downstream_server_not_configured",
        `downstream server ${serverId} is not configured or the downstream stack is disabled`,
        { recoverable: false },
      );
    }
    if (this.runningOps.has(sessionId)) {
      auditDenial("operation_in_progress");
      throw new GuidanceError(
        "operation_in_progress",
        `an operation is already running for session ${sessionId}`,
        { recoverable: true },
      );
    }
    this.acquireWorkspaceOpLock(session.workspaceRoot);
    this.runningOps.add(sessionId);
    const controller = new AbortController();
    let controllers = this.activeOpControllers.get(sessionId);
    if (!controllers) {
      controllers = new Set();
      this.activeOpControllers.set(sessionId, controllers);
    }
    controllers.add(controller);
    const startedAt = Date.now();
    const opId = `call_downstream:${serverId}:${toolName}`;
    try {
      if (session.status !== "active") {
        auditDenial(`session_${session.status}`);
        return {
          id: opId,
          status: "failed",
          summary: `session is ${session.status}`,
        };
      }
      const outcome = await this.agentInvoker(serverId, toolName, args);
      // FR-202 parity with runOperation: a call issued before cancel_workflow
      // has its result discarded (the in-flight HTTP request itself cannot be
      // aborted — see JSDoc).
      if (this.sessions.load(sessionId).status === "cancelled") {
        this.audit.append({
          sessionId,
          eventType: "operation_invoked",
          data: {
            operationId: opId,
            status: "cancelled",
            durationMs: Date.now() - startedAt,
            via: "call_downstream",
          },
        });
        return {
          id: opId,
          status: "failed",
          summary: "session cancelled during operation; result discarded",
        };
      }
      // Same sanitization seam as the operation path (OperationEngine):
      // downstream payloads are redacted BEFORE they become agent-facing.
      const redactedContent =
        outcome.kind === "transport"
          ? []
          : (redactUnknown(outcome.content) as unknown[]);
      const structuredContent =
        outcome.kind === "success" && outcome.structuredContent
          ? redactUnknown(outcome.structuredContent)
          : undefined;
      const result =
        outcome.kind === "success"
          ? {
              operationId: opId,
              status: "succeeded" as const,
              summary: `${opId} succeeded`,
              content: redactedContent,
              data: {},
              errors: [] as { code?: string; message: string }[],
              warnings: [] as { code?: string; message: string }[],
              protocolMetadata: structuredContent ? { structuredContent } : {},
            }
          : outcome.kind === "tool_reported"
            ? {
                operationId: opId,
                status: "failed" as const,
                summary: "tool reported an error",
                content: redactedContent,
                data: {},
                errors: [
                  {
                    code: "operation_result_invalid",
                    message: outcome.message,
                  },
                ],
                warnings: [] as { code?: string; message: string }[],
                protocolMetadata: {},
              }
            : {
                operationId: opId,
                status: "failed" as const,
                summary: "transport failure",
                content: [] as unknown[],
                data: {},
                errors: [
                  {
                    code: "downstream_connection_failed",
                    message: outcome.message,
                  },
                ],
                warnings: [] as { code?: string; message: string }[],
                protocolMetadata: {},
              };
      this.audit.append({
        sessionId,
        eventType: "operation_invoked",
        data: {
          operationId: opId,
          status: result.status,
          durationMs: Date.now() - startedAt,
          via: "call_downstream",
        },
      });
      return this.exposeOpResult(result);
    } catch (err) {
      this.audit.append({
        sessionId,
        eventType: "operation_invoked",
        data: {
          operationId: opId,
          status: "failed",
          durationMs: Date.now() - startedAt,
          via: "call_downstream",
        },
      });
      throw err;
    } finally {
      this.runningOps.delete(sessionId);
      controllers.delete(controller);
      if (controllers.size === 0) this.activeOpControllers.delete(sessionId);
      this.releaseWorkspaceOpLock(session.workspaceRoot);
    }
  }

  /** specs/015 healing chain, automatic stage: before required lifecycle
   *  gates run, a workspace with missing or stale node_modules gets its
   *  deps-install operation executed (config-gated via preFlight.enabled,
   *  default ON). Fail-open: a pre-flight failure is audited but never
   *  masks the gate — the gate's own error plus the reactive nodeDepsHints
   *  remain the source of truth. Serialized per workspace root so
   *  concurrent sessions cannot race two npm runs into one tree. */
  private static readonly preflightLocks = new Map<string, Promise<void>>();

  /** mtime trigger is best-effort (drvfs granularity over bind mounts):
   *  a MISSING node_modules is the deterministic trigger; staleness only
   *  adds the common "manifest newer than install" case. Native-ABI
   *  mismatch is intentionally NOT detected here — it stays on the
   *  reactive deps-reinstall path (nodeDepsHints). */
  private static nodeDepsStale(workspaceRoot: string): boolean {
    const pkg = join(workspaceRoot, "package.json");
    if (!existsSync(pkg)) return false; // not an npm workspace — no-op
    const nm = join(workspaceRoot, "node_modules");
    if (!existsSync(nm)) return true;
    try {
      const nmMtime = statSync(nm).mtimeMs;
      if (statSync(pkg).mtimeMs > nmMtime) return true;
      const lock = join(workspaceRoot, "package-lock.json");
      return existsSync(lock) && statSync(lock).mtimeMs > nmMtime;
    } catch {
      return false;
    }
  }

  private async runDepsPreflight(session: {
    id: string;
    workspaceRoot: string;
  }): Promise<void> {
    if (!this.config.preFlight.enabled) return;
    if (!WorkflowEngine.nodeDepsStale(session.workspaceRoot)) return;
    const depsOp = this.operations["deps-install"];
    if (!depsOp) return; // no configured healing op — nothing to reuse
    const root = resolve(session.workspaceRoot);
    const prev = WorkflowEngine.preflightLocks.get(root) ?? Promise.resolve();
    const run = prev
      .catch(() => undefined)
      .then(() =>
        (async () => {
          this.audit.append({
            sessionId: session.id,
            eventType: "deps_preflight",
            data: {
              workspaceRoot: root,
              trigger: "node_modules_missing_or_stale",
            },
          });
          try {
            const run = await this.operationEngine.executeRequired([depsOp], {
              workspaceRoot: session.workspaceRoot,
              redactionPatterns: this.redactionPatterns,
            });
            const res = run.results[0];
            this.recordDownstreamState(
              session.id,
              depsOp.operationId,
              res?.status ?? "failed",
              res?.summary ?? "deps pre-flight",
            );
            if (res?.status !== "succeeded") {
              // Terminal audit outcome — fail-open: the gate runs anyway.
              this.audit.append({
                sessionId: session.id,
                eventType: "deps_preflight",
                data: {
                  workspaceRoot: root,
                  failed: true,
                  status: res?.status ?? "failed",
                },
              });
            }
          } catch (err) {
            // Fail-open: audited, then the gate runs anyway.
            this.audit.append({
              sessionId: session.id,
              eventType: "deps_preflight",
              data: { workspaceRoot: root, failed: true, error: String(err) },
            });
          }
        })(),
      );
    WorkflowEngine.preflightLocks.set(
      root,
      run.catch(() => undefined),
    );
    await run;
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
    // Chain fix (2026-10-08): start-time depth pre-check — warn (non-blocking)
    // when the Form-B task count exceeds the effective chain depth; the agent
    // relays the warning to the user and waits for a decision (e.g. restart
    // with chain.maxChainDepthOverride).
    const chainWarnings = chainSpec ? this.chainStartWarnings(chainSpec) : [];
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
    // specs/017 FR-1: resolve the session definition at creation. Absent or
    // boot-equal workflowId keeps the boot definition object itself (FR-2
    // byte-identical default); a variant id loads from the per-workspace
    // registry and fails closed on unknown/unresolvable ids (F4).
    let definition: WorkflowDefinition = this.definition;
    let variantResolved = false;
    if (input.workflowId && input.workflowId !== this.definition.workflowId) {
      definition = this.workflowRegistry.resolve(
        this.config.configDir,
        input.workflowId,
      ).definition as unknown as WorkflowDefinition;
      variantResolved = true;
    }
    const session: WorkflowSession = {
      sessionId,
      workflowId: input.workflowId ?? this.definition.workflowId,
      variantResolved,
      configurationVersion: this.config.configVersion,
      configDir: this.config.configDir,
      workspaceRoot: input.workspaceRoot!,
      status: "active",
      currentPhase: definition.initialPhase,
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
    // GN-D1 hybrid probe: compare the DECLARED capability state
    // (guidance.json gitnexus.state) with LIVE availability — fire-and-forget,
    // timeout-bounded, read-only; audits a capability_state_deviation event
    // when they diverge. Never blocks session creation (void + swallow).
    void this.probeCapabilityState(sessionId).catch(() => {
      /* probe is best-effort; never fails session creation */
    });
    // specs/017 FR-8: skip bound phases whose exit artifact already exists
    // (understand at session start when spec.md is present; crash-resume for
    // every other bound phase). Recorded in session state + audit.
    this.applyArtifactSkips(session, definition);
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
      ...(chainWarnings.length > 0 ? { warnings: chainWarnings } : {}),
    };
  }

  /** Chain fix (2026-10-08): Form-B start-time depth pre-check. Reads the
   * UNCHECKED task count straight from tasks.md (no session state exists for
   * the head yet) and warns when the effective depth cannot carry the chain.
   * Non-blocking by design: the user decides (override, split, or accept). */
  private chainStartWarnings(
    spec: NonNullable<WorkflowSession["chainSpec"]>,
  ): string[] {
    if (spec.source !== "spec_kit_tasks") return [];
    if (!spec.featureId) {
      return [
        "chain depth pre-check skipped: manifest has no featureId — Form-B candidates resolve from the session's imported spec-kit state at completion time",
      ];
    }
    const pending = this.deps.specKitPendingTaskCount?.(spec.featureId);
    if (pending === undefined || pending === null) {
      return [
        `chain depth pre-check skipped: tasks.md not found or unreadable for feature ${spec.featureId}`,
      ];
    }
    const depth = spec.maxChainDepthOverride ?? this.chain.maxChainDepth;
    // Clean traversal needs depth >= pending + 1: the LAST successor is created
    // at chainIndex = pending and must still pass the backstop gate on ITS
    // completion to reach the silent chain end (smaller depth fails with
    // chain_depth_exceeded, depth == pending fails on the final session).
    if (depth < pending + 1) {
      return [
        `chain.maxChainDepth (${depth}) cannot carry the ${pending} unchecked spec-kit task(s) of feature ${spec.featureId}: the chain will fail with chain_depth_exceeded after ${depth} successor session(s) (a clean run needs depth >= ${pending + 1}). Ask the user how to proceed: restart with chain.maxChainDepthOverride (integer, hard cap 512), or split the work into smaller chains`,
      ];
    }
    return [];
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
    // optional but at least one must be present. WIZ-3: Form B (source) is no
    // longer profile-gated — both chain forms are available whenever
    // chain.enabled is true; the form follows the manifest.
    const c = chain as {
      steps?: unknown;
      source?: unknown;
      requestTemplate?: unknown;
      featureId?: string;
      taskFilter?: { statuses?: string[] };
      maxChainDepthOverride?: unknown;
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
    // Chain fix (2026-10-08): per-manifest temporary depth override — the
    // user decision surfaced by the depth pre-check warning. Mirrors the
    // zod cap (512) here so direct engine callers fail closed the same way.
    if (c.maxChainDepthOverride !== undefined) {
      const n = c.maxChainDepthOverride as number;
      if (!Number.isInteger(n) || n < 1 || n > 512) {
        throw new GuidanceError(
          "configuration_invalid",
          `chain.maxChainDepthOverride must be an integer between 1 and 512 (got ${String(c.maxChainDepthOverride)})`,
          { recoverable: true },
        );
      }
      spec.maxChainDepthOverride = n;
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
      // Chain fix (2026-10-08): per-manifest override wins over config depth.
      const maxDepth = spec.maxChainDepthOverride ?? this.chain.maxChainDepth;
      if ((session.chainIndex ?? 0) >= maxDepth) {
        return {
          failure: {
            reason: "chain_depth_exceeded",
            error: `chainIndex ${session.chainIndex} reached maxChainDepth (${maxDepth})`,
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
      // Chain fix (2026-10-08): per-manifest override wins over config depth.
      const maxDepth = spec.maxChainDepthOverride ?? this.chain.maxChainDepth;
      if ((session.chainIndex ?? 0) >= maxDepth) {
        return {
          failure: {
            reason: "chain_depth_exceeded",
            error: `chainIndex ${session.chainIndex} reached maxChainDepth (${maxDepth})`,
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
    // REV-F053-1: all-or-nothing approval — resolve + validate the WHOLE
    // list before any op executes (a later denial must not burn the grants
    // of already-executed ops).
    const def = this.definitionFor(this.sessions.load(sessionId));
    const beforeEnterOps = (
      def.phases[phase]?.lifecycle?.beforeEnter ?? []
    ).map((id) => {
      const op = this.operations[id];
      if (!op)
        throw new GuidanceError(
          "operation_not_configured",
          `operation ${id} is not configured`,
          { recoverable: false },
        );
      return op;
    });
    this.assertApprovals(this.sessions.load(sessionId), beforeEnterOps);
    if (beforeEnterOps.length > 0) {
      const startSession = this.sessions.load(sessionId);
      await this.runDepsPreflight({
        id: sessionId,
        workspaceRoot: startSession.workspaceRoot,
      });
    }
    for (const op of beforeEnterOps) {
      const run = await this.operationEngine.executeRequired([op], {
        workspaceRoot: this.sessions.load(sessionId).workspaceRoot,
        redactionPatterns: this.redactionPatterns,
      });
      this.consumeApprovals(this.sessions.load(sessionId), [op], run.results);
      for (const r of run.results) {
        opResultsStart.push(this.exposeOpResult(r, op));
        this.noteGateTransportFailure(sessionId, op, r);
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
            description: `beforeEnter operation ${op.operationId} failed at session start`,
            requiresUserDecision: false,
          });
        });
        this.audit.append({
          sessionId,
          eventType: "hook_failed",
          phase,
          data: {
            lifecycle: "beforeEnter",
            operationId: op.operationId,
            blocked: true,
          },
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
    // Review F3 (GN-D1): skipped(capability-absent) results are NOT
    // failures — an optional gate skipping must not trip the heuristic.
    const requiredFailed =
      afterEnterResults.length > 0 &&
      afterEnterResults.some(
        (o) => o.status !== "succeeded" && o.status !== "skipped",
      ) &&
      (def.phases[phase]?.lifecycle?.afterEnter ?? []).some(
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
    const ids =
      this.definitionFor(session).phases[phase]?.lifecycle?.afterEnter ?? [];
    const out: { id: string; status: string; summary: string }[] = [];
    // REV-F053-1: all-or-nothing approval — resolve + validate the WHOLE
    // list before any op executes.
    const ops = ids.map((id) => {
      const op = this.operations[id];
      if (!op)
        throw new GuidanceError(
          "operation_not_configured",
          `operation ${id} is not configured`,
          { recoverable: false },
        );
      return op;
    });
    this.assertApprovals(session, ops);
    for (const op of ops) {
      const run = await this.operationEngine.executeRequired(
        [op],
        this.ctxFor(session),
      );
      this.consumeApprovals(session, [op], run.results);
      for (const r of run.results) {
        out.push(this.exposeOpResult(r, op));
        if (op.required && r.status !== "succeeded") {
          this.audit.append({
            sessionId: session.sessionId,
            eventType: "hook_failed",
            phase,
            data: { operationId: op.operationId },
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

  /** CHFIX-11 hybrid capability re-pin (explicit-release leg): removes
   *  capability pins IN-PROCESS — the conscious counterpart to the drift
   *  auto-detect in the invoker closure. `confirm: true` is the deliberate
   *  step (releasing pins re-enables capability discovery; the next
   *  successful tool call re-pins automatically — no server restart).
   *  Audits capability_pins_reset with the calling session's id; the file
   *  removal goes through saveCapabilityPins({remove}) so co-running engine
   *  instances keep their pins (merge-on-save). */
  releaseCapabilityPins(
    sessionId: string,
    opts: { serverId?: string; toolName?: string; confirm?: boolean } = {},
  ): { released: number } {
    if (opts.confirm !== true) {
      throw new GuidanceError(
        "operation_arguments_invalid",
        "release_capability_pins requires confirm:true — releasing capability pins is a conscious infra-event decision (e.g. a confirmed server upgrade/reindex); the release is audited",
        { recoverable: true },
      );
    }
    // Session binding mirrors the other session-scoped tools.
    this.getSession(sessionId);
    // Pin keys are `${serverId}:${toolName}` and TOOL names may contain
    // colons — split at the FIRST colon (server ids are colon-free slugs)
    // so a toolName filter never over-matches another tool's suffix
    // (review F-1: endsWith(":"+toolName) also hit `s1:thinking:analyze`
    // when releasing `analyze`).
    const keyOf = (k: string): { sid: string; tname: string } => {
      const idx = k.indexOf(":");
      return { sid: k.slice(0, idx), tname: k.slice(idx + 1) };
    };
    const keys = [...this.pinnedHashes.keys()].filter((k) => {
      const { sid, tname } = keyOf(k);
      if (opts.serverId && sid !== opts.serverId) return false;
      if (opts.toolName && tname !== opts.toolName) return false;
      return true;
    });
    for (const k of keys) this.pinnedHashes.delete(k);
    if (keys.length > 0) {
      saveCapabilityPins(this.stateDir, this.pinnedHashes, {
        remove: keys,
      });
    }
    this.audit.append({
      sessionId,
      eventType: "capability_pins_reset",
      data: {
        released: keys.length,
        ...(opts.serverId ? { serverId: opts.serverId } : {}),
        ...(opts.toolName ? { toolName: opts.toolName } : {}),
      },
    });
    return { released: keys.length };
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
    hooks?: TransitionHooks,
  ): Promise<SubmitResult> {
    const routed = this.routedFor(sessionId);
    if (routed)
      return routed.submit(sessionId, phase, payload, requestId, hooks);
    return this.sessions.withLock(sessionId, () =>
      this.submitLocked(sessionId, phase, payload, requestId, hooks),
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
    hooks?: TransitionHooks,
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

    const def = this.definitionFor(session);
    const phaseDef = def.phases[session.currentPhase];
    if (phaseDef?.submissionSchema) {
      const validator = this.validatorFor(phaseDef.submissionSchema);
      const result = validator.validate(payload);
      if (!result.valid) {
        return fail("submission_invalid", result.errors.join("; "));
      }
    }

    // specs/017: variant gates run before anything is persisted — artifact
    // exit gate (FR-4), batch registration (FR-6), batch-cadence rejects and
    // convergence classification (FR-7). standard-development is untouched
    // (variantFor returns null there, FR-2).
    const variant = this.variantFor(session);
    let variantReason: string | undefined;
    if (variant) {
      const gateReject = this.specKitExitGate(session, variant, phase);
      if (gateReject) {
        return gateReject as unknown as SubmitResult;
      }
      const variantGate = this.specKitVariantGate(
        session,
        variant,
        phase,
        payload,
      );
      if (variantGate.reject) {
        return variantGate.reject as unknown as SubmitResult;
      }
      variantReason = variantGate.reason;
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
    // Spec 016 FR-6: monotonic cumulative gate progress across the three
    // lifecycle gate groups (beforeExit -> beforeEnter -> afterExit); the
    // observer is passive — gate semantics/order/fail-closed are untouched.
    const gateTotal =
      (phaseDef?.lifecycle?.beforeExit?.length ?? 0) +
      (phaseDef?.lifecycle?.beforeEnter?.length ?? 0) +
      (phaseDef?.lifecycle?.afterExit?.length ?? 0);
    let gateCursor = 0;
    const gateObserver: ((event: GateEvent) => void) | undefined =
      hooks?.onGateEvent
        ? (event) =>
            hooks.onGateEvent!({
              ...event,
              index: gateCursor + event.index,
              total: gateTotal,
            })
        : undefined;
    let opResults: { id: string; status: string; summary: string }[] = [];
    let opsSucceeded = true;
    if (ops.length > 0) {
      const ctx: OperationContext = this.ctxFor(session);
      for (const op of ops) {
        this.recordDownstreamState(sessionId, op.operationId, "running", "");
      }
      this.assertApprovals(session, ops);
      await this.runDepsPreflight({
        id: sessionId,
        workspaceRoot: ctx.workspaceRoot,
      });
      const run = await this.operationEngine.executeRequired(
        ops,
        ctx,
        gateObserver,
      );
      gateCursor += ops.length;
      this.consumeApprovals(session, ops, run.results);
      opsSucceeded = run.allSucceeded;
      const opById = new Map(ops.map((op) => [op.operationId, op]));
      opResults = run.results.map((r) =>
        this.exposeOpResult(r, opById.get(r.operationId)),
      );
      for (const r of run.results) {
        const gateOp = opById.get(r.operationId);
        if (gateOp) this.noteGateTransportFailure(sessionId, gateOp, r);
        this.recordDownstreamState(
          sessionId,
          r.operationId,
          r.status,
          r.summary,
        );
      }
    }

    // Severity gate: open blocking review findings force the reason-transition
    // (review_and_fix_implementation → implement, review_and_adjust_plan → plan)
    // instead of advancing on submission_valid. Deterministic on payload+policy;
    // evaluated only when ops succeeded (failing verifications loop via
    // verification_failed, FR-040).
    const gateReason = opsSucceeded
      ? (this.reviewGateReason(sessionId, session, phaseDef, payload) ??
        variantReason ??
        null)
      : null;

    // Transition selection: success path ignores reason-only alternatives.
    const target = this.selectTransition(
      phaseDef?.transitions ?? [],
      opsSucceeded,
      opsSucceeded ? undefined : "verification_failed",
      gateReason,
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
    const beforeEnterIds = def.phases[target]?.lifecycle?.beforeEnter ?? [];
    // REV-F053-1: all-or-nothing approval — resolve + validate the WHOLE
    // list before any op executes.
    const beforeEnterOps = beforeEnterIds.map((id) => {
      const op = this.operations[id];
      if (!op)
        throw new GuidanceError(
          "operation_not_configured",
          `operation ${id} is not configured`,
          { recoverable: false },
        );
      return op;
    });
    this.assertApprovals(session, beforeEnterOps);
    for (const op of beforeEnterOps) {
      const run = await this.operationEngine.executeRequired(
        [op],
        this.ctxFor(session),
        gateObserver,
      );
      gateCursor += 1;
      this.consumeApprovals(session, [op], run.results);
      for (const r of run.results) {
        opResults.push(this.exposeOpResult(r, op));
        this.noteGateTransportFailure(sessionId, op, r);
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
          data: { lifecycle: "beforeEnter", operationId: op.operationId },
        });
        const err = new GuidanceError(
          "required_hook_failed",
          `beforeEnter operation ${op.operationId} failed; transition blocked`,
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
    // specs/017 FR-7: snapshot tasks.md when the verify phase is ENTERED
    // (before the agent runs speckit.converge) — never at submission time,
    // otherwise the classification races the agent's run (lesson #10).
    if (variant && target === "verify") {
      this.takeConvergenceSnapshot(session);
    }
    // specs/017 FR-8: crash-resume — entering a bound phase whose artifact
    // already exists skips it via artifacts_present (recorded).
    if (variant) {
      this.applyArtifactSkips(session, def);
    }
    const finalPhase = session.currentPhase;
    // A skip chain can land directly ON verify (custom variants may bind it):
    // ensure the convergence snapshot exists for that entry path too
    // (Review B F3) — but not twice within the same entry when the first
    // attempt already recorded its unavailability.
    if (
      variant &&
      finalPhase === "verify" &&
      !session.specKit?.convergence &&
      !session.specKit?.convergenceUnavailable
    ) {
      this.takeConvergenceSnapshot(session);
    }
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
    const afterExitIds = def.phases[previousPhase]?.lifecycle?.afterExit ?? [];
    // REV-F053-1: all-or-nothing approval — resolve + validate the WHOLE
    // list before any op executes.
    const afterExitOps = afterExitIds.map((id) => {
      const op = this.operations[id];
      if (!op)
        throw new GuidanceError(
          "operation_not_configured",
          `operation ${id} is not configured`,
          { recoverable: false },
        );
      return op;
    });
    this.assertApprovals(session, afterExitOps);
    for (const op of afterExitOps) {
      const run = await this.operationEngine.executeRequired(
        [op],
        this.ctxFor(session),
        gateObserver,
      );
      gateCursor += 1;
      this.consumeApprovals(session, [op], run.results);
      for (const r of run.results) {
        opResults.push(this.exposeOpResult(r, op));
        this.noteGateTransportFailure(sessionId, op, r);
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
          data: { lifecycle: "afterExit", operationId: op.operationId },
        });
      }
    }

    opResults.push(...(await this.runAfterEnter(session, finalPhase)));
    const result: SubmitResult = {
      accepted: true,
      sessionId,
      previousPhase,
      currentPhase: finalPhase,
      status: session.status,
      guidance: this.guidanceFor(session, finalPhase),
      operations: opResults,
    };
    this.sessions.update(sessionId, (s) => {
      s.currentPhase = finalPhase;
      s.previousPhase = previousPhase;
      s.specKit = session.specKit;
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
    hooks?: TransitionHooks,
  ): Promise<SubmitResult> {
    const routed = this.routedFor(sessionId);
    if (routed)
      return routed.completeWorkflow(sessionId, report, requestId, hooks);
    const result = await this.sessions.withLock(sessionId, () =>
      this.completeWorkflowLocked(sessionId, report, requestId, hooks),
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
        // specs/017 FR-8: session-start skip applies to chain successors too
        // (bound phase artifact already present → artifacts_present skip).
        this.applyArtifactSkips(successor, this.definitionFor(successor));
        // A skip chain can land the successor directly on verify: take the
        // convergence snapshot for that entry path (Review B F3).
        if (this.variantFor(successor) && successor.currentPhase === "verify") {
          this.takeConvergenceSnapshot(successor);
        }
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
    hooks?: TransitionHooks,
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
    const phaseDef = this.definitionFor(session).phases["complete"];
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
    this.assertApprovals(session, ops);
    const run = await this.operationEngine.executeRequired(
      ops,
      this.ctxFor(session),
      hooks?.onGateEvent,
    );
    this.consumeApprovals(session, ops, run.results);
    const opById = new Map(ops.map((op) => [op.operationId, op]));
    for (const r of run.results) {
      const gateOp = opById.get(r.operationId);
      if (gateOp) this.noteGateTransportFailure(sessionId, gateOp, r);
    }
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
    // specs/017 F3: a chain step naming a variant workflowId must boot the
    // successor into THAT variant's initial phase — resolve via the registry
    // and fail closed on unknown ids instead of silently using the boot def.
    const successorWorkflowId = step.workflowId ?? session.workflowId;
    let successorDefinition: WorkflowDefinition = this.definition;
    let successorVariantResolved = false;
    if (
      successorWorkflowId &&
      successorWorkflowId !== this.definition.workflowId
    ) {
      successorDefinition = this.workflowRegistry.resolve(
        this.config.configDir,
        successorWorkflowId,
      ).definition as unknown as WorkflowDefinition;
      successorVariantResolved = true;
    }
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
      variantResolved: successorVariantResolved,
      configurationVersion: session.configurationVersion,
      configDir: session.configDir,
      workspaceRoot: session.workspaceRoot,
      status: "activating", // crash-window fix (Plan-Review F1): fail-closed until activateSession completes
      currentPhase: successorDefinition.initialPhase,
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
    // GN-D1 (review F1): chain successors are session starts too — the hybrid
    // capability probe runs for them exactly as for startWorkflow creations
    // (fire-and-forget, never blocking activation).
    void this.probeCapabilityState(successor.sessionId).catch(() => {
      /* probe is best-effort; never fails successor creation */
    });
    // Chain fix (2026-10-08): inherit the spec-kit state so the FR-117 bridge
    // resolves Form-B candidates in EVERY successor session (a new sessionId
    // without a state file returned [] and silently ended the chain after one
    // task). Best-effort: the bridge implementation logs and swallows errors —
    // a failed copy degrades to the previous behavior, it never blocks completion.
    this.inheritSpecKitState?.(session.sessionId, successor.sessionId);
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
  async retryOperations(
    sessionId: string,
    hooks?: TransitionHooks,
  ): Promise<SubmitResult> {
    const routed = this.routedFor(sessionId);
    if (routed) return routed.retryOperations(sessionId, hooks);

    let finalizeRequestId: string | undefined;
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
      const phaseDef = this.definitionFor(session).phases[session.currentPhase];
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
      this.assertApprovals(session, ops);
      const run = await this.operationEngine.executeRequired(
        ops,
        this.ctxFor(session),
        hooks?.onGateEvent,
      );
      this.consumeApprovals(session, ops, run.results);
      const opById = new Map(ops.map((op) => [op.operationId, op]));
      for (const r of run.results) {
        const gateOp = opById.get(r.operationId);
        if (gateOp) this.noteGateTransportFailure(sessionId, gateOp, r);
      }
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
      // GND1-DESYNC-1 (live evidence 2026-10-09, two occurrences): a failed
      // submit can leave the phase WITHOUT a recorded submission (hook
      // failures before the persist, or error paths that never reach the
      // persisting update). Re-running green hooks must not advance the
      // phase on its own — the phase's submission contract is still
      // unfulfilled; the agent simply resubmits (the hooks now pass). The
      // complete phase is exempt: its 'submission' is the completion report
      // held in pendingCompletion (GDS-6 finalization below).
      if (
        target &&
        session.currentPhase !== "complete" &&
        !session.submissions[session.currentPhase]
      ) {
        this.audit.append({
          sessionId,
          eventType: "operation_retried",
          phase: session.currentPhase,
          data: { retried: true, transitionHeld: "missing_phase_submission" },
        });
        return {
          accepted: true,
          sessionId,
          currentPhase: session.currentPhase,
          status: session.status,
          operations: opResults,
        } as SubmitResult;
      }
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
            finalizeRequestId = pending.requestId;
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
    // REV-eedb7bb-1: refresh the requestId cache post-activation (mirror the
    // completeWorkflow path) so replays see the final chain status.
    return await this.activateSuccessor(result, finalizeRequestId);
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
        if (open) {
          open.resolution = {
            decision: input.decision,
            notes: input.notes,
            resolvedAt: new Date().toISOString(),
          };
          // FR-053 approval grant (REV-US2-F1, scope A): an approval blocker
          // resolved with "approve <operation-id>" stores a one-shot grant.
          if (open.category === "approval") {
            const m = /^approve\s+([a-z0-9-]+)\s*$/i.exec(input.decision);
            if (m) {
              s.approvedOperations ??= [];
              s.approvedOperations.push(m[1]!);
              this.audit.append({
                sessionId,
                eventType: "approval_granted",
                data: { operationId: m[1] },
              });
            }
          }
        }
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

  /** policies.reviewFindings.blockingSeverities — empty/absent disables the
   *  gate (lenient default, keeps minimal-policy configs working). */
  private blockingSeverities(): string[] {
    const raw = (
      this.config.policies as
        { reviewFindings?: { blockingSeverities?: unknown } } | undefined
    )?.reviewFindings?.blockingSeverities;
    if (!Array.isArray(raw)) return [];
    return raw.filter((s): s is string => typeof s === "string");
  }

  /** specs/017 FR-1: the variant definition of a session, or null when the
   *  session runs the boot workflow (standard-development — untouched, FR-2).
   *  A workflowId that does not resolve as a registry file is treated as a
   *  legacy free-form label (pre-017 sessions used it as a chain label) and
   *  falls back to the boot definition; a CORRUPT resolvable variant file
   *  still fails closed (non-workflow_not_found errors rethrow). */
  private variantFor(session: WorkflowSession): LoadedWorkflow | null {
    if (
      !session.workflowId ||
      session.workflowId === this.definition.workflowId
    ) {
      return null;
    }
    try {
      return this.workflowRegistry.resolve(
        this.config.configDir,
        session.workflowId,
      );
    } catch (err) {
      // specs/017 Final#1: a session that legitimately resolved its variant
      // at creation but whose file is now unresolvable runs degraded on the
      // boot definition — make that visible (sticky flag + one audit event)
      // instead of silently dropping all variant semantics. Applies to ANY
      // resolve error (missing file AND corrupt file); non-not_found errors
      // still rethrow afterwards so mutating paths stay fail-closed.
      if (session.variantResolved && !session.variantDegraded) {
        // Both writes are intentional: the local flag short-circuits the
        // remaining variantFor call sites of THIS operation (same object),
        // sessions.update persists it for other callers/engines. Plain
        // load-mutate-save, no lock (SessionRepository.update).
        session.variantDegraded = true;
        this.sessions.update(session.sessionId, (s) => {
          s.variantDegraded = true;
        });
        this.audit.append({
          sessionId: session.sessionId,
          eventType: "variant_degraded",
          phase: session.currentPhase,
          data: {
            workflowId: session.workflowId,
            reason: err instanceof Error ? err.message : String(err),
          },
        });
      }
      if (err instanceof GuidanceError && err.code === "workflow_not_found") {
        return null;
      }
      throw err;
    }
  }

  /** Session-scoped definition lookup: variant definition when the session
   *  opted into one at creation, boot definition otherwise (FR-2 fallback). */
  private definitionFor(session: WorkflowSession): WorkflowDefinition {
    const variant = this.variantFor(session);
    return variant
      ? (variant.definition as unknown as WorkflowDefinition)
      : this.definition;
  }

  private bindingsFor(session: WorkflowSession): Record<string, PhaseBinding> {
    return this.variantFor(session)?.bindings ?? {};
  }

  private limitsFor(session: WorkflowSession): VariantLimits {
    return (
      this.variantFor(session)?.limits ?? {
        maxReviewRoundsPerBatch: 5,
        maxConvergencePasses: 5,
      }
    );
  }

  private artifactCheck(
    session: WorkflowSession,
    pattern: string,
  ): { present: boolean; reason?: string; sha256?: string; content?: string } {
    return (
      this.deps.specKitArtifactCheck?.(session.sessionId, pattern) ?? {
        present: false,
        reason: "artifact check bridge not wired",
      }
    );
  }

  /** specs/017 FR-8: advance through bound phases whose exit artifact already
   *  exists and imports cleanly (artifacts_present). Records every skip in
   *  session state + audit. Mutates session.currentPhase in place. */
  private applyArtifactSkips(
    session: WorkflowSession,
    definition: WorkflowDefinition,
  ): void {
    const bindings = this.bindingsFor(session);
    for (let guard = 0; guard < 16; guard++) {
      const artifact = bindings[session.currentPhase]?.artifact;
      if (!artifact || !artifact.required) break;
      const check = this.artifactCheck(session, artifact.pattern);
      if (!check.present) break;
      const transition = (
        definition.phases[session.currentPhase]?.transitions ?? []
      ).find((t) => t.when === "submission_valid");
      if (!transition) break;
      const from = session.currentPhase;
      session.currentPhase = transition.to;
      const sk = (session.specKit ??= {
        skips: [],
        batches: [],
        convergence: null,
      });
      sk.skips.push({
        phase: from,
        reason: "artifacts_present",
        at: new Date().toISOString(),
      });
      this.audit.append({
        sessionId: session.sessionId,
        eventType: "phase_skipped",
        phase: from,
        data: { reason: "artifacts_present", to: transition.to },
      });
    }
    this.sessions.update(session.sessionId, (s) => {
      s.currentPhase = session.currentPhase;
      s.specKit = session.specKit;
    });
  }

  /** specs/017 FR-7: snapshot tasks.md when the verify phase is ENTERED
   *  (before the agent runs speckit.converge) — never at submission time,
   *  otherwise the classification races the agent's run (lesson #10). */
  private takeConvergenceSnapshot(session: WorkflowSession): void {
    const sk = (session.specKit ??= {
      skips: [],
      batches: [],
      convergence: null,
    });
    const check = this.artifactCheck(session, "tasks.md");
    // No importable tasks.md (or bridge unwired) => no snapshot; the
    // convergence gate then degrades to the standard flow instead of
    // comparing against an empty hash (Review B F4). With a WIRED bridge the
    // failure is SIGNALLED (Final#2): audit + visible flag + guidance note —
    // and the verify gate rejects the submission instead of silently
    // completing (unwired engines keep the historical behavior).
    if (!check.present || !check.sha256) {
      if (typeof this.deps.specKitArtifactCheck === "function") {
        const reason = check.reason ?? "tasks.md missing or unreadable";
        sk.convergenceUnavailable = reason;
        this.sessions.update(session.sessionId, (s) => {
          s.specKit = session.specKit;
        });
        this.audit.append({
          sessionId: session.sessionId,
          eventType: "convergence_snapshot_unavailable",
          phase: session.currentPhase,
          data: { reason },
        });
      }
      return;
    }
    sk.convergenceUnavailable = undefined;
    sk.convergence = {
      snapshotSha256: check.sha256,
      passes: sk.convergence?.passes ?? 0,
    };
    this.sessions.update(session.sessionId, (s) => {
      s.specKit = session.specKit;
    });
  }

  /** specs/017 FR-4 (enforcement layer): fail-closed artifact exit gate for
   *  bound variant phases. Returns a reject result or null. */
  private specKitExitGate(
    session: WorkflowSession,
    variant: LoadedWorkflow,
    phase: string,
  ): Record<string, unknown> | null {
    const artifact = variant.bindings[phase]?.artifact;
    if (!artifact || !artifact.required) return null;
    const check = this.artifactCheck(session, artifact.pattern);
    if (check.present) return null;
    const err = new GuidanceError(
      "spec_kit_artifact_missing",
      `bound phase "${phase}" cannot be exited: no importable artifact matching "${artifact.pattern}" (${check.reason ?? "not found"}) — produce it with the phase's bound command, or it is picked up by the artifacts_present skip`,
      {
        recoverable: true,
        currentPhase: session.currentPhase,
        workflowStatus: session.status,
      },
    );
    return {
      ...err.toResponse(),
      sessionId: session.sessionId,
      currentPhase: session.currentPhase,
      status: session.status,
    };
  }

  /** specs/017 FR-6/FR-7: variant-specific transition gating. Returns a
   *  reason for selectTransition, a reject result, or nothing. Handles:
   *  - review_and_fix_implementation `outcome` (batch cadence)
   *  - implement batch registration
   *  - verify convergence classification (hash-based, DQ-1) */
  private specKitVariantGate(
    session: WorkflowSession,
    variant: LoadedWorkflow,
    phase: string,
    payload: Record<string, unknown>,
  ): { reason?: string; reject?: Record<string, unknown> } {
    const sk = (session.specKit ??= {
      skips: [],
      batches: [],
      convergence: null,
    });
    const fail = (
      code:
        | "spec_kit_batch_gate"
        | "spec_kit_convergence_unclassified"
        | "convergence_snapshot_unavailable"
        | "spec_kit_clarify_declaration_invalid",
      message: string,
    ) => {
      const err = new GuidanceError(code, message, {
        recoverable: true,
        currentPhase: session.currentPhase,
        workflowStatus: session.status,
      });
      return {
        ...err.toResponse(),
        sessionId: session.sessionId,
        currentPhase: session.currentPhase,
        status: session.status,
      };
    };

    // implement: register/update the submitted batch (batch-scoped payload).
    // Re-submitting the same batch id updates the current batch instead of
    // stacking duplicates (implement -> review fix loop re-runs implement).
    if (phase === "implement") {
      const batch = payload.batch as
        { id?: unknown; taskIds?: unknown } | undefined;
      if (
        batch &&
        Array.isArray(batch.taskIds) &&
        batch.taskIds.length > 0 &&
        batch.taskIds.every((t) => typeof t === "string")
      ) {
        const id =
          typeof batch.id === "string" && batch.id.length > 0
            ? batch.id
            : `batch-${sk.batches.length + 1}`;
        const existing = [...sk.batches]
          .reverse()
          .find((b) => !b.approved && b.id === id);
        if (existing) {
          existing.taskIds = batch.taskIds as string[];
        } else {
          sk.batches.push({
            id,
            taskIds: batch.taskIds as string[],
            reviewRounds: 0,
            approved: false,
          });
        }
        this.sessions.update(session.sessionId, (s) => {
          s.specKit = session.specKit;
        });
      }
      return {};
    }

    // review_and_fix_implementation: strict batch cadence outcome.
    if (phase === "review_and_fix_implementation") {
      const persistSpecKit = () => {
        this.sessions.update(session.sessionId, (s) => {
          s.specKit = session.specKit;
        });
      };
      const outcome = payload.outcome;
      const current = [...sk.batches].reverse().find((b) => !b.approved);
      if (outcome === "implementation_changes_required") {
        if (current) {
          current.reviewRounds += 1;
          if (current.reviewRounds > variant.limits.maxReviewRoundsPerBatch) {
            return {
              reject: this.escalateBlocker(
                session,
                "spec_kit_review_round_exceeded",
                `batch "${current.id}" exceeded the review-round maximum (${variant.limits.maxReviewRoundsPerBatch}) — escalate to the user`,
              ),
            };
          }
          // Persist immediately: the round counter must survive reject paths
          // (beforeEnter/ops failures) — otherwise the outcome is replayable
          // and session state diverges from the audit trail (Review B F1).
          persistSpecKit();
        }
        return { reason: "implementation_changes_required" };
      }
      if (outcome === "batch_approved_more_pending") {
        if (!current) {
          return {
            reject: fail(
              "spec_kit_batch_gate",
              "outcome batch_approved_more_pending requires an unapproved batch",
            ),
          };
        }
        // Approve and loop — the NEXT implement submission registers the
        // following batch (batches are unknown until the agent implements
        // them; the task list tells the agent whether more are pending).
        current.approved = true;
        current.reviewRounds += 1;
        persistSpecKit();
        return { reason: "batch_approved_more_pending" };
      }
      if (outcome === "submission_valid") {
        if (current) current.approved = true;
        const unapproved = sk.batches.filter((b) => !b.approved);
        if (unapproved.length > 0) {
          persistSpecKit();
          return {
            reject: fail(
              "spec_kit_batch_gate",
              `submission_valid requires every batch to have an approved review pass — unapproved: ${unapproved.map((b) => b.id).join(", ")}`,
            ),
          };
        }
        persistSpecKit();
        return {};
      }
      // No outcome: fall through to the standard severity gate / selection.
      return {};
    }

    // understand: FR-5 attended-clarify self-declaration (specs/017 follow-up
    // A2). asked=true requires blockerId of an ANSWERED blocker
    // (resume_workflow keeps the entry and sets .resolution); asked=false
    // forbids blockerId. Valid declarations are audited.
    if (phase === "understand") {
      const clarify = payload.clarify as
        { asked?: unknown; blockerId?: unknown } | undefined;
      if (clarify && typeof clarify.asked === "boolean") {
        // Normalize an empty-string blockerId to absent (F2: asked=false with
        // blockerId: "" must behave exactly like no blockerId).
        if (clarify.blockerId === "") clarify.blockerId = undefined;
        if (clarify.asked) {
          const blockerId =
            typeof clarify.blockerId === "string" ? clarify.blockerId : "";
          const answered = blockerId
            ? (session.blockers ?? []).some(
                (b) =>
                  b.blockerId === blockerId &&
                  b.category === "clarify" &&
                  !!b.resolution,
              )
            : false;
          if (!answered) {
            return {
              reject: fail(
                "spec_kit_clarify_declaration_invalid",
                blockerId
                  ? `clarify declaration references blocker "${blockerId}" which does not exist, is not a clarify blocker, or has not been answered via resume_workflow`
                  : "clarify declaration with asked=true requires the blockerId of a clarify blocker answered via resume_workflow",
              ),
            };
          }
        } else if (
          clarify.blockerId !== undefined &&
          clarify.blockerId !== ""
        ) {
          return {
            reject: fail(
              "spec_kit_clarify_declaration_invalid",
              "clarify declaration with asked=false must not carry a blockerId",
            ),
          };
        }
        this.audit.append({
          sessionId: session.sessionId,
          eventType: "clarify_declared",
          phase,
          data: {
            asked: clarify.asked,
            blockerId: clarify.blockerId ?? null,
          },
        });
      }
    }

    // verify: hash-based convergence classification (DQ-1).
    if (phase === "verify") {
      const snapshot = sk.convergence;
      if (!snapshot) {
        // specs/017 Final#2: with a wired bridge a missing snapshot means
        // tasks.md was missing/unreadable at verify entry. Recovery-first:
        // if tasks.md is importable NOW, retake the snapshot instead of
        // rejecting (the agent restored the file after the entry failure);
        // otherwise reject with the classified recoverable error instead of
        // silently bypassing the converge loop. Unwired bridge: historical
        // standard flow.
        if (typeof this.deps.specKitArtifactCheck === "function") {
          const nowCheck = this.artifactCheck(session, "tasks.md");
          if (nowCheck.present && nowCheck.sha256) {
            // Retake the snapshot, but do NOT classify against it in the same
            // submission — that would make the gate tautological (any
            // restored file would trivially "converge"). Force one more
            // submission so the agent reports convergence against the NEW
            // snapshot (final review F1).
            this.takeConvergenceSnapshot(session);
            return {
              reject: fail(
                "convergence_snapshot_unavailable",
                "tasks.md is importable again — convergence snapshot retaken; resubmit the verification results (speckit.converge classification runs against the new snapshot)",
              ),
            };
          }
        }
      }
      if (!snapshot) {
        if (typeof this.deps.specKitArtifactCheck === "function") {
          return {
            reject: fail(
              "convergence_snapshot_unavailable",
              `no convergence snapshot was taken at verify entry (${sk.convergenceUnavailable ?? "tasks.md missing or unreadable"}) — restore tasks.md (e.g. import_spec_kit_artifacts) and resubmit`,
            ),
          };
        }
        return {}; // bridge unwired: historical standard flow
      }
      const check = this.artifactCheck(session, "tasks.md");
      if (!check.present || !check.sha256) return {};
      if (check.sha256 === snapshot.snapshotSha256) {
        return {}; // converged — normal flow advances to complete
      }
      const appended =
        typeof check.content === "string" &&
        /##\s*Phase\s+\d+:\s*Convergence/.test(check.content);
      if (!appended) {
        return {
          reject: fail(
            "spec_kit_convergence_unclassified",
            "tasks.md changed during speckit.converge without a '## Phase N: Convergence' section — classify the converge outcome (byte-identical = converged, Convergence section = tasks_appended)",
          ),
        };
      }
      const passes = snapshot.passes + 1;
      if (passes > variant.limits.maxConvergencePasses) {
        return {
          reject: this.escalateBlocker(
            session,
            "spec_kit_convergence_exceeded",
            `convergence pass maximum exceeded (${variant.limits.maxConvergencePasses}) — escalate to the user`,
          ),
        };
      }
      sk.convergence = { snapshotSha256: snapshot.snapshotSha256, passes };
      this.sessions.update(session.sessionId, (s) => {
        s.specKit = session.specKit;
      });
      return { reason: "tasks_appended" };
    }
    return {};
  }

  /** specs/017 US4/US5: escalate a loop-limit breach via a
   *  requiresUserDecision blocker (session status blocked). */
  private escalateBlocker(
    session: WorkflowSession,
    category: string,
    description: string,
  ): Record<string, unknown> {
    this.sessions.update(session.sessionId, (s) => {
      s.status = "blocked";
      s.specKit = session.specKit;
      s.blockers.push({
        blockerId: `blocker-${randomUUID()}`,
        category,
        description,
        requiresUserDecision: true,
      });
    });
    session.status = "blocked";
    this.audit.append({
      sessionId: session.sessionId,
      eventType: "blocker_reported",
      phase: session.currentPhase,
      data: { category, requiresUserDecision: true },
    });
    const err = new GuidanceError("workflow_blocked", description, {
      recoverable: true,
      currentPhase: session.currentPhase,
      workflowStatus: session.status,
    });
    return {
      ...err.toResponse(),
      sessionId: session.sessionId,
      currentPhase: session.currentPhase,
      status: session.status,
    };
  }

  /** specs/017 US7: variant visibility annex for phase guidance. */
  private specKitGuidanceNote(session: WorkflowSession, phase: string): string {
    const variant = this.variantFor(session);
    if (!variant) return "";
    const lines: string[] = [
      ` SPEC-KIT MODE (workflow "${variant.workflowId}") phase "${phase}":`,
    ];
    const binding = variant.bindings[phase];
    if (binding) {
      lines.push(
        `- Bound command(s): ${binding.commands.join(", ")} — run them for this phase.`,
      );
      if (binding.artifact?.required) {
        lines.push(
          `- Exit gate: a non-empty artifact matching "${binding.artifact.pattern}" must exist and import cleanly before submission (fail-closed).`,
        );
      }
      if (phase === "understand") {
        lines.push(
          "- Attended clarify (FR-5): surface open questions via report_blocker with requiresUserDecision: true — NEVER answer clarify questions yourself; resume_workflow continues the phase.",
        );
        lines.push(
          '- Clarify declaration (required in this submission): {"clarify": {"asked": true, "blockerId": "<answered clarify blocker>"}} when questions were surfaced and answered, or {"clarify": {"asked": false}} when the spec has no open questions. Submissions are rejected until the declaration matches an answered blocker.',
        );
      }
    }
    if (phase === "implement") {
      lines.push(
        "- Strict batch cadence: submit the current, fully implemented batch (batch-scoped submit_implementation payload carrying the batch's task ids); every batch passes review_and_fix_implementation before verify.",
      );
      if ((session.specKit?.convergence?.passes ?? 0) > 0) {
        lines.push(
          "- Convergence loop active: call refresh_spec_kit_artifacts FIRST (the task snapshot changed), then implement the gap tasks from the appended '## Phase N: Convergence' section — they re-enter the strict batch cadence.",
        );
      }
    }
    if (phase === "review_and_fix_implementation") {
      lines.push(
        '- Review outcomes: {"outcome": "implementation_changes_required" | "batch_approved_more_pending" | "submission_valid"} — submission_valid is only accepted when EVERY batch has an approved review pass.',
      );
    }
    if (phase === "verify") {
      lines.push(
        '- Converge loop: run speckit.converge; byte-identical tasks.md = converged (submit_verification proceeds to complete); a new "## Phase N: Convergence" section loops back to implement — call refresh_spec_kit_artifacts first, then implement the gap tasks (they re-enter the batch cadence).',
      );
      if (session.specKit?.convergenceUnavailable) {
        lines.push(
          `- CONVERGENCE SNAPSHOT UNAVAILABLE: ${session.specKit.convergenceUnavailable} — restore tasks.md and re-enter verify; submissions are rejected until a snapshot exists.`,
        );
      }
    }
    const sk = session.specKit;
    if (sk?.skips.length) {
      lines.push(
        `- Skips: ${sk.skips.map((s) => `${s.phase} (${s.reason})`).join(", ")}.`,
      );
    }
    if (sk?.batches.length) {
      const current = [...sk.batches].reverse().find((b) => !b.approved);
      lines.push(
        `- Batches: ${sk.batches.length} total, ${sk.batches.filter((b) => b.approved).length} approved${current ? `, current batch "${current.id}" review round ${current.reviewRounds}/${variant.limits.maxReviewRoundsPerBatch}` : ""}.`,
      );
    }
    if (sk?.convergence) {
      lines.push(
        `- Convergence passes: ${sk.convergence.passes}/${variant.limits.maxConvergencePasses}.`,
      );
    }
    return "\n" + lines.join("\n");
  }

  /** Severity gate (reviewFindings.blockingSeverities): when the phase has a
   *  reason-transition, ops succeeded and the submission carries open
   *  blocking findings, return that transition's reason so selectTransition
   *  loops back instead of advancing. Evaluated only on the ops-success path
   *  (a failing verification wins via verification_failed) and persists the
   *  loop counter immediately so audit and session state stay consistent.
   *  Phase identity is deliberately indirect (any phase with a
   *  reason-transition whose valid payload carries findings): custom
   *  workflows can gate additional review-style phases. */
  private reviewGateReason(
    sessionId: string,
    session: WorkflowSession,
    phaseDef:
      | { transitions?: { to: string; when?: string; reason?: string }[] }
      | undefined,
    payload: Record<string, unknown>,
  ): string | null {
    const severities = this.blockingSeverities();
    if (severities.length === 0) return null;
    const reasonTransition = (phaseDef?.transitions ?? []).find(
      (t) => typeof t.reason === "string",
    );
    if (!reasonTransition?.reason) return null;
    const findings = (payload as { findings?: unknown }).findings;
    if (!Array.isArray(findings) || findings.length === 0) return null;
    const evaluation = evaluateReviewFindings(findings, severities);
    if (!evaluation.blocked) return null;
    const loops = (session.reviewGateLoops ??= {});
    const loopCount = (loops[session.currentPhase] ?? 0) + 1;
    loops[session.currentPhase] = loopCount;
    // Persist immediately: the counter must stay consistent with the audit
    // event even when the subsequent transition fails (beforeEnter hook or
    // misconfigured phase) and the submit returns early.
    this.sessions.update(sessionId, (s) => {
      s.reviewGateLoops = { ...loops };
    });
    this.audit.append({
      sessionId,
      eventType: "review_findings_gate_triggered",
      phase: session.currentPhase,
      data: {
        openBlockingCount: evaluation.openBlocking.length,
        totalFindings: evaluation.totalFindings,
        loopCount,
      },
    });
    return reasonTransition.reason;
  }

  private selectTransition(
    transitions: { to: string; when?: string; reason?: string }[],
    opsSucceeded: boolean,
    failureReason?: string,
    gateReason?: string | null,
  ): string | null {
    if (!opsSucceeded && failureReason) {
      return transitions.find((t) => t.reason === failureReason)?.to ?? null;
    }
    if (gateReason) {
      const gated = transitions.find((t) => t.reason === gateReason)?.to;
      if (gated) return gated;
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
    const def = this.definitionFor(session);
    const phaseDef = def.phases[key];
    const configured = this.instructions[phaseDef?.response ?? key];
    // specs/017 FR-4 (instruction layer) + US7: bound commands, exit gate,
    // batch/review-round state, skips and convergence progress are surfaced
    // in the phase guidance of variant sessions.
    const specKitNote = this.specKitGuidanceNote(session, key);
    // specs/017 Final#1: a degraded variant session runs on the boot
    // definition — say so loudly, including the sticky-flag caveat.
    const degradedNote = session.variantDegraded
      ? '\n VARIANT DEGRADED: the workflow definition file for "' +
        session.workflowId +
        '" is missing or unresolvable — this session runs on the default workflow semantics (no variant gates, no batch cadence, no artifact/convergence enforcement). Restore the definition file or restart with a valid one; the session REMAINS marked degraded for its lifetime.'
      : "";
    // Amendment 002 (FR-118): Form-B successors are scoped to exactly one
    // spec-kit task — the annex is appended to EVERY phase instruction.
    const scope = session.chainTaskScope
      ? ` CHAIN TASK SCOPE: This workflow is chained for spec-kit task ${session.chainTaskScope.taskId} of feature ${session.chainTaskScope.featureId} ONLY. Import the artifacts first (import_spec_kit_artifacts), then start/submit/complete exactly this task; do not touch other tasks.`
      : "";
    // WF-6 trap (chain-head scope): the head session runs the top-level
    // request; successors ALWAYS start at steps[0]. Warn the head agent not
    // to implement steps[] scopes itself, or the first successor duplicates
    // the work. Heads only (chainFrom === null); successors carry the rest
    // of the chainSpec with chainFrom set.
    const headScope =
      session.chainFrom === null &&
      Array.isArray(session.chainSpec?.steps) &&
      session.chainSpec.steps.length > 0
        ? " CHAIN HEAD SCOPE: this session is the chain head; successors will run chain.steps[0..] in order. Do NOT implement any steps[] scope under this head session — keep the head request as its own scope (or run it as a verification-only cycle), otherwise the first successor duplicates the work."
        : "";
    // Severity gate loop counter (Option A): surface gate-triggered loop-backs
    // so the agent sees the repetition; no hard cap by design. The counter is
    // per review phase, but the note is shown on every phase while loops exist
    // (the loop lands the session in implement/plan, where the agent must act).
    // The completion final-review gate still requires high/critical findings
    // to be status "fixed" — tracked/accepted pass the loop gate but block
    // completion (deliberate divergence, see review-findings.ts).
    const gateLoopEntries = Object.entries(session.reviewGateLoops ?? {});
    const gateLoopTotal = gateLoopEntries.reduce((n, [, v]) => n + v, 0);
    const gateSeverities = this.blockingSeverities();
    const severityLabel =
      gateSeverities.length > 0 ? gateSeverities.join("/") : "high/critical";
    const gateNote =
      gateLoopTotal > 0
        ? ` SEVERITY GATE LOOP: the severity gate has looped this workflow ${gateLoopTotal} time(s) (${gateLoopEntries.map(([p, n]) => `${p}: ${n}`).join(", ")}) — open ${severityLabel} findings keep sending the workflow back; fix every blocking finding or classify it (status tracked/accepted) and record the follow-up — note the completion final-review gate still requires ${severityLabel} findings to be status fixed.`
        : "";
    return {
      title: configured?.title ?? key,
      instruction:
        (configured?.instruction ?? "") +
        scope +
        headScope +
        gateNote +
        specKitNote +
        degradedNote,
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
