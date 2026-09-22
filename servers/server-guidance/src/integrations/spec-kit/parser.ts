/**
 * Deterministic line-based parser for Spec-Kit artifacts (FR-063, R11).
 * parserVersion increments on any behavioral change; snapshots record it.
 */
export const PARSER_VERSION = "1.0.0";

export interface ParsedTask {
  taskId: string;
  title: string;
  description: string;
  required: boolean;
  parallelizable: boolean;
  sourceSection: string | null;
  dependencies: string[];
  linkedRequirementIds: string[];
  linkedCriterionIds: string[];
  checkboxChecked: boolean;
  line: number;
  warnings: string[];
}

export interface ParsedArtifact {
  tasks: ParsedTask[];
  requirements: { id: string; text: string; line: number }[];
  criteria: { id: string; text: string; line: number }[];
  warnings: string[];
}

const TASK_LINE = /^- \[( |x)\] (T\d+):\s*(.*)$|^-\[( |x)\]\s*(T\d+)\s*(.*)$/i;
const CHECKBOX = /^- \[( |x)\]\s*(?:\*\*)?(T\d+)(?:\*\*)?\s*:?\s*(.*)$/i;
const SECTION = /^#{2,3}\s+(?:\*\*)?([^*]+)(?:\*\*)?\s*$/;
const PARALLEL = /\[P\]/i;
const DEP_BACKTICK = /`depends:\s*([^`]+)`/i;
const DEP_PAREN = /\(depends:\s*([^)]+)\)/i;
const ID_TOKEN = /\b((?:FR|AC|SC|US|T)-?\d{3,}|T\d+)\b/g;
const REQ_TOKEN = /\bFR-\d+\b/g;
const CRIT_TOKEN = /\b(?:AC|SC)-\d+\b/g;

function extractDependencies(text: string): string[] {
  const deps: string[] = [];
  for (const re of [DEP_BACKTICK, DEP_PAREN]) {
    const m = text.match(re);
    if (m) {
      for (const d of m[1]!.split(/[,\s]+/)) {
        const id = d.trim();
        if (/^T\d+$/i.test(id)) deps.push(id.toUpperCase());
      }
    }
  }
  return [...new Set(deps)];
}

/** Parses a Spec-Kit `tasks.md` into normalized tasks. Deterministic. */
export function parseTasks(content: string): ParsedArtifact {
  const warnings: string[] = [];
  const tasks: ParsedTask[] = [];
  const requirements: { id: string; text: string; line: number }[] = [];
  const criteria: { id: string; text: string; line: number }[] = [];
  let currentSection: string | null = null;

  const lines = content.replace(/\r\n/g, "\n").split("\n");
  lines.forEach((rawLine, idx) => {
    const line = rawLine.trimEnd();
    const lineNo = idx + 1;
    const sectionMatch = line.match(SECTION);
    if (sectionMatch) {
      currentSection = sectionMatch[1]!.trim();
      return;
    }
    const checkbox = line.match(CHECKBOX);
    if (checkbox) {
      const checked = checkbox[1]!.toLowerCase() === "x";
      const taskId = checkbox[2]!.toUpperCase();
      let rest = checkbox[3] ?? "";
      const parallelizable = PARALLEL.test(rest);
      rest = rest.replace(PARALLEL, "").trim();
      const dependencies = extractDependencies(rest);
      rest = rest.replace(/`[^`]*`/g, "").replace(/\(depends:[^)]*\)/gi, "").trim();
      const linkedRequirementIds = [...new Set((rest.match(REQ_TOKEN) ?? []).map((x) => x.toUpperCase()))];
      const linkedCriterionIds = [...new Set((rest.match(CRIT_TOKEN) ?? []).map((x) => x.toUpperCase()))];
      const title = rest.split(/[.;(]/)[0]!.trim() || rest;
      tasks.push({
        taskId,
        title,
        description: rest,
        required: true,
        parallelizable,
        sourceSection: currentSection,
        dependencies,
        linkedRequirementIds,
        linkedCriterionIds,
        checkboxChecked: checked,
        line: lineNo,
        warnings: [],
      });
      return;
    }
    const req = line.match(/\*\*(FR-\d+)\*\*:?\s*(.*)/i) ?? line.match(/- \*\*?(FR-\d+)\*\*?/i);
    if (req) {
      requirements.push({ id: req[1]!.toUpperCase(), text: line.replace(/^\s*-\s*/, ""), line: lineNo });
      return;
    }
    const crit = line.match(/\*\*((?:AC|SC)-\d+)\*\*:?\s*(.*)/i);
    if (crit) {
      criteria.push({ id: crit[1]!.toUpperCase(), text: line.replace(/^\s*-\s*/, ""), line: lineNo });
      return;
    }
    if (/\[[a-z]+\]/i.test(line) && line.startsWith("-")) {
      warnings.push(`unrecognized marker at line ${lineNo}: ${line.slice(0, 60)}`);
    }
  });
  return { tasks, requirements, criteria, warnings };
}

/** Extracts required section presence for validation (FR-063). */
export function hasSection(content: string, section: string): boolean {
  const re = new RegExp(`^#{1,3}\\s+.*${section.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "mi");
  return re.test(content.replace(/\r\n/g, "\n"));
}
