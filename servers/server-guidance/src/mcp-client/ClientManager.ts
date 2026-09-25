/**
 * MCP client manager (FR-031/033/034/042): one client per configured
 * downstream server, capability discovery with hash-pinned snapshots,
 * per-server failure isolation, connection health.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { createHash } from "node:crypto";
import { GuidanceError } from "../types/errors.js";

export interface DownstreamToolInfo {
  name: string;
  inputSchemaHash: string;
}

export interface DownstreamServerStatus {
  status: "ready" | "failed" | "disconnected";
  required: boolean;
  lastSuccessfulRequestAt?: string;
  error?: string;
  tools: DownstreamToolInfo[];
}

type FetchTransport = (serverId: string) => Transport | Promise<Transport>;

/** `connection.reconnect` semantics (HD-1): retry cycles after transport failures. */
export interface ReconnectPolicy {
  enabled?: boolean;
  maximumAttempts?: number;
  delayMilliseconds?: number;
}

export interface ConnectionOptions {
  handshakeTimeoutSeconds?: number;
  reconnect?: ReconnectPolicy;
}

/**
 * Transport selection per downstream server. `type: "http"` targets a
 * streamable-HTTP endpoint (URL must be allowlisted via egress policy; header
 * secrets are resolved at config load, never persisted). Legacy shapes without
 * `type` are treated as stdio for backward compatibility.
 */
export type DownstreamTransportConfig =
  | { type?: "stdio"; executable: string; args: string[]; cwd?: string }
  | { type: "http"; url: string; headers?: Record<string, string> };

export interface ClientManagerOptions {
  /** Test seam: override transport creation (in-process stubs). */
  fetchTransport?: FetchTransport;
  requiredServers?: string[];
}

interface ConnectionRecord {
  config?: DownstreamTransportConfig;
  handshakeTimeoutSeconds?: number;
  reconnect?: ReconnectPolicy;
}

export class ClientManager {
  private readonly clients = new Map<string, Client>();
  private readonly statuses = new Map<string, DownstreamServerStatus>();
  private readonly customTransports = new Map<string, FetchTransport>();
  private readonly connections = new Map<string, ConnectionRecord>();
  private readonly required: Set<string>;
  /** Tests may inject a timeout (ms) used for readiness handshake. */
  handshakeTimeoutMs = 10_000;

  constructor(options: ClientManagerOptions = {}) {
    this.required = new Set(options.requiredServers ?? []);
    if (options.fetchTransport) this.customTransports.set("__default__", options.fetchTransport);
  }

  /** Registers a custom transport factory for a specific server (test seam). */
  useTransport(serverId: string, fetch: FetchTransport): void {
    this.customTransports.set(serverId, fetch);
  }

  private async transportFor(serverId: string, config?: DownstreamTransportConfig): Promise<Transport> {
    const custom = this.customTransports.get(serverId) ?? this.customTransports.get("__default__");
    if (custom) return await custom(serverId);
    if (!config) throw new GuidanceError("downstream_server_not_configured", `no transport for ${serverId}`, { recoverable: false });
    if (config.type === "http") {
      return new StreamableHTTPClientTransport(new URL(config.url), {
        requestInit: { headers: config.headers },
      });
    }
    return new StdioClientTransport({ command: config.executable, args: config.args, cwd: config.cwd });
  }

  /**
   * Connects, discovers and pins capabilities. Idempotent when already ready.
   * `connection.handshakeTimeoutSeconds` (from `connection.startupTimeoutSeconds`)
   * overrides the instance default for this server; invalid values yield a
   * failed status (config validation rejects them earlier anyway).
   */
  async ensureReady(
    serverId: string,
    config?: DownstreamTransportConfig,
    connection?: ConnectionOptions,
  ): Promise<DownstreamServerStatus> {
    const existing = this.statuses.get(serverId);
    if (existing?.status === "ready") return existing;
    // Remember how this server was reached so reconnect cycles can re-run
    // the handshake with identical parameters (HD-1).
    this.connections.set(serverId, {
      config,
      handshakeTimeoutSeconds: connection?.handshakeTimeoutSeconds,
      reconnect: connection?.reconnect,
    });
    const status: DownstreamServerStatus = { status: "failed", required: this.required.has(serverId), tools: [] };
    this.statuses.set(serverId, status);
    try {
      const s = connection?.handshakeTimeoutSeconds;
      const timeoutMs = s === undefined
        ? this.handshakeTimeoutMs
        : (Number.isFinite(s) && s > 0 ? s * 1000 : NaN);
      if (Number.isNaN(timeoutMs)) {
        throw new GuidanceError("downstream_server_not_configured", `invalid handshakeTimeoutSeconds: ${s}`, { recoverable: false });
      }
      const client = new Client({ name: "guidance", version: "0.1.0" });
      const transport = await this.transportFor(serverId, config);
      let timer: NodeJS.Timeout | undefined;
      const readyOrTimeout = Promise.race([
        client.connect(transport),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error("handshake timeout")), timeoutMs);
        }),
      ]);
      try {
        await readyOrTimeout;
      } catch (err) {
        clearTimeout(timer);
        try { await client.close(); } catch { /* isolation */ }
        throw err;
      }
      clearTimeout(timer);
      this.clients.set(serverId, client);
      const tools = await client.listTools();
      status.status = "ready";
      status.tools = (tools.tools ?? []).map((t) => ({
        name: t.name,
        inputSchemaHash: `sha256:${createHash("sha256").update(JSON.stringify(t.inputSchema ?? {})).digest("hex")}`,
      }));
      status.lastSuccessfulRequestAt = new Date().toISOString();
      delete status.error;
    } catch (err) {
      status.status = "failed";
      status.error = String(err);
    }
    return status;
  }

  private clientFor(serverId: string): Client {
    const client = this.clients.get(serverId);
    if (!client) {
      throw new GuidanceError("downstream_server_unavailable", `server ${serverId} is not connected`, { recoverable: true });
    }
    return client;
  }

  /** Pins a discovered tool contract; rejects removed or unknown tools. */
  pinCapability(serverId: string, toolName: string): DownstreamToolInfo {
    const status = this.statuses.get(serverId);
    const tool = status?.tools.find((t) => t.name === toolName);
    if (!tool) {
      throw new GuidanceError("downstream_capability_missing", `tool ${toolName} not discovered on ${serverId}`, { recoverable: false });
    }
    return tool;
  }

  /** Allowlist check: discovery does not imply permission (FR-048). */
  assertAllowed(serverId: string, toolName: string, allowlist: string[]): void {
    if (!allowlist.includes(toolName)) {
      throw new GuidanceError("downstream_capability_not_allowed", `tool ${toolName} is not allowlisted for ${serverId}`, { recoverable: false });
    }
  }

  /** Drift detection: compare a pinned hash against current discovery (FR-042). */
  assertNotDrifted(serverId: string, toolName: string, pinnedHash: string): void {
    const status = this.statuses.get(serverId);
    const tool = status?.tools.find((t) => t.name === toolName);
    if (!tool) {
      throw new GuidanceError("downstream_capability_changed", `tool ${toolName} disappeared from ${serverId}`, { recoverable: false });
    }
    if (tool.inputSchemaHash !== pinnedHash) {
      throw new GuidanceError("downstream_capability_changed", `tool ${toolName} schema drifted on ${serverId}`, { recoverable: false });
    }
  }

  /**
   * Invokes a tool and classifies transport vs tool-reported errors (FR-037).
   * When `requestTimeoutSeconds` is provided, the invocation is aborted after
   * that many seconds and reported as a transport failure (retry semantics
   * preserved upstream). Unconfigured = unbounded (explicit opt-in).
   */
  async invokeTool(serverId: string, toolName: string, args: Record<string, unknown>, requestTimeoutSeconds?: number): Promise<
    | { kind: "success"; content: unknown[]; structuredContent?: unknown }
    | { kind: "tool_reported"; message: string; content: unknown[] }
    | { kind: "transport"; message: string; timedOut?: boolean }
  > {
    if (requestTimeoutSeconds !== undefined && (!Number.isFinite(requestTimeoutSeconds) || requestTimeoutSeconds <= 0)) {
      // Vor clientFor: invalid config beats connection errors in reporting.
      // Not a connectivity problem — reconnect must NOT retry this.
      return { kind: "transport", message: `invalid requestTimeoutSeconds: ${requestTimeoutSeconds}` };
    }
    const out = await this.invokeOnce(serverId, toolName, args, requestTimeoutSeconds);
    if (out.kind !== "transport") return out;
    // Request timeouts are NOT reconnected: the call already ran downstream and
    // was not cancelled (no AbortSignal in MCP callTool) — an automatic retry
    // could duplicate side effects on non-idempotent tools. Retry semantics
    // stay upstream (FR-035).
    if (out.timedOut) return out;
    return await this.reconnectAndRetry(serverId, toolName, args, requestTimeoutSeconds, out);
  }

  /**
   * HD-1: after a transport failure, drop the dead client and re-run the
   * handshake (with the original transport/handshake parameters) up to
   * `maximumAttempts` times, retrying the invocation after each successful
   * reconnect. Disabled or unconfigured ⇒ the failure is returned as-is.
   */
  private async reconnectAndRetry(
    serverId: string,
    toolName: string,
    args: Record<string, unknown>,
    requestTimeoutSeconds: number | undefined,
    firstFailure: { kind: "transport"; message: string; timedOut?: boolean },
  ): Promise<{ kind: "success"; content: unknown[]; structuredContent?: unknown } | { kind: "tool_reported"; message: string; content: unknown[] } | { kind: "transport"; message: string; timedOut?: boolean }> {
    const conn = this.connections.get(serverId);
    const rc = conn?.reconnect;
    const maximumAttempts = rc?.enabled === true && Number.isInteger(rc.maximumAttempts) && rc.maximumAttempts! > 0
      ? rc.maximumAttempts!
      : 0;
    let last: { kind: "transport"; message: string } = firstFailure;
    for (let attempt = 1; attempt <= maximumAttempts; attempt++) {
      const delayMs = rc?.delayMilliseconds;
      if (typeof delayMs === "number" && delayMs > 0) {
        await new Promise<void>((resolve) => setTimeout(resolve, delayMs).unref?.());
      }
      const old = this.clients.get(serverId);
      if (old) {
        try { await old.close(); } catch { /* isolate */ }
        this.clients.delete(serverId);
      }
      const st = this.statuses.get(serverId);
      if (st) st.status = "disconnected";
      const ready = await this.ensureReady(serverId, conn!.config, {
        handshakeTimeoutSeconds: conn!.handshakeTimeoutSeconds,
        reconnect: rc,
      });
      if (ready.status !== "ready") {
        last = { kind: "transport", message: `reconnect attempt ${attempt}/${maximumAttempts} failed: ${ready.error ?? "unknown"}` };
        continue;
      }
      const out = await this.invokeOnce(serverId, toolName, args, requestTimeoutSeconds);
      if (out.kind !== "transport") return out;
      if (out.timedOut) return out; // no auto-replay of timed-out calls
      last = out;
    }
    return last;
  }

  private async invokeOnce(serverId: string, toolName: string, args: Record<string, unknown>, requestTimeoutSeconds?: number): Promise<
    | { kind: "success"; content: unknown[]; structuredContent?: unknown }
    | { kind: "tool_reported"; message: string; content: unknown[] }
    | { kind: "transport"; message: string; timedOut?: boolean }
  > {
    let client: Client;
    try {
      client = this.clientFor(serverId);
    } catch (err) {
      return { kind: "transport", message: String(err) };
    }
    let response: { isError?: boolean; content?: unknown[]; structuredContent?: unknown };
    let timer: NodeJS.Timeout | undefined;
    let timedOut = false;
    try {
      const call = client.callTool({ name: toolName, arguments: args });
      // The raced call is intentionally abandoned on timeout; swallow its late
      // rejection so it cannot surface as an unhandled rejection. Note: the
      // downstream request is NOT cancelled (MCP callTool has no AbortSignal)
      // — retries after a timeout may duplicate side effects on non-idempotent
      // tools (tracked follow-up). The timedOut marker keeps reconnect from
      // auto-retrying such calls.
      call.catch(() => {});
      response = requestTimeoutSeconds === undefined
        ? (await call) as typeof response
        : (await Promise.race([
            call,
            new Promise<never>((_, reject) => {
              timer = setTimeout(
                () => {
                  timedOut = true;
                  reject(new Error(`request timed out after ${requestTimeoutSeconds}s`));
                },
                requestTimeoutSeconds * 1000,
              );
            }),
          ])) as typeof response;
    } catch (err) {
      return timedOut
        ? { kind: "transport", message: String(err), timedOut: true }
        : { kind: "transport", message: String(err) };
    } finally {
      clearTimeout(timer);
    }
    this.statuses.get(serverId)!.lastSuccessfulRequestAt = new Date().toISOString();
    if (response.isError) {
      const first = (response.content ?? []).find((c) => (c as { type: string }).type === "text") as { text?: string } | undefined;
      return { kind: "tool_reported", message: first?.text ?? "tool reported an error", content: response.content ?? [] };
    }
    return { kind: "success", content: response.content ?? [], structuredContent: response.structuredContent };
  }

  statusOf(serverId: string): DownstreamServerStatus | undefined {
    return this.statuses.get(serverId);
  }

  async shutdown(): Promise<void> {
    for (const [id, client] of this.clients) {
      try {
        await client.close();
      } catch {
        // isolate shutdown failures per server (FR-048 failure isolation)
      }
      this.statuses.get(id)!.status = "disconnected";
    }
  }
}
