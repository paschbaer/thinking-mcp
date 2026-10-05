/**
 * Configuration assistant (stateless wizard): guides an agent through the
 * design of a `.guidance/` configuration with a question catalog and generates
 * the complete configuration file set as a payload. The SERVER NEVER WRITES
 * files here — the agent persists the returned payload with its own file
 * tools. Stateless by design: the caller accumulates answers and passes them
 * on every call (fits the stateless HTTP mode; decision setup-wizard-state-1
 * Option A).
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { GuidanceError } from "../types/errors.js";

export type SetupAnswerValue = string | boolean;
export type SetupAnswers = Record<string, SetupAnswerValue>;

export interface SetupQuestion {
  id: string;
  question: string;
  help: string;
  options?: string[];
  required: boolean;
  default?: SetupAnswerValue;
}

interface GeneratedFile {
  path: string;
  content: string;
}

/** specs/008 registry name rule (mirrors workspace-registry.ts). */
const WORKSPACE_NAME_PATTERN = /^[a-z][a-z0-9-]{0,63}$/;

/** Package-manager profiles for generated operations. `scripts` are the
 *  invocation args per lifecycle script, preserving each PM's idiomatic form
 *  EXACTLY for npm ("npm test" has no "run") — the builtin template sync pin
 *  depends on it. cleanInstall is the PM's sync-with-lockfile strategy;
 *  install is the firstAvailable fallback when the clean strategy fails
 *  (lockfile missing or out of sync). Yarn target is yarn 4+ (berry). */
const PM_PROFILES: Record<
  "npm" | "pnpm" | "yarn",
  {
    runner: string;
    scripts: { build: string[]; lint: string[]; test: string[] };
    cleanInstall: { capability: string; args: string[] };
    install: { capability: string; args: string[] };
    cleanLabel: string;
    fallbackLabel: string;
  }
> = {
  npm: {
    runner: "npm",
    scripts: { build: ["run", "build"], lint: ["run", "lint"], test: ["test"] },
    cleanInstall: { capability: "npm-ci-lockfile", args: ["ci"] },
    install: { capability: "npm-install-fallback", args: ["install"] },
    cleanLabel: "npm ci (clean semantics)",
    fallbackLabel: "npm install",
  },
  pnpm: {
    runner: "pnpm",
    scripts: {
      build: ["run", "build"],
      lint: ["run", "lint"],
      test: ["run", "test"],
    },
    cleanInstall: {
      capability: "pnpm-install-frozen",
      args: ["install", "--frozen-lockfile"],
    },
    install: { capability: "pnpm-install-fallback", args: ["install"] },
    cleanLabel:
      "pnpm install --frozen-lockfile (clean sync with pnpm-lock.yaml)",
    fallbackLabel: "pnpm install",
  },
  yarn: {
    runner: "yarn",
    scripts: { build: ["build"], lint: ["lint"], test: ["test"] },
    cleanInstall: {
      capability: "yarn-install-immutable",
      args: ["install", "--immutable"],
    },
    install: { capability: "yarn-install-fallback", args: ["install"] },
    cleanLabel: "yarn install --immutable (clean sync with yarn.lock, yarn 4+)",
    fallbackLabel: "yarn install",
  },
};

const PKG_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

const QUESTIONS: SetupQuestion[] = [
  {
    id: "configSource",
    question: "Adopt the proven reference configuration or create a fresh one?",
    help: "adopt = workflow/policies/schemas are taken from the reference config; generic operations are regenerated from your answers below. fresh = everything is generated from your answers only.",
    options: ["fresh", "adopt"],
    required: true,
    default: "fresh",
  },
  {
    id: "projectName",
    question:
      "What is the project name (used as project.name and in gate descriptions)?",
    help: "Free text, kebab-case recommended. Referenced by gates and instructions.",
    required: true,
  },
  {
    id: "transport",
    question: "How will Guidance run: stdio or http-docker?",
    help: "http-docker makes downstream servers reachable via host.docker.internal and enables the egress allowlist; stdio uses localhost URLs.",
    options: ["stdio", "http-docker"],
    required: true,
  },
  {
    id: "referencePath",
    question:
      "Adopt: path to the reference .guidance/ directory (container path, e.g. /workspace/.guidance)?",
    help: "Required when configSource=adopt. Set to 'builtin' (or leave empty) to use the template shipped with the guidance package (examples/default-guidance, override via GUIDANCE_BUILTIN_TEMPLATE_DIR). Otherwise: container path to the reference .guidance/ directory (e.g. /workspace/.guidance). Validated fail-closed (all files present + parseable). Adopt locks insight/gitnexus/gates to the reference. Note: builtin is the generic baseline, not the Thinking-MCP reference.",
    required: false,
  },
  {
    id: "shell",
    question:
      "Terminal shell the agent should use (optional, agent-facing only)?",
    help: "Free text, e.g. 'wsl.exe -e bash'. Embedded as a setup sentence in the understand instruction. Leave empty for none. NOTE: FR-904 — the answer is placed in workflow.json instructions.global and injected into EVERY phase instruction.",
    required: false,
    default: "",
  },
  {
    id: "workspaceRoot",
    question:
      "Absolute container path of THIS repo (optional, needed for workspace registration)?",
    help: "WIZ-1: the container path where THIS repo is mounted (e.g. /workspaces/Thinking-MCP) — used as the root of the workspaces[] registry entry emitted when registerWorkspace is yes. The AGENT must be able to access this path later, so existence is validated before the payload is emitted. Leave empty only with registerWorkspace=no.",
    required: false,
    default: "",
  },
  {
    id: "registerWorkspace",
    question:
      "Register this repo in the Guidance instance workspace registry (workspaces[])?",
    help: "yes = the generated payload carries a workspaces[] merge snippet ({ name, root, projectName }) that the AGENT merges into the instance's guidance.json (or creates the registry when none exists yet). no = repo runs outside a pool instance — no registry step. Remote mode: the registry step is replaced by a hint to register via init_session.",
    options: ["yes", "no"],
    required: true,
    default: "yes",
  },
  {
    id: "insight",
    question:
      "Enable the Insight downstream (insight queries + capture-session-lessons gate)?",
    help: "yes = insight ops and the blocking capture gate are generated. no = those operations are omitted.",
    options: ["yes", "no"],
    required: true,
    default: "yes",
  },
  {
    id: "gitnexus",
    question:
      "Enable the GitNexus downstream (blocking repository-analysis gate)?",
    help: "yes = repository-analysis gate (MCP check + CLI fallback) and downstream entry are generated.",
    options: ["yes", "no"],
    required: true,
    default: "yes",
  },
  {
    id: "gates",
    question:
      "Gate preset: standard (lint opt + test opt + build REQ) or minimal (build REQ only)?",
    help: "standard matches this repository's own working sample. minimal suits fresh projects without a test/lint setup.",
    options: ["standard", "minimal"],
    required: true,
    default: "standard",
  },
  {
    id: "packageManager",
    question:
      "Which package manager does this repo use for install/test gates?",
    help: "DETECT from the repo root (do not guess): pnpm-lock.yaml or pnpm-workspace.yaml -> pnpm; yarn.lock -> yarn; package-lock.json or none -> npm. Controls the generated operations: gates run via the PM (npm run / pnpm run / yarn), deps-install uses the PM's clean-install strategy with plain install as firstAvailable fallback (npm ci -> npm install | pnpm install --frozen-lockfile -> pnpm install | yarn install --immutable -> yarn install; yarn target is yarn 4+). Default npm.",
    options: ["npm", "pnpm", "yarn"],
    required: false,
    default: "npm",
  },
];

// FR-908/FR-901: in adopt mode these answers are derived from the reference
// configuration (profile/insight/gitnexus/gates) and are NOT required — and
// the wizard must not ASK them (they would be overwritten by generateFiles).
const DERIVED_IN_ADOPT = new Set(["insight", "gitnexus", "gates"]);

function isAnswered(q: SetupQuestion, answers: SetupAnswers): boolean {
  const v = answers[q.id];
  return v !== undefined && v !== "";
}

/** Returns the first unanswered required question, or null when complete. */
export function nextQuestion(answers: SetupAnswers): SetupQuestion | null {
  const adopt = answers.configSource === "adopt";
  for (const q of QUESTIONS) {
    if (
      q.required &&
      !isAnswered(q, answers) &&
      !(adopt && DERIVED_IN_ADOPT.has(q.id))
    )
      return q;
  }
  return null;
}

/**
 * Start-phase options: the agent derives the workspace name before starting
 * (WIZ-2/WIZ-4, user decision 2026-10-03) and passes it as a hint so the
 * workspaceRoot question can carry a composed default. Variant (ii): no
 * plausibility logic — set the default only when BOTH the environment
 * (GUIDANCE_WORKSPACE_ROOT) and the hint are present, otherwise unchanged.
 */
export interface CatalogOptions {
  workspaceNameHint?: string;
}

/**
 * Compose the workspaceRoot default (WIZ-4): GUIDANCE_WORKSPACE_ROOT + "/" +
 * hint. Returns undefined when either input is missing/blank. Trailing
 * slashes on the env value are trimmed to avoid double separators.
 */
export function workspaceRootDefault(hint?: string): string | undefined {
  const root = process.env.GUIDANCE_WORKSPACE_ROOT?.trim().replace(/\/+$/, "");
  const name = hint?.trim();
  if (!root || !name) return undefined;
  return `${root}/${name}`;
}

/**
 * Normalize a raw name hint into a kebab-case project name (WIZ-2): strip a
 * leading npm scope ('@scope/pkg' -> 'pkg'), lowercase, map whitespace,
 * underscores and dots to '-', collapse repeated '-', trim edge '-'. The
 * result must satisfy the registry name pattern; 'default' is reserved and
 * rejected. Returns undefined when nothing valid remains — the caller then
 * injects NO suggestion (confirmation duty stays with the operator).
 */
export function normalizeProjectName(hint?: string): string | undefined {
  if (hint === undefined) return undefined;
  let name = hint.trim();
  if (name.startsWith("@")) {
    const slash = name.indexOf("/");
    name = slash === -1 ? "" : name.slice(slash + 1);
  }
  name = name
    .toLowerCase()
    .replace(/[\s_.]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (name === "" || name === "default" || !WORKSPACE_NAME_PATTERN.test(name)) {
    return undefined;
  }
  return name;
}

/** Immutable per-call catalog copy with runtime defaults applied (WIZ-4/WIZ-2). */
function catalogWithOptions(options: CatalogOptions): SetupQuestion[] {
  const root = workspaceRootDefault(options.workspaceNameHint);
  const project = normalizeProjectName(options.workspaceNameHint);
  if (root === undefined && project === undefined) return QUESTIONS;
  return QUESTIONS.map((q) => {
    if (q.id === "workspaceRoot" && root !== undefined) {
      return { ...q, default: root };
    }
    if (q.id === "projectName" && project !== undefined) {
      return { ...q, default: project };
    }
    return q;
  });
}

export function catalogOverview(
  answers: SetupAnswers,
  options: CatalogOptions = {},
): {
  done: boolean;
  nextQuestion: SetupQuestion | null;
  questions: SetupQuestion[];
  received: SetupAnswers;
  nextTool: string;
} {
  const next = nextQuestion(answers);
  const questions = catalogWithOptions(options);
  const current =
    next === null ? null : (questions.find((q) => q.id === next.id) ?? null);
  return {
    done: next === null,
    nextQuestion: current,
    questions,
    received: answers,
    nextTool:
      next === null ? "setup_guidance_generate" : "setup_guidance_answer",
  };
}

function requireCompleted(answers: SetupAnswers): void {
  const adopt = answers.configSource === "adopt";
  const missing = QUESTIONS.filter(
    (q) =>
      q.required &&
      !isAnswered(q, answers) &&
      !(adopt && DERIVED_IN_ADOPT.has(q.id)),
  ).map((q) => q.id);
  if (missing.length > 0) {
    throw new GuidanceError(
      "configuration_invalid",
      `setup answers incomplete, missing: ${missing.join(", ")}`,
      { recoverable: true },
    );
  }
}

function insightUrl(transport: string): string {
  return transport === "http-docker"
    ? "http://host.docker.internal:3002/mcp"
    : "http://localhost:3002/mcp";
}

function gitnexusUrl(transport: string): string {
  return transport === "http-docker"
    ? "http://host.docker.internal:4747/api/mcp"
    : "http://localhost:4747/api/mcp";
}

function emmsUrl(transport: string): string {
  return transport === "http-docker"
    ? "http://host.docker.internal:3002/mcp"
    : "http://localhost:3002/mcp";
}

function clearthoughtUrl(transport: string): string {
  return transport === "http-docker"
    ? "http://host.docker.internal:3000/mcp"
    : "http://localhost:3000/mcp";
}

function buildPolicies(transport: string): string {
  const hosts =
    transport === "http-docker"
      ? [
          "host.docker.internal:3000",
          "host.docker.internal:3002",
          "host.docker.internal:4747",
        ]
      : ["localhost:3000", "localhost:3002", "localhost:4747"];
  const policies = {
    version: 2,
    egress: { httpHostAllowlist: hosts },
    submission: { requestIdReuse: "warn" },
    trustLevels: {
      untrusted: { dataEgress: "none" },
      restricted: { dataEgress: "validated_inputs_only" },
      trusted: { dataEgress: "project_data" },
      privileged: { dataEgress: "project_data_with_approval" },
    },
    validation: {
      requireAcceptanceCriteria: true,
      requireUniqueTaskIds: true,
      rejectUnknownDependencies: true,
      rejectDependencyCycles: true,
      rejectEmptyArtifacts: true,
    },
    reviewFindings: { blockingSeverities: ["high", "critical"] },
    redaction: {
      patterns: [
        "\\bapi[_-]?key\\b",
        "\\btoken\\b",
        "\\bsecret\\b",
        "\\bpassword\\b",
        "\\bauthorization\\b",
      ],
    },
    outputDefaults: {
      returnToAgent: "summary_and_errors",
      maxExcerptBytes: 65536,
      maxArtifactBytes: 1048576,
      maximumTasks: 500,
      maximumEntities: 2000,
    },
  };
  return JSON.stringify(policies, null, 2) + "\n";
}

function buildWorkflow(
  gates: string,
  gitnexus: boolean,
  insight: boolean,
): string {
  const verifyGates =
    gates === "standard" ? ["lint", "test", "build"] : ["build"];
  const completeGates: string[] = [];
  if (gitnexus) completeGates.push("repository-analysis");
  if (insight) completeGates.push("capture-session-lessons");
  const workflow = {
    version: 2,
    workflow: {
      id: "standard-development",
      initialPhase: "understand",
      terminalStates: ["completed", "cancelled"],
    },
    phases: {
      understand: {
        response: "understand",
        submissionSchema: "schemas/understand.schema.json",
        transitions: [{ to: "plan", when: "submission_valid" }],
        lifecycle: insight
          ? { afterEnter: ["query-project-insights"] }
          : undefined,
      },
      plan: {
        response: "plan",
        submissionSchema: "schemas/plan.schema.json",
        transitions: [
          { to: "review_and_adjust_plan", when: "submission_valid" },
        ],
      },
      review_and_adjust_plan: {
        response: "review_and_adjust_plan",
        submissionSchema: "schemas/review-plan.schema.json",
        transitions: [
          { to: "plan", reason: "major_plan_revision_required" },
          { to: "implement", when: "submission_valid" },
        ],
      },
      implement: {
        response: "implement",
        submissionSchema: "schemas/implement.schema.json",
        transitions: [
          { to: "review_and_fix_implementation", when: "submission_valid" },
          { to: "plan", reason: "significant_plan_deviation" },
        ],
      },
      review_and_fix_implementation: {
        response: "review_and_fix_implementation",
        submissionSchema: "schemas/review-implementation.schema.json",
        transitions: [
          { to: "implement", reason: "implementation_changes_required" },
          { to: "verify", when: "submission_valid" },
        ],
      },
      verify: {
        response: "verify",
        submissionSchema: "schemas/verify.schema.json",
        lifecycle: { beforeExit: verifyGates },
        transitions: [
          {
            to: "review_and_fix_implementation",
            reason: "verification_failed",
          },
          { to: "complete", when: "required_operations_succeeded" },
        ],
      },
      complete: {
        response: "complete",
        submissionSchema: "schemas/complete.schema.json",
        lifecycle: { beforeExit: completeGates },
        transitions: [
          { to: "completed", when: "required_operations_succeeded" },
        ],
      },
    },
    states: {
      completed: { terminal: true },
      blocked: { system: true },
      cancelled: { terminal: true },
    },
  };
  return JSON.stringify(workflow, null, 2) + "\n";
}

function questionsSentence(field: string): string {
  return ` Ask open questions in the chat before submitting and reference them in \`${field}\`; escalate via \`report_blocker\` ONLY when the answer would materially change this submission (a different plan or different code) — otherwise document the question, state your working assumption explicitly, and proceed.`;
}

/** Builds the generic (fresh) baseline responses — exported for the FR-991 drift-guard test. */
export function buildResponses(shell: string): string {
  const shellSentence = shell
    ? ` Set up your terminal shell first: run all commands through ${shell}.`
    : "";
  const idempotency =
    " Submission idempotency: never reuse a requestId across submissions — each phase advance requires a fresh requestId; if a submission returns accepted but the phase is unchanged, do not retry the same requestId — check get_workflow_state (requestIds) instead.";
  const timeoutPolicy =
    " Timeout policy: NEVER retry the original call after a downstream MCP transport/request timeout — the call may already have run on the server. Instead, invoke the tool ONCE via the server's configured container route (containerRoute in downstream-servers.json; agent-side: run_operation through the guidance server). If the server has no containerRoute defined, or the container-route call also fails, make ONE direct call of the same tool over its HTTP MCP endpoint via curl (streamable-HTTP JSON-RPC). Non-idempotent calls (workspace_write/external_write) are never replayed on any route — for those, or if the direct call also fails, escalate via report_blocker (category: infrastructure). Route heavy GitNexus work (analyze/reindex) through the terminal CLI instead of MCP.";
  const longTransitions =
    " Long state transitions: verification and completion hooks (lint, build, final-review, index-freshness) can run for minutes and may outlive your MCP client timeout — submit the phase call ONCE; if it times out, do NOT retry it (the single-flight lock queues retries into more timeouts while the transition completes server-side), poll get_workflow_state instead until phase and operations reflect the transition.";
  const responses = {
    understand: {
      title: "Understand the Request",
      instruction:
        "Analyze the development request before proposing an implementation, using the Clear-Thought tools: run at least one sequential_thinking pass to structure the analysis and reference its conclusions in the submission. Provide a concise summary, assumptions, open questions, constraints, risks, measurable acceptance criteria, and affected areas." +
        idempotency +
        " Do not create an implementation plan yet." +
        shellSentence +
        timeoutPolicy +
        questionsSentence("openQuestions"),
      requiredActions: [
        "Inspect the relevant repository context.",
        "Run at least one Clear-Thought sequential_thinking pass and reference its conclusions in the submission.",
        "Distinguish confirmed facts from assumptions.",
        "Identify blocking questions explicitly.",
      ],
    },
    plan: {
      title: "Create the Implementation Plan",
      instruction:
        "Create a concrete implementation plan with stable task identifiers, affected files, dependencies, planned tests, and verification, using the Clear-Thought tools: decompose and prioritize via sequential_thinking (and decision_framework when weighing alternatives), and reference the reasoning results in the submission. Do not start implementation yet." +
        idempotency +
        timeoutPolicy +
        questionsSentence("openQuestions"),
      requiredActions: [
        "Run at least one Clear-Thought sequential_thinking or decision_framework pass for decomposition/prioritization and reference its results in the plan submission.",
      ],
    },
    review_and_adjust_plan: {
      title: "Review and Adjust the Plan",
      instruction:
        "Review the plan critically from architecture, correctness, maintainability, testability, security, backward-compatibility, performance, and operational perspectives, using the Clear-Thought tools: stress-test the plan's assumptions with assumption_xray, socratic_method, or argument_map, and reference the reasoning results in the findings. Submit the complete adjusted plan." +
        idempotency +
        timeoutPolicy +
        questionsSentence("remainingConcerns"),
      requiredActions: [
        "Run at least one Clear-Thought stress-test pass (assumption_xray, socratic_method, or argument_map) and reference its results in the findings.",
      ],
    },
    implement: {
      title: "Implement the Approved Plan",
      instruction:
        "Implement the approved plan. Follow the approved task identifiers, avoid unrelated changes, and report all changed, created, and deleted files plus deviations. FIRST step: verify you are on the branch you expect (git status), then create a feature branch (feature/<meaningful-name>). LAST step: update the documentation (README.md) and the memory-bank files." +
        idempotency +
        timeoutPolicy +
        questionsSentence("unresolvedIssues"),
      requiredActions: [],
    },
    review_and_fix_implementation: {
      title: "Review and Fix the Implementation",
      instruction:
        "Review the implementation for correctness, edge cases, error handling, security, maintainability, duplication, dead code, performance, compatibility, test coverage, and plan conformity. Apply fixes before submitting, using the Clear-Thought tools: run metacognitive_monitoring as a final confidence check before submitting, and debugging_approach for non-trivial findings — reference the results in the findings." +
        idempotency +
        timeoutPolicy +
        questionsSentence("unresolvedFindings"),
      requiredActions: [
        "Run Clear-Thought metacognitive_monitoring as a final confidence check before submitting; when findings are non-trivial, additionally apply debugging_approach and reference its results in the findings.",
      ],
    },
    verify: {
      title: "Verify the Implementation",
      instruction:
        "Guidance will execute the configured verification operations. Analyze failures and return to implementation review when code changes are required. Do not claim success while a mandatory operation is failing." +
        longTransitions +
        timeoutPolicy,
      requiredActions: [],
    },
    complete: {
      title: "Complete the Workflow",
      instruction:
        "Produce the final completion report: summary, changed files, verification results, known limitations, remaining risks, deviations, deferred work, and next steps. BEFORE submitting the completion report: (0) write `.guidance/state/final-review.json` FRESH for THIS session — strict schema per the check-final-review.mjs gate script (ships with the guidance server under scripts/; run it from the repo root): formatVersion 1; keys formatVersion, sessionId, reviewerRef, reviewScope, baseCommit, headCommit, commits, reviewedAt, openHighCritical, findings — each finding carries {id, severity, status, evidence}; headCommit MUST equal the current HEAD as a full 40-hex hash and every commit entry is a full 40-hex hash; write it AFTER the last commit — any commit after the review invalidates the gate, so after late commits re-run the review (or re-bless the delta with the same reviewer) and rewrite the file; validate it with that script BEFORE completing. (1) refresh the GitNexus index host-side by running gitnexus analyze --no-stats in the terminal (the gate only verifies index availability, not freshness) and note the refresh in the report; (2) review this session for recurring bugs, traps, and validated fixes and write them to .guidance/state/session-lessons.json as [{slug, observation, cause, fix}] — ALWAYS create the file (an empty array is the explicit no-op success); a MISSING file FAILS the capture-session-lessons gate, so the lessons review step must not be skipped." +
        longTransitions +
        idempotency +
        timeoutPolicy +
        questionsSentence("deferredWork/nextSteps"),
      requiredActions: [],
    },
  };
  return JSON.stringify({ version: 2, responses }, null, 2) + "\n";
}

function buildOperations(
  packageManager: string,
  gates: string,
  gitnexus: boolean,
  insight: boolean,
  projectName: string,
  transport: string,
): string {
  const pmRaw = String(packageManager ?? "npm")
    .trim()
    .toLowerCase();
  const effectivePm = pmRaw === "" ? "npm" : pmRaw;
  if (
    effectivePm !== "npm" &&
    effectivePm !== "pnpm" &&
    effectivePm !== "yarn"
  ) {
    throw new GuidanceError(
      "configuration_invalid",
      `setup answers: unsupported packageManager ${JSON.stringify(
        packageManager,
      )} (expected npm|pnpm|yarn)`,
      { recoverable: true },
    );
  }
  const pm = PM_PROFILES[effectivePm as "npm" | "pnpm" | "yarn"];
  const proc = (
    description: string,
    executable: string,
    args: string[],
    required: boolean,
    timeout: number,
    risk: string,
  ) => ({
    description,
    type: "process",
    executable,
    args,
    required,
    timeoutSeconds: timeout,
    riskClass: risk,
    validation: { protocolRequestMustSucceed: true, exitCodeMustBeZero: true },
    output: { returnToAgent: "summary_and_errors", retainRawResult: true },
  });
  const operations: Record<string, unknown> = {
    build: proc(
      `Build the project via ${pm.runner}.`,
      pm.runner,
      pm.scripts.build,
      true,
      600,
      "workspace_write",
    ),
  };
  if (gates === "standard") {
    operations.lint = proc(
      `Run the project lint script via ${pm.runner}.`,
      pm.runner,
      pm.scripts.lint,
      false,
      300,
      "read_only",
    );
    operations.test = proc(
      `Run the automated test suite via ${pm.runner}.`,
      pm.runner,
      pm.scripts.test,
      false,
      900,
      "read_only",
    );
  }
  // specs/015 US2 (FR-1211/1212): dependency-bootstrap operations. The via
  // label (step capability) doubles as the fallback audit note; runs happen
  // in the workspace root (OperationEngine cwd), so they are workspace-scoped.
  operations["deps-install"] = {
    description:
      `Install Node dependencies: ${pm.cleanLabel}, with ${pm.fallbackLabel} as the firstAvailable fallback — the fallback runs whenever the clean strategy fails for ANY reason (missing lockfile, lockfile out of sync, network error, dependency conflict, timeout). ` +
      (effectivePm === "npm"
        ? "npm ci removes node_modules before failing, so a masked failure leaves node_modules deleted. "
        : "The clean strategy is sync-with-lockfile semantics (no destructive node_modules reset). ") +
      "Runs in the workspace root; the result's via label records which strategy ran (audit note; visible in run history). riskClass workspace_write (subject to policies.approvals — default: allowed for unattended operation), exposure-filtered output (specs/015 FR-1211).",
    type: "composite",
    strategy: "firstAvailable",
    required: false,
    invocableByAgent: true,
    timeoutSeconds: 900,
    riskClass: "workspace_write",
    steps: [
      {
        type: "process",
        capability: pm.cleanInstall.capability,
        executable: pm.runner,
        args: pm.cleanInstall.args,
      },
      {
        type: "process",
        capability: pm.install.capability,
        executable: pm.runner,
        args: pm.install.args,
      },
    ],
    validation: { protocolRequestMustSucceed: true, exitCodeMustBeZero: true },
    output: { returnToAgent: "summary_and_errors", retainRawResult: true },
  };
  operations["deps-reinstall"] = {
    description: `Clean Node dependencies: delete node_modules (lockfile preserved), then reinstall with ${pm.runner} — workspace-scoped (runs in the workspace root, no path traversal). For native-addon ABI mismatches (ERR_DLOPEN_FAILED): reinstall INSIDE the container for a Linux-native tree. Platform note: spawns ${pm.runner} directly (no shell) — supported on Linux/container hosts (FR-1216); Windows hosts are not supported without shell adaptation. riskClass workspace_write (subject to policies.approvals — default: allowed for unattended operation), exposure-filtered output (specs/015 FR-1212).`,
    type: "process",
    executable: "node",
    args: [
      "-e",
      `const cp=require('node:child_process'),fs=require('node:fs');fs.rmSync('node_modules',{recursive:true,force:true});const r=cp.spawnSync('${pm.runner}',['install'],{stdio:'inherit'});process.exit(r.status??1)`,
    ],
    required: false,
    invocableByAgent: true,
    timeoutSeconds: 900,
    riskClass: "workspace_write",
    validation: { protocolRequestMustSucceed: true, exitCodeMustBeZero: true },
    output: { returnToAgent: "summary_and_errors", retainRawResult: true },
  };
  if (gitnexus) {
    operations["repository-analysis"] = {
      description:
        "Verify the GitNexus index for this repo is present and queryable (HTTP mode: mcpTool check; stdio mode: local CLI refresh). The index REFRESH itself stays a host-side pre-complete step: the HTTP server exposes no analyze tool.",
      type: "composite",
      strategy: "firstAvailable",
      required: true,
      timeoutSeconds: 900,
      riskClass: "read_only",
      steps: [
        {
          type: "mcpTool",
          server: "gitnexus",
          capability: "check",
          arguments: { mode: "fixed", value: { repo: projectName } },
        },
        {
          type: "process",
          executable: "gitnexus",
          args: ["analyze", "--no-stats"],
        },
      ],
      validation: {
        protocolRequestMustSucceed: true,
        toolResultMustNotBeError: true,
        requiredContent: true,
      },
      output: { returnToAgent: "summary_and_errors", retainRawResult: true },
      failure: {
        remainInPhase: true,
        allowManualRetry: true,
        reportToAgent: true,
      },
    };
  }
  if (insight) {
    operations["query-project-insights"] = {
      description:
        "Retrieve existing development insights (experience_search).",
      type: "mcpTool",
      server: "insight",
      capability: "experience_search",
      required: false,
      timeoutSeconds: 60,
      riskClass: "read_only",
      arguments: {
        mode: "template",
        value: { query: "${session.request}", scope_id: projectName },
      },
      validation: {
        protocolRequestMustSucceed: true,
        toolResultMustNotBeError: true,
      },
      output: { returnToAgent: "normalized", retainRawResult: false },
    };
    operations["capture-session-lessons"] = {
      description:
        "Seed validated session lessons. The agent writes .guidance/state/session-lessons.json BEFORE calling complete_workflow ([{slug, observation, cause, fix}]; empty array = explicit no-op success; a MISSING file FAILS the gate — the lessons review step must not be skipped; redact secrets — the script bypasses Guidance pattern redaction). Idempotent per slug.",
      type: "process",
      executable: "sh",
      args: [
        "-c",
        `EMMS_HTTP_URL=${emmsUrl(transport)} EMMS_LESSON_SCOPE=${projectName}-lessons node .guidance/scripts/seed-lessons.mjs .guidance/state/session-lessons.json`,
      ],
      required: false,
      timeoutSeconds: 120,
      riskClass: "external_write",
      validation: {
        protocolRequestMustSucceed: true,
        exitCodeMustBeZero: true,
      },
      output: { returnToAgent: "summary_and_errors", retainRawResult: true },
      failure: {
        remainInPhase: true,
        allowManualRetry: true,
        reportToAgent: true,
      },
    };
  }
  return JSON.stringify({ version: 2, operations }, null, 2) + "\n";
}

function buildDownstream(
  insight: boolean,
  gitnexus: boolean,
  transport: string,
): string {
  const conn = (timeout: number) => ({
    startupTimeoutSeconds: 30,
    requestTimeoutSeconds: timeout,
    reconnect: { enabled: true, maximumAttempts: 2, delayMilliseconds: 1000 },
  });
  const servers: Record<string, unknown> = {};
  // Clear-Thought is part of the default profile: the generated phase
  // instructions reference its reasoning tools, so the server must be
  // predefined even when the operator answers "no" to insight/gitnexus.
  servers.clearthought = {
    displayName: "Clear-Thought",
    enabled: true,
    required: false,
    trustLevel: "trusted",
    transport: { type: "http", http: { url: clearthoughtUrl(transport) } },
    capabilities: {
      allow: {
        tools: [
          "sequential_thinking",
          "decision_framework",
          "metacognitive_monitoring",
          "debugging_approach",
          "assumption_xray",
          "socratic_method",
          "argument_map",
          "structured_argumentation",
        ],
        resources: [],
        prompts: [],
      },
    },
    connection: conn(120),
  };
  if (gitnexus) {
    servers.gitnexus = {
      displayName: "GitNexus",
      enabled: true,
      required: true,
      trustLevel: "trusted",
      transport: { type: "http", http: { url: gitnexusUrl(transport) } },
      capabilities: {
        allow: {
          tools: ["check", "query", "detect_changes", "list_repos"],
          resources: [],
          prompts: [],
        },
      },
      connection: conn(300),
      // FR-035 amendment: read-only graph queries fall back over the same
      // endpoint when the primary transport times out (see REV-1).
      containerRoute: { url: gitnexusUrl(transport) },
    };
  }
  if (insight) {
    servers.insight = {
      displayName: "Insight",
      enabled: true,
      required: false,
      trustLevel: "trusted",
      transport: { type: "http", http: { url: insightUrl(transport) } },
      capabilities: {
        allow: {
          tools: ["experience_search", "experience_record_observation"],
          resources: ["insight://project/*"],
          prompts: [],
        },
      },
      connection: conn(120),
    };
  }
  return JSON.stringify({ version: 2, servers }, null, 2) + "\n";
}

/** Generates the complete `.guidance/` file set for the collected answers. */
export function generateFiles(answers: SetupAnswers): {
  files: GeneratedFile[];
  notes: string[];
} {
  requireCompleted(answers);
  const name = String(answers.projectName);
  const transport = String(answers.transport);
  const configSource = String(answers.configSource ?? "fresh");
  const adopt = configSource === "adopt";
  const referencePath =
    answers.referencePath !== undefined &&
    String(answers.referencePath).trim() !== ""
      ? String(answers.referencePath).trim()
      : undefined;
  // WIZ-3: the profile answer is GONE — spec-kit integrations are configured
  // via integrations.specKit / profiles-spec-kit.json when a repo needs one;
  // all tools register on every instance.
  const shell = String(answers.shell ?? "").trim();
  let insight = answers.insight === "yes" || answers.insight === true;
  let gitnexus = answers.gitnexus === "yes" || answers.gitnexus === true;
  let gates = String(answers.gates ?? "standard");

  // WIZ-1 (user decisions 2026-10-03): the former target modes are MERGED —
  // one assistant run produces the repo process config AND (opt-in via
  // registerWorkspace) the workspace registry entry. The registry data is
  // emitted as a merge SNIPPET in notes[]; the AGENT performs the merge into
  // the instance's guidance.json (the server never writes files).
  // Opt-in semantics: registration happens ONLY on an explicit yes (the
  // question default suggests yes, but an absent answer never registers —
  // keeps bare generateFiles calls repo-config-only).
  const registerWorkspace =
    answers.registerWorkspace === "yes" || answers.registerWorkspace === true;
  const remote = process.env.GUIDANCE_REMOTE_MODE === "1";
  const registryNotes: string[] = [];
  if (registerWorkspace) {
    const repoRoot = String(answers.workspaceRoot ?? "").trim();
    if (repoRoot === "") {
      throw new GuidanceError(
        "configuration_invalid",
        "registerWorkspace=yes requires workspaceRoot — the absolute container path where THIS repo is mounted (e.g. /workspaces/Thinking-MCP). Set registerWorkspace=no when the repo runs outside a pool instance.",
        { recoverable: true },
      );
    }
    if (!isAbsolute(repoRoot)) {
      throw new GuidanceError(
        "configuration_invalid",
        `registerWorkspace workspaceRoot must be an absolute path: ${repoRoot}`,
        { recoverable: true },
      );
    }
    // WIZ-1 decision 3: the agent must be able to access this path later —
    // validate existence BEFORE emitting the payload (not only at load).
    if (!existsSync(repoRoot)) {
      throw new GuidanceError(
        "configuration_invalid",
        `registerWorkspace workspaceRoot does not exist (the agent must be able to access it later): ${repoRoot} — verify the mount/path and answer again`,
        { recoverable: true },
      );
    }
    if (!WORKSPACE_NAME_PATTERN.test(name) || name === "default") {
      throw new GuidanceError(
        "configuration_invalid",
        `registerWorkspace: projectName ${JSON.stringify(name)} is used as the registry workspace name — expected ^[a-z][a-z0-9-]{0,63}$, "default" is reserved (the projectName default from workspaceNameHint is already normalized)`,
        { recoverable: true },
      );
    }
    const entry = { name, root: repoRoot, projectName: name };
    if (remote) {
      // WIZ-1 decision 2: in remote mode the registry lives per session in
      // the container — registration happens via init_session, not via the
      // path-based instance registry.
      registryNotes.push(
        "Remote mode (specs/014): skip the workspace registry — register this repo config via init_session (key + Bearer; idempotent per config hash).",
      );
    } else {
      const entryJson = JSON.stringify(entry, null, 2);
      registryNotes.push(
        `WIZ-1 workspace registration: merge this entry into the \"workspaces\" array of the instance's guidance.json (\${GUIDANCE_WORKSPACE_ROOT}/.guidance/guidance.json) — the AGENT performs the merge on the operator's behalf:\n${entryJson}`,
        `WIZ-1: if the instance registry does not exist yet, CREATE it: { "version": 2, "project": { "name": "<instance-name>" }, "workspaces": [${JSON.stringify(entry)}], "registryRegister": { "enabled": true }, "state": { "directory": "state", "persistAfterEveryOperation": true } } — confirm with the operator first (assistant question registerWorkspace covers the initial-creation case).`,
        `WIZ-1: workspace name \"${name}\" derives from projectName — the AGENT derives the projectName suggestion from the package manifest (or directory name) and the operator CONFIRMS/OVERRIDES it (do not answer on their behalf).`,
        `WIZ-1: start sessions for this repo via start_workflow { workspace: "${name}" }.`,
      );
    }
  }

  const nonGenericOps: string[] = [];
  const adaptedOps: string[] = [];
  const divergentOps: string[] = [];
  let workflowOverride: string | undefined;
  let policiesOverride: string | undefined;
  let downstreamOverride: string | undefined;
  let responsesOverride: string | undefined;
  let adoptionBlock: Record<string, unknown> | undefined;
  let nonGenericRefOps: Record<string, Record<string, unknown>> = {};
  let resolvedReference = referencePath;
  if (adopt) {
    // FR-971 (specs/011): "builtin" (or an omitted referencePath) resolves to
    // the template shipped with the guidance package — enables adopt in
    // container-only deployments without a mounted reference.
    const isBuiltin =
      referencePath === undefined ||
      referencePath === "" ||
      referencePath === "builtin";
    if (!resolvedReference || resolvedReference === "builtin") {
      resolvedReference = resolveBuiltinReferencePath();
    }
    validateAdoptReference(resolvedReference);
    const refGuidance = JSON.parse(
      readFileSync(join(resolvedReference, "guidance.json"), "utf8"),
    ) as Record<string, unknown>;
    void refGuidance; // legacy `profile` field is tolerated and ignored (WIZ-3)
    const refOps = JSON.parse(
      readFileSync(join(resolvedReference, "operations.json"), "utf8"),
    ) as { operations?: Record<string, Record<string, unknown>> };
    const refOpsMap = refOps.operations ?? {};
    insight = isBuiltin
      ? "store-completion-insight" in refOpsMap ||
        "query-project-insights" in refOpsMap ||
        "capture-session-lessons" in refOpsMap
      : "capture-session-lessons" in refOpsMap;
    gitnexus = "repository-analysis" in refOpsMap;
    gates = "lint" in refOpsMap && "test" in refOpsMap ? "standard" : "minimal";
    const genericPreset = new Set([
      "lint",
      "test",
      "build",
      "repository-analysis",
      "query-project-insights",
      "capture-session-lessons",
    ]);
    // Structural genericity (Niyama incident class): preset operations are
    // ALWAYS regenerated from the target-fresh template — never copied from
    // the reference. This is safe in both directions: repo-specific args under
    // a generic name (globs, foreign paths) cannot leak into the target, and
    // target-derived args (scopes, URLs) cannot be replaced by the reference's
    // deployment values. Divergent reference args are surfaced as a note for
    // review. Non-preset ops are copied with the [adopted] review marker.
    let freshOpsMap: Record<string, Record<string, unknown>> = {};
    try {
      freshOpsMap =
        (
          JSON.parse(
            buildOperations(
              String(answers.packageManager ?? "npm"),
              gates,
              gitnexus,
              insight,
              name,
              transport,
            ),
          ) as {
            operations?: Record<string, Record<string, unknown>>;
          }
        ).operations ?? {};
    } catch (err) {
      // Answer-validation errors from buildOperations (e.g. an unsupported
      // packageManager value) must fail closed — swallowing them here would
      // silently ignore the PM answer and copy npm-based reference ops.
      if (
        err instanceof GuidanceError &&
        err.code === "configuration_invalid"
      ) {
        throw err;
      }
      freshOpsMap = {};
    }
    for (const [opId, op] of Object.entries(refOpsMap)) {
      const freshOp = freshOpsMap[opId];
      if (!genericPreset.has(opId) || freshOp === undefined) {
        nonGenericOps.push(opId);
        continue;
      }
      adaptedOps.push(opId);
      // TMPL-3: divergence fingerprint covers process args, mcpTool arguments
      // and composite steps, plus the op's targeting fields (type/server/
      // capability) — the previous args-only comparison under-reported
      // divergence for non-process ops (advisory only; preset ops are
      // regenerated regardless). Order-sensitive by design; null-normalized
      // for absent fields.
      const fingerprint = (o: Record<string, unknown>) =>
        // template placeholders render to the target's values at generation
        // time — normalize them so the builtin template can stay in sync
        JSON.stringify({
          type: o.type ?? null,
          server: o.server ?? null,
          capability: o.capability ?? null,
          args: o.args ?? null,
          arguments: o.arguments ?? null,
          steps: o.steps ?? null,
        }).replaceAll("${project.name}", name);
      if (fingerprint(op) !== fingerprint(freshOp)) divergentOps.push(opId);
    }
    let wfText = readFileSync(join(resolvedReference, "workflow.json"), "utf8");
    if (shell) {
      const wf = JSON.parse(wfText) as Record<string, unknown>;
      // GDS-5/FR-981: MERGE the shell sentence with an existing template
      // instructions.global (e.g. the worktree-isolation rule) instead of
      // replacing the slot.
      const existing = (wf["instructions"] as { global?: string } | undefined)
        ?.global;
      wf["instructions"] = {
        global: [existing, shell].filter(Boolean).join("\n"),
      };
      wfText = JSON.stringify(wf, null, 2);
    }
    workflowOverride = wfText;
    policiesOverride = buildPolicies(transport);
    downstreamOverride = buildDownstream(insight, gitnexus, transport);
    // FR-981/FR-992..994 (specs/012+013): adopt the reference RESPONSES.
    // Builtin adopt renders the wisdom baseline (fail-closed if missing);
    // mounted references use their responses-wisdom.json when present,
    // otherwise their responses.json (012 behavior).
    const wisdomFile = join(resolvedReference, "responses-wisdom.json");
    const responsesSource =
      isBuiltin || existsSync(wisdomFile)
        ? wisdomFile
        : join(resolvedReference, "responses.json");
    if (isBuiltin && !existsSync(responsesSource)) {
      throw new GuidanceError(
        "configuration_invalid",
        "adopt source: missing/unreadable file responses-wisdom.json",
        { recoverable: true },
      );
    }
    const refResponses = JSON.parse(
      readFileSync(responsesSource, "utf8"),
    ) as Record<string, unknown>;
    // Phase coverage on the file actually adopted (FR-982).
    const wfPhases = Object.keys(
      ((JSON.parse(wfText) as { phases?: Record<string, unknown> }).phases ??
        {}) as Record<string, unknown>,
    );
    const responseIds = new Set(
      Object.keys((refResponses.responses ?? {}) as Record<string, unknown>),
    );
    for (const phaseId of wfPhases) {
      if (!responseIds.has(phaseId)) {
        throw new GuidanceError(
          "configuration_invalid",
          `adopt source: responses missing phase ${phaseId}`,
          { recoverable: true },
        );
      }
    }
    responsesOverride = renderAdoptedResponses(
      refResponses,
      {
        shell,
        transport,
        enabledServers: new Set<string>([
          "clearthought",
          ...(gitnexus ? ["gitnexus"] : []),
          ...(insight ? ["insight"] : []),
        ]),
        projectName: name,
      },
      // FR-995: wisdom sources must render completely; mounted fallback
      // responses.json keeps the lenient 012 behavior.
      { strictLeftovers: responsesSource.endsWith("responses-wisdom.json") },
    );
    // FR-981 (specs/012): adopt the reference responses (process wisdom)
    // instead of regenerating generic ones. Only the instructions.global
    // slot is swapped to the target's shell answer; an empty shell answer
    // removes the slot. Note: the workflow swap above behaves differently
    // on empty shell (it keeps the reference instructions) — that is the
    // established 011 mounted-adopt behavior and intentionally untouched.
    adoptionBlock = {
      // AC-3 (specs/011): audit block names the template, not the path;
      // resolvedPath (builtin only) keeps the actual location auditable.
      source: isBuiltin ? "builtin" : referencePath,
      ...(isBuiltin ? { resolvedPath: resolvedReference } : {}),
      strategy: "adopt",
      date: new Date().toISOString(),
      nonGenericOps,
      adaptedOps,
      // TMPL-3: machine-readable divergence list (mirrors the REGENERATED
      // note) — preset ops whose reference args differed from fresh
      // generation; they were regenerated regardless.
      divergentOps,
      shellSource: "answer",
    };
    // AD-1 (specs/009 follow-up): non-generic reference ops are COPIED into the
    // regenerated operations.json (marked in description) instead of being
    // discarded — otherwise the copied workflow.json can reference ops the
    // coherence check below would reject (configuration_invalid).
    nonGenericRefOps = refOpsMap;
  }
  // specs/014 + WIZ-1: the repo process config never carries the workspaces
  // registry itself — registration data flows through registryNotes (merge
  // snippet for the AGENT to apply to the instance's guidance.json).
  const notes: string[] = [
    remote
      ? "Remote mode (specs/014): register this repo config via init_session (key + Bearer; idempotent per config hash) — do not rely on the instance registry for process config."
      : "Workspace mode (specs/014): this process config lives in THIS repo's .guidance/ — the instance root only carries the workspaces[] registry (merge snippet below when registerWorkspace=yes).",
    ...registryNotes,
  ];
  if (adopt && divergentOps.length > 0) {
    notes.push(
      "adopt: preset operations with divergent reference invocation details were REGENERATED " +
        "from the target-fresh template (reference args discarded): " +
        divergentOps.join(", ") +
        ". Review if the reference args were intentional.",
    );
  }
  if (adopt) {
    notes.push(
      "adopt: based on reference " +
        (adoptionBlock ? String(adoptionBlock.source) : "") +
        " — non-generic operations copied from the reference with [adopted] markers: " +
        (nonGenericOps.join(", ") || "(none)") +
        ". Review their args/paths before use.",
    );
  }
  const guidance = {
    version: 2,
    project: { name },
    workflow: { file: "workflow.json" },
    responses: { file: "responses.json" },
    operations: { file: "operations.json" },
    downstreamServers: { file: "downstream-servers.json" },
    policies: { file: "policies.json" },
    state: { directory: "state", persistAfterEveryOperation: true },
    orchestration: {
      defaultTimeoutSeconds: 120,
      defaultRetryCount: 0,
      maximumConcurrentOperations: 4,
      failClosedForRequiredOperations: true,
    },
    security: {
      allowAgentDefinedServers: false,
      allowAgentDefinedOperations: false,
      allowAgentProvidedCommands: false,
      restrictWorkingDirectory: true,
      redactSensitiveOutput: true,
    },
    ...(adoptionBlock ? { adoption: adoptionBlock } : {}),
  };
  const files: GeneratedFile[] = [
    {
      path: "guidance.json",
      content: JSON.stringify(guidance, null, 2) + "\n",
    },
    {
      path: "workflow.json",
      content: workflowOverride ?? buildWorkflow(gates, gitnexus, insight),
    },
    {
      path: "responses.json",
      content: responsesOverride ?? buildResponses(""),
    },
    {
      path: "operations.json",
      content: buildOperations(
        String(answers.packageManager ?? "npm"),
        gates,
        gitnexus,
        insight,
        name,
        transport,
      ),
    },
    {
      path: "downstream-servers.json",
      content:
        downstreamOverride ?? buildDownstream(insight, gitnexus, transport),
    },
    {
      path: "policies.json",
      content: policiesOverride ?? buildPolicies(transport),
    },
  ];
  // WIZ-3: the former spec-kit profile file emission is gone — integrations
  // live in guidance.json (integrations.specKit) or profiles/spec-kit.json
  // when a repo opts into deeper spec-kit configuration.
  // F-01 (specs/011 final review): route through resolveBuiltinReferencePath()
  // so GUIDANCE_BUILTIN_TEMPLATE_DIR also governs embedded schemas — not just
  // the adopt reference.
  const schemasDir = join(resolveBuiltinReferencePath(), "schemas");
  const schemaFiles = [
    "understand",
    "plan",
    "review-plan",
    "implement",
    "review-implementation",
    "verify",
    "complete",
  ];
  let schemasEmbedded = true;
  for (const s of schemaFiles) {
    try {
      files.push({
        path: `schemas/${s}.schema.json`,
        content: readFileSync(join(schemasDir, `${s}.schema.json`), "utf8"),
      });
    } catch {
      schemasEmbedded = false;
      break;
    }
  }
  if (!schemasEmbedded) {
    notes.push(
      `Schemas could not be read from ${schemasDir.replace(/\\/g, "/")} — copy them manually from examples/default-guidance/schemas of the guidance package.`,
    );
  }
  notes.push(
    "After writing the files, restart the Guidance server or start a new session: the configuration is snapshotted per session (configurationVersion).",
  );
  if (transport === "http-docker") {
    notes.push(
      "http-docker: downstream URLs use host.docker.internal — ensure those servers are reachable from the container (allowlist already generated).",
    );
  }
  // Container-only self-containment (specs/011 follow-up): the generated
  // config must not reference files outside the TARGET repo. The gate ops
  // need helper scripts — embed them into .guidance/scripts/ at generation
  // time (fail-closed: the scripts ship with the guidance package).
  const embeddedScripts: [string, string][] = [
    [
      ".guidance/scripts/check-final-review.mjs",
      join(PKG_ROOT, "scripts", "check-final-review.mjs"),
    ],
    [
      ".guidance/scripts/seed-lessons.mjs",
      join(PKG_ROOT, "scripts", "embedded", "seed-lessons.mjs"),
    ],
    [
      ".guidance/scripts/check-spec-drift.mjs",
      join(PKG_ROOT, "scripts", "embedded", "check-spec-drift.mjs"),
    ],
  ];
  for (const [relPath, absPath] of embeddedScripts) {
    let content: string;
    try {
      content = readFileSync(absPath, "utf8");
    } catch {
      throw new GuidanceError(
        "configuration_invalid",
        `embedded gate script missing from the guidance package: ${absPath.replace(/\\/g, "/")}`,
        { recoverable: false },
      );
    }
    files.push({ path: relPath, content });
  }
  if (adopt && nonGenericRefOps) {
    // Mounted references authored before the self-containment rule may copy
    // ops pointing at guidance-package paths — surface them loudly.
    const copied = JSON.stringify(nonGenericRefOps);
    if (/servers\/(server-guidance|server-insight)\//.test(copied)) {
      notes.push(
        "WARNING: copied reference operations still reference scripts inside the guidance package (servers/server-guidance or servers/server-insight). Container-only deployments require self-contained configs — rewrite those args to .guidance/scripts/ (embedded copies are generated) or drop the ops.",
      );
    }
  }
  // AD-1 (specs/009 follow-up): merge non-generic reference ops into the
  // regenerated operations.json, marked in their description — the copied
  // workflow.json may reference them and the coherence check below stays strict.
  if (adopt && nonGenericOps.length > 0) {
    const opsFile = files.find((f) => f.path === "operations.json");
    if (opsFile) {
      const ops = JSON.parse(opsFile.content) as {
        operations: Record<string, Record<string, unknown>>;
      };
      for (const opId of nonGenericOps) {
        const refOp = nonGenericRefOps[opId];
        if (!refOp) continue;
        if (typeof refOp.type !== "string" || refOp.type === "") {
          throw new GuidanceError(
            "configuration_invalid",
            `adopt source: reference op ${opId} has no valid type — cannot copy fail-closed`,
            { recoverable: true },
          );
        }
        const desc =
          typeof refOp.description === "string" ? refOp.description : "";
        ops.operations[opId] = {
          ...refOp,
          description: desc
            ? desc + " [adopted from reference — review args/paths]"
            : "[adopted from reference — review args/paths]",
        };
      }
      opsFile.content = JSON.stringify(ops, null, 2) + "\n";
    }
  }
  // specs/009 FR-901 Post-Adopt-Kohärenz (N-2): jede im kopierten workflow.json
  // referenzierte Op muss in der regenerierten operations.json existieren.
  if (adopt && workflowOverride) {
    const wfFinal = JSON.parse(workflowOverride) as {
      phases?: Record<string, { lifecycle?: { beforeExit?: string[] } }>;
    };
    const opsFile = files.find((f) => f.path === "operations.json");
    const availableOps = new Set(
      Object.keys(
        opsFile
          ? ((
              JSON.parse(opsFile.content) as {
                operations?: Record<string, unknown>;
              }
            ).operations ?? {})
          : [],
      ),
    );
    for (const ph of Object.values(wfFinal.phases ?? {})) {
      for (const op of ph.lifecycle?.beforeExit ?? []) {
        if (!availableOps.has(op)) {
          throw new GuidanceError(
            "configuration_invalid",
            `adopt coherence: workflow references unknown op ${op}`,
            { recoverable: true },
          );
        }
      }
    }
  }
  return { files, notes };
}

/**
 * FR-993 (specs/013): render the wisdom baseline onto the target repo.
 * Replaces transport-dependent URL/project tokens, renders {{#server:NAME}}
 * conditional blocks only for enabled downstream servers, sets/removes the
 * instructions.global slot (FR-981 semantics), and fails closed on unknown
 * leftover {{tokens}}.
 */
export function renderAdoptedResponses(
  wisdom: Record<string, unknown>,
  target: {
    shell: string;
    transport: string;
    enabledServers: Set<string>;
    projectName: string;
  },
  opts?: { strictLeftovers?: boolean },
): string {
  const tokens: Record<string, string> = {
    CLEARTHOUGHT_URL: clearthoughtUrl(target.transport),
    INSIGHT_URL: insightUrl(target.transport),
    GITNEXUS_URL: gitnexusUrl(target.transport),
    PROJECT_NAME: target.projectName,
  };
  const renderText = (text: string): string => {
    let out = text.replace(
      /\{\{#server:([a-z-]+)\}\}([\s\S]*?)\{\{\/server:\1\}\}/g,
      (_m, name: string, body: string) =>
        target.enabledServers.has(name) ? body : "",
    );
    out = out.replace(/\{\{([A-Z_]+)\}\}/g, (m, token: string) => {
      if (!(token in tokens)) {
        // Lenient fallback responses.json keeps 012 pass-through behavior;
        // wisdom sources fail closed (strictLeftovers catch below too).
        if (!opts?.strictLeftovers) return m;
        throw new GuidanceError(
          "configuration_invalid",
          `adopt source: unknown responses placeholder {{${token}}}`,
          { recoverable: true },
        );
      }
      return tokens[token] as string;
    });
    if (/\{\{[#/]/.test(out)) {
      throw new GuidanceError(
        "configuration_invalid",
        "adopt source: unbalanced server-conditional block in responses",
        { recoverable: true },
      );
    }
    // FR-995 (specs/013): wisdom sources must render completely — any
    // leftover {{...}} (wrong case, typos, spaces, unknown tokens) fails
    // closed instead of silently reaching the target config. Mounted
    // fallback responses.json stays lenient (012 pass-through behavior).
    if (opts?.strictLeftovers && /\{\{/.test(out)) {
      throw new GuidanceError(
        "configuration_invalid",
        `adopt source: unrendered placeholder in wisdom responses: ${out.match(/\{\{[^}]*\}\}/)?.[0]}`,
        { recoverable: true },
      );
    }
    return out;
  };
  const renderValue = (value: unknown): unknown => {
    if (typeof value === "string") return renderText(value);
    if (Array.isArray(value)) return value.map(renderValue);
    if (value !== null && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([k, v]) => [
          k,
          renderValue(v),
        ]),
      );
    }
    return value;
  };
  const rendered = renderValue(wisdom) as Record<string, unknown>;
  // GDS-5/FR-981: merge with an existing wisdom instructions.global slot
  // instead of replacing it (keeps template-embedded rules on adopt).
  const existingGlobal = (
    rendered["instructions"] as { global?: string } | undefined
  )?.global;
  if (target.shell || existingGlobal) {
    rendered["instructions"] = {
      global: [existingGlobal, target.shell].filter(Boolean).join("\n"),
    };
  } else delete rendered["instructions"];
  return JSON.stringify(rendered, null, 2);
}

/**
 * specs/008 FR-902 (adopt flow, N-6): fail-closed validation of the adopt
 * reference configuration. Checks presence + JSON-parseability of every file
 * the adopt flow needs, plus readability of the reference profile file
 * (FR-908). Throws GuidanceError("configuration_invalid") with the
 * `adopt source: missing/unreadable file <name>` pattern.
 */
export function resolveBuiltinReferencePath(): string {
  // FR-971 (specs/011): deployments can point the builtin template elsewhere
  // via this env var (e.g. a mounted, deployment-specific template volume).
  const override = process.env.GUIDANCE_BUILTIN_TEMPLATE_DIR;
  if (override && override.trim() !== "") return override.trim();
  return join(PKG_ROOT, "examples", "default-guidance");
}

export function validateAdoptReference(referenceDir: string): void {
  // FR-971 (specs/011): the named reference "builtin" resolves to the
  // template shipped with the guidance package (fail-closed, FR-973).
  const dir =
    referenceDir === "builtin" ? resolveBuiltinReferencePath() : referenceDir;
  const requiredFiles = [
    "guidance.json",
    "workflow.json",
    "responses.json",
    "policies.json",
    "operations.json",
    "downstream-servers.json",
  ];
  for (const f of requiredFiles) {
    const p = join(dir, f);
    if (!existsSync(p)) {
      throw new GuidanceError(
        "configuration_invalid",
        `adopt source: missing/unreadable file ${f} (reference dir: ${dir})`,
        { recoverable: true },
      );
    }
    try {
      JSON.parse(readFileSync(p, "utf-8"));
    } catch {
      throw new GuidanceError(
        "configuration_invalid",
        `adopt source: unreadable file ${f} (reference dir: ${dir})`,
        { recoverable: true },
      );
    }
  }
  const schemasDir = join(dir, "schemas");
  if (!existsSync(schemasDir)) {
    throw new GuidanceError(
      "configuration_invalid",
      `adopt source: missing/unreadable file schemas/ (reference dir: ${dir})`,
      { recoverable: true },
    );
  }
  // FR-908: the reference profile file must be readable when a non-plain
  // profile is declared — the adopted workflow may depend on its gates.
  let guidance: Record<string, unknown>;
  try {
    guidance = JSON.parse(
      readFileSync(join(dir, "guidance.json"), "utf-8"),
    ) as Record<string, unknown>;
  } catch {
    throw new GuidanceError(
      "configuration_invalid",
      "adopt source: unreadable file guidance.json",
      { recoverable: true },
    );
  }
  const profile = guidance["profile"];
  if (typeof profile === "string" && profile !== "plain") {
    const profileFile = join(dir, "profiles", `${profile}.json`);
    if (!existsSync(profileFile)) {
      throw new GuidanceError(
        "configuration_invalid",
        `adopt source: missing/unreadable file profiles/${profile}.json (FR-908)`,
        { recoverable: true },
      );
    }
  }
  // FR-982 (specs/012) + FR-994 (specs/013): responses-adoption requires
  // phase coverage on the file actually adopted — responses-wisdom.json when
  // present, otherwise responses.json.
  const responsesFile = existsSync(join(dir, "responses-wisdom.json"))
    ? join(dir, "responses-wisdom.json")
    : join(dir, "responses.json");
  const workflow = JSON.parse(
    readFileSync(join(dir, "workflow.json"), "utf-8"),
  ) as { phases?: Record<string, unknown> };
  const responses = JSON.parse(readFileSync(responsesFile, "utf-8")) as {
    responses?: Record<string, unknown>;
  };
  const responseIds = new Set(Object.keys(responses.responses ?? {}));
  for (const phaseId of Object.keys(workflow.phases ?? {})) {
    if (!responseIds.has(phaseId)) {
      throw new GuidanceError(
        "configuration_invalid",
        `adopt source: responses missing phase ${phaseId}`,
        { recoverable: true },
      );
    }
  }
}
