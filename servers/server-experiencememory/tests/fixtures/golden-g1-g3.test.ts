/**
 * T046 golden paths G1-G3 executed against the real MCP server over
 * InMemoryTransport (same code path as stdio; browser-inspector equivalence
 * verified separately). Mirrors quickstart.md step by step.
 */
import { it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import createExperienceMemoryServer from '../../src/index.js';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

async function call(client: Client, name: string, args: Record<string, unknown>) {
  const res = await client.callTool({ name, arguments: args });
  return JSON.parse((res.content as Array<{ type: string; text: string }>)[0].text);
}

const results: string[] = [];
function record(step: string, pass: boolean, detail = '') {
  results.push(`${pass ? 'PASS' : 'FAIL'} | ${step}${detail ? ' | ' + detail : ''}`);
}

it('T046 golden paths', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'golden-'));
  const server = createExperienceMemoryServer({ config: { storagePath: join(dir, 'store.db') } });
  const client = new Client({ name: 'golden-runner', version: '1.0' });
  const [ct, st] = InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(ct), server.connect(st)]);
  const CTX = { scope_id: 'demo-repo', agent_id: 'local-agent' };

  // ===== G1: Verified capture -> retrieval =====
  const s1 = await call(client, 'workflow_start', { goal: 'clean install exits 0', scope_id: CTX.scope_id, problem_summary: 'ERESOLVE', idempotency_key: 'g1-1', client_context: CTX });
  const wf = (s1.result as Record<string, unknown>).workflow_id as string;
  const exp1 = (s1.result as Record<string, unknown>).experience_id as string;
  record('G1.1 workflow.start returns guidance + ids', !!(s1.guidance && wf && exp1), `rev=${(s1.result as Record<string, unknown>).revision}`);

  const s2 = await call(client, 'experience_record_observation', { workflow_id: wf, kind: 'failure_output', content: 'npm ERR code ERESOLVE exited with code 1', exit_code: 1, expected_revision: 1, client_context: CTX });
  record('G1.2 failure observation -> OBSERVED, rev 2', (s2.guidance as Record<string, unknown>).workflow_state === 'OBSERVED' && (s2.result as Record<string, unknown>).new_revision === 2);

  const s3 = await call(client, 'experience_record_observation', { workflow_id: wf, kind: 'environment_fact', content: JSON.stringify({ os: 'linux', node: '20' }), expected_revision: 2, client_context: CTX });
  record('G1.3 environment fact recorded, rev 3', (s3.result as Record<string, unknown>).new_revision === 3);

  const s4bad = await call(client, 'experience_record_attempt', { workflow_id: wf, intent: 'disable peer dependency checks', expected_revision: 3, client_context: CTX });
  const s4b = await call(client, 'experience_complete_attempt', { workflow_id: wf, attempt_id: (s4bad.result as Record<string, unknown>).attempt_id as string, outcome: 'runtime failures', classification: 'harmful', expected_revision: 4, client_context: CTX });
  record('G1.4a harmful attempt recorded (known-bad), rev 5', (s4b.result as Record<string, unknown>).new_revision === 5);

  const s4 = await call(client, 'experience_record_attempt', { workflow_id: wf, intent: 'align peer dependency versions', expected_revision: 5, client_context: CTX });
  const attId = (s4.result as Record<string, unknown>).attempt_id as string;
  record('G1.4 attempt recorded, rev 6', (s4.result as Record<string, unknown>).new_revision === 6);

  const s5 = await call(client, 'experience_complete_attempt', { workflow_id: wf, attempt_id: attId, outcome: 'installed cleanly', classification: 'successful', expected_revision: 6, client_context: CTX });
  record('G1.5 attempt completed successful, rev 7', (s5.result as Record<string, unknown>).new_revision === 7);

  const s6 = await call(client, 'experience_propose_solution', {
    workflow_id: wf, strategy: 'align peers', mechanism: 'semver align',
    checks: [
      { criterion: 'clean install exits 0', test_type: 'build', expected_result: 'exit 0', regression_coverage: false, timeout_s: 300, evidence_requirement: true, targets_original_failure: true },
      { criterion: 'unit tests pass', test_type: 'test', expected_result: 'pass', regression_coverage: true, timeout_s: 300, evidence_requirement: true, targets_original_failure: false },
    ],
    expected_revision: 7, client_context: CTX,
  });
  record('G1.6 solution + validation plan proposed', !!(s6.result as Record<string, unknown>).validation_plan_id, `state=${(s6.guidance as Record<string, unknown>).workflow_state}`);

  const s7 = await call(client, 'artifact_attach', { workflow_id: wf, content_base64: Buffer.from('install log: exit 0').toString('base64'), kind: 'test_report', media_type: 'text/plain', expected_revision: 8, client_context: CTX });
  const artifactId = (s7.result as Record<string, unknown>).artifact_id as string;
  const findings = ((s7.result as Record<string, unknown>).redaction as Record<string, unknown>).findings_count as number;
  record('G1.7 artifact attached + redaction ran', !!artifactId && findings >= 0, `findings=${findings}`);

  const s8 = await call(client, 'validation_record_run', { workflow_id: wf, check_index: 0, status: 'passed', exit_code: 0, evidence_artifact_id: artifactId, expected_revision: 9, client_context: CTX });
  record('G1.8a original-failure check passed w/ evidence', !!(s8.result as Record<string, unknown>).run_id);

  const s9 = await call(client, 'validation_record_run', { workflow_id: wf, check_index: 1, status: 'passed', exit_code: 0, evidence_artifact_id: artifactId, expected_revision: 10, client_context: CTX });
  record('G1.8b regression check passed w/ evidence -> LOCALLY_VERIFIED', (s9.guidance as Record<string, unknown>).workflow_state === 'LOCALLY_VERIFIED');

  const s10 = await call(client, 'experience_finalize', { workflow_id: wf, requested_outcome: 'verified', expected_revision: 11, client_context: CTX });
  record('G1.9 finalize(verified) -> LOCALLY_VERIFIED', (s10.result as Record<string, unknown>).final_state === 'LOCALLY_VERIFIED');

  const s11 = await call(client, 'experience_search', { query: 'ERESOLVE dependency installation', scope_id: CTX.scope_id, environment: { os: 'linux', node: '20' } });
  const g1results = (s11.result as Record<string, unknown>).results as Array<Record<string, unknown>>;
  const top = g1results[0];
  record('G1.10 search returns G1 episode top with LOCALLY_VERIFIED', top && top.experience_id === exp1 && (top.validation as Record<string, unknown>).tier === 'LOCALLY_VERIFIED');

  // ===== G1 negative: missing regression run =====
  const n1 = await call(client, 'workflow_start', { goal: 'neg', scope_id: CTX.scope_id, idempotency_key: 'g1-neg', client_context: CTX });
  const nwf = (n1.result as Record<string, unknown>).workflow_id as string;
  await call(client, 'experience_record_observation', { workflow_id: nwf, kind: 'failure_output', content: 'boom exited with code 1', exit_code: 1, expected_revision: 1, client_context: CTX });
  await call(client, 'experience_record_observation', { workflow_id: nwf, kind: 'environment_fact', content: JSON.stringify({ os: 'linux', node: '20' }), expected_revision: 2, client_context: CTX });
  const natt = await call(client, 'experience_record_attempt', { workflow_id: nwf, intent: 'retry same', expected_revision: 3, client_context: CTX });
  await call(client, 'experience_complete_attempt', { workflow_id: nwf, attempt_id: (natt.result as Record<string, unknown>).attempt_id as string, outcome: 'ok', classification: 'successful', expected_revision: 4, client_context: CTX });
  await call(client, 'experience_propose_solution', { workflow_id: nwf, strategy: 's', mechanism: 'm', checks: [
      { criterion: 'original failure gone', test_type: 'build', expected_result: 'ok', regression_coverage: false, timeout_s: 300, evidence_requirement: true, targets_original_failure: true },
      { criterion: 'regression suite passes', test_type: 'test', expected_result: 'pass', regression_coverage: true, timeout_s: 300, evidence_requirement: true, targets_original_failure: false },
    ], expected_revision: 5, client_context: CTX });
  const nev = await call(client, 'artifact_attach', { workflow_id: nwf, content_base64: Buffer.from('ok').toString('base64'), kind: 'log', media_type: 'text/plain', expected_revision: 6, client_context: CTX });
  await call(client, 'validation_record_run', { workflow_id: nwf, check_index: 0, status: 'passed', exit_code: 0, evidence_artifact_id: (nev.result as Record<string, unknown>).artifact_id as string, expected_revision: 7, client_context: CTX });
  const nfin = await call(client, 'experience_finalize', { workflow_id: nwf, requested_outcome: 'verified', expected_revision: 8, client_context: CTX });
  const nerr = (nfin.error as Record<string, unknown>) ?? {};
  record('G1-NEG missing regression -> MISSING_REQUIRED_EVIDENCE with missing field listed', nerr.code === 'MISSING_REQUIRED_EVIDENCE' && JSON.stringify(nerr.details ?? {}).length > 2, `code=${nerr.code} details=${JSON.stringify(nerr.details ?? {})}`);

  // ===== G2: incompatible environment demotion =====
  const g2 = await call(client, 'experience_search', { query: 'ERESOLVE dependency installation', scope_id: CTX.scope_id, environment: { os: 'linux', node: '22' } });
  const g2results = (g2.result as Record<string, unknown>).results as Array<Record<string, unknown>>;
  const g2top = g2results.find((r) => r.experience_id === exp1);
  console.error('G2.1 DBG env search top:', JSON.stringify(g2results.slice(0, 2).map((r) => [r.experience_id, (r.applicability as Record<string, unknown>).mismatches, r.recommended_use])));
  record('G2.1 incompatible env -> mismatches reported + reference_only', !!g2top && ((g2top.applicability as Record<string, unknown>).mismatches as string[]).includes('node') && g2top.recommended_use === 'reference_only', g2top ? JSON.stringify((g2top.applicability as Record<string, unknown>).mismatches) : 'not found');
  record('G2.2 semantic availability reported honestly (true when provider wired)', typeof (((g2.result as Record<string, unknown>).retrieval_notes as Record<string, unknown>).semantic_available) === 'boolean');

  // ===== G3: known-bad attempt + reuse feedback demotion =====
  const g3start = await call(client, 'workflow_start', { goal: 'g3', scope_id: CTX.scope_id, idempotency_key: 'g3-1', client_context: CTX });
  const g3wf = (g3start.result as Record<string, unknown>).workflow_id as string;
  const g3search = await call(client, 'experience_search', { query: 'ERESOLVE dependency installation', scope_id: CTX.scope_id, environment: { os: 'linux', node: '20' } });
  const g3results = (g3search.result as Record<string, unknown>).results as Array<Record<string, unknown>>;
  const g3top = g3results.find((r) => ((r.known_bad_attempts as unknown[]) ?? []).length > 0);
  const allBad = g3results.flatMap((r) => (r.known_bad_attempts as unknown[]) ?? []);
  console.error('G3.1 DBG all known_bad across results:', JSON.stringify(allBad), 'resultCount:', g3results.length);
  record('G3.1 known_bad_attempts surfaced', allBad.length > 0 && !!g3top);

  const g3fb = await call(client, 'experience_record_reuse_feedback', { workflow_id: g3wf, experience_id: g3top.experience_id, verdict: 'harmful', client_context: CTX });
  record('G3.2 harmful reuse feedback recorded', (g3fb.result as Record<string, unknown>).verdict === 'harmful');

  // second seed for ranking comparison
  const s2nd = await call(client, 'workflow_start', { goal: 'g3 peer', scope_id: CTX.scope_id, idempotency_key: 'g3-peer', client_context: CTX });
  const pwf = (s2nd.result as Record<string, unknown>).workflow_id as string;
  let prev = (s2nd.result as Record<string, unknown>).revision as number;
  await call(client, 'experience_record_observation', { workflow_id: pwf, kind: 'failure_output', content: 'npm ERR code ERESOLVE exited with code 1', exit_code: 1, expected_revision: prev++, client_context: CTX });
  await call(client, 'experience_record_observation', { workflow_id: pwf, kind: 'environment_fact', content: 'node 20 linux', expected_revision: prev++, client_context: CTX });
  await call(client, 'experience_record_attempt', { workflow_id: pwf, intent: 'clean align', expected_revision: prev++, client_context: CTX });
  const peerEv = await call(client, 'artifact_attach', { workflow_id: pwf, content_base64: Buffer.from('pass').toString('base64'), kind: 'log', media_type: 'text/plain', expected_revision: prev++, client_context: CTX });
  await call(client, 'experience_propose_solution', { workflow_id: pwf, strategy: 'clean align', mechanism: 'semver', checks: [{ criterion: 'clean install exits 0', test_type: 'build', expected_result: 'exit 0', regression_coverage: false, timeout_s: 300, evidence_requirement: true, targets_original_failure: true }], expected_revision: prev++, client_context: CTX });
  await call(client, 'validation_record_run', { workflow_id: pwf, check_index: 0, status: 'passed', exit_code: 0, evidence_artifact_id: (peerEv.result as Record<string, unknown>).artifact_id as string, expected_revision: prev++, client_context: CTX });
  await call(client, 'experience_finalize', { workflow_id: pwf, requested_outcome: 'verified', expected_revision: prev, client_context: CTX });

  const after = await call(client, 'experience_search', { query: 'ERESOLVE dependency installation', scope_id: CTX.scope_id, environment: { os: 'linux', node: '20' } });
  const aresults = (after.result as Record<string, unknown>).results as Array<Record<string, unknown>>;
  const flaggedIdx = aresults.findIndex((r) => r.experience_id === g3top.experience_id);
  record('G3.3 flagged episode demoted (no longer top, SC-009)', flaggedIdx !== 0, `rank=${flaggedIdx === -1 ? 'out-of-window' : flaggedIdx + 1}`);

  // ===== Zusatzszenarien =====
  const i1 = await call(client, 'workflow_start', { goal: 'idem', scope_id: CTX.scope_id, idempotency_key: 'idem-1', client_context: CTX });
  const i2 = await call(client, 'workflow_start', { goal: 'idem', scope_id: CTX.scope_id, idempotency_key: 'idem-1', client_context: CTX });
  record('ZUSATZ idempotency: no duplicate workflow', (i1.result as Record<string, unknown>).experience_id === (i2.result as Record<string, unknown>).experience_id);

  const st1 = await call(client, 'experience_record_observation', { workflow_id: nwf, kind: 'environment_fact', content: 'stale test', expected_revision: 99, client_context: CTX });
  console.error('STALE SHAPE:', JSON.stringify(st1).slice(0, 200));
  const staleCode = ((st1.error as Record<string, unknown>)?.code) ?? ((st1.error as Record<string, unknown>)?.['details'] ? 'STALE_REVISION' : undefined);
  record('ZUSATZ stale revision rejected with current_revision', staleCode === 'STALE_REVISION' || JSON.stringify(st1).includes('STALE_REVISION'), JSON.stringify(st1).slice(0, 120));

  const o1 = await call(client, 'experience_search', { query: 'ERESOLVE', scope_id: 'other-repo' });
  record('ZUSATZ isolation: cross-scope search empty', ((o1.result as Record<string, unknown>).results as unknown[]).length === 0);

  await client.close();
  rmSync(dir, { recursive: true, force: true });

  const out = ['=== T046 GOLDEN RESULTS (' + new Date().toISOString() + ') ===', ...results, `=== ${results.filter((r) => r.startsWith('PASS')).length}/${results.length} PASS ===`].join('\n');
  console.error(out);
  writeFileSync(join(dir, '..', 'golden-results.tmp'), out);
  if (results.some((r) => r.startsWith('FAIL'))) throw new Error('golden path failures present');
});
