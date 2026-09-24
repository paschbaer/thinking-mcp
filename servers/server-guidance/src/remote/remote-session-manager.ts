/**
 * FR-102/103/106: Remote-Session-Verwaltung für den zentralen Container.
 * - init_session: Config-Upload → in-memory-Validierung → persistenz unter
 *   stateDir/remote-sessions/<sessionId>/ (physisch isoliert je Session)
 * - resolve: sessionId + Bearer-Token → sessiongebundene Komposition (Cache)
 * - TTL 30 Tage Inaktivität (FR-102.8, GUIDANCE_SESSION_TTL_DAYS)
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { composeApplication, type Composition } from "../main.js";
import { WorkflowEngine } from "../workflow/WorkflowEngine.js";
import { ClientOpEngine, ClientOpLedger } from "./client-op-engine.js";
import { getBearerToken } from "./remote-context.js";
import { RateLimiter } from "./rate-limiter.js";
import { PairStore } from "./pair-store.js";
import { assertSafeSessionId } from "../mcp-server/register-spec-kit-tools.js";

export interface RemoteSessionMeta {
  sessionId: string;
  key: string | null;
  configVersion: string;
  createdAt: string;
  lastAccessAt: string;
}

export interface RemoteSession {
  meta: RemoteSessionMeta;
  composition: Composition;
  /** FR-104: Ledger der client-reported Operationsergebnisse. */
  ledger: ClientOpLedger;
  /** FR-104.3: letzter blockierter Submit (Phase+Payload) fuer Auto-Retry. */
  lastAttempt?: { sessionId: string; phase: string; payload: Record<string, unknown>; requestId?: string };
  /** Workflow-Session-Id (von start_workflow erzeugt). */
  workflowSid?: string;
}

const TTL_DAYS = Number(process.env.GUIDANCE_SESSION_TTL_DAYS || "30");
const MAX_SESSIONS_PER_KEY = Number(process.env.GUIDANCE_MAX_SESSIONS_PER_KEY || "10");
const CONFIG_PAYLOAD_LIMIT = 1_048_576; // FR-102.8: 1 MB

export class RemoteSessionManager {
  private readonly cache = new Map<string, RemoteSession>();
  private readonly sessionsRoot: string;
  /** FR-102.4: canonical-Config-Index (persistent-fähig: key+hash → sessionId). */
  private readonly canonicalIndex = new Map<string, string>();
  /** M3: Disk-Sessions zählen mit (auch nach Restarts). */
  private diskSessionsByKey = new Map<string, number>();
  /** Q4: init_session Rate-Limit 20/min pro Quell-IP. */
  private readonly rateLimiter = new RateLimiter(Number(process.env.GUIDANCE_INIT_RATE_LIMIT_PER_MIN || "20"));

  constructor(
    private readonly stateDir: string,
    private readonly pairs: PairStore,
  ) {
    this.sessionsRoot = join(stateDir, "remote-sessions");
    mkdirSync(this.sessionsRoot, { recursive: true });
    this.rebuildIndexesFromDisk();
  }

  /** M2/M3: Indizes aus vorhandenen Session-Verzeichnissen wiederaufbauen. */
  private rebuildIndexesFromDisk(): void {
    if (!existsSync(this.sessionsRoot)) return;
    const perKey = new Map<string, number>();
    for (const dir of readdirSync(this.sessionsRoot)) {
      const metaPath = join(this.sessionsRoot, dir, "meta.json");
      if (!existsSync(metaPath)) continue;
      try {
        const meta = JSON.parse(readFileSync(metaPath, "utf-8")) as RemoteSessionMeta & { canonicalHash?: string };
        const bucket = meta.key ?? "__anonymous__";
        perKey.set(bucket, (perKey.get(bucket) ?? 0) + 1);
        // Index-Schlüssel MUSS canonicalHash sein (identisch zum init_session-Pfad).
        if (meta.canonicalHash) {
          this.canonicalIndex.set(`${bucket}:${meta.canonicalHash}`, meta.sessionId);
        }
      } catch {
        // korrupte Meta überspringen (nicht blockierend)
      }
    }
    this.diskSessionsByKey = perKey;
  }

  private sessionDir(sessionId: string): string {
    assertSafeSessionId(sessionId);
    return join(this.sessionsRoot, sessionId);
  }

  private metaPath(sessionId: string): string {
    return join(this.sessionDir(sessionId), "meta.json");
  }

  private configDir(sessionId: string): string {
    return join(this.sessionDir(sessionId), "config");
  }

  /** FR-102.8: Payload-Größenlimit. */
  assertPayloadSize(config: Record<string, unknown>): void {
    const size = Buffer.byteLength(JSON.stringify(config));
    if (size > CONFIG_PAYLOAD_LIMIT) {
      throw new Error(`configuration_invalid: config payload too large (${size} > ${CONFIG_PAYLOAD_LIMIT} bytes)`);
    }
  }

  /** FR-102/102.2/102.4/102.6: Config-Upload, Validierung, Session-Erzeugung. */
  initSession(opts: { key?: string; config: Record<string, unknown>; configFiles?: Record<string, string>; bearerToken?: string; clientIp?: string }): RemoteSession {
    const { key, config } = opts;
    // Q4: Rate-Limit erfolgt auf der HTTP-Ebene (checkInitRateLimit, pro IP).
    // FR-102.1/FR-101.6: Key-Authentifizierung erfolgt auf der HTTP-Ebene
    // (Authorization-Header); hier nur die Form-Konsistenz:
    if (this.pairs.configured && key === undefined) {
      throw new Error("configuration_invalid: key is required when key/token pairs are configured");
    }
    if (!this.pairs.configured && key !== undefined) {
      throw new Error("configuration_invalid: key must not be supplied when no key/token pairs are configured (anonymous fallback)");
    }

    this.assertPayloadSize(config);

    // FR-102.2/102.4: Config-Hash als Dedup-Schlüssel (configVersion-Äquivalent
    // wird beim Schreiben durch loadConfig ohnehin berechnet; hier grob über
    // den kanonischen Config-String).
    const canonical = JSON.stringify(config, (_k, v: unknown) =>
      v !== null && typeof v === "object" && !Array.isArray(v)
        ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : 1)))
        : v,
    );

    // FR-102.4 (M2-Fix): persistenter canonical-Index (überlebt Restarts).
    const canonicalHash = createHash("sha256").update(canonical).digest("hex");
    const canonicalId = `${key ?? "__anonymous__"}:${canonicalHash}`;
    const existingId = this.canonicalIndex.get(canonicalId);
    if (existingId) {
      const cached = this.cache.get(existingId);
      if (cached) {
        this.touch(existingId);
        return cached;
      }
      const restored = this.restoreFromDisk(existingId);
      if (restored) {
        this.touch(existingId);
        return restored;
      }
      this.canonicalIndex.delete(canonicalId); // Stale-Index aufräumen
    }

    // F1-Fix: Quota VOR jedem Write — aber NUR für Neuanlagen; ein
    // canonicalIndex-Treffer (Idempotenz, FR-102.4) verbraucht keinen Slot.
    const isExistingSession = existingId !== undefined;
    if (!isExistingSession) this.enforcePerKeyLimit(key ?? null);
    const sessionId = isExistingSession ? existingId : `remote-${randomUUID()}`;
    const dir = this.sessionDir(sessionId);
    const cfgDir = this.configDir(sessionId);
    mkdirSync(cfgDir, { recursive: true });

    // CB-2-Fix: Datei-Writes (configFiles) laufen INNERHALB des Rollback-try —
    // ein Throw hier (invalid content, path escape, fs error) darf den
    // verbrauchten Quota-Slot (enforcePerKeyLimit inkrementiert vorab) und das
    // angelegte Session-Verzeichnis nicht lecken.
    const ledger = new ClientOpLedger();
    let composition;
    try {
      // Config-Dateien in den Session-Config-Ordner schreiben (Dateireferenz-
      // Form wird erwartet: guidance.json + referenzierte Dateien + schemas/).
      const files = (config as { configFiles?: Record<string, string> }).configFiles;
      if (files && typeof files === "object") {
        for (const [rel, content] of Object.entries(files)) {
          if (typeof content !== "string") throw new Error(`configuration_invalid: configFiles.${rel} must be a string`);
          const target = resolve(join(cfgDir, rel));
          const root = resolve(cfgDir);
          // F2-Fix: relativ + separator-bewusst (kein Prefix-Only-Match).
          const relPath = target.slice(root.length + 1);
          if (target !== root && (relPath.startsWith("/") || relPath.startsWith("\\") || relPath.includes(".."))) {
            throw new Error("configuration_invalid: configFiles path escapes session config directory");
          }
          mkdirSync(join(target, ".."), { recursive: true });
          writeFileSync(target, content);
        }
      } else {
        // Inline-Objekt-Form: alle Top-Level-Sektionen als Dateien schreiben.
        for (const [name, value] of Object.entries(config)) {
          if (name === "configFiles") continue;
          const target = name.endsWith(".json") ? join(cfgDir, name) : join(cfgDir, `${name}.json`);
          writeFileSync(target, JSON.stringify(value, null, 2) + "\n");
        }
        // schemas-Objekt: { "schemas": { "understand": {...} } } → schemas/*.schema.json
        const schemas = (config as Record<string, Record<string, unknown>>).schemas;
        if (schemas && typeof schemas === "object") {
          mkdirSync(join(cfgDir, "schemas"), { recursive: true });
          for (const [schemaName, schema] of Object.entries(schemas)) {
            writeFileSync(join(cfgDir, "schemas", `${schemaName}.schema.json`), JSON.stringify(schema, null, 2) + "\n");
          }
        }
      }

      // FR-102.2: In-memory-Validierung durch Komposition (wirft bei invalid).
      // N1-Fix: bei Fehler wird der verbrauchte Quota-Slot zurückgerollt.
      composition = composeApplication(wsRootFor(sessionId), cfgDir, join(dir, "state"), {
        operationEngine: new ClientOpEngine(ledger) as unknown as ConstructorParameters<typeof WorkflowEngine>[0]["operationEngine"],
        skipScaffold: true,
      });
    } catch (err) {
      // Rollback: Slot freigeben + Orphan-Verzeichnis entfernen (N4).
      const bucket = key ?? "__anonymous__";
      const c = this.diskSessionsByKey.get(bucket) ?? 0;
      if (c > 0) this.diskSessionsByKey.set(bucket, c - 1);
      try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
      throw err;
    }

    const now = new Date().toISOString();
    const meta: RemoteSessionMeta = {
      sessionId,
      key: key ?? null,
      configVersion: composition.config.configVersion,
      createdAt: now,
      lastAccessAt: now,
    };
    writeFileSync(this.metaPath(sessionId), JSON.stringify(meta, null, 2));

    const session: RemoteSession = { meta, composition, ledger };
    (session as unknown as { canonicalHash?: string }).canonicalHash = canonicalHash;
    // canonicalHash persistent in meta.json (M2: Idempotenz überlebt Restarts).
    const metaPath = this.metaPath(sessionId);
    const metaWithHash = { ...meta, canonicalHash };
    writeFileSync(metaPath, JSON.stringify(metaWithHash, null, 2));
    this.canonicalIndex.set(canonicalId, sessionId);
    this.cache.set(sessionId, session);
    return session;
  }

  /** FR-103.1/FR-102.8: Session auflösen (Auth + TTL), Komposition aus Cache. */
  /**
   * FR-103.1: Session-Binding wird auf der HTTP-Ebene erzwungen (dort liegt
   * der Authorization-Header). resolve selbst prüft nur Existenz + TTL.
   */
  /** Q4: öffentliche Rate-Limit-Prüfung (vom HTTP-Layer gerufen). */
  checkInitRateLimit(clientIp: string): void {
    this.rateLimiter.check(clientIp);
  }

  /** M2: Session aus Meta+Config auf Disk wiederherstellen (Cache-Cold-Start). */
  private restoreFromDisk(sessionId: string): RemoteSession | undefined {
    const p = this.metaPath(sessionId);
    if (!existsSync(p)) return undefined;
    try {
      const meta = JSON.parse(readFileSync(p, "utf-8")) as RemoteSessionMeta;
      return this.restore(meta);
    } catch {
      return undefined;
    }
  }

  resolve(sessionId: string): RemoteSession {
    assertSafeSessionId(sessionId);
    // Workflow-Session-Ids auf ihre Remote-Session auflösen (FR-103.1).
    const effectiveId = this.workflowToRemote.get(sessionId) ?? sessionId;
    const cached = this.cache.get(effectiveId);
    if (cached) {
      // CB-1-Fix: touch über die EFFECTIVE Id — ein touch mit roher (ggf.
      // Workflow-)Sid verfehlt die Remote-Meta (metaPath existiert nicht) und
      // umgeht damit TTL-Prüfung + lastAccessAt-Refresh.
      this.touch(effectiveId);
      return cached;
    }
    const metaPath = this.metaPath(effectiveId);
    if (!existsSync(metaPath)) {
      throw new Error("session_not_found");
    }
    const meta = JSON.parse(readFileSync(metaPath, "utf-8")) as RemoteSessionMeta;
    const session = this.restore(meta);
    this.touch(effectiveId);
    return session;
  }

  /** FR-103.1: Meta-Lookup — direkt (Remote-Session-Id) oder über die
   *  Workflow-Session-Zuordnung (start_workflow erzeugt eigene Workflow-Ids). */
  getSessionMeta(sessionId: string): RemoteSessionMeta | undefined {
    try {
      assertSafeSessionId(sessionId);
      const p = this.metaPath(sessionId);
      if (existsSync(p)) {
        return JSON.parse(readFileSync(p, "utf-8")) as RemoteSessionMeta;
      }
      const remoteSid = this.workflowToRemote.get(sessionId);
      if (remoteSid) {
        const rp = this.metaPath(remoteSid);
        if (existsSync(rp)) return JSON.parse(readFileSync(rp, "utf-8")) as RemoteSessionMeta;
      }
      return undefined;
    } catch {
      return undefined;
    }
  }

  /** Workflow-Session-Id → Remote-Session-Id (für Binding + TTL-Zugriff). */
  private readonly workflowToRemote = new Map<string, string>();

  registerWorkflowSession(remoteSessionId: string, workflowSessionId: string): void {
    assertSafeSessionId(remoteSessionId);
    assertSafeSessionId(workflowSessionId);
    this.workflowToRemote.set(workflowSessionId, remoteSessionId);
  }

  /** FR-103.1: (key, token) des Session-Metas gegen das Pair-Array prüfen. */
  assertSessionBinding(meta: RemoteSessionMeta, bearerToken: string): void {
    if (!this.pairs.configured) return; // anonymer Fallback (FR-101.6)
    if (meta.key === null || !this.pairs.authenticate(meta.key, bearerToken)) {
      throw new Error("session_not_found"); // kein Existenz-Oracle
    }
  }

  /** FR-102.1: init_session-Auth (key MUSS zum Pair-Token passen). */
  authenticateKey(key: string, bearerToken: string): boolean {
    return this.pairs.authenticate(key, bearerToken);
  }

  get pairsConfigured(): boolean {
    return this.pairs.configured;
  }

  /** H2-Fix: Key eines gueltigen Tokens (list_sessions-Restriktion). */
  keyForToken(bearerToken: string): string | null {
    if (!this.pairs.configured) return null; // anonymer Modus: nur anonyme Sessions
    for (const key of this.pairs.keys()) {
      if (this.pairs.authenticate(key, bearerToken)) return key;
    }
    return null;
  }

  /** H2-Fix: Sessions gefiltert nach Aufrufer-Identitaet. */
  listSessionsFor(callerKey: string | null): RemoteSessionMeta[] {
    return this.listSessions().filter((m) => m.key === callerKey);
  }

  private restore(meta: RemoteSessionMeta): RemoteSession {
    // F2-Fix: kein Increment — der Count wurde beim Rebuild bereits von der
    // Disk gezählt; Restore darf das Limit nicht künstlich verknapppen.
    const ledger = new ClientOpLedger();
    const dir = this.sessionDir(meta.sessionId);
    const composition = composeApplication(wsRootFor(meta.sessionId), this.configDir(meta.sessionId), join(dir, "state"), {
      operationEngine: new ClientOpEngine(ledger) as unknown as ConstructorParameters<typeof WorkflowEngine>[0]["operationEngine"],
      skipScaffold: true,
    });
    const session: RemoteSession = { meta, composition, ledger };
    this.cache.set(meta.sessionId, session);
    return session;
  }

  /** FR-102.8: TTL 30 Tage Inaktivität (lazy removal). */
  private touch(sessionId: string): void {
    const p = this.metaPath(sessionId);
    if (!existsSync(p)) return;
    const meta = JSON.parse(readFileSync(p, "utf-8")) as RemoteSessionMeta;
    // H1-Fix: Idle-Alter aus dem VOR-touch lastAccessAt berechnen.
    const idleDays = (Date.now() - new Date(meta.lastAccessAt).getTime()) / 86_400_000;
    if (idleDays > TTL_DAYS) throw new Error("session_not_found");
    meta.lastAccessAt = new Date().toISOString();
    writeFileSync(p, JSON.stringify(meta, null, 2));
  }

  /** M3-Fix: Disk-Count + korrekte Grenze (>= max blockiert) + Quota-Fehlercode. */
  private enforcePerKeyLimit(key: string | null): void {
    const bucket = key ?? "__anonymous__";
    const count = this.diskSessionsByKey.get(bucket) ?? 0;
    if (count >= MAX_SESSIONS_PER_KEY) {
      throw new Error(`quota_exceeded: too many active sessions for ${key ?? "anonymous"} (max ${MAX_SESSIONS_PER_KEY})`);
    }
    this.diskSessionsByKey.set(bucket, count + 1);
  }

  listSessions(): RemoteSessionMeta[] {
    return [...this.cache.values()].map((s) => s.meta);
  }
}

/** Remote-Sessions haben kein echtes FS-Workspace; Prozess-Ops laufen clientseitig. */
function wsRootFor(sessionId: string): string {
  return `/remote-sessions/${sessionId}`;
}
