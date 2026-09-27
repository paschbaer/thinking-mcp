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
import { dirname, join, resolve } from "node:path";
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

const PKG_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

const QUESTIONS: SetupQuestion[] = [
  {
    id: "configSource",
    question: "Adopt the proven reference configuration or create a fresh one?",
    help: "adopt = workflow/policies/schemas are taken from the reference config (profile locked to the reference); generic operations are regenerated from your answers below. fresh = everything is generated from your answers only.",
    options: ["fresh", "adopt"],
    required: true,
    default: "fresh",
  },
  {
    id: "projectName",
    question: "What is the project name (used as project.name and in gate descriptions)?",
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
    question: "Adopt: path to the reference .guidance/ directory (container path, e.g. /workspace/.guidance)?",
    help: "Required when configSource=adopt. Validated fail-closed (all files present + parseable). Adopt locks profile/insight/gitnexus/gates to the reference.",
    required: false,
  },
  {
    id: "profile",
    question: "Which profile: plain or spec-kit?",
    help: "plain = standard development flow. spec-kit additionally registers the 12 Spec-Kit tools (the wizard does not interview for spec-kit specifics in v1).",
    options: ["plain", "spec-kit"],
    required: true,
    default: "plain",
  },
  {
    id: "shell",
    question: "Terminal shell the agent should use (optional, agent-facing only)?",
    help: "Free text, e.g. 'wsl.exe -e bash'. Embedded as a setup sentence in the understand instruction. Leave empty for none. NOTE: FR-904 — the answer is placed in workflow.json instructions.global and injected into EVERY phase instruction.",
    required: false,
    default: "",
  },
  {
    id: "insight",
    question: "Enable the Insight downstream (insight queries + capture-session-lessons gate)?",
    help: "yes = insight ops and the blocking capture gate are generated. no = those operations are omitted.",
    options: ["yes", "no"],
    required: true,
    default: "yes",
  },
  {
    id: "gitnexus",
    question: "Enable the GitNexus downstream (blocking repository-analysis gate)?",
    help: "yes = repository-analysis gate (MCP check + CLI fallback) and downstream entry are generated.",
    options: ["yes", "no"],
    required: true,
    default: "yes",
  },
  {
    id: "gates",
    question: "Gate preset: standard (lint opt + test opt + build REQ) or minimal (build REQ only)?",
    help: "standard matches this repository's own working sample. minimal suits fresh projects without a test/lint setup.",
    options: ["standard", "minimal"],
    required: true,
    default: "standard",
  },
];

function isAnswered(q: SetupQuestion, answers: SetupAnswers): boolean {
  const v = answers[q.id];
  return v !== undefined && v !== "";
}

/** Returns the first unanswered required question, or null when complete. */
export function nextQuestion(answers: SetupAnswers): SetupQuestion | null {
  for (const q of QUESTIONS) {
    if (q.required && !isAnswered(q, answers)) return q;
  }
  return null;
}

export function catalogOverview(answers: SetupAnswers): {
  done: boolean;
  nextQuestion: SetupQuestion | null;
  questions: SetupQuestion[];
  received: SetupAnswers;
  nextTool: string;
} {
  const next = nextQuestion(answers);
  return {
    done: next === null,
    nextQuestion: next,
    questions: QUESTIONS,
    received: answers,
    nextTool: next === null ? "setup_guidance_generate" : "setup_guidance_answer",
  };
}

function requireCompleted(answers: SetupAnswers): void {
  // FR-908/FR-901: in adopt mode these answers are derived from the reference
  // configuration (profile/insight/gitnexus/gates) and are NOT required.
  const derivedInAdopt = new Set(["profile", "insight", "gitnexus", "gates"]);
  const adopt = answers.configSource === "adopt";
  const missing = QUESTIONS.filter((q) => q.required && !isAnswered(q, answers) && !(adopt && derivedInAdopt.has(q.id))).map((q) => q.id);
  if (missing.length > 0) {
    throw new GuidanceError("configuration_invalid", `setup answers incomplete, missing: ${missing.join(", ")}`, { recoverable: true });
  }
}

function insightUrl(transport: string): string {
  return transport === "http-docker" ? "http://host.docker.internal:3002/mcp" : "http://localhost:3002/mcp";
}

function gitnexusUrl(transport: string): string {
  return transport === "http-docker" ? "http://host.docker.internal:4747/api/mcp" : "http://localhost:4747/api/mcp";
}

function emmsUrl(transport: string): string {
  return transport === "http-docker" ? "http://host.docker.internal:3002/mcp" : "http://localhost:3002/mcp";
}

function buildPolicies(transport: string): string {
  const hosts = transport === "http-docker" ? ["host.docker.internal:3002", "host.docker.internal:4747"] : ["localhost:3002", "localhost:4747"];
  const policies = {
    version: 2,
    egress: { httpHostAllowlist: hosts },
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
      patterns: ["\\bapi[_-]?key\\b", "\\btoken\\b", "\\bsecret\\b", "\\bpassword\\b", "\\bauthorization\\b"],
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

function buildWorkflow(gates: string, gitnexus: boolean, insight: boolean): string {
  const verifyGates = gates === "standard" ? ["lint", "test", "build"] : ["build"];
  const completeGates: string[] = [];
  if (gitnexus) completeGates.push("repository-analysis");
  if (insight) completeGates.push("capture-session-lessons");
  const workflow = {
    version: 2,
    workflow: {
      id: "standard-development",
      profile: "plain",
      initialPhase: "understand",
      terminalStates: ["completed", "cancelled"],
    },
    phases: {
      understand: {
        response: "understand",
        submissionSchema: "schemas/understand.schema.json",
        transitions: [{ to: "plan", when: "submission_valid" }],
        lifecycle: insight ? { afterEnter: ["query-project-insights"] } : undefined,
      },
      plan: {
        response: "plan",
        submissionSchema: "schemas/plan.schema.json",
        transitions: [{ to: "review_and_adjust_plan", when: "submission_valid" }],
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
          { to: "review_and_fix_implementation", reason: "verification_failed" },
          { to: "complete", when: "required_operations_succeeded" },
        ],
      },
      complete: {
        response: "complete",
        submissionSchema: "schemas/complete.schema.json",
        lifecycle: { beforeExit: completeGates },
        transitions: [{ to: "completed", when: "required_operations_succeeded" }],
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

function buildResponses(shell: string): string {
  const shellSentence = shell ? ` Set up your terminal shell first: run all commands through ${shell}.` : "";
  const responses = {
    understand: {
      title: "Understand the Request",
      instruction:
        "Analyze the development request before proposing an implementation, using the Clear-Thought tools: run at least one sequential_thinking pass to structure the analysis and reference its conclusions in the submission. Provide a concise summary, assumptions, open questions, constraints, risks, measurable acceptance criteria, and affected areas. Do not create an implementation plan yet."
        + shellSentence
        + questionsSentence("openQuestions"),
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
        "Create a concrete implementation plan with stable task identifiers, affected files, dependencies, planned tests, and verification, using the Clear-Thought tools: decompose and prioritize via sequential_thinking (and decision_framework when weighing alternatives), and reference the reasoning results in the submission. Do not start implementation yet."
        + questionsSentence("openQuestions"),
      requiredActions: [
        "Run at least one Clear-Thought sequential_thinking or decision_framework pass for decomposition/prioritization and reference its results in the plan submission.",
      ],
    },
    review_and_adjust_plan: {
      title: "Review and Adjust the Plan",
      instruction:
        "Review the plan critically from architecture, correctness, maintainability, testability, security, backward-compatibility, performance, and operational perspectives, using the Clear-Thought tools: stress-test the plan's assumptions with assumption_xray, socratic_method, or argument_map, and reference the reasoning results in the findings. Submit the complete adjusted plan."
        + questionsSentence("remainingConcerns"),
      requiredActions: [
        "Run at least one Clear-Thought stress-test pass (assumption_xray, socratic_method, or argument_map) and reference its results in the findings.",
      ],
    },
    implement: {
      title: "Implement the Approved Plan",
      instruction:
        "Implement the approved plan. Follow the approved task identifiers, avoid unrelated changes, and report all changed, created, and deleted files plus deviations. FIRST step: verify you are on the branch you expect (git status), then create a feature branch (feature/<meaningful-name>). LAST step: update the documentation (README.md) and the memory-bank files."
        + questionsSentence("unresolvedIssues"),
      requiredActions: [],
    },
    review_and_fix_implementation: {
      title: "Review and Fix the Implementation",
      instruction:
        "Review the implementation for correctness, edge cases, error handling, security, maintainability, duplication, dead code, performance, compatibility, test coverage, and plan conformity. Apply fixes before submitting, using the Clear-Thought tools: run metacognitive_monitoring as a final confidence check before submitting, and debugging_approach for non-trivial findings — reference the results in the findings."
        + questionsSentence("unresolvedFindings"),
      requiredActions: [
        "Run Clear-Thought metacognitive_monitoring as a final confidence check before submitting; when findings are non-trivial, additionally apply debugging_approach and reference its results in the findings.",
      ],
    },
    verify: {
      title: "Verify the Implementation",
      instruction: "Guidance will execute the configured verification operations. Analyze failures and return to implementation review when code changes are required. Do not claim success while a mandatory operation is failing.",
      requiredActions: [],
    },
    complete: {
      title: "Complete the Workflow",
      instruction:
        "Produce the final completion report: summary, changed files, verification results, known limitations, remaining risks, deviations, deferred work, and next steps. BEFORE submitting the completion report: (1) refresh the GitNexus index host-side by running gitnexus analyze --no-stats in the terminal (the gate only verifies index availability, not freshness) and note the refresh in the report; (2) review this session for recurring bugs, traps, and validated fixes and write them to the lessons file (see capture-session-lessons contract)."
        + questionsSentence("deferredWork/nextSteps"),
      requiredActions: [],
    },
  };
  return JSON.stringify({ version: 2, responses }, null, 2) + "\n";
}

function buildOperations(gates: string, gitnexus: boolean, insight: boolean, projectName: string, transport: string): string {
  const proc = (description: string, executable: string, args: string[], required: boolean, timeout: number, risk: string) => ({
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
    build: proc("Build the project.", "npm", ["run", "build"], true, 600, "workspace_write"),
  };
  if (gates === "standard") {
    operations.lint = proc(
      "Check formatting with Prettier.",
      "npx",
      ["prettier", "--check", "servers/*/src/**/*.{ts,tsx}"],
      false,
      300,
      "read_only",
    );
    operations.test = proc("Run the automated test suite.", "npm", ["test"], false, 900, "read_only");
  }
  if (gitnexus) {
    operations["repository-analysis"] = {
      description: "Verify the GitNexus index for this repo is present and queryable (HTTP mode: mcpTool check; stdio mode: local CLI refresh). The index REFRESH itself stays a host-side pre-complete step: the HTTP server exposes no analyze tool.",
      type: "composite",
      strategy: "firstAvailable",
      required: true,
      timeoutSeconds: 900,
      riskClass: "read_only",
      steps: [
        { type: "mcpTool", server: "gitnexus", capability: "check", arguments: { mode: "fixed", value: { repo: projectName } } },
        { type: "process", executable: "gitnexus", args: ["analyze", "--no-stats"] },
      ],
      validation: { protocolRequestMustSucceed: true, toolResultMustNotBeError: true, requiredContent: true },
      output: { returnToAgent: "summary_and_errors", retainRawResult: true },
      failure: { remainInPhase: true, allowManualRetry: true, reportToAgent: true },
    };
  }
  if (insight) {
    operations["query-project-insights"] = {
      description: "Retrieve existing development insights (experience_search).",
      type: "mcpTool",
      server: "insight",
      capability: "experience_search",
      required: false,
      timeoutSeconds: 60,
      riskClass: "read_only",
      arguments: { mode: "template", value: { query: "${session.request}", scope_id: projectName } },
      validation: { protocolRequestMustSucceed: true, toolResultMustNotBeError: true },
      output: { returnToAgent: "normalized", retainRawResult: false },
    };
    operations["capture-session-lessons"] = {
      description: "Seed validated session lessons. The agent writes .guidance/state/session-lessons.json BEFORE calling complete_workflow ([{slug, observation, cause, fix}]; empty array = no-op success; redact secrets — the script bypasses Guidance pattern redaction). Idempotent per slug.",
      type: "process",
      executable: "sh",
      args: ["-c", `EMMS_HTTP_URL=${emmsUrl(transport)} EMMS_LESSON_SCOPE=thinking-mcp-lessons node servers/server-insight/scripts/seed-lessons.mjs .guidance/state/session-lessons.json`],
      required: false,
      timeoutSeconds: 120,
      riskClass: "external_write",
      validation: { protocolRequestMustSucceed: true, exitCodeMustBeZero: true },
      output: { returnToAgent: "summary_and_errors", retainRawResult: true },
      failure: { remainInPhase: true, allowManualRetry: true, reportToAgent: true },
    };
  }
  return JSON.stringify({ version: 2, operations }, null, 2) + "\n";
}

function buildDownstream(insight: boolean, gitnexus: boolean, transport: string): string {
  const conn = (timeout: number) => ({
    startupTimeoutSeconds: 30,
    requestTimeoutSeconds: timeout,
    reconnect: { enabled: true, maximumAttempts: 2, delayMilliseconds: 1000 },
  });
  const servers: Record<string, unknown> = {};
  if (gitnexus) {
    servers.gitnexus = {
      displayName: "GitNexus",
      enabled: true,
      required: true,
      trustLevel: "trusted",
      transport: { type: "http", http: { url: gitnexusUrl(transport) } },
      capabilities: { allow: { tools: ["check", "query", "detect_changes", "list_repos"], resources: [], prompts: [] } },
      connection: conn(300),
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
        allow: { tools: ["experience_search", "experience_record_observation"], resources: ["insight://project/*"], prompts: [] },
      },
      connection: conn(120),
    };
  }
  return JSON.stringify({ version: 2, servers }, null, 2) + "\n";
}

/** Generates the complete `.guidance/` file set for the collected answers. */
export function generateFiles(answers: SetupAnswers): { files: GeneratedFile[]; notes: string[] } {
  requireCompleted(answers);
  const name = String(answers.projectName);
  const transport = String(answers.transport);
  const configSource = String(answers.configSource ?? "fresh");
  const adopt = configSource === "adopt";
  const referencePath = answers.referencePath !== undefined && answers.referencePath !== "" ? String(answers.referencePath) : undefined;
  let profile = String(answers.profile ?? "plain");
  const shell = String(answers.shell ?? "");
  let insight = answers.insight === "yes" || answers.insight === true;
  let gitnexus = answers.gitnexus === "yes" || answers.gitnexus === true;
  let gates = String(answers.gates ?? "standard");

  const nonGenericOps: string[] = [];
  const adaptedOps: string[] = [];
  let workflowOverride: string | undefined;
  let policiesOverride: string | undefined;
  let downstreamOverride: string | undefined;
  let adoptionBlock: Record<string, unknown> | undefined;
  if (adopt) {
    if (!referencePath) {
      throw new GuidanceError("configuration_invalid", "adopt requires referencePath (path to the reference .guidance directory)", { recoverable: true });
    }
    validateAdoptReference(referencePath);
    const refGuidance = JSON.parse(readFileSync(join(referencePath, "guidance.json"), "utf8")) as Record<string, unknown>;
    profile = typeof refGuidance.profile === "string" ? refGuidance.profile : "plain";
    const refOps = JSON.parse(readFileSync(join(referencePath, "operations.json"), "utf8")) as { operations?: Record<string, Record<string, unknown>> };
    const refOpsMap = refOps.operations ?? {};
    const genericPreset = new Set(["lint", "test", "build", "repository-analysis", "query-project-insights", "capture-session-lessons"]);
    for (const [opId, op] of Object.entries(refOpsMap)) {
      const argsText = JSON.stringify((op as { args?: unknown }).args ?? "");
      if (!genericPreset.has(opId) || argsText.includes('"repo"')) nonGenericOps.push(opId);
      else adaptedOps.push(opId);
    }
    insight = "capture-session-lessons" in refOpsMap;
    gitnexus = "repository-analysis" in refOpsMap;
    gates = "lint" in refOpsMap && "test" in refOpsMap ? "standard" : "minimal";
    let wfText = readFileSync(join(referencePath, "workflow.json"), "utf8");
    if (shell) {
      const wf = JSON.parse(wfText) as Record<string, unknown>;
      wf["instructions"] = { global: shell };
      wfText = JSON.stringify(wf, null, 2);
    }
    workflowOverride = wfText;
    policiesOverride = buildPolicies(transport);
    downstreamOverride = buildDownstream(insight, gitnexus, transport);
    adoptionBlock = { source: referencePath, strategy: "adopt", date: new Date().toISOString(), nonGenericOps, adaptedOps, shellSource: "answer" };
  }
  const notes: string[] = [];
  if (adopt) {
    notes.push("adopt: based on reference " + (adoptionBlock ? String(adoptionBlock.source) : "") + " — non-generic operations NOT regenerated: " + (nonGenericOps.join(", ") || "(none)") + ". Adapt these manually.");
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
    { path: "guidance.json", content: JSON.stringify(guidance, null, 2) + "\n" },
    { path: "workflow.json", content: workflowOverride ?? buildWorkflow(gates, gitnexus, insight) },
    { path: "responses.json", content: buildResponses("") },
    { path: "operations.json", content: buildOperations(gates, gitnexus, insight, name, transport) },
    { path: "downstream-servers.json", content: downstreamOverride ?? buildDownstream(insight, gitnexus, transport) },
    { path: "policies.json", content: policiesOverride ?? buildPolicies(transport) },
  ];
  if (profile === "spec-kit") {
    files.push({ path: "profiles/spec-kit.json", content: JSON.stringify({ profile: "spec-kit" }, null, 2) + "\n" });
    notes.push("spec-kit profile: copy the integrations block and spec-kit-specific questions from examples/default-guidance/profiles — the wizard does not interview for spec-kit specifics in v1.");
  }
  const schemasDir = join(PKG_ROOT, "examples", "default-guidance", "schemas");
  const schemaFiles = ["understand", "plan", "review-plan", "implement", "review-implementation", "verify", "complete"];
  let schemasEmbedded = true;
  for (const s of schemaFiles) {
    try {
      files.push({ path: `schemas/${s}.schema.json`, content: readFileSync(join(schemasDir, `${s}.schema.json`), "utf8") });
    } catch {
      schemasEmbedded = false;
      break;
    }
  }
  if (!schemasEmbedded) {
    notes.push(`Schemas could not be read from ${schemasDir.replace(/\\/g, "/")} — copy them manually from examples/default-guidance/schemas of the guidance package.`);
  }
  notes.push("After writing the files, restart the Guidance server or start a new session: the configuration is snapshotted per session (configurationVersion).");
  if (transport === "http-docker") {
    notes.push("http-docker: downstream URLs use host.docker.internal — ensure those servers are reachable from the container (allowlist already generated).");
  }
  // specs/009 FR-901 Post-Adopt-Kohärenz (N-2): jede im kopierten workflow.json
  // referenzierte Op muss in der regenerierten operations.json existieren.
  if (adopt && workflowOverride) {
    const wfFinal = JSON.parse(workflowOverride) as {
      phases?: Record<string, { lifecycle?: { beforeExit?: string[] } }>;
    };
    const opsFile = files.find((f) => f.path === "operations.json");
    const availableOps = new Set(
      Object.keys(opsFile ? (JSON.parse(opsFile.content) as { operations?: Record<string, unknown> }).operations ?? {} : []),
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
 * specs/008 FR-902 (adopt flow, N-6): fail-closed validation of the adopt
 * reference configuration. Checks presence + JSON-parseability of every file
 * the adopt flow needs, plus readability of the reference profile file
 * (FR-908). Throws GuidanceError("configuration_invalid") with the
 * `adopt source: missing/unreadable file <name>` pattern.
 */
export function validateAdoptReference(referenceDir: string): void {
  const requiredFiles = [
    "guidance.json",
    "workflow.json",
    "policies.json",
    "operations.json",
    "downstream-servers.json",
  ];
  for (const f of requiredFiles) {
    const p = join(referenceDir, f);
    if (!existsSync(p)) {
      throw new GuidanceError(
        "configuration_invalid",
        `adopt source: missing/unreadable file ${f} (reference dir: ${referenceDir})`,
        { recoverable: true },
      );
    }
    try {
      JSON.parse(readFileSync(p, "utf-8"));
    } catch {
      throw new GuidanceError(
        "configuration_invalid",
        `adopt source: unreadable file ${f} (reference dir: ${referenceDir})`,
        { recoverable: true },
      );
    }
  }
  const schemasDir = join(referenceDir, "schemas");
  if (!existsSync(schemasDir)) {
    throw new GuidanceError(
      "configuration_invalid",
      `adopt source: missing/unreadable file schemas/ (reference dir: ${referenceDir})`,
      { recoverable: true },
    );
  }
  // FR-908: the reference profile file must be readable when a non-plain
  // profile is declared — the adopted workflow may depend on its gates.
  let guidance: Record<string, unknown>;
  try {
    guidance = JSON.parse(readFileSync(join(referenceDir, "guidance.json"), "utf-8")) as Record<string, unknown>;
  } catch {
    throw new GuidanceError("configuration_invalid", "adopt source: unreadable file guidance.json", { recoverable: true });
  }
  const profile = guidance["profile"];
  if (typeof profile === "string" && profile !== "plain") {
    const profileFile = join(referenceDir, "profiles", `${profile}.json`);
    if (!existsSync(profileFile)) {
      throw new GuidanceError(
        "configuration_invalid",
        `adopt source: missing/unreadable file profiles/${profile}.json (FR-908)`,
        { recoverable: true },
      );
    }
  }
}
