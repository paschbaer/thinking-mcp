import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Regression coverage for the documentation drift gate (specs/010, AC-1..4 +
// N-AC-1..4). Each test builds a minimal repo fixture and runs the real script.
let ws: string;

const REGISTER_TOOLS = `export const WORKFLOW_TOOL_NAMES = [
  "tool_a",
] as const;
export const SPEC_KIT_TOOL_NAMES = [
  "tool_b",
] as const;
`;
const ASSISTANT = `const QUESTIONS = [
    id: "q_one",
  ];
`;
const ERRORS = `export const ERROR_CODES = {
  "code_one",
  "code2x",
} as const;
`;

beforeEach(() => {
  ws = mkdtempSync(join(tmpdir(), "guidance-docs-drift-"));
  mkdirSync(join(ws, "servers/server-guidance/src/mcp-server"), {
    recursive: true,
  });
  mkdirSync(join(ws, "servers/server-guidance/src/setup"), { recursive: true });
  mkdirSync(join(ws, "servers/server-guidance/src/types"), { recursive: true });
  writeFileSync(
    join(ws, "servers/server-guidance/src/mcp-server/register-tools.ts"),
    REGISTER_TOOLS,
  );
  writeFileSync(
    join(ws, "servers/server-guidance/src/setup/ConfigAssistant.ts"),
    ASSISTANT,
  );
  writeFileSync(
    join(ws, "servers/server-guidance/src/types/errors.ts"),
    ERRORS,
  );
});

afterEach(() => {
  rmSync(ws, { recursive: true, force: true });
});

const SCRIPT = join(import.meta.dirname, "../../scripts/check-docs-drift.mjs");

interface RunResult {
  status: number;
  stderr: string;
  stdout: string;
}

function run(): RunResult {
  try {
    const stdout = execFileSync("node", [SCRIPT, ws], { encoding: "utf-8" });
    return { status: 0, stderr: "", stdout };
  } catch (e) {
    const err = e as { status: number; stderr: string; stdout: string };
    return {
      status: err.status ?? -1,
      stderr: err.stderr ?? "",
      stdout: err.stdout ?? "",
    };
  }
}

function writeReadme(body: string) {
  writeFileSync(join(ws, "servers/server-guidance/README.md"), body);
}

const cleanReadme = `# README
## Tool reference
| Tool | Parameters | Purpose |
|---|---|---|
| \`tool_a\` | — | documented |
| \`tool_b\` | — | documented |
## Configuration assistant
question \`q_one\` documented
## Error codes
| Code | Meaning |
|---|---|
| \`code_one\` | first |
| \`code2x\` | second |
`;

describe("docs drift gate (specs/010 AC-1..4, N-AC-1..4)", () => {
  beforeEach(() => writeReadme(cleanReadme));

  it("passes when README matches sources", () => {
    const r = run();
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("2 tools");
  });

  it("AC-1: registered tool without README row is reported (missing)", () => {
    writeReadme(cleanReadme.replace("| `tool_a` | — | documented |\n", ""));
    const r = run();
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("tool tool_a");
  });

  it("AC-1: README tool row without registered source is reported (no source)", () => {
    writeReadme(
      cleanReadme.replace(
        "| `tool_b` | — | documented |",
        "| `ghost_tool` | — | documented |",
      ),
    );
    const r = run();
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("README tool row ghost_tool");
  });

  it("FR2-L2: README tool row matching is case-sensitive (contract-documented)", () => {
    writeReadme(
      cleanReadme.replace(
        "| `tool_a` | — | documented |",
        "| `TOOL_A` | — | documented |",
      ),
    );
    const r = run();
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("tool tool_a");
  });

  it("AC-2: question id missing from assistant chapter is reported", () => {
    writeReadme(cleanReadme.replace("question `q_one` documented\n", ""));
    const r = run();
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("question q_one");
  });

  it("AC-2: question id documented outside the assistant chapter does NOT count", () => {
    writeReadme(
      cleanReadme.replace(
        "question `q_one` documented",
        "question documented",
      ) + "\nsee `q_one` elsewhere\n",
    );
    const r = run();
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("question q_one");
  });

  it("AC-3: error code without table row is reported; free-text mention does not count", () => {
    writeReadme(
      cleanReadme.replace(
        "| `code_one` | first |\n",
        "free text `code_one` in prose\n",
      ),
    );
    const r = run();
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("error code code_one");
  });

  it("AC-3: error codes with digits are parsed (regression: [a-z_] only skipped them)", () => {
    writeReadme(cleanReadme.replace("| `code2x` | second |\n", ""));
    const r = run();
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("error code code2x");
  });

  it("AC-4: Draft spec with no open checkboxes is reported; override comment suppresses", () => {
    mkdirSync(join(ws, "specs/feat"), { recursive: true });
    const spec = "**Status:** Draft\n";
    const tasks = "- [x] T1 done\n";
    writeFileSync(join(ws, "specs/feat/spec.md"), spec);
    writeFileSync(join(ws, "specs/feat/tasks.md"), tasks);
    expect(run().stderr).toContain("spec feat");
    writeFileSync(
      join(ws, "specs/feat/spec.md"),
      spec + "<!-- docs-drift: status ok -->\n",
    );
    expect(run().status).toBe(0);
  });

  it("AC-4: Draft spec with an open checkbox is NOT reported", () => {
    mkdirSync(join(ws, "specs/feat2"), { recursive: true });
    writeFileSync(join(ws, "specs/feat2/spec.md"), "**Status:** Draft\n");
    writeFileSync(join(ws, "specs/feat2/tasks.md"), "- [ ] T1 open\n");
    expect(run().status).toBe(0);
  });

  it("N-AC-1: missing README fails closed with a clear message", () => {
    rmSync(join(ws, "servers/server-guidance/README.md"));
    const r = run();
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("missing/unreadable");
  });

  it("N-AC-2: missing specs directory is skipped silently", () => {
    expect(run().status).toBe(0);
  });

  it("N-AC-4: .bak spec directories are ignored", () => {
    mkdirSync(join(ws, "specs/feat.bak"), { recursive: true });
    writeFileSync(join(ws, "specs/feat.bak/spec.md"), "**Status:** Draft\n");
    writeFileSync(join(ws, "specs/feat.bak/tasks.md"), "- [x] T1\n");
    expect(run().status).toBe(0);
  });
});
