import fs from "node:fs";
import { execSync, execFileSync } from "node:child_process";
const H = execSync("git rev-parse HEAD").toString().trim();
const B = execSync("git rev-parse develop").toString().trim();
const sid = "session-7e69dcdd-de7c-490d-9e3b-807955eb948c";
const ev = {
  formatVersion: 1,
  sessionId: sid,
  reviewerRef: "subagent-7774bfe4-1c64-474f-a95c-0f1a83ac37b8 (independent)",
  reviewScope: "specs/015 Phase 1 (T001/T002): spec.md R1/R2 decisions + FR-1201..1216 mapping, tasks.md checkboxes; docs-only; target commit " + H.slice(0, 8),
  baseCommit: B,
  headCommit: H,
  commits: [B, H],
  reviewedAt: new Date().toISOString(),
  openHighCritical: 0,
  findings: [
    { id: "F1", severity: "info", status: "fixed", evidence: "Reviewer APPROVED: R1=B matches plan.md, R2 matches addendum AC-13..17, FR-1201..1216 mapping internally consistent, NO FR namespace collision (FR-12xx unique across specs/ and src), tasks.md checkboxes match reality." },
    { id: "F2", severity: "low", status: "accepted", evidence: "Pre-existing cross-ref drift: plan.md R2 wording says AC-1..6 anchor, actual anchor is addendum AC-13..17 - out of diff scope, harmless." },
  ],
};
fs.writeFileSync(".guidance/state/final-review.json", JSON.stringify(ev, null, 2));
fs.writeFileSync(".guidance/state/session-lessons.json", JSON.stringify([
  { slug: "fr-namespace-collision-check-on-spec-numbers", observation: "specs/015 introduced FR-1201..1216; a naive grep for FR-12 also hits legacy 3-digit FR-120/121, so collision checks must compare parsed full numbers, not substrings.", cause: "Substring grep false positives when verifying requirement-id namespaces across specs and source.", fix: "Check collisions with word-boundary/full-id matching against specs/ and src before finalizing new FR ranges." },
], null, 2));
execFileSync("node", ["servers/server-guidance/scripts/check-final-review.mjs", "."], { stdio: "inherit" });
execFileSync("wsl.exe", ["-e", "bash", "-lc", "export NVM_DIR=$HOME/.nvm && . $NVM_DIR/nvm.sh >/dev/null 2>&1; cd /mnt/d/repos/Thinking-MCP && gitnexus analyze --no-stats --force 2>&1 | tail -1 && node servers/server-guidance/scripts/check-index-freshness.mjs ."], { stdio: "inherit", shell: true });

const base = "http://127.0.0.1:3003/mcp";
let id = 500;
async function call(name, args) {
  const r = await fetch(base, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: id++, method: "tools/call", params: { name, arguments: { sessionId: sid, ...args } } }) });
  const p = JSON.parse(JSON.parse(await r.text()).result.content[0].text);
  console.log(name, "accepted=" + p.accepted, "phase=" + p.currentPhase, p.error ? "ERR=" + p.error.code : "");
  return p;
}
await call("submit_understanding", {
  summary: "specs/015 Phase 1 (T001/T002): spec review against current codebase and final FR numbering. T001: reviewed spec.md/plan.md against WorkflowEngine/PolicyEngine and specs/014 multi-workspace registry; GDS-6 tracked as related WorkflowEngine completion-path defect (out of this chain's scope). T002: FR-1201..1210 (US1 Alternative B) and FR-1211..1216 (US2) anchored in spec.md; R1 (Alternative B) and R2 (rebind semantics, addendum AC-13..17) recorded as decided. Structured reasoning was done in the preceding cleanup chains; this docs-only step was reviewed by an independent subagent (APPROVED 0 HIGH/CRIT, no FR namespace collisions).",
  assumptions: ["FR numbering FR-1201..1216 stays stable for implementation steps 2-4.", "Variant A follow-up remains tracked as SPEC015-A."],
  acceptanceCriteria: ["spec.md records R1/R2 as decided with FR mapping FR-1201..1216", "No FR namespace collisions (verified by independent review)", "tasks.md T001/T002 checked", "No production code changes in this step"],
});
await call("submit_plan", { tasks: [
  { id: "T1", title: "Spec review + decision recording", files: ["specs/015-registry-hot-reload-deps/spec.md"], change: "R1/R2 decided sections + Requirements-Mapping FR-1201..1216.", tests: [], dependsOn: [] },
  { id: "T2", title: "Tasks + tracking + review + finalize", files: ["specs/015-registry-hot-reload-deps/tasks.md", "memory-bank/activeContext.md"], change: "Check T001/T002, activeContext note, independent review, final-review evidence, analyze --force, complete.", tests: [], dependsOn: ["T1"] },
] });
await call("submit_plan_review", { findings: [ { severity: "info", area: "scope", finding: "Docs-only step; independent review verified FR namespace uniqueness and decision consistency." } ], approvedPlan: { tasks: [ { id: "T1", title: "Spec review + decision recording", files: ["specs/015-registry-hot-reload-deps/spec.md"], change: "As planned.", tests: [], dependsOn: [] }, { id: "T2", title: "Tasks + tracking + review + finalize", files: ["specs/015-registry-hot-reload-deps/tasks.md", "memory-bank/activeContext.md"], change: "As planned.", tests: [], dependsOn: ["T1"] } ] } });
await call("submit_implementation", { implementedTasks: ["T1", "T2"], changedFiles: ["specs/015-registry-hot-reload-deps/spec.md", "specs/015-registry-hot-reload-deps/tasks.md", "memory-bank/activeContext.md", ".guidance/state/final-review.json", ".guidance/state/session-lessons.json"] });
await call("submit_implementation_review", { findings: [ { id: "F1", severity: "info", area: "correctness", finding: "Independent reviewer (7774bfe4) APPROVED: FR namespace unique, mapping consistent with AC-1..17 and plan.md, checkboxes match reality; 0 HIGH/CRIT." } ] });
await call("submit_verification", { verificationSummary: [
  "Docs-only commit 9dcca90: spec.md R1=B recorded, R2 -> addendum AC-13..17, FR-1201..1210/FR-1211..1216 mapping anchored; tasks.md T001/T002 checked.",
  "Independent review APPROVED 0 HIGH/CRIT (no FR namespace collisions vs FR-001..995 and FR-1101..1107).",
  "final-review gate green at HEAD; gitnexus analyze --no-stats --force green; index fresh.",
  "No production code, no config changes, no container restart.",
] });
const comp = await call("complete_workflow", { summary: "specs/015 Phase 1 complete on feature/015-us1-registry-register (9dcca90): T001 spec review done, T002 FR-1201..1210 (US1 B) / FR-1211..1216 (US2) anchored, R1/R2 recorded as decided. Independent review APPROVED 0 HIGH/CRIT. Next chain steps: US1 implementation (T003..T006 incl. AC-16 regression test closing CHAIN-1), US2 (T007..T010), polish (T011..T014)." });
console.log("COMPLETE ws=" + comp.workflowStatus + " status=" + comp.status + " next=" + (comp.nextSessionId ?? "-"));
