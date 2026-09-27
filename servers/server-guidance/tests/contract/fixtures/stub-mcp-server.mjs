/**
 * Minimal second MCP server (HTTP, stateless) used as a real downstream
 * endpoint in remote-downstream tests. Prints "PORT:<n>" on stderr once
 * listening. Usage: node stub-mcp-server.mjs [port] [countFile]
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import { z } from "zod";
import fs from "node:fs";

const port = Number(process.argv[2]) || 0;
const countFile = process.argv[3];
let count = 0;

const app = express();
app.use(express.json({ limit: "1mb" }));

app.post("/mcp", async (req, res) => {
  count += 1;
  try {
    fs.writeFileSync(countFile, JSON.stringify({ count }));
  } catch {
    /* best effort */
  }
  const server = new McpServer({ name: "stub-downstream", version: "1.0.0" });
  server.tool("echo", { message: z.string() }, async ({ message }) => ({
    content: [{ type: "text", text: `echo:${message}` }],
  }));
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  res.on("close", () => {
    void transport.close();
  });
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

const httpServer = app.listen(port, "127.0.0.1", () => {
  const actual = httpServer.address()?.port ?? port;
  console.error(`PORT:${actual}`);
});
