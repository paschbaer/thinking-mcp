import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { SessionState } from '../state/SessionState.js';
import { ToolsetRegistry, collectOperations } from './registry.js';

import { registerRecipeRunner } from '../tools/recipe-runner.js';

export function registerWorkflowToolset(server: McpServer, state: SessionState): void {
  const registry = new ToolsetRegistry('workflow', 'Workflow navigation operations');

  collectOperations(registerRecipeRunner, state).forEach((op) => registry.addOperation(op));

  registry.register(server);
}
