const sid = process.argv[2];
const r = await fetch("http://127.0.0.1:3003/mcp", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: 99, method: "tools/call", params: { name: "get_workflow_state", arguments: { sessionId: sid } } }) });
const p = JSON.parse(JSON.parse(await r.text()).result.content[0].text);
console.log(p.status, p.currentPhase, p.error ? p.error.code : "");
