// One-off gap audit for RB-10 (typed outputSchemas + human titles + param
// descriptions). Run: npx tsx scripts/audit-tool-metadata.ts
// Prints per-tool: annotations.title, input props missing descriptions,
// outputSchema top-level property count (0 = passthrough-only).
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import createClearThoughtServer from '../src/index.js';

interface JsonSchemaLike {
  properties?: Record<string, { description?: unknown }>;
  [key: string]: unknown;
}

interface ToolInfo {
  name: string;
  title?: string;
  description?: string;
  inputSchema: JsonSchemaLike;
  outputSchema?: JsonSchemaLike;
  annotations?: Record<string, unknown>;
}

const server = createClearThoughtServer({
  sessionId: 'audit-rb10',
  config: { sessionId: 'audit-rb10' } as never
});
const client = new Client({ name: 'rb10-audit', version: '0.0.0' });
const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

try {
  const { tools } = await client.listTools();
  const rows = tools.map((tool: ToolInfo) => {
    const props = tool.inputSchema?.properties ?? {};
    const missingDescriptions = Object.entries(props)
      .filter(([, schema]) => typeof (schema as { description?: unknown }).description !== 'string')
      .map(([key]) => key);
    const outputProps = Object.keys(tool.outputSchema?.properties ?? {}).length;
    const title = tool.annotations?.title as string | undefined;
    const titleIsHuman =
      typeof title === 'string' && /[A-Z]/.test(title) && title !== tool.name;
    return {
      name: tool.name,
      title,
      titleIsHuman,
      outputProps,
      missingParamDescriptions: missingDescriptions
    };
  });

  const byName = [...rows].sort((a, b) => a.name.localeCompare(b.name));
  console.log(`total tools: ${rows.length}\n`);
  for (const row of byName) {
    const flags = [
      row.titleIsHuman ? 'title-ok' : `title-generic(${row.title ?? 'none'})`,
      row.outputProps > 0 ? `out-props:${row.outputProps}` : 'out-passthrough',
      row.missingParamDescriptions.length
        ? `params-missing-desc:[${row.missingParamDescriptions.join(', ')}]`
        : 'params-ok'
    ];
    console.log(`${row.name.padEnd(28)} ${flags.join('  ')}`);
  }

  const needTitle = byName.filter((r) => !r.titleIsHuman).map((r) => r.name);
  const needOutput = byName.filter((r) => r.outputProps === 0).map((r) => r.name);
  const needParams = byName.filter((r) => r.missingParamDescriptions.length > 0);
  console.log(`\n=== SUMMARY ===`);
  console.log(`tools with generic/missing title : ${needTitle.length}`);
  console.log(`tools with passthrough output     : ${needOutput.length}`);
  console.log(`tools with undescribed params     : ${needParams.length}`);
  for (const row of needParams) {
    console.log(`  ${row.name}: [${row.missingParamDescriptions.join(', ')}]`);
  }
} finally {
  await client.close();
  await server.close();
}
