import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { SessionState } from '../state/SessionState.js';
import type { ArgumentData } from '../types/index.js';

export function registerStructuredArgumentation(server: McpServer, sessionState: SessionState) {
  server.tool(
    'structured_argumentation',
    'Construct and analyze structured arguments',
    {
      claim: z.string().describe('The claim being argued'),
      premises: z.array(z.string()).describe('Supporting premises for the claim'),
      conclusion: z.string().describe('The conclusion drawn from the premises'),
      argumentType: z.string().describe('Type of argument: deductive, inductive, abductive, or analogical'),
      confidence: z.number().describe('Confidence in the argument, 0-1'),
      nextArgumentNeeded: z.boolean().describe('Whether another argument iteration is needed')
    },
    async (args) => {
      const argumentData: ArgumentData = {
        claim: args.claim,
        premises: args.premises,
        conclusion: args.conclusion,
        argumentType: args.argumentType as ArgumentData['argumentType'],
        confidence: args.confidence,
        nextArgumentNeeded: args.nextArgumentNeeded,
        sessionId: sessionState.sessionId,
        iteration: 1
      };
      
      // Store using the addArgumentation method
      sessionState.addArgumentation(argumentData);
      
      // Get session context
      const stats = sessionState.getStats();
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            claim: args.claim,
            premisesCount: args.premises.length,
            argumentType: args.argumentType,
            confidence: args.confidence,
            nextArgumentNeeded: args.nextArgumentNeeded,
            status: 'success',
            sessionContext: {
              sessionId: sessionState.sessionId,
              totalOperations: stats.totalOperations,
              creativeStoreStats: stats.stores.creative
            }
          }, null, 2)
        }]
      };
    }
  );
}