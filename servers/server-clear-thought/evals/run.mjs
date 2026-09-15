#!/usr/bin/env node
/**
 * E3 Tier 2 — LLM task evals: run the same tasks with and without the
 * Clear Thought MCP server and judge both answers against a rubric.
 *
 * Provider-agnostic: any OpenAI-compatible /chat/completions endpoint.
 *
 * Actor and judge are SEPARATE endpoints — each role has its own model,
 * base URL and API key, so the judge can be an independent model on a
 * different provider (avoids same-model self-bias scoring):
 * Env (actor):
 *   EVAL_ACTOR_MODEL                default: EVAL_MODEL ?? gpt-4o-mini
 *   EVAL_ACTOR_BASE_URL             default: EVAL_BASE_URL ?? https://api.openai.com/v1
 *   EVAL_ACTOR_API_KEY              default: EVAL_API_KEY ?? OPENAI_API_KEY (required)
 * Env (judge):
 *   EVAL_JUDGE_MODEL                default: actor model
 *   EVAL_JUDGE_BASE_URL             default: actor base URL
 *   EVAL_JUDGE_API_KEY              default: actor API key
 * Usage:
 *   npm run build && node evals/run.mjs [--max-tasks N] [--tasks <file>]
 * Output:
 *   evals/results/<timestamp>/report.json + report.md (written incrementally
 *   after every task, so a crash only loses the in-flight task)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const pkgRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MAX_TOOL_ROUNDS = 6;

const hostOf = (url) => {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
};

// ── actor endpoint (runs the tasks) ─────────────────────────────────────
const ACTOR_API_KEY =
  process.env.EVAL_ACTOR_API_KEY ?? process.env.EVAL_API_KEY ?? process.env.OPENAI_API_KEY;
const ACTOR_BASE_URL = (
  process.env.EVAL_ACTOR_BASE_URL ?? process.env.EVAL_BASE_URL ?? 'https://api.openai.com/v1'
).replace(/\/$/, '');
const ACTOR_MODEL = process.env.EVAL_ACTOR_MODEL ?? process.env.EVAL_MODEL ?? 'gpt-4o-mini';

// ── judge endpoint (scores the answers) — independent by default config ──
const JUDGE_API_KEY = process.env.EVAL_JUDGE_API_KEY ?? ACTOR_API_KEY;
const JUDGE_BASE_URL = (
  process.env.EVAL_JUDGE_BASE_URL ?? ACTOR_BASE_URL
).replace(/\/$/, '');
const JUDGE_MODEL = process.env.EVAL_JUDGE_MODEL ?? ACTOR_MODEL;

const ACTOR = { role: 'actor', model: ACTOR_MODEL, baseUrl: ACTOR_BASE_URL, apiKey: ACTOR_API_KEY };
const JUDGE = { role: 'judge', model: JUDGE_MODEL, baseUrl: JUDGE_BASE_URL, apiKey: JUDGE_API_KEY };

if (!ACTOR_API_KEY) {
  console.error('Missing API key — set OPENAI_API_KEY (or EVAL_API_KEY / EVAL_ACTOR_API_KEY).');
  process.exit(2);
}
if (!fs.existsSync(path.join(pkgRoot, 'dist/dev.js'))) {
  console.error('dist/dev.js missing — run `npm run build` first.');
  process.exit(2);
}

const argv = process.argv.slice(2);
const maxIdx = argv.indexOf('--max-tasks');
let maxTasks = Infinity;
if (maxIdx >= 0) {
  maxTasks = Number(argv[maxIdx + 1]);
  if (!Number.isFinite(maxTasks) || maxTasks < 1) {
    console.error('--max-tasks expects a positive number');
    process.exit(2);
  }
}
const tasksIdx = argv.indexOf('--tasks');
if (tasksIdx >= 0 && !argv[tasksIdx + 1]) {
  console.error('--tasks expects a file path');
  process.exit(2);
}
const tasksFile = tasksIdx >= 0 ? argv[tasksIdx + 1] : 'evals/tasks.json';
const tasksPath = path.isAbsolute(tasksFile) ? tasksFile : path.join(pkgRoot, tasksFile);
if (!fs.existsSync(tasksPath)) {
  console.error(`Tasks file not found: ${tasksPath}`);
  process.exit(2);
}

const { tasks } = JSON.parse(fs.readFileSync(tasksPath, 'utf8'));
const selected = Number.isFinite(maxTasks) ? tasks.slice(0, maxTasks) : tasks;

const results = [];
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const outDir = path.join(pkgRoot, 'evals/results', stamp);
fs.mkdirSync(outDir, { recursive: true });

/** Endpoint snapshot for reproducibility — keys are never written. */
function writeConfig() {
  fs.writeFileSync(
    path.join(outDir, 'config.json'),
    JSON.stringify(
      {
        tasksFile,
        actor: { model: ACTOR_MODEL, baseUrl: ACTOR_BASE_URL },
        judge: { model: JUDGE_MODEL, baseUrl: JUDGE_BASE_URL }
      },
      null,
      2
    )
  );
}

/** Incremental: a crash mid-run keeps every completed task. */
function writeReport() {
  fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(results, null, 2));
  let md = `# LLM Eval Report — ${new Date().toISOString()}\n\nActor: \`${ACTOR_MODEL}\` @ ${hostOf(ACTOR_BASE_URL)} · Judge: \`${JUDGE_MODEL}\` @ ${hostOf(JUDGE_BASE_URL)} · Tasks: \`${tasksFile}\`\n\n| Task | Baseline | With Server | Δ | Expected tools | Actually used |\n|---|---|---|---|---|---|\n`;
  for (const r of results) {
    const delta = r.with_server.judge.total - r.baseline.judge.total;
    md += `| ${r.id} | ${r.baseline.judge.total}/${r.baseline.max} | ${r.with_server.judge.total}/${r.with_server.max} | ${delta >= 0 ? '+' : ''}${delta} | ${r.expected_tools.join(', ')} | ${r.with_server.toolsUsed.join(', ') || '—'} |\n`;
  }
  fs.writeFileSync(path.join(outDir, 'report.md'), md);
}

function rubricMax(task) {
  return task.rubric.reduce((acc, r) => acc + 4 * r.weight, 0);
}

async function chatOnce(messages, tools, endpoint = ACTOR) {
  const res = await fetch(`${endpoint.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${endpoint.apiKey}` },
    body: JSON.stringify({ model: endpoint.model, messages, ...(tools ? { tools } : {}) }),
    signal: AbortSignal.timeout(180000)
  });
  if (!res.ok) {
    throw new Error(`LLM API ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  return res.json();
}

/** Retries transient failures (timeouts, 5xx, rate limits) with backoff. */
async function chat(messages, tools, attempts = 3, label = 'llm call', endpoint = ACTOR) {
  for (let i = 1; i <= attempts; i++) {
    const start = Date.now();
    console.log(`    → LLM call [${label}] (attempt ${i}/${attempts}, ${endpoint.role} ${endpoint.model}) …`);
    const ticker = setInterval(() => {
      console.log(`    ⏳ [${label}] waiting … ${Math.round((Date.now() - start) / 1000)}s`);
    }, 20000);
    try {
      const json = await chatOnce(messages, tools, endpoint);
      clearInterval(ticker);
      console.log(`    ✓ [${label}] done in ${((Date.now() - start) / 1000).toFixed(1)}s`);
      return json;
    } catch (error) {
      clearInterval(ticker);
      const causeCode = String(error.cause?.code ?? '');
      const transient =
        /UND_ERR|timeout|ECONN/i.test(causeCode + ' ' + error.message) ||
        /\b(5\d\d|429)\b/.test(error.message.slice(0, 60));
      if (i === attempts || !transient) throw error;
      const wait = i * 5000;
      console.log(`    ✗ [${label}] transient error (${error.message.slice(0, 80)}) — retry in ${wait / 1000}s …`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
}

/** Mode A — baseline: no server, single completion. */
async function runBaseline(task) {
  const res = await chat([{ role: 'user', content: task.prompt }], null, 3, `${task.id} · baseline`, ACTOR);
  return { answer: res.choices[0].message.content ?? '', toolsUsed: [] };
}

/** Connect one MCP server over stdio. Generous timeouts: on Windows/WSL
 * drvfs mounts a cold node start alone can take >60s. */
async function connectStdio(scriptPath, name) {
  const transport = new StdioClientTransport({ command: process.execPath, args: [scriptPath] });
  const client = new Client({ name, version: '0.0.0' }, { defaultRequestTimeoutMsec: 300000 });
  try {
    await client.connect(transport, { timeout: 300000 });
  } catch (error) {
    await transport.close().catch(() => {}); // no leaked stdio child on failed init
    throw error;
  }
  return client;
}

/** Mode B — with the MCP server(s): tool-use loop over tools/list. The
 * sibling stochastic-thinking server is attached automatically when its
 * build exists, so tasks can also exercise stateful algorithm tools
 * (e.g. bandit runs continued via runId across calls). */
async function runWithServer(task) {
  const clients = [];
  const toolClients = new Map(); // tool name → owning client (first server wins)
  try {
    clients.push(await connectStdio(path.join(pkgRoot, 'dist/dev.js'), 'llm-eval'));
    const extraPath = path.resolve(pkgRoot, '../server-stochasticthinking/dist/dev.js');
    if (fs.existsSync(extraPath)) {
      try {
        clients.push(await connectStdio(extraPath, 'llm-eval-stochastic'));
        console.log('  (stochastic-thinking server attached)');
      } catch (error) {
        console.log(`  (stochastic-thinking attach failed, continuing: ${error.message.slice(0, 80)})`);
      }
    }
    const openaiTools = [];
    for (const client of clients) {
      const { tools } = await client.listTools(undefined, { timeout: 300000 });
      for (const t of tools) {
        if (toolClients.has(t.name)) continue;
        toolClients.set(t.name, client);
        openaiTools.push({
          type: 'function',
          function: { name: t.name, description: t.description ?? '', parameters: t.inputSchema }
        });
      }
    }
    const messages = [{ role: 'user', content: task.prompt }];
    const toolsUsed = [];

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const res = await chat(messages, openaiTools, 3, `${task.id} · server (round ${round + 1})`, ACTOR);
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
          const client = toolClients.get(name);
          if (!client) throw new Error(`unknown tool: ${name}`);
          const result = await client.callTool({ name, arguments: JSON.parse(args ?? '{}') }, undefined, { timeout: 300000 });
          resultText = result.content?.map((c) => c.text ?? '').join('\n') ?? '';
        } catch (error) {
          resultText = `tool error: ${error.message}`;
        }
        messages.push({ role: 'tool', tool_call_id: call.id, content: resultText.slice(0, 8000) });
      }
    }
    // Round budget exhausted — the model must answer NOW. Without this nudge
    // an actor deep in a multi-stage workflow keeps announcing next stages
    // and the task scores 0 on a finished-looking but empty answer
    // (observed: "All attack stages complete. Let me advance …").
    messages.push({
      role: 'user',
      content:
        'Your tool budget is exhausted. Do not announce further stages or steps. ' +
        'Write your FINAL answer to the original request now, including every requested ' +
        'number, ranking and recommendation, using the tool outputs you already received.'
    });
    const final = await chat(messages, null, 3, `${task.id} · final synthesis`, ACTOR);
    return { answer: final.choices[0].message.content ?? '', toolsUsed };
  } finally {
    for (const client of clients) await client.close().catch(() => {});
  }
}

/** Judge: score the rubric 0–4 per criterion. Uses the separate judge model
 * (EVAL_JUDGE_MODEL) and applies ONE corrective retry when the output is not
 * valid JSON — an unparseable judge result otherwise silently zeroes a task. */
async function judge(task, answer) {
  const rubric = task.rubric
    .map((r, i) => `${i + 1}. (${r.weight}pt) ${r.criterion}`)
    .join('\n');
  const messages = [
    {
      role: 'system',
      content:
        'You are a strict eval judge. Score each rubric criterion 0-4 based ONLY on the answer text. ' +
        'Anchors: 4 = fully satisfies the criterion; 3 = minor gaps; 2 = partially satisfies or ' +
        'misses requested specifics; 1 = barely touches it; 0 = absent or wrong. ' +
        'Apply the anchors with identical strictness to every answer — do not reward length or ' +
        'format, and do not penalize correctly derived numbers just because they differ from an ' +
        'example value written inside a criterion. ' +
        'Respond with JSON only: {"scores":[{"criterion":string,"score":number,"justification":string}]}.'
    },
    {
      role: 'user',
      content: `Task given to the assistant:\n${task.prompt}\n\nRubric:\n${rubric}\n\nAssistant answer:\n${answer.slice(0, 12000)}`
    }
  ];

  const parse = (raw) => {
    const parsed = JSON.parse(raw);
    const scores = parsed.scores ?? [];
    const total = scores.reduce((acc, s) => acc + (Number(s.score) || 0), 0);
    if (!scores.length) throw new Error('empty scores');
    return { scores, total };
  };

  const res = await chat(messages, null, 3, `${task.id} · judge`, JUDGE);
  try {
    return parse(res.choices[0].message.content);
  } catch {
    console.log(`    ⚠ judge output unparseable — asking for corrected JSON …`);
    messages.push({ role: 'assistant', content: res.choices[0].message.content ?? '' });
    messages.push({
      role: 'user',
      content: 'That was not valid JSON per the schema. Return ONLY the JSON object, no other text.'
    });
    const retry = await chat(messages, null, 1, `${task.id} · judge (retry)`, JUDGE);
    try {
      return parse(retry.choices[0].message.content);
    } catch {
      return { scores: [], total: 0, error: 'judge output unparseable after retry' };
    }
  }
}

// ── main ────────────────────────────────────────────────────────────────
console.log(`LLM eval: ${selected.length} task(s) from ${tasksFile}`);
console.log(`  actor: ${ACTOR_MODEL} @ ${hostOf(ACTOR_BASE_URL)}`);
console.log(`  judge: ${JUDGE_MODEL} @ ${hostOf(JUDGE_BASE_URL)}`);
if (ACTOR_MODEL === JUDGE_MODEL && ACTOR_BASE_URL === JUDGE_BASE_URL) {
  console.log(
    `  ⚠ self-bias risk: actor and judge are the same model on the same endpoint — ` +
      `set EVAL_JUDGE_MODEL / EVAL_JUDGE_BASE_URL (plus EVAL_JUDGE_API_KEY) to an independent model.`
  );
}
console.log('');
writeConfig();

const avg = (key) =>
  (results.reduce((acc, r) => acc + r[key].judge.total / r[key].max, 0) / results.length) * 100;

for (const task of selected) {
  console.log(`▶ ${task.id}`);
  process.stdout.write('  baseline (no tools) … ');
  const base = await runBaseline(task);
  const baseJudge = await judge(task, base.answer);
  console.log(`score ${baseJudge.total}/${rubricMax(task)}`);

  process.stdout.write('  with server … ');
  const withServer = await runWithServer(task);
  const serverJudge = await judge(task, withServer.answer);
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
  writeReport();

  const delta = serverJudge.total - baseJudge.total;
  console.log(`  Δ ${delta >= 0 ? '+' : ''}${delta} (baseline ${baseJudge.total} → server ${serverJudge.total})\n`);
}

console.log(`\nBaseline avg: ${results.length ? avg('baseline').toFixed(1) + '%' : 'n/a'} | With server avg: ${results.length ? avg('with_server').toFixed(1) + '%' : 'n/a'}`);
console.log(`Report: ${path.join(outDir, 'report.md')}`);
