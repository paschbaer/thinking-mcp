/**
 * Registriert die 12 Spec-Kit-Tools am SDK-Server (Review Finding 7, Option C):
 * nur wenn das Profil "spec-kit" aktiv ist (R17), mit vollen zod-Schemas und
 * einem lazy SpecKitEngine-Cache je Session. Registrierung VOR connect().
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SpecKitEngine, type SpecKitState } from "../integrations/spec-kit/SpecKitEngine.js";
import { GuidanceError } from "../types/errors.js";
import { SPEC_KIT_TOOL_NAMES } from "./register-tools.js";
import type { SpecKitConfig as ConfigSpecKitConfig } from "../config.js";

/**
 * Adapter: Konfigurations-SpecKitConfig (config.ts) → Engine-SpecKitConfig
 * (SpecKitEngine.ts). Entities-/Excerpt-Limits sind bewusst großzügige
 * Konstanten (kein Konfigurationsfeld im downstream contract).
 */
export function toEngineSpecKitConfig(cfg: ConfigSpecKitConfig): ConstructorParameters<typeof SpecKitEngine>[3] {
  return {
    featureRoot: cfg.discovery.featureRoot,
    strategy: cfg.discovery.strategy,
    requireUniqueMatch: cfg.discovery.requireUniqueMatch,
    artifactPatterns: Object.fromEntries(
      Object.entries(cfg.artifacts).map(([k, v]) => [k, { required: v.required, patterns: v.patterns }]),
    ),
    maxTasks: cfg.taskExecution.batch.maximumTasks,
    maxEntities: 1_000,
    maxExcerptBytes: 65_536,
  };
}

function toJson(result: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
}

const SESSION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

/** Wirft bei pfad-traversierenden oder formatwidrigen Session-IDs (Path Safety). */
export function assertSafeSessionId(sessionId: string): void {
  if (!SESSION_ID_PATTERN.test(sessionId)) {
    throw new GuidanceError("configuration_invalid", `invalid sessionId: ${JSON.stringify(sessionId.slice(0, 32))}`, { recoverable: true });
  }
}

/** Persistiert SpecKitState je Session (atomic tmp+rename, FR-052 pattern). */
export class SpecKitStateStore {
  constructor(private readonly stateDir: string) {}

  private path(sessionId: string): string {
    assertSafeSessionId(sessionId);
    return join(this.stateDir, "spec-kit-states", `${sessionId}.json`);
  }

  load(sessionId: string): SpecKitState {
    const p = this.path(sessionId);
    if (!existsSync(p)) {
      throw new GuidanceError("spec_kit_artifact_missing", "no imported spec-kit state for this session; call import_spec_kit_artifacts first", { recoverable: true });
    }
    return JSON.parse(readFileSync(p, "utf-8")) as SpecKitState;
  }

  save(sessionId: string, state: SpecKitState): void {
    const dir = join(this.stateDir, "spec-kit-states");
    mkdirSync(dir, { recursive: true });
    const tmp = `${this.path(sessionId)}.tmp-${process.pid}-${Date.now()}`;
    writeFileSync(tmp, JSON.stringify(state, null, 2));
    renameSync(tmp, this.path(sessionId));
  }

  exists(sessionId: string): boolean {
    return existsSync(this.path(sessionId));
  }
}

export interface SpecKitToolOptions {
  workspaceRoot: string;
  stateDir: string;
  configVersion: string;
  specKitConfig: ConstructorParameters<typeof SpecKitEngine>[3];
  audit: (event: { sessionId: string; eventType: string; phase?: string; data?: Record<string, unknown> }) => void;
}

/**
 * Lazy SpecKitEngine-Cache je (sessionId): der Konstruktor ist session-gebunden,
 * Engines werden erst beim ersten Toolaufruf erzeugt (Option C).
 */
const ENGINE_CACHE_LIMIT = 64;

export class SpecKitEngineResolver {
  /** Einfacher FIFO-Cap: verhindert unbegrenztes Wachstum bei vielen Sessions. */
  private readonly cache = new Map<string, SpecKitEngine>();
  readonly store: SpecKitStateStore;

  constructor(private readonly opts: SpecKitToolOptions) {
    this.store = new SpecKitStateStore(opts.stateDir);
  }

  resolve(sessionId: string): SpecKitEngine {
    assertSafeSessionId(sessionId);
    if (this.cache.size >= ENGINE_CACHE_LIMIT) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) this.cache.delete(oldest);
    }
    let engine = this.cache.get(sessionId);
    if (!engine) {
      engine = new SpecKitEngine(
        this.opts.workspaceRoot,
        this.opts.stateDir,
        this.opts.configVersion,
        this.opts.specKitConfig,
        this.opts.audit,
        sessionId,
      );
      this.cache.set(sessionId, engine);
    }
    return engine;
  }
}

/** Wirft, wenn das Profil/Integration nicht freigeschaltet ist (fail-closed). */
export function registerSpecKitTools(server: McpServer, opts: SpecKitToolOptions): void {
  if (!opts.specKitConfig) {
    throw new GuidanceError("spec_kit_not_enabled", "spec-kit profile not enabled; refusing to register spec-kit tools", { recoverable: false });
  }
  const resolver = new SpecKitEngineResolver(opts);
  const sessionId = { sessionId: z.string().min(1) };
  const featureId = { featureId: z.string().min(1).optional() };
  const batchId = { batchId: z.string().min(1).optional() };

  // Per-Session-Mutex: serialisiert read-modify-write über StateStore, auch
  // falls ein Handler künftig async wird (Lost-Update-Schutz, vgl. withLock).
  const sessionLocks = new Map<string, Promise<unknown>>();
  const withLock = async <T>(sessionIdValue: string, fn: () => T): Promise<T> => {
    const previous = sessionLocks.get(sessionIdValue) ?? Promise.resolve();
    const run = previous.then(fn, fn);
    sessionLocks.set(sessionIdValue, run.catch(() => {}));
    return await run;
  };
  const withState = async (sessionIdValue: string, fn: (engine: SpecKitEngine, state: SpecKitState) => SpecKitState | void) =>
    withLock(sessionIdValue, () => {
      const engine = resolver.resolve(sessionIdValue);
      const state = resolver.store.load(sessionIdValue);
      const next = fn(engine, state) ?? state;
      resolver.store.save(sessionIdValue, next);
      return next;
    });

  server.tool(
    "discover_spec_kit_feature",
    "Findet das Spec-Kit-Feature im Workspace (read-only)",
    { ...sessionId, ...featureId },
    async ({ sessionId: sid, featureId: fid }) =>
      toJson(resolver.resolve(sid).discoverFeature(fid)),
  );

  server.tool(
    "import_spec_kit_artifacts",
    "Importiert spec.md/plan.md/tasks.md usw. und erzeugt einen Snapshot",
    { ...sessionId, ...featureId },
    async ({ sessionId: sid, featureId: fid }) => {
      const engine = resolver.resolve(sid);
      const feature = engine.discoverFeature(fid);
      const state = engine.importArtifacts(feature);
      resolver.store.save(sid, state);
      return toJson({ featureId: state.featureId, activeSnapshotId: state.activeSnapshotId, validation: state.validation, taskCount: Object.keys(state.tasks).length });
    },
  );

  server.tool(
    "get_spec_kit_status",
    "Liest den importierten Spec-Kit-Status (read-only)",
    sessionId,
    async ({ sessionId: sid }) => {
      const state = resolver.store.load(sid);
      return toJson({
        featureId: state.featureId,
        activeSnapshotId: state.activeSnapshotId,
        activeBatchId: state.activeBatchId,
        validation: state.validation,
        tasks: Object.values(state.tasks).reduce<Record<string, number>>((acc, t) => { acc[t.status] = (acc[t.status] ?? 0) + 1; return acc; }, {}),
        // offen = noch nicht entschieden/appliziert (proposed | artifact_update_required)
        pendingPlanChanges: Object.values(state.planChanges).filter((p) => p.status === "proposed" || p.status === "artifact_update_required").length,
      });
    },
  );

  server.tool(
    "get_next_task",
    "Liefert die nächste ablaufbereite Aufgabe (read-only)",
    sessionId,
    async ({ sessionId: sid }) => {
      const engine = resolver.resolve(sid);
      const ready = engine.readyTasks(resolver.store.load(sid));
      return toJson({ readyTaskIds: ready, nextTaskId: ready[0] ?? null });
    },
  );

  server.tool(
    "start_task",
    "Startet Aufgaben in einem Batch (Status → in_progress)",
    { ...sessionId, ...batchId, taskIds: z.array(z.string().min(1)).min(1) },
    async ({ sessionId: sid, batchId: bid, taskIds }) =>
      toJson(await withState(sid, (engine, state) => {
        const target = bid ?? state.activeBatchId;
        if (!target) throw new GuidanceError("spec_kit_task_not_released", "no batchId supplied and no active batch", { recoverable: true });
        engine.startTask(state, target, taskIds);
      })),
  );

  server.tool(
    "submit_task_implementation",
    "Reicht Implementierungsnachweise für Aufgaben ein",
    { ...sessionId, ...batchId, evidence: z.array(z.record(z.unknown())) },
    async ({ sessionId: sid, batchId: bid, evidence }) =>
      toJson(await withState(sid, (engine, state) => {
        const target = bid ?? state.activeBatchId;
        if (!target) throw new GuidanceError("spec_kit_task_not_released", "no batchId supplied and no active batch", { recoverable: true });
        engine.submitImplementation(state, target, evidence as Parameters<SpecKitEngine["submitImplementation"]>[2]);
      })),
  );

  server.tool(
    "submit_task_review",
    "Reicht Review-Findings für Aufgaben ein",
    { ...sessionId, ...batchId, findings: z.array(z.record(z.unknown())) },
    async ({ sessionId: sid, batchId: bid, findings }) =>
      toJson(await withState(sid, (engine, state) => {
        const target = bid ?? state.activeBatchId;
        if (!target) throw new GuidanceError("spec_kit_task_not_released", "no batchId supplied and no active batch", { recoverable: true });
        engine.submitReview(state, target, findings as Parameters<SpecKitEngine["submitReview"]>[2]);
      })),
  );

  server.tool(
    "complete_task",
    "Markiert eine verifizierte Aufgabe als completed",
    { ...sessionId, taskId: z.string().min(1) },
    async ({ sessionId: sid, taskId }) =>
      toJson(await withState(sid, (engine, state) => { engine.completeTask(state, taskId); })),
  );

  server.tool(
    "propose_plan_change",
    "Schlägt eine Plan-Änderung vor (minor/major-Klassifikation)",
    {
      ...sessionId,
      changeType: z.string().min(1),
      reason: z.string().min(1),
      affectedTasks: z.array(z.string()),
      impact: z.object({ acceptanceCriteria: z.boolean(), publicApi: z.boolean(), dependencies: z.boolean() }),
    },
    async ({ sessionId: sid, changeType, reason, affectedTasks, impact }) =>
      toJson(await withState(sid, (engine, state) => {
        engine.proposePlanChange(state, { changeType, reason, affectedTasks, impact });
      })),
  );

  server.tool(
    "refresh_spec_kit_artifacts",
    "Re-importiert die Artefakte und ersetzt den aktiven Snapshot",
    sessionId,
    async ({ sessionId: sid }) => {
      const engine = resolver.resolve(sid);
      const previous = resolver.store.load(sid);
      const feature = engine.discoverFeature(previous.featureId);
      // 2a: previous state => snapshot chain (previousSnapshotId) + history.
      const state = engine.importArtifacts(feature, previous);
      resolver.store.save(sid, state);
      return toJson({ activeSnapshotId: state.activeSnapshotId, previousSnapshotId: previous.activeSnapshotId, validation: state.validation });
    },
  );

  server.tool(
    "get_traceability_report",
    "Liefert den Kriterien-Abdeckungsreport (read-only)",
    sessionId,
    async ({ sessionId: sid }) =>
      toJson({ coverage: resolver.resolve(sid).coverageSummary(resolver.store.load(sid)) }),
  );

  server.tool(
    "validate_spec_kit_completion",
    "Prüft die Completion-Invarianten des Features",
    {
      ...sessionId,
      requiredVerificationSucceeded: z.boolean(),
      completionOpsSucceeded: z.boolean(),
    },
    async ({ sessionId: sid, requiredVerificationSucceeded, completionOpsSucceeded }) =>
      toJson(resolver.resolve(sid).evaluateCompletionInvariants(resolver.store.load(sid), { requiredVerificationSucceeded, completionOpsSucceeded })),
  );
}

export { SPEC_KIT_TOOL_NAMES };
