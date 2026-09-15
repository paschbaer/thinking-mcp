import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { SessionState } from '../state/SessionState.js';
import type { DecisionData } from '../types/index.js';

export function registerDecisionFramework(server: McpServer, sessionState: SessionState) {
  server.tool(
    'decision_framework',
    'Apply structured decision-making frameworks',
    {
      decisionStatement: z.string().describe('The decision to be made'),
      options: z.array(z.object({
        name: z.string(),
        description: z.string()
      })).describe('The options under consideration'),
      analysisType: z.string().describe('Type of analysis (e.g. architecture, technology, process)'),
      stage: z.string().describe('Current analysis stage'),
      decisionId: z.string().describe('Identifier for this decision analysis'),
      iteration: z.number().describe('Current iteration number'),
      nextStageNeeded: z.boolean().describe('Whether another analysis stage is needed')
    },
    async (args) => {
      const decisionData: DecisionData = {
        decisionStatement: args.decisionStatement,
        options: args.options,
        analysisType: args.analysisType as DecisionData['analysisType'],
        stage: args.stage as DecisionData['stage'],
        decisionId: args.decisionId,
        iteration: args.iteration,
        nextStageNeeded: args.nextStageNeeded
      };
      
      sessionState.addDecision(decisionData);
      
      // Get session context
      const stats = sessionState.getStats();
      const recentDecisions = sessionState.getDecisions();
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            decisionId: args.decisionId,
            stage: args.stage,
            analysisType: args.analysisType,
            optionsCount: args.options.length,
            nextStageNeeded: args.nextStageNeeded,
            status: 'success',
            sessionContext: {
              sessionId: sessionState.sessionId,
              totalOperations: stats.totalOperations,
              decisionStoreStats: stats.stores.decisions,
              recentDecisions: recentDecisions.slice(-3).map((d: DecisionData) => ({
                decisionId: d.decisionId,
                stage: d.stage,
                iteration: d.iteration
              }))
            }
          }, null, 2)
        }]
      };
    }
  );
}