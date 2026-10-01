import { loadConfig } from "/workspaces/Thinking-MCP/servers/server-guidance/dist/config.js";
import { join } from "node:path";
const pool = loadConfig("/workspaces/.guidance", { workspaceRoot: "/workspaces" });
const repo = loadConfig("/workspaces/Thinking-MCP/.guidance", { workspaceRoot: "/workspaces/Thinking-MCP" });
console.log("pool:", pool.configVersion);
console.log("repo:", repo.configVersion);
console.log("pool workspaces:", JSON.stringify(pool.workspaces.list()));
console.log("repo workspaces:", JSON.stringify(repo.workspaces.list()));
