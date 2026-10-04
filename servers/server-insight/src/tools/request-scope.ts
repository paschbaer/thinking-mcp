/**
 * Per-request MCP session scope propagation (spec 016 FR-3).
 *
 * The per-request SSE transport (see server.ts) is stateless, so the SDK
 * leaves extra.sessionId undefined for requests served over it. The async
 * operation scope must nevertheless be the MCP session, otherwise outcomes
 * accepted over SSE are invisible to plain-JSON status polls (and could
 * leak across sessions). server.ts runs each SSE request inside this
 * storage bound to the known session's wire id; the tool wrapper falls
 * back to it.
 */
import { AsyncLocalStorage } from "node:async_hooks";

export const requestSessionScope = new AsyncLocalStorage<string>();
