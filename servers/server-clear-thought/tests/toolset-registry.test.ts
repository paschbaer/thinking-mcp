import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { defaultConfig } from '../src/config.js';
import { SessionState } from '../src/state/SessionState.js';
import { registerUtilityToolset } from '../src/toolsets/utility.js';
import { registerReasoningToolset } from '../src/toolsets/reasoning.js';
import { ToolsetRegistry } from '../src/toolsets/registry.js';

function setupServer() {
  const server = new McpServer({ name: 'test', version: '0.0.0' });
  const state = new SessionState('test', defaultConfig);
  return { server, state };
}

function getTool(server: McpServer, name: string): any {
  return (server as any)._registeredTools[name];
}

it('advertises an operation enum covering every utility operation', () => {
  const { server, state } = setupServer();
  registerUtilityToolset(server, state);
  const json: any = zodToJsonSchema(getTool(server, 'utility').inputSchema);
  const op = json.properties.operation;
  expect(op.type).toBe('string');
  expect(op.enum).toEqual(
    expect.arrayContaining([
      'analogical_mapper',
      'assumption_xray',
      'comparative_advantage',
      'drag_point_audit',
      'safe_struggle_designer',
      'seven_seekers_orchestrator',
      'value_of_information',
      'existing_tool_example'
    ])
  );
  expect(json.required).toContain('operation');
});

it('advertises field schemas for reasoning operations', () => {
  const { server, state } = setupServer();
  registerReasoningToolset(server, state);
  const json: any = zodToJsonSchema(getTool(server, 'reasoning').inputSchema);
  expect(json.properties.operation.enum).toContain('sequentialthinking');
  expect(json.properties.thought).toBeDefined();
  expect(json.properties.thought.description).toBeDefined();
});

it('rejects unknown operations with a descriptive error', async () => {
  const { server, state } = setupServer();
  registerUtilityToolset(server, state);
  const handler = getTool(server, 'utility').handler;
  await expect(handler({ operation: 'nope' }, {})).rejects.toThrow(/Invalid arguments for operation 'nope'/);
});

it('rejects operations with missing required fields', async () => {
  const { server, state } = setupServer();
  registerUtilityToolset(server, state);
  const handler = getTool(server, 'utility').handler;
  // assumption_xray requires `claim`; a valid operation with a missing field
  // must fail strict per-operation validation, not dispatch with undefined.
  await expect(handler({ operation: 'assumption_xray', context: 'x' }, {})).rejects.toThrow(
    /Invalid arguments for operation 'assumption_xray'.*claim: Required/
  );
});

it('rejects unknown operations listing the valid operations', async () => {
  const { server, state } = setupServer();
  registerUtilityToolset(server, state);
  const handler = getTool(server, 'utility').handler;
  await expect(handler({ operation: 'nope' }, {})).rejects.toThrow(
    /unknown operation\. Valid operations: analogical_mapper/
  );
});

it('dispatches sequentialthinking through the reasoning toolset', async () => {
  const { server, state } = setupServer();
  registerReasoningToolset(server, state);
  const handler = getTool(server, 'reasoning').handler;
  const result = await handler(
    {
      operation: 'sequentialthinking',
      thought: 'step one',
      thoughtNumber: 1,
      totalThoughts: 2,
      nextThoughtNeeded: true
    },
    {}
  );
  const data = JSON.parse(result.content[0].text);
  expect(data.status).toBe('success');
});

it('resolves advertised field collisions first-wins but validates per operation', async () => {
  // Regression test for review finding E4: when two operations share a field
  // name, the advertised (flat) schema uses the FIRST definition; the strict
  // per-operation validator still enforces each operation's own field type.
  const { server } = setupServer();
  const registry = new ToolsetRegistry('collide', 'Collision semantics');
  registry.addOperation({
    name: 'first',
    description: 'string payload',
    schema: { payload: z.string() },
    handler: async (args) => ({ content: [{ type: 'text', text: `first:${args.payload}` }] })
  });
  registry.addOperation({
    name: 'second',
    description: 'number payload',
    schema: { payload: z.number() },
    handler: async (args) => ({ content: [{ type: 'text', text: `second:${args.payload}` }] })
  });
  registry.register(server);

  const json: any = zodToJsonSchema(getTool(server, 'collide').inputSchema);
  expect(json.properties.payload.type).toBe('string'); // first definition wins

  const handler = getTool(server, 'collide').handler;
  await expect(handler({ operation: 'second', payload: 'not-a-number' }, {})).rejects.toThrow(
    /payload/
  );
  // symmetric case: the advertised string type must not weaken `first` either
  await expect(handler({ operation: 'first', payload: 42 }, {})).rejects.toThrow(
    /Invalid arguments for operation 'first'.*payload/
  );
  const ok = await handler({ operation: 'second', payload: 42 }, {});
  expect(ok.content[0].text).toBe('second:42');
});

it('rejects operations declaring the reserved operation field', () => {
  const { server } = setupServer();
  const registry = new ToolsetRegistry('guard', 'Reserved field guard');
  expect(() =>
    registry.addOperation({
      name: 'bad',
      description: 'declares a reserved field',
      schema: { operation: z.string() },
      handler: async () => ({ content: [{ type: 'text', text: 'never' }] })
    })
  ).toThrow(/reserved 'operation' field/);
});

it('lists valid operations when arguments are missing entirely', async () => {
  const { server, state } = setupServer();
  registerUtilityToolset(server, state);
  const handler = getTool(server, 'utility').handler;
  await expect(handler(undefined, {})).rejects.toThrow(
    /unknown operation\. Valid operations: analogical_mapper/
  );
});
