const base = "http://127.0.0.1:3000/mcp";
const init = await fetch(base, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: 0, method: "initialize", params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "zed-agent", version: "1.0" } } }) });
const sid = init.headers.get("mcp-session-id");
await fetch(base, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", "Mcp-Session-Id": sid }, body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) });
const thoughts = [
  ["US1 step 1/4 (recon): two production areas are in play. (a) Successor-born-invalid defect: successor creation composes configurationVersion from a different workspace root than start_workflow - fix the composition root so both paths hash identically (AC-16). (b) registry-register tool: new MCP tool, WorkspaceRegistry.build exclusive, atomic persist, audit, new configurationVersion, flag-gated.", true],
  ["US1 step 2/4 (rebind semantics): getWorkflowState guard (WorkflowEngine.ts:641-648) currently throws fail-closed on any hash mismatch. New semantics: status completed -> return session (survives); active/blocked -> run full re-validation (re-compose config and WorkspaceRegistry.build; on success rebind session.configurationVersion to current + audit session_rebound; on failure keep fail-closed). The rebind happens at activation/state access.", true],
  ["US1 step 3/4 (tool shape): registry-register follows the existing MCP tool registration pattern; arguments { name, root, projectName?, remove? }; execution path: WorkspaceRegistry.build over the complete new registry (existing entries + change), atomic write of the instance registry section, audit event registry_changed, configurationVersion recomputed; tool gated by config flag default OFF (fail-closed when disabled).", true],
  ["US1 step 4/4 (verification plan): contract tests FIRST for rebind semantics (AC-13..17 incl. AC-16 successor-composition regression), focused + full suite + typecheck + prettier(src) via WSL, integration pool onboarding test, independent review, then completion with pre-checked gates.", false],
];
for (let i = 0; i < thoughts.length; i++) {
  const body = { jsonrpc: "2.0", id: i + 1, method: "tools/call", params: { name: "sequential_thinking", arguments: { thought: thoughts[i][0], thoughtNumber: i + 1, totalThoughts: 4, nextThoughtNeeded: thoughts[i][1] } } };
  const r = await fetch(base, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", "Mcp-Session-Id": sid }, body: JSON.stringify(body) });
  const t = await r.text();
  console.log(i + 1, t.includes('"result"') ? "OK" : t.slice(0, 150));
}
