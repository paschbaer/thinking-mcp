import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { SessionState } from '../state/SessionState.js';
import { ToolsetRegistry, collectOperations } from './registry.js';

import { registerSequentialThinking } from '../tools/sequential-thinking.js';
import { registerMentalModel } from '../tools/mental-model.js';
import { registerDebuggingApproach } from '../tools/debugging-approach.js';
import { registerCollaborativeReasoning } from '../tools/collaborative-reasoning.js';
import { registerDecisionFramework } from '../tools/decision-framework.js';
import { registerMetacognitiveMonitoring } from '../tools/metacognitive.js';
import { registerSocraticMethod } from '../tools/socratic-method.js';
import { registerCreativeThinking } from '../tools/creative-thinking.js';
import { registerSystemsThinking } from '../tools/systems-thinking.js';
import { registerScientificMethod } from '../tools/scientific-method.js';
import { registerStructuredArgumentation } from '../tools/structured-argumentation.js';
import { registerArgumentMap } from '../tools/argument-map.js';
import { registerCausalGraph } from '../tools/causal-graph.js';
import { registerFermiEstimate } from '../tools/fermi-estimate.js';
import { registerGameMatrix } from '../tools/game-matrix.js';

export function registerReasoningToolset(server: McpServer, state: SessionState): void {
  const registry = new ToolsetRegistry('reasoning', 'Reasoning operations');
  [
    registerSequentialThinking,
    registerMentalModel,
    registerDebuggingApproach,
    registerCollaborativeReasoning,
    registerDecisionFramework,
    registerMetacognitiveMonitoring,
    registerSocraticMethod,
    registerCreativeThinking,
    registerSystemsThinking,
    registerScientificMethod,
    registerStructuredArgumentation,
    registerArgumentMap,
    registerCausalGraph,
    registerFermiEstimate,
    registerGameMatrix
  ].forEach(fn => {
    collectOperations(fn, state).forEach(op => registry.addOperation(op));
  });
  registry.register(server);
}
