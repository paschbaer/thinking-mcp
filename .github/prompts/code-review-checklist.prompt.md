---
name: Code Review Checklist
description: "Review any code change with standardized severity labels and acceptance criteria."
argument-hint: "What changed? Example: refactor of config loading and validation"
agent: Review Agent
---

Review the provided change set and produce a findings-first report.

Before reviewing, independently verify the manifest snapshot with `git status --short --branch`, `git rev-parse HEAD`, `git diff`, and `git diff --cached`; for a committed change, also verify `git show <commit> --stat` and inspect the commit diff. If the snapshot, manifest hashes, or requested scope do not match, report `REVIEW INCOMPLETE` and do not approve.

Required format:
1. Snapshot table: branch, HEAD, review basis, working-tree/unstaged/staged/commit diff hashes, staged/unstaged diff status, post-commit diff status, current-source reads, and tests actually executed.
2. Findings ordered by severity: Critical, High, Medium, Low.
3. For each finding include:
   - Severity
   - Impact
   - Current-source evidence with exact file and line link
   - Reproducible test/check
   - Diff provenance and status classification
   - Suggested fix direction
4. For every HIGH/CRITICAL finding, provide an evidence-table row and classify it as fixed, pre-existing, out of scope with tracked follow-up, or verified false positive.
5. Explicitly list stale or contradictory reviewer reports as review-quality issues.
6. Acceptance criteria:
   - No unresolved Critical findings
   - No unresolved High findings unless explicitly accepted as risk
   - Validation plan listed for all changed modules
   - Residual risks explicitly listed
7. State the unresolved Critical/High count. Output `APPROVED` only when the approval criteria are satisfied. Otherwise output `REVIEW INCOMPLETE`.
8. If no findings exist, state that clearly and still provide residual risks and validation gaps.
9. For every non-trivial finding: develop at least two alternative fix strategies (e.g., quick fix vs. robust refactor), compare them (trade-offs, risk, effort, blast radius), and present them to the user for a decision instead of picking one unilaterally. Use the clear-thought reasoning tools (e.g., decisionframework, debugging_approach, metacognitive_monitoring) to structure this comparison.

Focus areas (general, domain-agnostic):
- side effects and unsafe runtime behavior (network calls, file writes, external systems)
- consistency of the module pipeline / data flow (input → processing → output)
- data safety (None/empty inputs, missing keys or columns, index/type assumptions, error handling)
- config-driven behavior and parameter integrity (no hardcoded constants, sensible defaults)
- testability and coverage of changed behavior
- security basics (no credentials in source, injection-prone inputs, unsafe deserialization)
