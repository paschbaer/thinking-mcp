/**
 * Option D (Review-Follow-up "missing config crash loop"): Scaffold-on-first-
 * start. Wenn .guidance/guidance.json FEHLT (nicht: invalide!), wird eine
 * minimale valide Standardkonfiguration erzeugt. Fail-closed bleibt erhalten:
 * existierende Dateien werden NIE überschrieben; invalide Config wirft weiter-
 * hin. Opt-out: GUIDANCE_SCAFFOLD=off.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const PHASES = [
  "understand",
  "plan",
  "review_plan",
  "implement",
  "review_implementation",
  "verify",
  "complete",
] as const;

type PhaseName = (typeof PHASES)[number];

const TRANSITION_TO: Record<Exclude<PhaseName, "complete">, PhaseName> = {
  understand: "plan",
  plan: "review_plan",
  review_plan: "implement",
  implement: "review_implementation",
  review_implementation: "verify",
  verify: "complete",
};

export interface ScaffoldResult {
  scaffolded: boolean;
  createdFiles: string[];
}

function fileIfMissing(root: string, rel: string, content: string, created: string[]): void {
  const target = join(root, rel);
  // "wx": atomar exklusiv — existiert die Datei zwischen Check und Write
  // (TOCTOU), schlägt der Write fehl statt zu überschreiben (NEVER overwrite).
  try {
    mkdirSync(join(target, ".."), { recursive: true });
    writeFileSync(target, content, { flag: "wx" });
    created.push(rel);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
  }
}

/** Kleiner gemergter Submission-Schema-Generator (summary + Listenfelder). */
function schemaFor(phase: PhaseName): string {
  const extras: Record<string, string> = {
    understand: `,\n    "assumptions": { "type": "array", "items": { "type": "string" } },\n    "acceptanceCriteria": { "type": "array", "items": { "type": "string" } }`,
    plan: `,\n    "tasks": { "type": "array", "items": { "type": "object", "additionalProperties": true } }`,
    review_plan: `,\n    "approvedPlan": { "type": "object", "additionalProperties": true },\n    "findings": { "type": "array", "items": { "type": "object", "additionalProperties": true } }`,
    implement: `,\n    "implementedTasks": { "type": "array", "items": { "type": "string" } },\n    "changedFiles": { "type": "array", "items": { "type": "string" } }`,
    review_implementation: `,\n    "findings": { "type": "array", "items": { "type": "object", "additionalProperties": true } },\n    "filesChangedDuringReview": { "type": "array", "items": { "type": "string" } }`,
    verify: `,\n    "verificationSummary": { "type": "array", "items": { "type": "string" } }`,
    complete: `,\n    "changedFiles": { "type": "array", "items": { "type": "string" } },\n    "verificationSummary": { "type": "array", "items": { "type": "string" } }`,
  };
  return JSON.stringify(
    JSON.parse(`{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "additionalProperties": false,
  "required": ["summary"],
  "properties": { "summary": { "type": "string" }${extras[phase] ?? ""} }
}`),
    null,
    2,
  ) + "\n";
}

function phaseResponse(phase: PhaseName): string {
  const titles: Record<PhaseName, string> = {
    understand: "Understand the Request",
    plan: "Create the Implementation Plan",
    review_plan: "Review and Adjust the Plan",
    implement: "Implement the Approved Plan",
    review_implementation: "Review and Fix the Implementation",
    verify: "Verify the Result",
    complete: "Complete the Workflow",
  };
  return JSON.stringify(
    {
      version: 2,
      responses: Object.fromEntries(
        PHASES.map((p) => [p, { title: titles[p], instruction: `Phase ${p}: ${titles[p]}.`, requiredActions: [] }]),
      ),
    },
    null,
    2,
  ) + "\n";
}

/**
 * Scaffold eine minimale Standardkonfiguration, wenn guidance.json fehlt.
 * @returns was erzeugt wurde; scaffolded=false wenn guidance.json existierte.
 */
export function scaffoldIfMissing(configDir: string): ScaffoldResult {
  const entry = join(configDir, "guidance.json");
  if (existsSync(entry)) return { scaffolded: false, createdFiles: [] };

  const created: string[] = [];
  const project = "my-project";

  fileIfMissing(
    configDir,
    "guidance.json",
    JSON.stringify(
      {
        version: 2,
        profile: "plain",
        project: { name: project },
        workflow: { file: "workflow.json" },
        responses: { file: "responses.json" },
        operations: { file: "operations.json" },
        downstreamServers: { file: "downstream-servers.json" },
        policies: { file: "policies.json" },
        state: { directory: "state", persistAfterEveryOperation: true },
        security: {
          allowAgentDefinedServers: false,
          allowAgentDefinedOperations: false,
          allowAgentProvidedCommands: false,
          restrictWorkingDirectory: true,
          redactSensitiveOutput: true,
        },
      },
      null,
      2,
    ) + "\n",
    created,
  );

  fileIfMissing(
    configDir,
    "workflow.json",
    JSON.stringify(
      {
        version: 2,
        workflow: { id: "standard-development", initialPhase: "understand", terminalStates: ["completed", "cancelled"] },
        phases: Object.fromEntries(
          PHASES.map((phase) => [
            phase,
            phase === "complete"
              ? {
                  response: "complete",
                  submissionSchema: "schemas/complete.schema.json",
                  // Kein beforeEnter-Op im Scaffold: jede lifecycle-Referenz
                  // MUSS in operations.json definiert sein (sonst wirft der
                  // Engine operation_not_configured, non-recoverable).
                  transitions: [{ to: "completed", when: "submission_valid" }],
                }
              : phase === "verify"
                ? {
                    response: "verify",
                    submissionSchema: "schemas/verify.schema.json",
                    lifecycle: { beforeExit: ["lint", "test", "build"] },
                    transitions: [
                      { to: "review_implementation", reason: "verification_failed" },
                      { to: "complete", when: "required_operations_succeeded" },
                    ],
                  }
                : {
                    response: phase,
                    submissionSchema: `schemas/${phase}.schema.json`,
                    transitions: [{ to: TRANSITION_TO[phase], when: "submission_valid" }],
                  },
          ]),
        ),
        states: { completed: { terminal: true }, blocked: { system: true }, cancelled: { terminal: true } },
      },
      null,
      2,
    ) + "\n",
    created,
  );

  fileIfMissing(configDir, "responses.json", phaseResponse("understand"), created);

  fileIfMissing(
    configDir,
    "operations.json",
    JSON.stringify(
      {
        version: 2,
        operations: {
          lint: { description: "run linter", type: "process", executable: "npm", args: ["run", "lint"], required: false, timeoutSeconds: 120, validation: { exitCodeMustBeZero: true }, output: { returnToAgent: "summary_and_errors" } },
          test: { description: "run test suite", type: "process", executable: "npm", args: ["test"], required: true, timeoutSeconds: 600, validation: { exitCodeMustBeZero: true }, output: { returnToAgent: "summary_and_errors" } },
          build: { description: "build the project", type: "process", executable: "npm", args: ["run", "build"], required: true, timeoutSeconds: 300, validation: { exitCodeMustBeZero: true }, output: { returnToAgent: "summary_and_errors" } },
        },
      },
      null,
      2,
    ) + "\n",
    created,
  );

  fileIfMissing(
    configDir,
    "downstream-servers.json",
    JSON.stringify({ version: 2, servers: {} }, null, 2) + "\n",
    created,
  );

  fileIfMissing(
    configDir,
    "policies.json",
    JSON.stringify(
      {
        version: 2,
        trustLevels: {
          untrusted: { dataEgress: "none" },
          restricted: { dataEgress: "validated_inputs_only" },
          trusted: { dataEgress: "project_data" },
          privileged: { dataEgress: "project_data_with_approval" },
        },
        validation: {
          requireAcceptanceCriteria: false,
          requireUniqueTaskIds: true,
          rejectUnknownDependencies: true,
          rejectDependencyCycles: true,
          rejectEmptyArtifacts: true,
        },
        reviewFindings: { blockingSeverities: ["high", "critical"] },
        redaction: { patterns: ["\\bapi[_-]?key\\b", "\\btoken\\b", "\\bsecret\\b", "\\bpassword\\b"] },
        outputDefaults: { returnToAgent: "summary_and_errors", maxExcerptBytes: 65536, maxArtifactBytes: 1048576, maximumTasks: 500, maximumEntities: 2000 },
      },
      null,
      2,
    ) + "\n",
    created,
  );

  for (const phase of PHASES) {
    fileIfMissing(configDir, join("schemas", `${phase}.schema.json`), schemaFor(phase), created);
  }

  return { scaffolded: true, createdFiles: created };
}

/** Liest eine Datei relativ zum eigenen Modul (für eingebettete Templates). */
export function readTemplate(rel: string): string | undefined {
  const p = join(import.meta.dirname, rel);
  return existsSync(p) ? readFileSync(p, "utf-8") : undefined;
}
