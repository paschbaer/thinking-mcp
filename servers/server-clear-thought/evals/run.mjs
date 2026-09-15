#!/usr/bin/env node
/**
 * E3 Tier 2 — LLM task evals: run the same tasks with and without the
 * Clear Thought MCP server and judge both answers against a rubric.
 *
 * Provider-agnostic: any OpenAI-compatible /chat/completions endpoint.
 * Env:
 *   OPENAI_API_KEY / EVAL_API_KEY   API key (required)
 *   EVAL_BASE_URL                   default https://api.openai.com/v1
 *   EVAL_MODEL                      default gpt-4o-mini
 * Usage:
 *   npm run build && node evals/run.mjs [--max-tasks N]
 * Output:
 *   evals/results/<timestamp>/report.json + report.md
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const pkgRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const API_KEY = process.env.EVAL_API_KEY ?? process.env.OPENAI_API_KEY;
const BASE_URL = (process.env.EVAL_BASE_URL ?? 'https://api.openai.com/v1').replace(/\/$/, '');
const MODEL = process.env.EVAL_MODEL ?? 'gpt-4o-mini';
const MAX_TOOL_ROUNDS = 6;

if (!API_KEY) {
  console.error('Missing API key — set OPENAI_API_KEY (or EVAL_API_KEY).');
  process.exit(2);
}
if (!fs.existsSync(path.join(pkgRoot, 'dist/dev.js'))) {
  console.error('dist/dev.js missing — run `npm run build` first.');
  process.exit(2);
}

const argv = process.argv.slice(2);
const maxIdx = argv.indexOf('--max-tasks');
const maxTasks = maxIdx >= 0 ? Number(argv[maxIdx + 1]) : Infinity;

const { tasks } = JSON.parse(fs.readFileSync(path.join(pkgRoot, 'evals/tasks.json'), 'utf8'));
const selected = Number.isFinite(maxTasks) ? tasks.slice(0, maxTasks) : tasks;

async function chat(messages, tools) {
  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({ model: MODEL, messages, ...(tools ? { tools } : {}) })
  });
  if (!res.ok) {
    throw new Error(`LLM API ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  return res.json();
}

/** Mode A — baseline: no server, single completion. */
async function runBaseline(task) {
  const res = await chat([{ role: 'user', content: task.prompt }]);
  return { answer: res.choices[0].message.content ?? '', toolsUsed: [] };
}

/** Mode B — with the MCP server: tool-use loop over tools/list. */
async function runWithServer(task) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.join(pkgRoot, 'dist/dev.js')]
  });
  const client = new Client({ name: 'llm-eval', version: pkg.version ?? '0.0.0' });
  await client.connect(transport);
  try {
    const { tools } = await client.listTools();
    const openaiTools = tools.map((t) => ({
      type: 'function',
      function: { name: t.name, description: t.description ?? '', parameters: t.inputSchema }
    }));
    const messages = [{ role: 'user', content: task.prompt }];
    const toolsUsed = [];

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const res = await chat(messages, openaiTools);
      const msg = res.choices[0].message;
      messages.push(msg);
      if (!msg.tool_calls?.length) {
        return { answer: msg.content ?? '', toolsUsed };
      }
      for (const call of msg.tool_calls) {
        const { name, arguments: args } = call.function;
        toolsUsed.push(name);
        let resultText;
        try {
          const result = await client.callTool({ name, arguments: JSON.parse(args ?? '{}') });
          resultText = result.content?.map((c) => c.text ?? '').join('\n') ?? '';
        } catch (error) {
          resultText = `tool error: ${error.message}`;
        }
        messages.push({ role: 'tool', tool_call_id: call.id, content: resultText.slice(0, 8000) });
      }
    }
    const final = await chat(messages);
    return { answer: final.choices[0].message.content ?? '', toolsUsed };
  } finally {
    await client.close();
  }
}

/** Judge: score the rubric 0–4 per criterion (JSON-enforced with fallback). */
async function judge(task, variant, answer) {
  const rubric = task.rubric
    .map((r, i) => `${i + 1}. (${r.weight}pt) ${r.criterion}`)
    .join('\n');
  const messages = [
    {
      role: 'system',
      content:
        'You are a strict eval judge. Score each rubric criterion 0-4 based ONLY on the answer text. ' +
        'Respond with JSON only: {"scores":[{"criterion":string,"score":number,"justification":string}]}.'
    },
    {
      role: 'user',
      content: `Task given to the assistant:\n${task.prompt}\n\nRubric:\n${rubric}\n\nAssistant answer:\n${answer.slice(0, 6000)}`
    }
  ];
  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({
      model: MODEL,
      messages,
      response_format: { type: 'json_object' }
    })
  });
  if (!res.ok) {
    return { scores: [], total: 0, error: `judge ${res.status}` };
  }
  try {
    const parsed = JSON.parse((await res.json()).choices[0].message.content);
    const scores = parsed.scores ?? [];
    const total = scores.reduce((acc, s) => acc + (Number(s.score) || 0), 0);
    return { scores, total };
  } catch {
    return { scores: [], total: 0, error: 'judge output unparseable' };
  }
}

function rubricMax(task) {
  return task.rubric.reduce((acc, r) => acc + 4 * r.weight, 0);
}

// ── main ────────────────────────────────────────────────────────────────
const results = [];
console.log(`LLM eval: ${selected.length} task(s), model ${MODEL}, base ${BASE_URL}\n`);

for (const task of selected) {
  console.log(`▶ ${task.id}`);
  process.stdout.write('  baseline (no tools) … ');
  const base = await runBaseline(task);
  const baseJudge = await judge(task, 'baseline', base.answer);
  console.log(`score ${baseJudge.total}/${rubricMax(task)}`);

  process.stdout.write('  with server … ');
  const withServer = await runWithServer(task);
  const serverJudge = await judge(task, 'with-server', withServer.answer);
  console.log(`score ${serverJudge.total}/${rubricMax(task)}`);

  results.push({
    id: task.id,
    baseline: { answer: base.answer, toolsUsed: [], judge: baseJudge, max: rubricMax(task) },
    with_server: {
      answer: withServer.answer,
      toolsUsed: withServer.toolsUsed,
      judge: serverJudge,
      max: rubricMax(task)
    },
    expected_tools: task.expects_tools,
    rubric: task.rubric
  });
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const outDir = path.join(pkgRoot, 'evals/results', stamp);
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(results, null, 2));

let md = `# LLM Eval Report — ${new Date().toISOString()}\n\nModel: \`${MODEL}\`\n\n| Task | Baseline | With Server | Δ | Expected tools | Actually used |\n|---|---|---|---|---|---|\n`;
for (const r of results) {
  md += `| ${r.id} | ${r.baseline.judge.total}/${r.baseline.max} | ${r.with_server.judge.total}/${r.with_server.max} | ${r.with_server.judge.total - r.baseline.judge.total >= 0 ? '+' : ''}${r.with_server.judge.total - r.baseline.judge.total} | ${r.expected_tools.join(', ')} | ${r.with_server.toolsUsed.join(', ') || '—'} |\n`;
}
fs.writeFileSync(path.join(outDir, 'report.md'), md);

const avg = (key) =>
  (results.reduce((acc, r) => acc + r[key].judge.total / r[key].max, 0) / results.length) * 100;
console.log(`\nBaseline avg: ${avg('baseline').toFixed(1)}% | With server avg: ${avg('with_server').toFixed(1)}%`);
console.log(`Report: ${outDir}`);
