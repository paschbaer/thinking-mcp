import { execFileSync } from "node:child_process";
const sid = process.argv[2];
const summary = process.argv[3];
execFileSync("wsl.exe", ["-e", "bash", "-lc", "export NVM_DIR=$HOME/.nvm && . $NVM_DIR/nvm.sh >/dev/null 2>&1; cd /mnt/d/repos/Thinking-MCP && gitnexus analyze --no-stats --force >/dev/null 2>&1; node servers/server-guidance/scripts/check-index-freshness.mjs . && node servers/server-guidance/scripts/check-final-review.mjs ."], { stdio: "inherit", shell: true });
const r = await fetch("http://127.0.0.1:3003/mcp", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: 400, method: "tools/call", params: { name: "complete_workflow", arguments: { sessionId: sid, summary } } }) });
const q = JSON.parse(JSON.parse(await r.text()).result.content[0].text);
console.log("accepted=" + q.accepted, "ws=" + q.workflowStatus, "status=" + q.status, "phase=" + q.currentPhase, "next=" + (q.nextSessionId ?? "-"), q.error ? "ERR=" + q.error.code + " " + (q.error.message ?? "").slice(0, 200) : "");
for (const o of q.operations ?? []) if (o.status && o.status !== "succeeded") console.log("==", o.id, o.status, (o.errors ?? []).map((e) => e.message?.slice(0, 200)).join("; "));
