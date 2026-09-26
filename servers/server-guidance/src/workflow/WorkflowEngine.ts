/**
 * Authoritative workflow state machine (FR-001–005, FR-019, FR-022, FR-028).
 * Phase guidance and transitions come exclusively from configuration.
 */
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import {
  existsSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  renameSync,
} from "node:fs";
import { join } from "node:path";
import { GuidanceError } from "../types/errors.js";
import type { ChainConfig, LoadedConfig } from "../config.js";
import type {
  OperationConfig,
  OperationStatus,
  PhaseInstruction,
  TrustLevel,
  WorkflowDefinition,
  WorkflowSession,
} from "../types/index.js";
import { WorkspaceOpLock } from "./workspace-lock.js";
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

const TRUST_LEVELS: readonly TrustLevel[] = [
  "untrusted",
  "restricted",
  "trusted",
  "privileged",
];
/** Warn-once-Gedächtnis: eine Fehlkonfiguration soll nicht pro Call warnen. */
const trustLevelWarned = new Set<string>();
/** Normalizes a configured trustLevel to the TrustLevel union; unknown values fall back to "trusted". */
function toTrustLevel(
  value: string | undefined,
  serverId?: string,
): TrustLevel {
  if (value !== undefined && !TRUST_LEVELS.includes(value as TrustLevel)) {
    const key = `${serverId ?? "?"}:${value}`;
    if (!trustLevelWarned.has(key)) {
      trustLevelWarned.add(key);
      process.stderr.write(
        `[guidance] warning: unknown trustLevel "${value}" for server ${serverId ?? "?"}; falling back to "trusted"\n`,
      );
    }
  }
  return TRUST_LEVELS.includes(value as TrustLevel)
    ? (value as TrustLevel)
    : "trusted";
}

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

export interface StartResult {
  accepted: true;
  sessionId: string;
  workflowId: string;
  currentPhase: string;
  status: string;
  guidance: PhaseInstruction;
  operations: { id: string; status: string; summary: string }[];
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
  operations?: { id: string; status: string; summary: string }[];
  error?: { code: string; message: string; recoverable: boolean };
  /** Amendment 002: set when a chain successor was created for this completion. */
  nextSessionId?: string;
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
  /** FR-117 bridge: pending spec-kit tasks of a session, tasks.md order. */
  specKitTasks?: (sessionId: string) => PendingSpecKitTask[];
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
  private readonly config: LoadedConfig;
  private readonly chain: ChainConfig;
  private readonly specKitTasks?: (sessionId: string) => PendingSpecKitTask[];
  private readonly validators = new Map<string, SchemaValidator>();

  constructor(deps: EngineDeps) {
    this.config = deps.config;
    this.chain = deps.config.chain ?? {
      enabled: false,
      maxChainDepth: 8,
      maxStepsPerManifest: 16,
    };
    this.specKitTasks = deps.specKitTasks;
    this.sessions = new SessionRepository(join(deps.stateDir, "sessions"));
    this.archiveDir = join(deps.stateDir, "archive");
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
    this.workspaceLock = new WorkspaceOpLock(
      join(deps.stateDir, "workspace-ops.lock"),
      "workspace-ops.lock",
      Math.max(120_000, 2 * maxTimeoutSeconds * 1000),
    );
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
    if (enabled.length > 0) {
      this.clientManager = new ClientManager({
        requiredServers: enabled
          .filter(([, v]) => v.required)
          .map(([id]) => id),
      });
      this.allowlists = new Map(
        enabled.map(([id, v]) => [id, v.capabilities?.allow?.tools ?? []]),
      );
      // An externally provided OperationEngine keeps its own invoker (test seam).
      if (!deps.operationEngine)
        this.operationEngine.setDownstreamInvoker({
          invokeTool: async (serverId, toolName, args) => {
            const allow = this.allowlists?.get(serverId) ?? [];
            this.clientManager!.assertAllowed(serverId, toolName, allow);
            const serverCfgE = servers[serverId];
            const opForEgress = Object.values(this.operations).find(
              (o) => o.server === serverId && o.capability === toolName,
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
              this.clientManager!.assertNotDrifted(
                serverId,
                toolName,
                pinnedHash,
              );
            }
            if (tool) {
              this.pinnedHashes.set(
                `${serverId}:${toolName}`,
                tool.inputSchemaHash,
              );
              saveCapabilityPins(deps.stateDir, this.pinnedHashes); // 2e: Pin persistieren
            }
            const requestTimeoutSeconds =
              serverCfg?.connection?.requestTimeoutSeconds;
            return await this.clientManager!.invokeTool(
              serverId,
              toolName,
              args,
              requestTimeoutSeconds,
            );
          },
        });
    }
  }

  private clientManager?: ClientManager;
  private allowlists?: Map<string, string[]>;
  private readonly stateDir: string;
  private readonly workspaceLock: WorkspaceOpLock;
  private readonly runningOps = new Set<string>();
  private readonly activeOpControllers = new Map<string, Set<AbortController>>();
  private readonly redactionPatterns: string[];
  private pinnedHashes = new Map<string, string>();
  private readonly policyEngine = new PolicyEngine();
  private readonly archiveDir: string;
  private readonly redactor: ReturnType<typeof createRedactor>;

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

  async getWorkflowState(sessionId: string): Promise<WorkflowSession> {
    return await this.sessions.withLock(sessionId, () => {
      // Amendment 002: getSession includes the fail-closed 'activating' check.
      const session = this.reconcileRunningOperations(
        this.getSession(sessionId),
      );
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
    }[]
  > {
    if (!this.clientManager) return [];
    const out: {
      id: string;
      status?: string;
      required?: boolean;
      lastSuccessfulRequestAt?: string;
    }[] = [];
    for (const id of this.allowlists?.keys() ?? []) {
      const st = this.clientManager.statusOf(id);
      out.push({
        id,
        status: st?.status ?? "disconnected",
        required: st?.required,
        lastSuccessfulRequestAt: st?.lastSuccessfulRequestAt,
      });
    }
    return out;
  }

  /** spec 003 FR-109: cross-session serialization for venv-mutating ops.
   *  File lock (O_CREAT-exclusiv) im stateDir — gilt auch über
   *  Engine-Instanzen hinweg. Stale-Lock-Recovery (Review R-004): ein Lock
   *  eines toten Prozesses oder älter als STALE_LOCK_TTL_MS wird gestohlen,
   *  damit ein Crash den Bootstrap nicht dauerhaft blockiert. */
  /** spec 003 FR-109: cross-session serialization for venv-mutating ops.
   *  Race-safe Implementierung in workspace-lock.ts (atomarer link-Acquire,
   *  rename-basierter Steal mit verify+restore — Review R-011). */
  private acquireWorkspaceOpLock(): void {
    this.workspaceLock.acquire();
  }

  private releaseWorkspaceOpLock(): void {
    this.workspaceLock.release();
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
  ): Promise<{ id: string; status: string; summary: string }> {
    const session = this.getSession(sessionId);
    const auditDenial = (data: Record<string, unknown>): void =>
      this.audit.append({ sessionId, eventType: "operation_invocation_denied", data });
    const op = this.operations[operationId];
    if (!op) {
      auditDenial({ operationId, reason: "operation_not_configured" });
      throw new GuidanceError("operation_not_configured", `operation ${operationId} is not configured`, { recoverable: false });
    }
    if (op.invocableByAgent !== true) {
      auditDenial({ operationId, reason: "agent_invocation_denied" });
      throw new GuidanceError("agent_invocation_denied", `operation ${operationId} is not marked invocableByAgent`, { recoverable: true });
    }
    if (this.runningOps.has(sessionId)) {
      auditDenial({ operationId, reason: "operation_in_progress" });
      throw new GuidanceError("operation_in_progress", `an operation is already running for session ${sessionId}`, { recoverable: true });
    }
    this.acquireWorkspaceOpLock();
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
        this.audit.append({ sessionId, eventType: "operation_invocation_denied", data: { operationId, reason: `session_${session.status}` } });
        return { id: operationId, status: "failed", summary: `session is ${session.status}` };
      }
      const run = await this.operationEngine.execute(op, this.ctxFor(session), 1, controller.signal);
      // FR-202 (Hard-Kill seit Feature 004): Cancel/Timeout bricht den Child
      // via Abort ab (SIGTERM→SIGKILL); das Ergebnis wird verworfen und als
      // cancelled auditiert.
      const wasCancelled =
        this.sessions.load(sessionId).status === "cancelled" || run.status === "cancelled";
      if (wasCancelled) {
        this.audit.append({
          sessionId,
          eventType: "operation_invoked",
          data: { operationId, status: "cancelled", durationMs: Date.now() - startedAt, via: "run_operation" },
        });
        return { id: operationId, status: "failed", summary: "session cancelled during operation; result discarded" };
      }
      this.recordDownstreamState(sessionId, run.operationId, run.status, run.summary);
      this.audit.append({
        sessionId,
        eventType: "operation_invoked",
        data: { operationId, status: run.status, durationMs: Date.now() - startedAt, via: "run_operation" },
      });
      return this.exposeOpResult(run, op);
    } catch (err) {
      this.audit.append({
        sessionId,
        eventType: "operation_invoked",
        data: { operationId, status: "failed", durationMs: Date.now() - startedAt, via: "run_operation" },
      });
      throw err;
    } finally {
      this.runningOps.delete(sessionId);
      const controllers = this.activeOpControllers.get(sessionId);
      controllers?.delete(controller);
      if (controllers && controllers.size === 0) this.activeOpControllers.delete(sessionId);
      this.releaseWorkspaceOpLock();
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
    workspaceRoot: string;
    request: string;
    workflowId?: string;
    metadata?: Record<string, unknown>;
    chain?: unknown;
  }): Promise<StartResult> {
    const sessionId = `session-${randomUUID()}`;
    const now = new Date().toISOString();
    const chainSpec =
      input.chain !== undefined
        ? this.validateChainManifest(input.chain)
        : undefined;
    const session: WorkflowSession = {
      sessionId,
      workflowId: input.workflowId ?? this.definition.workflowId,
      profile: this.config.profile,
      configurationVersion: this.config.configVersion,
      configDir: this.config.configDir,
      workspaceRoot: input.workspaceRoot,
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
    return this.sessions.withLock(sessionId, () =>
      this.submitLocked(sessionId, phase, payload, requestId),
    );
  }

  /** FR-037/§30: op result filtered per returnToAgent exposure before agent-facing use. */
  private exposeOpResult(
    r: {
      operationId: string;
      status: string;
      summary: string;
      content?: unknown[];
      data?: Record<string, unknown>;
    },
    config?: OperationConfig,
  ): { id: string; status: string; summary: string } {
    const mode = config?.output?.returnToAgent ?? "summary_and_errors";
    const exposed = this.policyEngine.applyExposure(
      {
        ...r,
        content: r.content ?? [],
        data: r.data ?? {},
        errors: [],
        warnings: [],
        protocolMetadata: {},
      },
      mode,
    );
    const errorMessages: string[] =
      (r as { errors?: { message: string }[] }).errors?.map((e) => this.redactor.redact(e.message)) ??
      [];
    const suffix =
      errorMessages.length > 0 &&
      (mode === "summary_and_errors" || mode === "normalized" || mode === "raw")
        ? `: ${errorMessages.join("; ").slice(0, 500)}`
        : "";
    return {
      id: r.operationId,
      status: r.status,
      summary: exposed.summary + suffix,
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
      return session.requestIds[requestId] as SubmitResult;
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
      if (requestId) s.requestIds[requestId] = result;
    });
    return result;
  }

  async completeWorkflow(
    sessionId: string,
    report: Record<string, unknown>,
    requestId?: string,
  ): Promise<SubmitResult> {
    const result = await this.sessions.withLock(sessionId, () =>
      this.completeWorkflowLocked(sessionId, report, requestId),
    );
    // Amendment 002: Successor-Lifecycle OUTSIDE the predecessor lock (Spec §4.2).
    // Guard "activating": replays (requestIds idempotency) return the cached
    // result whose successor is already active/blocked — no double activation.
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
          this.sessions.update(sessionId, (s) => {
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
      return session.requestIds[requestId] as SubmitResult;
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
    const resolved = this.resolveChainStep(session, report);
    if (resolved === null) {
      // CHN-4: a silent Form-B end (source set, no pending candidate) is the
      // normal termination but deserves a diagnostic marker so a broken
      // bridge is at least countable; pure Form-A exhaustion stays fully
      // silent per Spec §3.2.
      if (session.chainSpec?.source === "spec_kit_tasks") {
        this.audit.append({
          sessionId,
          eventType: "chain_end",
          phase: "completed",
          data: {
            reason: "no_pending_tasks",
            chainedCount: (session.chainSpec.chainedTaskIds ?? []).length,
          },
        });
      }
      if (requestId) {
        this.sessions.update(sessionId, (s) => {
          s.requestIds[requestId] = successResult;
        });
      }
      return successResult;
    }
    if ("failure" in resolved) {
      this.audit.append({
        sessionId,
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
        this.sessions.update(sessionId, (s) => {
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
      chainFrom: sessionId,
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
        chainFrom: sessionId,
        chainIndex,
      },
    });
    this.audit.append({
      sessionId,
      eventType: "chain_successor_created",
      phase: "completed",
      data: { from: sessionId, to: successor.sessionId, chainIndex },
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
      this.sessions.update(sessionId, (s) => {
        s.requestIds[requestId] = successResult;
      });
    }
    return successResult;
  }

  /** Re-runs the current phase's required beforeExit operations (FR-040 retry). */
  async retryOperations(sessionId: string): Promise<SubmitResult> {
    return this.sessions.withLock(sessionId, async () => {
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
        } as SubmitResult;
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
    return this.guidanceFor(session, phase);
  }

  async cancelWorkflow(sessionId: string): Promise<SubmitResult> {
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
