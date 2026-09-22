/**
 * Spec-Kit integration engine (FR-060–075): read-only artifact adapter,
 * immutable snapshots, persistent task entities with a Guidance-owned state
 * machine, dependency-aware scheduling, evidence-gated completion,
 * controlled plan changes, traceability, and completion invariants.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync, renameSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { GuidanceError } from "../../types/errors.js";
import { parseTasks, hasSection, PARSER_VERSION, type ParsedTask } from "./parser.js";

export type TaskStatus =
  | "pending" | "ready" | "in_progress" | "implemented" | "review_required"
  | "fix_required" | "verification_required" | "verified" | "completed"
  | "blocked" | "deferred" | "cancelled";

export interface ArtifactRecord {
  type: string;
  relativePath: string;
  sha256: string;
  sizeBytes: number;
  mtimeAtImport: string;
}

export interface Snapshot {
  snapshotId: string;
  previousSnapshotId: string | null;
  createdAt: string;
  configVersion: string;
  parserVersion: string;
  featureId: string;
  artifacts: (ArtifactRecord & { content?: string })[];
}

export interface SpecTask {
  taskId: string;
  title: string;
  description: string;
  required: boolean;
  parallelizable: boolean;
  sourceSection: string | null;
  status: TaskStatus;
  previousStatus?: TaskStatus;
  dependencies: string[];
  linkedRequirements: { id: string; source: "parsed" | "asserted" }[];
  linkedCriteria: { id: string; source: "parsed" | "asserted" }[];
  affectedFiles: string[];
  source: { artifact: string; relativePath: string; line: number; contentHash: string };
  implementation?: { summary: string; changedFiles: string[]; createdFiles: string[]; deletedFiles: string[]; testsAddedOrUpdated: string[]; deviations: unknown[]; unresolvedIssues: string[] };
  review?: { findings: { findingId: string; severity: string; fixRequired: boolean; fixApplied: boolean }[]; unresolved: string[] };
  verification?: { executions: string[]; succeeded: boolean };
  checkboxAtImport: "checked" | "unchecked";
}

export interface SpecCriterion {
  id: string;
  text: string;
  required: boolean;
  linkedTaskIds: string[];
  coverage: "unmapped" | "planned" | "implemented" | "partially_verified" | "verified" | "waived" | "blocked";
  waiver?: { reason: string; approvedBy: "user"; at: string };
}

export interface PlanChange {
  changeId: string;
  changeType: string;
  classification: "minor" | "major";
  reason: string;
  affectedTasks: string[];
  impact: { acceptanceCriteria: boolean; publicApi: boolean; dependencies: boolean };
  status: "proposed" | "artifact_update_required" | "approved" | "applied" | "rejected";
}

export interface SpecKitState {
  featureId: string;
  featureDirectory: string;
  activeSnapshotId: string | null;
  snapshots: Snapshot[];
  tasks: Record<string, SpecTask>;
  criteria: Record<string, SpecCriterion>;
  batches: Record<string, { batchId: string; taskIds: string[]; status: "released" | "active" | "closed" }>;
  planChanges: Record<string, PlanChange>;
  validation: { valid: boolean; findings: { severity: string; message: string }[] };
  activeBatchId: string | null;
}

export interface SpecKitConfig {
  featureRoot: string;
  strategy: "explicit" | "currentBranch" | "mostRecentlyModified" | "singleCandidate" | "configuredDefault";
  requireUniqueMatch: boolean;
  artifactPatterns: Record<string, { required: boolean; patterns: string[] }>;
  maxTasks: number;
  maxEntities: number;
  maxExcerptBytes: number;
}

export const DEFAULT_ARTIFACTS: Record<string, { required: boolean; patterns: string[] }> = {
  specification: { required: true, patterns: ["spec.md"] },
  plan: { required: true, patterns: ["plan.md"] },
  tasks: { required: true, patterns: ["tasks.md"] },
  research: { required: false, patterns: ["research.md"] },
  dataModel: { required: false, patterns: ["data-model.md"] },
  quickstart: { required: false, patterns: ["quickstart.md"] },
  contracts: { required: false, patterns: ["contracts/**"] },
  checklists: { required: false, patterns: ["checklists/**"] },
};

const sha256 = (content: string) => `sha256:${createHash("sha256").update(content).digest("hex")}`;

function discoverArtifacts(featureDir: string, workspaceRoot: string, patterns: Record<string, { required: boolean; patterns: string[] }>): { type: string; path: string }[] {
  const resolved = resolve(featureDir);
  const ws = resolve(workspaceRoot);
  if (!resolved.startsWith(ws + "/") && resolved !== ws) {
    throw new GuidanceError("spec_kit_feature_outside_workspace", `feature directory escapes the workspace: ${featureDir}`, { recoverable: false });
  }
  const found: { type: string; path: string }[] = [];
  for (const [type, def] of Object.entries(patterns)) {
    for (const pattern of def.patterns) {
      if (pattern.endsWith("/**")) {
        const sub = join(featureDir, pattern.slice(0, -3));
        if (existsSync(sub)) {
          for (const f of readdirRecursive(sub)) found.push({ type, path: f });
        }
        continue;
      }
      const path = join(featureDir, pattern);
      if (existsSync(path)) found.push({ type, path });
    }
  }
  return found;
}

function readdirRecursive(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSafe(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...readdirRecursive(full));
    else out.push(full);
  }
  return out;
}

function readdirSafe(dir: string): string[] {
  try {
    return readdirSyncSafe(dir);
  } catch {
    return [];
  }
}

function readdirSyncSafe(dir: string): string[] {
  // node:fs wrapper kept indirection-free for testability
  const fs = requireFs();
  return fs.readdirSync(dir);
}

function requireFs(): typeof import("node:fs") {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require("node:fs");
}

export class SpecKitEngine {
  constructor(
    private readonly workspaceRoot: string,
    private readonly stateDir: string,
    private readonly configVersion: string,
    private readonly config: SpecKitConfig,
    private readonly audit: (event: { sessionId: string; eventType: string; phase?: string; data?: Record<string, unknown> }) => void,
    private readonly sessionId: string,
  ) {}

  /** FR-061: exactly one feature; explicit strategy is authoritative. */
  discoverFeature(featureId?: string): { featureId: string; directory: string } {
    const root = join(this.workspaceRoot, this.config.featureRoot);
    if (!existsSync(root)) {
      throw new GuidanceError("spec_kit_feature_not_found", `feature root missing: ${this.config.featureRoot}`, { recoverable: true });
    }
    if (featureId) {
      const dir = join(root, featureId);
      if (!existsSync(dir)) throw new GuidanceError("spec_kit_feature_not_found", `feature ${featureId} not found`, { recoverable: true });
      this.assertInsideWorkspace(dir);
      return { featureId, directory: dir };
    }
    if (this.config.strategy === "explicit") {
      throw new GuidanceError("spec_kit_feature_ambiguous", "no featureId supplied for explicit strategy", { recoverable: true });
    }
    const candidates = readdirSyncSafe(root).filter((d) => existsSync(join(root, d, "spec.md")));
    if (candidates.length !== 1) {
      throw new GuidanceError("spec_kit_feature_ambiguous", `${candidates.length} candidate features`, { recoverable: true });
    }
    this.assertInsideWorkspace(join(root, candidates[0]!));
    return { featureId: candidates[0]!, directory: join(root, candidates[0]!) };
  }

  private assertInsideWorkspace(dir: string): void {
    const resolved = resolve(dir);
    const ws = resolve(this.workspaceRoot);
    if (resolved !== ws && !resolved.startsWith(ws + "/") && !resolved.startsWith(ws + "\\")) {
      throw new GuidanceError("spec_kit_feature_outside_workspace", `outside workspace: ${dir}`, { recoverable: false });
    }
  }

  /** FR-062/063: deterministic import with structural validation + normalization. */
  importArtifacts(feature: { featureId: string; directory: string }): SpecKitState {
    const findings: { severity: string; message: string }[] = [];
    const artifacts: Snapshot["artifacts"] = [];
    const patterns = { ...DEFAULT_ARTIFACTS, ...this.config.artifactPatterns };
    for (const [type, def] of Object.entries(patterns)) {
      let content: string | null = null;
      let path: string | null = null;
      for (const pattern of def.patterns) {
        if (pattern.endsWith("/**")) continue;
        const candidate = join(feature.directory, pattern);
        if (existsSync(candidate)) { path = candidate; break; }
      }
      if (!path) {
        if (def.required) findings.push({ severity: "blocking", message: `${type}: required artifact missing (${def.patterns.join(", ")})` });
        continue;
      }
      content = readFileSync(path, "utf-8");
      if (content.trim() === "") {
        findings.push({ severity: "blocking", message: `${type}: artifact is empty` });
        continue;
      }
      const stat = statSync(path);
      artifacts.push({
        type,
        relativePath: patternOf(def.patterns[0] ?? ""),
        sha256: sha256(content),
        sizeBytes: stat.size,
        mtimeAtImport: stat.mtime.toISOString(),
        content,
      });
    }
    // contracts dir pattern
    const contractsDir = join(feature.directory, "contracts");
    if (existsSync(contractsDir)) {
      for (const f of readdirRecursive(contractsDir)) {
        const content = readFileSync(f, "utf-8");
        artifacts.push({ type: "contracts", relativePath: f, sha256: sha256(content), sizeBytes: statSync(f).size, mtimeAtImport: statSync(f).mtime.toISOString(), content });
      }
    }

    const tasksArtifact = artifacts.find((a) => a.type === "tasks");
    const specArtifact = artifacts.find((a) => a.type === "specification");
    const parsed = tasksArtifact ? parseTasks(tasksArtifact.content!) : { tasks: [] as ParsedTask[], warnings: [] as string[] };
    for (const w of parsed.warnings) findings.push({ severity: "warning", message: w });

    if (parsed.tasks.length === 0) findings.push({ severity: "blocking", message: "tasks.md normalized to zero tasks" });

    // uniqueness
    const ids = parsed.tasks.map((t) => t.taskId);
    const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
    if (dupes.length > 0) findings.push({ severity: "blocking", message: `duplicate task ids: ${[...new Set(dupes)].join(", ")}` });
    // unknown deps
    for (const t of parsed.tasks) {
      for (const d of t.dependencies) {
        if (!ids.includes(d)) findings.push({ severity: "blocking", message: `unknown dependency: ${t.taskId} -> ${d}` });
      }
    }
    // cycles (DFS)
    if (findings.every((f) => !f.message.startsWith("unknown dependency"))) {
      const graph = new Map(parsed.tasks.map((t) => [t.taskId, t.dependencies.filter((d) => ids.includes(d))]));
      const visiting = new Set<string>();
      const visited = new Set<string>();
      const visit = (id: string): boolean => {
        if (visiting.has(id)) return true;
        if (visited.has(id)) return false;
        visiting.add(id);
        for (const d of graph.get(id) ?? []) if (visit(d)) return true;
        visiting.delete(id);
        visited.add(id);
        return false;
      };
      if (ids.some((id) => visit(id))) findings.push({ severity: "blocking", message: "dependency cycle detected" });
    }
    if (findings.some((f) => f.severity === "blocking")) {
      for (const f of findings.filter((x) => x.severity === "blocking")) {
        this.audit({ sessionId: this.sessionId, eventType: "spec_kit_artifact_rejected", data: { message: f.message } });
      }
      return {
        featureId: feature.featureId, featureDirectory: feature.directory, activeSnapshotId: null, snapshots: [],
        tasks: {}, criteria: {}, batches: {}, planChanges: {}, validation: { valid: false, findings },
        activeBatchId: null,
      };
    }

    // Normalize
    const tasks: Record<string, SpecTask> = {};
    for (const t of parsed.tasks) {
      tasks[t.taskId] = {
        taskId: t.taskId,
        title: t.title,
        description: t.description,
        required: true,
        parallelizable: t.parallelizable,
        sourceSection: t.sourceSection,
        status: "pending",
        dependencies: t.dependencies,
        linkedRequirements: t.linkedRequirementIds.map((id) => ({ id, source: "parsed" as const })),
        linkedCriteria: t.linkedCriterionIds.map((id) => ({ id, source: "parsed" as const })),
        affectedFiles: [],
        source: { artifact: "tasks", relativePath: "tasks.md", line: t.line, contentHash: tasksArtifact!.sha256 },
        checkboxAtImport: t.checkboxChecked ? "checked" : "unchecked",
      };
    }
    const criteria: Record<string, SpecCriterion> = {};
    for (const c of specArtifact ? parseCriteria(specArtifact.content!) : []) {
      criteria[c.id] = { id: c.id, text: c.text, required: true, linkedTaskIds: [], coverage: c.linkedTasks ? "unmapped" : "unmapped", waiver: undefined };
      void c.linkedTasks;
    }
    for (const task of Object.values(tasks)) {
      for (const link of task.linkedCriteria) {
        if (criteria[link.id]) criteria[link.id]!.linkedTaskIds.push(task.taskId);
        else findings.push({ severity: "warning", message: `${task.taskId} links unknown criterion ${link.id}` });
      }
    }

    const snapshotId = `snapshot-${randomUUID()}`;
    const snapshot: Snapshot = {
      snapshotId,
      previousSnapshotId: null,
      createdAt: new Date().toISOString(),
      configVersion: this.configVersion,
      parserVersion: PARSER_VERSION,
      featureId: feature.featureId,
      artifacts: artifacts.map(({ content, ...rest }) => rest),
    };
    // Persist snapshot dir with normalized entities (immutability: never rewritten)
    const snapDir = join(this.stateDir, "snapshots", snapshotId);
    mkdirSync(snapDir, { recursive: true });
    writeFileSync(join(snapDir, "manifest.json"), JSON.stringify({ ...snapshot, artifacts: snapshot.artifacts }, null, 2));
    writeFileSync(join(snapDir, "entities.json"), JSON.stringify({ tasks, criteria }, null, 2));
    this.audit({ sessionId: this.sessionId, eventType: "spec_kit_snapshot_created", data: { snapshotId } });

    return {
      featureId: feature.featureId, featureDirectory: feature.directory, activeSnapshotId: snapshotId,
      snapshots: [snapshot], tasks, criteria, batches: {}, planChanges: {},
      validation: { valid: true, findings }, activeBatchId: null,
    };
  }

  /** FR-067 readiness: deps in satisfying set {completed, verified}; no holds. */
  isReady(state: SpecKitState, taskId: string): boolean {
    const task = state.tasks[taskId];
    if (!task) return false;
    // FR-067: a task is ready when its dependencies are all in the fixed
    // satisfying set {completed, verified} and no policy hold applies.
    if (task.status !== "pending" && task.status !== "ready") return false;
    for (const dep of task.dependencies) {
      const depTask = state.tasks[dep];
      if (!depTask) return false;
      if (depTask.status !== "completed" && depTask.status !== "verified") return false;
    }
    return true;
  }

  /** Returns ready task ids in dependency order (topological-ish: stable sort). */
  readyTasks(state: SpecKitState): string[] {
    return Object.keys(state.tasks)
      .filter((id) => this.isReady(state, id))
      .sort((a, b) => a.localeCompare(b));
  }

  releaseBatch(state: SpecKitState, mode: "single" | "batch" | "allReady" | "phaseGroup", batchId: string): string[] {
    const ready = this.readyTasks(state);
    let selected: string[];
    switch (mode) {
      case "single": selected = ready.slice(0, 1); break;
      case "batch": selected = ready.slice(0, this.config.maxTasks); break;
      case "allReady": selected = ready; break;
      case "phaseGroup": {
        const sections = [...new Set(ready.map((id) => state.tasks[id]!.sourceSection ?? ""))].sort();
        selected = ready.filter((id) => (state.tasks[id]!.sourceSection ?? "") === sections[0]);
        break;
      }
    }
    state.batches[batchId] = { batchId, taskIds: selected, status: "released" };
    state.activeBatchId = batchId;
    return selected;
  }

  // ---- Task lifecycle (FR-066/069): Guidance-owned transitions ----

  transitionTask(state: SpecKitState, taskId: string, to: TaskStatus): void {
    const task = state.tasks[taskId];
    if (!task) throw new GuidanceError("spec_kit_task_not_found", `unknown task ${taskId}`, { recoverable: true });
    task.previousStatus = task.status;
    task.status = to;
  }

  startTask(state: SpecKitState, batchId: string, taskIds: string[]): void {
    const batch = state.batches[batchId];
    if (!batch) throw new GuidanceError("spec_kit_task_not_released", `batch ${batchId} not released`, { recoverable: true });
    if (state.activeBatchId !== batchId) throw new GuidanceError("spec_kit_task_already_active", "another batch is active", { recoverable: true });
    for (const id of taskIds) {
      const task = state.tasks[id];
      if (!task) throw new GuidanceError("spec_kit_task_not_found", id, { recoverable: true });
      if (!batch.taskIds.includes(id)) throw new GuidanceError("spec_kit_task_not_released", `${id} not in released batch`, { recoverable: true });
      if (!this.isReady(state, id) && task.status !== "ready" && task.status !== "in_progress") {
        throw new GuidanceError("spec_kit_task_dependency_unsatisfied", `${id} dependencies unsatisfied`, { recoverable: true });
      }
    }
    batch.status = "active";
    for (const id of taskIds) this.transitionTask(state, id, "in_progress");
  }

  submitImplementation(state: SpecKitState, batchId: string, evidence: { taskId: string; summary: string; changedFiles: string[]; testsAddedOrUpdated: string[]; deviations: unknown[]; unresolvedIssues: string[] }[]): void {
    const batch = state.batches[batchId];
    if (!batch) throw new GuidanceError("spec_kit_task_not_released", batchId, { recoverable: true });
    for (const e of evidence) {
      if (!batch.taskIds.includes(e.taskId)) {
        throw new GuidanceError("spec_kit_task_not_released", `task ${e.taskId} not in released batch`, { recoverable: true });
      }
      const task = state.tasks[e.taskId]!;
      task.implementation = {
        summary: e.summary,
        changedFiles: e.changedFiles,
        createdFiles: [],
        deletedFiles: [],
        testsAddedOrUpdated: e.testsAddedOrUpdated,
        deviations: e.deviations,
        unresolvedIssues: e.unresolvedIssues,
      };
      this.transitionTask(state, e.taskId, "implemented");
    }
  }

  submitReview(state: SpecKitState, batchId: string, findings: { findingId: string; taskIds: string[]; severity: string; fixRequired: boolean; fixApplied: boolean }[]): void {
    const batch = state.batches[batchId];
    if (!batch) throw new GuidanceError("spec_kit_task_not_released", `batch ${batchId} unknown`, { recoverable: true });
    for (const f of findings) {
      for (const taskId of f.taskIds) {
        const task = state.tasks[taskId];
        if (!task) continue;
        if (task.status === "completed") {
          throw new GuidanceError("spec_kit_task_not_found" as never, `task ${taskId} is completed and cannot regress`, { recoverable: false });
        }
        if (!batch.taskIds.includes(taskId)) {
          throw new GuidanceError("spec_kit_task_not_released", `task ${taskId} not in released batch`, { recoverable: true });
        }
        task.review = task.review ?? { findings: [], unresolved: [] };
        const existingIdx = task.review.findings.findIndex((x) => x.findingId === f.findingId);
        if (existingIdx >= 0) task.review.findings[existingIdx] = { findingId: f.findingId, severity: f.severity, fixRequired: f.fixRequired, fixApplied: f.fixApplied };
        else task.review.findings.push({ findingId: f.findingId, severity: f.severity, fixRequired: f.fixRequired, fixApplied: f.fixApplied });
        if (f.fixRequired && !f.fixApplied) {
          this.transitionTask(state, taskId, "fix_required");
        }
      }
    }
  }

  completeTask(state: SpecKitState, taskId: string): void {
    const task = state.tasks[taskId]!;
    if (!task.implementation) throw new GuidanceError("spec_kit_task_review_required", `${taskId} has no implementation evidence`, { recoverable: true });
    const blocking = (task.review?.findings ?? []).some((f) => f.fixRequired && !f.fixApplied);
    if (blocking) throw new GuidanceError("spec_kit_task_review_required", `${taskId} has unresolved blocking findings`, { recoverable: true });
    if (!task.verification?.succeeded) throw new GuidanceError("spec_kit_task_verification_required", `${taskId} has no successful verification`, { recoverable: true });
    const hasUnapprovedDeviations = (task.implementation.deviations ?? []).some((d) => (d as { approved?: boolean })?.approved !== true);
    if (hasUnapprovedDeviations) throw new GuidanceError("spec_kit_plan_change_required", `${taskId} has unapproved deviations`, { recoverable: true });
    this.transitionTask(state, taskId, "completed");
  }

  // ---- Traceability (FR-071) ----

  coverageSummary(state: SpecKitState): { id: string; coverage: string; linkedTaskIds: string[] }[] {
    return Object.values(state.criteria).map((c) => ({
      id: c.id,
      coverage: c.waiver ? "waived" : c.linkedTaskIds.length === 0 ? "unmapped" : c.linkedTaskIds.every((t) => state.tasks[t]?.status === "completed") && state.tasks && Object.values(state.tasks).filter((t) => c.linkedTaskIds.includes(t.taskId)).every((t) => t.verification?.succeeded) ? "verified" : c.linkedTaskIds.some((t) => state.tasks[t]?.status === "implemented" || state.tasks[t]?.status === "verified" || state.tasks[t]?.status === "completed") ? "partially_verified" : "planned",
      linkedTaskIds: c.linkedTaskIds,
    }));
  }

  // ---- Plan changes (FR-072) ----

  classifyPlanChange(changeType: string, impact: { acceptanceCriteria: boolean; publicApi: boolean; dependencies: boolean }): "minor" | "major" {
    const additiveNonBreaking = changeType === "add_task" && !impact.acceptanceCriteria && !impact.publicApi && !impact.dependencies;
    return additiveNonBreaking ? "minor" : "major";
  }

  proposePlanChange(state: SpecKitState, input: { changeType: string; reason: string; affectedTasks: string[]; impact: { acceptanceCriteria: boolean; publicApi: boolean; dependencies: boolean } }): PlanChange {
    const TRIGGERS = new Set(["add_task", "remove_task", "defer_task", "changed_requirement", "changed_acceptance_criterion", "architecture_change", "public_api_change", "dependency_change", "migration", "verification_strategy_change", "out_of_scope_work"]);
    if (!TRIGGERS.has(input.changeType)) {
      throw new GuidanceError("spec_kit_plan_change_required", `unknown plan-change type ${input.changeType}`, { recoverable: true });
    }
    const classification = this.classifyPlanChange(input.changeType, input.impact);
    const change: PlanChange = {
      changeId: `change-${randomUUID()}`,
      changeType: input.changeType,
      classification,
      reason: input.reason,
      affectedTasks: input.affectedTasks,
      impact: input.impact,
      status: "artifact_update_required",
    };
    state.planChanges[change.changeId] = change;
    return change;
  }

  hasPendingPlanChanges(state: SpecKitState): boolean {
    return Object.values(state.planChanges).some((c) => c.status !== "applied" && c.status !== "rejected");
  }

  /** FR-073: reconciliation diff — pure. */
  reconcile(prevTasks: Record<string, SpecTask>, nextTasks: Record<string, SpecTask>): {
    added: string[]; removed: string[]; changed: string[]; evidencePreserved: string[]; flaggedForReview: string[];
  } {
    const added = Object.keys(nextTasks).filter((id) => !prevTasks[id]);
    const removed = Object.keys(prevTasks).filter((id) => !nextTasks[id]);
    const changed: string[] = [];
    const evidencePreserved: string[] = [];
    const flaggedForReview: string[] = [];
    for (const [id, prev] of Object.entries(prevTasks)) {
      const next = nextTasks[id];
      if (!next) continue;
      const prevSig = JSON.stringify({ d: prev.dependencies, t: prev.title, desc: prev.description });
      const nextSig = JSON.stringify({ d: next.dependencies, t: next.title, desc: next.description });
      if (prevSig !== nextSig) {
        changed.push(id);
        if (prev.status === "pending" || prev.status === "ready") { /* re-normalize */ }
        else if (prev.status !== "completed" && prev.status !== "cancelled") flaggedForReview.push(id);
        else flaggedForReview.push(id); // completed changed ⇒ impact review
      } else {
        evidencePreserved.push(id);
      }
    }
    return { added, removed, changed, evidencePreserved, flaggedForReview };
  }

  /** FR-074: Spec-Kit completion invariants evaluation. */
  evaluateCompletionInvariants(state: SpecKitState, opts: { snapshotCurrent: boolean; requiredVerificationSucceeded: boolean; completionOpsSucceeded: boolean }): { satisfied: boolean; violations: string[] } {
    const violations: string[] = [];
    if (!state.validation.valid) violations.push("artifacts_invalid");
    if (!state.activeSnapshotId || !opts.snapshotCurrent) violations.push("snapshot_stale");
    const required = Object.values(state.tasks).filter((t) => t.required);
    if (required.some((t) => t.status !== "completed")) violations.push("required_tasks_incomplete");
    if (required.some((t) => t.status === "blocked")) violations.push("required_tasks_blocked");
    if (Object.values(state.tasks).some((t) => t.status === "in_progress" || t.status === "ready")) violations.push("active_tasks");
    const uncovered = this.coverageSummary(state).filter((c) => c.coverage !== "verified" && c.coverage !== "waived");
    if (uncovered.length > 0) violations.push("acceptance_criteria_unverified");
    if (this.hasPendingPlanChanges(state)) violations.push("pending_plan_changes");
    if (!opts.requiredVerificationSucceeded) violations.push("verification_failed");
    if (!opts.completionOpsSucceeded) violations.push("completion_operations_failed");
    return { satisfied: violations.length === 0, violations };
  }

}

function patternOf(p: string): string { return p; }

import { readdirSync } from "node:fs";
function readdirRecursive2(dir: string): string[] { return readdirSync(dir); }
void readdirRecursive2;

function parseCriteria(content: string): { id: string; text: string; linkedTasks: string[] }[] {
  const out: { id: string; text: string; linkedTasks: string[] }[] = [];
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  for (const line of lines) {
    const m = line.match(/\*\*((?:AC|SC)-\d+)\*\*:?\s*(.*)/i);
    if (m) out.push({ id: m[1]!.toUpperCase(), text: m[2] ?? "", linkedTasks: [] });
  }
  return out;
}
