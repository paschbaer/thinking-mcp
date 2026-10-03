/**
 * Severity gate for review-phase submissions (reviewFindings.blockingSeverities).
 *
 * A finding blocks the submission when its severity is in the configured
 * blocking set AND it is not classified as resolved. Resolution semantics:
 * status in {fixed, tracked, accepted} counts as resolved for the LOOP gate
 * — a tracked/accepted finding has a follow-up, so the workflow may advance
 * instead of looping. This is deliberately DIVERGENT from the completion
 * final-review gate (scripts/check-final-review.mjs), which only accepts
 * status "fixed" for high/critical findings: a tracked finding passes the
 * loop gate here but still blocks completion until it is fixed.
 * Findings that are not objects (or carry no usable severity) are ignored
 * here — the tightened submission schemas reject them upstream, so the
 * engine never sees them in a valid submission.
 */

export interface OpenBlockingFinding {
  index: number;
  severity: string;
  status?: string;
}

export interface ReviewFindingsEvaluation {
  openBlocking: OpenBlockingFinding[];
  totalFindings: number;
  blocked: boolean;
}

const RESOLVED_STATUSES = new Set(["fixed", "tracked", "accepted"]);

export function evaluateReviewFindings(
  findings: unknown,
  blockingSeverities: readonly string[],
): ReviewFindingsEvaluation {
  const blocking = new Set(blockingSeverities.map((s) => s.toLowerCase()));
  const openBlocking: OpenBlockingFinding[] = [];
  const list = Array.isArray(findings) ? findings : [];
  for (let index = 0; index < list.length; index++) {
    const raw = list[index];
    if (typeof raw !== "object" || raw === null) continue;
    const f = raw as { severity?: unknown; status?: unknown };
    if (typeof f.severity !== "string") continue;
    if (!blocking.has(f.severity.toLowerCase())) continue;
    const status =
      typeof f.status === "string" ? f.status.toLowerCase() : undefined;
    if (status !== undefined && RESOLVED_STATUSES.has(status)) continue;
    openBlocking.push({
      index,
      severity: f.severity,
      ...(status !== undefined ? { status } : {}),
    });
  }
  return {
    openBlocking,
    totalFindings: list.length,
    blocked: openBlocking.length > 0,
  };
}
