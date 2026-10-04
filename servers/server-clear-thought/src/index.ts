import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SessionState } from "./state/SessionState.js";
import { ServerConfigSchema, type ServerConfig } from "./config.js";
import { registerTools } from "./tools/index.js";
import { TOOL_METADATA } from "./tools/tool-metadata.js";
import { registerSessionResources } from "./resources/session-resources.js";
import { registerWorkflowPrompts } from "./prompts/workflow-prompts.js";
import {
  fingerprintArgs,
  OperationRegistry,
} from "./workflow/operation-registry.js";

// Export the config schema for Smithery
export { ServerConfigSchema as configSchema } from "./config.js";

/**
 * Spec 016 (FR-1/FR-2/FR-3): async acceptance for long-running tools.
 * Opt-in per request via `_meta.async` or server-wide via
 * CLEAR_THOUGHT_ASYNC_ACCEPTANCE=1; synchronous execution remains the
 * DEFAULT (FR-4/FR-10). Outcomes (incl. failures) are carried by the
 * existing status interface: session_info merges `asyncOperations` (FR-3).
 */
const ASYNC_WRAPPED_TOOLS = new Set(["session_save", "session_load"]);

interface HandlerExtra {
  _meta?: { async?: boolean; progressToken?: string | number };
  sessionId?: string;
  sendNotification: (notification: {
    method: string;
    params: Record<string, unknown>;
  }) => Promise<void>;
}

let sharedRegistry: OperationRegistry | undefined;
function registry(): OperationRegistry {
  // The registry directory lives under the server's dataDir when configured;
  // without a dataDir (session persistence disabled) a process-local temp dir
  // keeps the machinery available without writing into the repo.
  sharedRegistry ??= new OperationRegistry(
    process.env.CLEAR_THOUGHT_DATA_DIR ??
      mkdtempSync(join(tmpdir(), "clear-thought-ops-")),
  );
  return sharedRegistry;
}

function asyncMode(meta: HandlerExtra["_meta"]): boolean {
  if (meta?.async !== undefined) return meta.async === true;
  return process.env.CLEAR_THOUGHT_ASYNC_ACCEPTANCE === "1";
}

/** Test fixture hook (mirrors guidance's slow-gate fixture): makes the
 *  wrapped handlers observably slow so acceptance/poll timing and SSE
 *  keepalive gaps are provable. Production default 0 — no effect. */
function testMinDurationMs(): number {
  const v = Number(process.env.CLEAR_THOUGHT_ASYNC_TEST_MIN_DURATION_MS);
  return Number.isFinite(v) && v > 0 ? v : 0;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Spec 016 FR-3: session_info carries async operation outcomes for this
 *  MCP session (only when any exist — otherwise the response shape is
 *  unchanged, FR-9). session_info returns a pretty-printed JSON text
 *  payload; the merge preserves that format. */
async function withAsyncOperations(
  toolName: string,
  scope: string,
  result: unknown,
): Promise<unknown> {
  if (toolName !== "session_info") return result;
  const ops = await registry().allFor(scope);
  if (Object.keys(ops).length === 0) return result;
  const content = (
    result as { content?: Array<{ type: string; text: string }> }
  )?.content;
  const text = content?.[0]?.text;
  if (typeof text !== "string") return result;
  try {
    const payload = JSON.parse(text) as Record<string, unknown>;
    payload.asyncOperations = ops;
    return {
      ...(result as Record<string, unknown>),
      content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
    };
  } catch {
    return result;
  }
}

/**
 * Creates a Clear Thought MCP server instance for a specific session
 * @param sessionId - Unique identifier for this session
 * @param config - Server configuration
 * @returns Server instance configured for this session
 */
/**
 * Builds the session-bound McpServer (tools, resources, prompts, capability
 * metadata + the spec-016 async/progress wrapper). Exported so the HTTP
 * transport can build a per-request SSE server that SHARES the session's
 * SessionState (state is held by SessionState, not by the McpServer).
 */
export function createSessionMcpServer({
  sessionId,
  config,
  sessionState,
}: {
  sessionId: string;
  config: ServerConfig;
  sessionState: SessionState;
}): McpServer {
  const mcpServer = new McpServer({
    name: "clear-thought",
    version: "2.0.0",
  });

  // Register all tools for this session
  registerTools(mcpServer, sessionState);

  // Register session-state resources and workflow prompts (tracks D1/D2)
  registerSessionResources(mcpServer, sessionState);
  registerWorkflowPrompts(mcpServer);

  // Capability metadata for every registered tool: annotations, a generic
  // object output schema, and structuredContent derived from the JSON text
  // payload the handlers already return. Applied centrally via the SDK's
  // supported tool.update() so all current and future tools are covered
  // without touching each registration site. Reasoning tools do not modify
  // the external environment (they only read session state), so the
  // readOnly/idempotent hints are accurate.
  const registeredTools = (
    mcpServer as unknown as { _registeredTools: Record<string, any> }
  )._registeredTools;
  for (const [toolName, tool] of Object.entries(registeredTools ?? {})) {
    // RB-10: registry-driven metadata — human-readable titles, honest
    // idempotent hints (stateful tools accumulate session state) and typed
    // output schemas. Fallback keeps the loop total if a tool ships without
    // an entry; the completeness test makes that gap visible.
    const metadata = TOOL_METADATA[toolName];
    const outputSchema =
      metadata?.outputSchema ??
      (z.object({}).passthrough() as z.ZodObject<Record<string, z.ZodTypeAny>>);
    const originalHandler = tool.handler.bind(tool);
    tool.update({
      annotations: {
        title: metadata?.title ?? toolName,
        readOnlyHint: metadata?.readOnly ?? true,
        destructiveHint: metadata?.destructive ?? false,
        idempotentHint: !(metadata?.stateful ?? false),
        openWorldHint: false,
      },
      outputSchema: outputSchema.shape,
      callback: async (args: unknown, extra: unknown) => {
        const handlerExtra = extra as unknown as HandlerExtra;
        const scope = handlerExtra.sessionId ?? sessionId;
        const isAsyncWrapped =
          ASYNC_WRAPPED_TOOLS.has(toolName) && asyncMode(handlerExtra._meta);
        // Spec 016 FR-1: opt-in async acceptance at the single choke point
        // (this update() callback wraps every handler).
        if (isAsyncWrapped) {
          const fp = fingerprintArgs((args as Record<string, unknown>) ?? {});
          const { record, created } = await registry().begin(
            scope,
            toolName,
            fp,
          );
          if (!created) {
            // FR-2: idempotent in-flight retry; a different payload is
            // flagged, never swallowed (F5).
            const retry = {
              accepted: false,
              reason: "operation_in_progress",
              payloadMatches: record.fingerprint === fp,
              operationId: record.operationId,
              status: record.status,
            };
            return {
              content: [{ type: "text", text: JSON.stringify(retry) }],
              structuredContent: retry,
            };
          }
          void (async () => {
            try {
              const minMs = testMinDurationMs();
              if (minMs > 0) await sleep(minMs);
              const result = await originalHandler(args, extra);
              await registry().complete(scope, toolName, result);
            } catch (e) {
              await registry().fail(scope, toolName, {
                code: "operation_failed",
                message: e instanceof Error ? e.message : String(e),
                recoverable: true,
              });
            }
          })().catch(() => undefined);
          const acceptance = {
            accepted: true,
            operationId: record.operationId,
            tool: toolName,
            poll: "session_info",
          };
          return {
            content: [{ type: "text", text: JSON.stringify(acceptance) }],
            structuredContent: acceptance,
          };
        }
        const minMs = testMinDurationMs();
        if (minMs > 0) await sleep(minMs);
        // Spec 016 FR-6: with a progressToken the response streams over SSE;
        // notifications are emitted WHILE the request is open (the transport
        // drops notifications sent after the response completed).
        const token = handlerExtra._meta?.progressToken;
        const progressStep = async (message: string, value: number) => {
          if (token === undefined) return;
          await handlerExtra
            .sendNotification({
              method: "notifications/progress",
              params: {
                progressToken: token,
                progress: value,
                total: 1,
                message,
              },
            })
            .catch(() => undefined);
        };
        await progressStep(`${toolName} started`, 0);
        const result = await originalHandler(args, extra);
        await progressStep(`${toolName} succeeded`, 1);
        const merged = await withAsyncOperations(toolName, scope, result);
        // Preserve the structuredContent derivation for every tool (see RB-10).
        if ((merged as { structuredContent?: unknown })?.structuredContent) {
          return merged;
        }
        const text = (merged as { content?: Array<{ text?: string }> })
          ?.content?.[0]?.text;
        if (typeof text !== "string") return merged;
        try {
          const structured = JSON.parse(text);
          if (
            structured &&
            typeof structured === "object" &&
            !Array.isArray(structured)
          ) {
            return {
              ...(merged as Record<string, unknown>),
              structuredContent: structured,
            };
          }
        } catch {
          // non-JSON payloads stay text-only
        }
        return merged;
      },
    });
    // update() builds the schema via objectFromShape(shape) which serializes
    // conservatively — assign the full zod object so clients get defined
    // properties + additionalProperties (passthrough) for payload evolution.
    tool.outputSchema = outputSchema;
  }

  // Return the McpServer (callers needing the underlying Server use .server)
  return mcpServer;
}

/**
 * Creates a Clear Thought MCP server instance for a specific session
 * @param sessionId - Unique identifier for this session
 * @param config - Server configuration
 * @returns Server instance configured for this session
 */
export default function createClearThoughtServer({
  sessionId,
  config,
}: {
  sessionId: string;
  config: z.infer<typeof ServerConfigSchema>;
}): Server {
  // Initialize session state — parse defensively so raw/partial configs get
  // schema defaults (e.g. sessionTimeout); an unparsed config would leave
  // sessionTimeout undefined and arm an immediate cleanup timer.
  const resolvedConfig = ServerConfigSchema.parse(config);
  const sessionState = new SessionState(sessionId, resolvedConfig);
  const server = createSessionMcpServer({
    sessionId,
    config: resolvedConfig,
    sessionState,
  }).server;
  // Attached for the HTTP transport: per-request SSE servers share this state.
  (server as unknown as { __sessionState: SessionState }).__sessionState =
    sessionState;
  return server;
}
