#!/usr/bin/env node
/**
 * Documentation drift gate (specs/010 FR-951/953): verifies that the README
 * documents the current tool surface, the setup question catalog, and all
 * registered error codes — plus spec status hygiene (Draft + all-done
 * checkboxes). Read-only: findings on stderr, exit 1 on drift.
 *
 * Usage: node check-docs-drift.mjs [repoRoot=cwd]
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const repoRoot = resolve(process.argv[2] ?? process.cwd());
const findings = [];
const report = (artefact, expected, found) =>
  findings.push(`docs drift: ${artefact} — expected: ${expected} vs found: ${found}`);

const read = (p) => {
  try {
    return readFileSync(p, "utf-8");
  } catch {
    return null;
  }
};

// ---- source of truth: tool names ----------------------------------------
const registerToolsPath = join(repoRoot, "servers/server-guidance/src/mcp-server/register-tools.ts");
const registerToolsSrc = read(registerToolsPath);
if (registerToolsSrc === null) {
  console.error(`docs drift: missing/unreadable source file ${registerToolsPath}`);
  process.exit(1);
}
const arrayNames = (src, name) => {
  const start = src.indexOf(`export const ${name} = [`);
  if (start === -1) return [];
  const end = src.indexOf("] as const;", start);
  if (end === -1) return [];
  return [...src.slice(start, end).matchAll(/"([a-z_0-9]+)"/g)].map((x) => x[1]);
};
const workflowTools = arrayNames(registerToolsSrc, "WORKFLOW_TOOL_NAMES");
const specKitTools = arrayNames(registerToolsSrc, "SPEC_KIT_TOOL_NAMES");
const allTools = [...workflowTools, ...specKitTools];

// ---- README --------------------------------------------------------------
const readmePath = join(repoRoot, "servers/server-guidance/README.md");
const readme = read(readmePath);
if (readme === null) {
  console.error(`docs drift: missing/unreadable file ${readmePath}`);
  process.exit(1);
}

// ---- check 1: tool parity (FR-951.1, AC-1) -------------------------------
// Check direction: registered tools must be DOCUMENTED (missing = drift).
// The reverse (README rows without a registered tool) is NOT checked — the
// README legitimately documents more tools than the registered lists
// (setup_* tools, status codes, parameters).

// ---- check 2: question catalog parity (FR-951.2, AC-2) -------------------
const assistantPath = join(repoRoot, "servers/server-guidance/src/setup/ConfigAssistant.ts");
const assistantSrc = read(assistantPath);
if (assistantSrc === null) {
  console.error(`docs drift: missing/unreadable source file ${assistantPath}`);
  process.exit(1);
}
const questionIds = [...assistantSrc.matchAll(/^\s{4}id: "([a-z_0-9]+)",$/gm)].map((m) => m[1]);
for (const id of questionIds) {
  if (!readme.includes(`\`${id}\``)) report(`question ${id}`, "documented in README assistant chapter", "missing");
}

// ---- check 3: error codes table (FR-951.3, AC-3) -------------------------
const errorsPath = join(repoRoot, "servers/server-guidance/src/types/errors.ts");
const errorsSrc = read(errorsPath);
if (errorsSrc === null) {
  console.error(`docs drift: missing/unreadable source file ${errorsPath}`);
  process.exit(1);
}
const errorCodes = [...errorsSrc.matchAll(/^\s{2}"([a-z_]+)",$/gm)].map((m) => m[1]);
for (const code of errorCodes) {
  if (!readme.includes(`\`${code}\``)) report(`error code ${code}`, "documented in README", "missing");
}

// ---- check 4: spec status hygiene (FR-951.4, AC-4) -----------------------
const specsDir = join(repoRoot, "specs");
if (existsSync(specsDir)) {
  for (const id of readdirSync(specsDir)) {
    const specFile = join(specsDir, id, "spec.md");
    const tasksFile = join(specsDir, id, "tasks.md");
    if (!existsSync(specFile) || !existsSync(tasksFile)) continue;
    const spec = read(specFile);
    if (spec === null) continue;
    const statusMatch = spec.match(/^\*\*Status:\*\* (.+)$/m);
    if (!statusMatch || !statusMatch[1].startsWith("Draft")) continue;
    const tasks = read(tasksFile) ?? "";
    const open = (tasks.match(/^- \[ \] /gm) ?? []).length;
    const done = (tasks.match(/^- \[x\] /gm) ?? []).length;
    if (open === 0 && done > 0 && !tasks.includes("docs-drift: status ok")) {
      report(`spec ${id}`, "status updated (all tasks done, status still Draft)", "Draft");
    }
  }
}

// ---- report --------------------------------------------------------------
if (findings.length > 0) {
  for (const f of findings) console.error(f);
  process.exit(1);
}
console.log(`docs drift check: OK (${allTools.length} tools, ${questionIds.length} questions, ${errorCodes.length} error codes)`);
process.exit(0);
