#!/usr/bin/env node
/**
 * Comprehensive functional test against a DEPLOYED clear-thought instance.
 *
 * Usage:
 *   BASE=http://localhost:3000/mcp node scripts/funktionstest.mjs
 *   npm run test:live
 *
 * Covers every registered tool (individual + toolset dispatch), dual-mode
 * behavior and the session lifecycle. Exit code 0 = all green; run it after
 * every deployment as a regression gate.
 */
const BASE = process.env.BASE ?? 'http://localhost:3000/mcp';
let sessionId, id = 0;
const results = [];

async function rpc(method, params) {
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' };
  if (sessionId) headers['mcp-session-id'] = sessionId;
  const res = await fetch(BASE, { method: 'POST', headers, body: JSON.stringify({ jsonrpc: '2.0', id: (id += 1), method, ...(params ? { params } : {}) }) });
  const sid = res.headers.get('mcp-session-id');
  if (sid) sessionId = sid;
  const text = await res.text();
  let json = null;
  for (const l of text.split('\n')) {
    if (l.startsWith('data:')) { json = JSON.parse(l.slice(5).trim()); break; }
  }
  if (json === null) { try { json = JSON.parse(text); } catch { } }
  return json;
}

const parse = (r) => {
  if (r?.error) return { __rpcError: r.error.message };
  try {
    const d = JSON.parse(r?.result?.content?.[0]?.text ?? '');
    return r?.result?.isError ? { __toolError: d } : d;
  } catch {
    return { __parseFail: (r?.result?.content?.[0]?.text ?? '').slice(0, 120) };
  }
};

function record(name, data, assertFn) {
  let ok = true;
  let detail = '';
  try {
    if (data.__rpcError) throw new Error('rpc: ' + data.__rpcError);
    if (data.__toolError) throw new Error('tool error: ' + JSON.stringify(data.__toolError).slice(0, 120));
    assertFn?.(data);
  } catch (e) {
    ok = false;
    detail = e.message;
  }
  results.push({ name, ok, detail });
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`);
}

const run = async () => {
  await rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'full-funktionstest', version: '1' } });
  await rpc('notifications/initialized');

  const list = await rpc('tools/list');
  const tools = list?.result?.tools ?? [];
  const names = new Set(tools.map((t) => t.name));
  const expected = ['sequentialthinking','mentalmodel','debuggingapproach','collaborativereasoning','decisionframework','metacognitivemonitoring','socraticmethod','creativethinking','systemsthinking','scientificmethod','structuredargumentation','visualreasoning','analogical_mapper','assumption_xray','comparative_advantage','drag_point_audit','safe_struggle_designer','seven_seekers_orchestrator','value_of_information','mind_map','concept_map','fishbone_diagram','swot_analysis','issue_tree','existing_tool_example','session_info','session_export','session_import','agents_guide','reasoning','visualization','utility','session'];
  const missing = expected.filter((n) => names.has(n) === false);
  results.push({ name: 'tools/list completeness', ok: missing.length === 0, detail: missing.join(', ') });
  console.log(`${missing.length === 0 ? '✅' : '❌'} tools/list: ${tools.length} tools, expected ${expected.length}${missing.length ? ', missing: ' + missing.join(', ') : ''}`);

  // schema sanity: every toolset exposes operation enum; agents_guide present
  for (const ts of ['reasoning', 'visualization', 'utility', 'session']) {
    const ops = tools.find((t) => t.name === ts)?.inputSchema?.properties?.operation?.enum ?? [];
    record(`toolset ${ts} operation enum`, { n: ops.length }, (d) => { if (d.n === 0) throw new Error('empty enum'); });
  }
  record('agents_guide deployed', { has: names.has('agents_guide') }, (d) => { if (d.has === false) throw new Error('missing — deployment stale?'); });

  const call = async (tool, args) => parse(await rpc('tools/call', { name: tool, arguments: args }));
  const callTs = async (ts, args) => parse(await rpc('tools/call', { name: ts, arguments: { operation: args.operation, ...args } }));

  // --- reasoning tools (individual) ---
  record('sequentialthinking', await call('sequentialthinking', { thought: 'step', thoughtNumber: 1, totalThoughts: 2, nextThoughtNeeded: true }),
    (d) => { if (d.status !== 'success' || d.sessionContext?.remainingThoughts === undefined) throw new Error('no session stats'); });
  record('mentalmodel', await call('mentalmodel', { modelName: 'first_principles', problem: 'p', steps: ['s'], reasoning: 'r', conclusion: 'c' }),
    (d) => { if (d.status !== 'success') throw new Error('no success'); });
  record('debuggingapproach', await call('debuggingapproach', { approachName: 'binary_search', issue: '500s', steps: ['a'], findings: 'f', resolution: 'r' }),
    (d) => { if (d.sessionContext === undefined && d.status === undefined) throw new Error('unexpected shape'); });
  record('collaborativereasoning', await call('collaborativereasoning', {
    topic: 't',
    personas: [{ id: 'p1', name: 'analyst', expertise: ['x'], background: 'b', perspective: 'data-first', biases: ['recency'], communication: { style: 'technical', tone: 'neutral' } }],
    contributions: [{ personaId: 'p1', content: 'start with data quality', type: 'observation', confidence: 0.8 }],
    stage: 'problem-definition',
    activePersonaId: 'p1',
    sessionId: 'cr1',
    iteration: 1,
    nextContributionNeeded: false
  }),
    (d) => { if (d.sessionContext === undefined && d.status === undefined) throw new Error('unexpected shape'); });
  record('decisionframework', await call('decisionframework', { decisionStatement: 'd', options: [{ name: 'a', description: 'x' }], analysisType: 'weighted', stage: 'options', decisionId: 'd1', iteration: 1, nextStageNeeded: false }),
    (d) => { if (d.status !== 'success' && d.decisionId === undefined) throw new Error('unexpected shape'); });
  record('metacognitivemonitoring', await call('metacognitivemonitoring', { task: 't', stage: 'review', overallConfidence: 0.8, uncertaintyAreas: ['u'], recommendedApproach: 'ra', monitoringId: 'm1', iteration: 1, nextAssessmentNeeded: false }),
    (d) => { if (d.status !== 'success' && d.overallConfidence === undefined) throw new Error('unexpected shape'); });
  record('socraticmethod', await call('socraticmethod', { claim: 'c', premises: ['p'], conclusion: 'concl', question: 'why?', stage: 'clarification', argumentType: 'deductive', confidence: 0.7, sessionId: 'soc1', iteration: 1, nextArgumentNeeded: false }),
    (d) => { if (d.sessionContext === undefined && d.status === undefined) throw new Error('unexpected shape'); });
  record('creativethinking', await call('creativethinking', { prompt: 'p', ideas: ['i'], techniques: ['t'], connections: [], insights: ['ins'], sessionId: 's1', iteration: 1, nextIdeaNeeded: false }),
    (d) => { if (d.status !== 'success' && d.iteration === undefined) throw new Error('unexpected shape'); });
  record('systemsthinking', await call('systemsthinking', { system: 'deploy pipeline', components: ['build', 'deploy'], relationships: [{ from: 'build', to: 'deploy', type: 'positive', description: 'handoff' }], feedbackLoops: [{ components: ['deploy'], type: 'negative', description: 'rollback loop' }], emergentProperties: ['flakiness'], leveragePoints: ['build speed'], sessionId: 'sys1', iteration: 1, nextAnalysisNeeded: false }),
    (d) => { if (d.sessionContext === undefined && d.status === undefined) throw new Error('unexpected shape'); });
  record('scientificmethod', await call('scientificmethod', {
    stage: 'hypothesis',
    inquiryId: 'inquiry-1',
    hypothesis: { statement: 'caching reduces p95', variables: [{ name: 'cache', type: 'independent' }], assumptions: ['clean isolation'], hypothesisId: 'h1', confidence: 0.6, domain: 'performance', iteration: 1, status: 'proposed' },
    iteration: 1,
    nextStageNeeded: false
  }),
    (d) => { if (d.sessionContext === undefined && d.status === undefined) throw new Error('unexpected shape'); });
  record('structuredargumentation', await call('structuredargumentation', { claim: 'c', premises: ['p1'], conclusion: 'con', argumentType: 'deductive', confidence: 0.7, nextArgumentNeeded: false }),
    (d) => { if (d.sessionContext === undefined && d.status === undefined) throw new Error('unexpected shape'); });

  // --- visualization tools (dual mode) ---
  record('visualreasoning', await call('visualreasoning', { operation: 'create', diagramId: 'd1', diagramType: 'mindmap', iteration: 1, nextOperationNeeded: false }),
    (d) => { if (d.status !== 'success') throw new Error('no success'); });
  record('mind_map analysis', await call('mind_map', { topic: 't', branches: [{ title: 'b1', subtopics: ['x'] }] }),
    (d) => { if (d.mode !== 'analysis' || d.branch_count !== 1) throw new Error('mode/branch_count'); });
  record('mind_map facilitation', await call('mind_map', { topic: 't' }),
    (d) => { if (d.mode !== 'facilitation' || d.guiding_questions.length === 0) throw new Error('no scaffold'); });
  record('concept_map analysis', await call('concept_map', { main_concept: 'm', related_concepts: ['r1'], relations: ['relates to'] }),
    (d) => { if (d.mode !== 'analysis' || d.links[0].relation !== 'relates to') throw new Error('link label'); });
  record('fishbone analysis', await call('fishbone_diagram', { problem: 'p', causes: [{ category: 'methods', causes: ['c1'] }] }),
    (d) => { if (d.mode !== 'analysis' || d.total_cause_count !== 1) throw new Error('causes'); });
  record('swot facilitation', await call('swot_analysis', { subject: 's' }),
    (d) => { if (d.mode !== 'facilitation') throw new Error('mode'); });
  record('swot analysis (v2 weighted)', await call('swot_analysis', {
    subject: 'polars vs duckdb',
    strengths: [{ text: 'fast', impact: 5, likelihood: 4, tags: ['perf'] }, 'simple'],
    weaknesses: [{ text: 'ram', impact: 4, likelihood: 4, tags: ['perf'] }],
    opportunities: ['growing data'],
    threats: ['sql momentum'],
    topN: 3,
    matchMode: 'tags'
  }), (d) => {
    if (d.mode !== 'analysis') throw new Error('mode');
    if (d.towsRanked === undefined) throw new Error('no towsRanked');
    if (d.scores?.weighted === undefined) throw new Error('no weighted scores');
    if (d.meta?.truncatedPerQuadrant === undefined) throw new Error('no meta');
  });
  record('issue_tree analysis', await call('issue_tree', { problem: 'p', depth: 2, sub_questions: ['q1', 'q2'] }),
    (d) => { if (d.mode !== 'analysis' || d.node_count !== 3) throw new Error('nodes'); });

  // --- utility tools (upgraded) ---
  record('analogical_mapper scaffold', await call('analogical_mapper', { problem: 'cache invalidation', seed_domains: ['physics', 'cooking'], k: 2 }),
    (d) => { if (d.mode !== 'facilitation' || d.lenses.length !== 2 || d.analogies !== undefined) throw new Error('fabrication or lenses'); });
  record('assumption_xray heuristics', await call('assumption_xray', { claim: 'All imports always fail because of network limits', context: 'ctx' }),
    (d) => { if (d.mode !== 'analysis' || d.assumptions.length < 2 || !d.assumptions[0].falsification_test) throw new Error('heuristics'); });
  record('comparative_advantage matching', await call('comparative_advantage', {
    skills: { alice: { sql: 5 }, bob: { sql: 1, python: 5 } },
    tasks: { db: ['sql'], scripting: ['python'] }
  }), (d) => {
    const m = Object.fromEntries(d.advantage_map.map((e) => [e.task, e.assignee]));
    if (m.db !== 'alice' || m.scripting !== 'bob') throw new Error('matching wrong');
  });
  record('comparative_advantage capacity', await call('comparative_advantage', {
    skills: { alice: { sql: 5 }, bob: { sql: 2 } },
    tasks: { t1: ['sql'], t2: ['sql'] },
    capacity: { alice: 1, bob: 1 }
  }), (d) => { if (d.assignment_mode !== 'capacity-aware-greedy') throw new Error('mode'); });
  record('drag_point_audit log scan', await call('drag_point_audit', { log: 'ERROR a\nretry a\nretry a\nok' }),
    (d) => { if (d.mode !== 'analysis' || d.drag_density === undefined || d.repeated_messages.length !== 1) throw new Error('scan'); });
  record('safe_struggle_designer deadline', await call('safe_struggle_designer', { skill: 'rust', current_level: 1, target_level: 3, hours_per_week: 4, session_minutes: 60, deadline_weeks: 2 }),
    (d) => { if (d.success_criteria.length !== 2 || d.prerequisite_chain.length !== 2 || d.review_intervals === undefined) throw new Error('plan fields'); });
  record('seven_seekers scaffold', await call('seven_seekers_orchestrator', { query: 'q' }),
    (d) => { if (d.mode !== 'facilitation' || d.lenses.length !== 7 || d.resonance_map !== undefined) throw new Error('lenses/resonance'); });
  record('value_of_information uniform', await call('value_of_information', { decision_options: ['a'], uncertainties: ['u1', 'u2'], payoffs: [8, 2] }),
    (d) => { if (d.voi_score !== 5 || d.ranked_uncertainties[0].impact !== 8) throw new Error('voi math'); });
  record('value_of_information weighted+partial+per-option', await call('value_of_information', {
    decision_options: ['a', 'b'],
    uncertainties: ['u1', 'u2'],
    payoffs: [8, 2],
    probabilities: [0.5, 0.9],
    option_payoffs: { a: [8, 2], b: [1, 3] },
    sampled_uncertainties: ['u1']
  }), (d) => {
    if (d.ranked_uncertainties[0].expected_impact !== 4) throw new Error('weighting');
    if (d.partial_voi?.share_of_total === undefined) throw new Error('partial');
    if (d.per_option === undefined || d.per_option.length !== 2) throw new Error('per-option');
  });
  record('existing_tool_example', await call('existing_tool_example', { text: 'echo-check' }),
    (d) => { if (JSON.stringify(d).includes('echo-check') === false) throw new Error('no echo'); });

  // --- agents_guide ---
  record('agents_guide full', await call('agents_guide', { project_name: 'Tradix' }),
    (d) => {
      if (d.mode !== undefined && d.mode !== 'full') throw new Error('mode: ' + d.mode);
      if (d.content?.includes('Reasoning Tool Guide for Tradix') === false) throw new Error('no rendered guide');
    });
  record('agents_guide merge', await call('agents_guide', {
    project_name: 'T2',
    existing_agents_md: '# My Rules\n\nbe nice.\n'
  }), (d) => {
    if (d.mode !== 'merge' || d.block_replaced !== false) throw new Error('merge basics');
    if (d.content.startsWith('# My Rules') === false) throw new Error('existing lost');
    if (d.content.includes('<!-- clear-thought:agents-guide:start -->') === false) throw new Error('no markers');
  });

  // --- toolset dispatch (one per toolset with fresh ops) ---
  record('toolset reasoning dispatch', await callTs('reasoning', { operation: 'sequentialthinking', thought: 'ts', thoughtNumber: 1, totalThoughts: 1, nextThoughtNeeded: false }),
    (d) => { if (d.status !== 'success') throw new Error('dispatch'); });
  record('toolset visualization dispatch (swot v2)', await callTs('visualization', { operation: 'swot_analysis', subject: 'x', strengths: ['s1'], threats: ['t1'] }),
    (d) => { if (d.mode !== 'analysis') throw new Error('dispatch'); });
  record('toolset utility dispatch (assumption_xray)', await callTs('utility', { operation: 'assumption_xray', claim: 'All rows are locked' }),
    (d) => { if (d.mode !== 'analysis') throw new Error('dispatch'); });

  // --- session lifecycle ---
  record('session_info', await call('session_info', {}),
    (d) => { if (d.sessionId === undefined && d.stats === undefined && d.session === undefined) throw new Error('no session data: ' + JSON.stringify(d).slice(0, 80)); });
  const exported = await call('session_export', {});
  record('session_export', exported,
    (d) => {
      const entries = Array.isArray(d) ? d : [d];
      if (entries.length === 0) throw new Error('empty export (session state expected)');
      if (entries.some((e) => e.sessionId === undefined && e.sessionType === undefined)) throw new Error('no sessionId/sessionType in export');
    });
  const payload = Array.isArray(exported) ? exported : [exported];
  record('session_import', await call('session_import', { sessionData: JSON.stringify(payload), merge: false }),
    (d) => { if (d.status !== 'success' && d.imported === undefined && d.restored === undefined) throw new Error('import shape: ' + JSON.stringify(d).slice(0, 80)); });

  // --- summary ---
  const failed = results.filter((r) => r.ok === false);
  console.log('\n========== SUMMARY ==========');
  console.log(`total: ${results.length} | ok: ${results.length - failed.length} | failed: ${failed.length}`);
  if (failed.length) {
    console.log('FAILED:');
    for (const f of failed) console.log(' - ' + f.name + ' :: ' + f.detail);
  }
  process.exit(failed.length ? 1 : 0);
};

run().catch((e) => { console.error('FATAL:', e.message); process.exit(1); });
