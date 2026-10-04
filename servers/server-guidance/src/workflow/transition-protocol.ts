/**
 * Spec 016 — transition observation protocol (FR-6, passive observer).
 *
 * These types describe the seam through which a running phase transition
 * reports per-gate progress WITHOUT changing gate semantics, order, or
 * fail-closed behavior: hooks are strictly additive, optional, and ignored
 * when absent (default synchronous JSON path is byte-identical, FR-9).
 */

/** One gate (required lifecycle beforeExit operation) lifecycle event. */
export interface GateEvent {
  /** Configured operation id of the gate (e.g. "lint", "build"). */
  operationId: string;
  /** Zero-based position of the gate within the transition's gate list. */
  index: number;
  /** Total number of gates configured for this transition. */
  total: number;
  phase: "started" | "succeeded" | "failed";
  /** Normalized op status when phase is "succeeded"/"failed" (status only —
   *  never gate output; FR-8 keeps progress messages credential-free). */
  status?: string;
}

/** Optional per-call observation hooks threaded through a transition. */
export interface TransitionHooks {
  onGateEvent?: (event: GateEvent) => void;
}

/**
 * MCP progress-notification channel (FR-6) bound to one tool call.
 * `token` is the client-supplied `_meta.progressToken`; `send` maps to
 * `RequestHandlerExtra.sendNotification` so the notification is related to
 * the originating request and streams over its SSE response.
 */
export interface ProgressChannel {
  token: string | number;
  send: (update: {
    progress: number;
    total?: number;
    message: string;
  }) => Promise<void>;
}

/** Per-request transition options extracted from `_meta` (FR-4/FR-10). */
export interface TransitionContext {
  /**
   * Opt-in async acceptance for this call (spec 016 FR-1). Synchronous
   * execution remains the default; `_meta.async === false` overrides a
   * server-side default-on.
   */
  asyncAcceptance?: boolean;
  /** Present only when the request carried `_meta.progressToken`. */
  progress?: ProgressChannel;
}

export function hooksFromContext(ctx?: TransitionContext): TransitionHooks {
  if (!ctx?.progress) return {};
  const { progress } = ctx;
  return {
    onGateEvent: (event) => {
      // Monotonic progress: started at gate index, finished at index+1.
      const value =
        event.phase === "started"
          ? event.index
          : Math.min(event.index + 1, event.total);
      const message =
        event.phase === "started"
          ? `gate ${event.operationId} started`
          : `gate ${event.operationId} ${event.status === "succeeded" ? "succeeded" : "failed"}`;
      void progress
        .send({ progress: value, total: event.total, message })
        .catch(() => {
          /* progress is best-effort; never fail the transition for it */
        });
    },
  };
}
