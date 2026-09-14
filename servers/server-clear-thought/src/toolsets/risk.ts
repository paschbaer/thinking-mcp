import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { SessionState } from '../state/SessionState.js';
import { ToolsetRegistry, collectOperations } from './registry.js';

import { registerPremortem } from '../tools/premortem.js';
import { registerFmea } from '../tools/fmea.js';
import { registerFaultTree } from '../tools/fault-tree.js';

export function registerRiskToolset(server: McpServer, state: SessionState): void {
  const registry = new ToolsetRegistry('risk', 'Risk analysis operations');

  collectOperations(registerPremortem, state).forEach((op) => registry.addOperation(op));
  collectOperations(registerFmea, state).forEach((op) => registry.addOperation(op));
  collectOperations(registerFaultTree, state).forEach((op) => registry.addOperation(op));

  registry.register(server);
}
