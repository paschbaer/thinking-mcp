import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { SessionState } from '../state/SessionState.js';
import type { MetacognitiveData } from '../types/index.js';

export function registerMetacognitiveMonitoring(server: McpServer, sessionState: SessionState) {
  server.tool(
    'metacognitive_monitoring',
    'Monitor and assess thinking processes and knowledge',
    {
      task: z.string().describe('The task or decision being assessed'),
      stage: z.string().describe('Current reasoning stage (e.g. planning, execution, review)'),
      overallConfidence: z.number().describe('Overall confidence in the reasoning, 0-1'),
      uncertaintyAreas: z.array(z.string()).describe('Areas of uncertainty affecting the confidence'),
      recommendedApproach: z.string().describe('Recommended approach going forward'),
      monitoringId: z.string().describe('Identifier for this monitoring session'),
      iteration: z.number().describe('Current iteration number'),
      nextAssessmentNeeded: z.boolean().describe('Whether another assessment is needed')
    },
    async (args) => {
      const metacognitiveData: MetacognitiveData = {
        task: args.task,
        stage: args.stage as MetacognitiveData['stage'],
        overallConfidence: args.overallConfidence,
        uncertaintyAreas: args.uncertaintyAreas,
        recommendedApproach: args.recommendedApproach,
        monitoringId: args.monitoringId,
        iteration: args.iteration,
        nextAssessmentNeeded: args.nextAssessmentNeeded
      };
      
      sessionState.addMetacognitive(metacognitiveData);
      
      // Get session context
      const stats = sessionState.getStats();
      const recentMonitoring = sessionState.getMetacognitiveSessions();
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            task: args.task,
            stage: args.stage,
            overallConfidence: args.overallConfidence,
            uncertaintyCount: args.uncertaintyAreas.length,
            nextAssessmentNeeded: args.nextAssessmentNeeded,
            status: 'success',
            sessionContext: {
              sessionId: sessionState.sessionId,
              totalOperations: stats.totalOperations,
              metacognitiveStoreStats: stats.stores.metacognitive,
              recentSessions: recentMonitoring.slice(-3).map((m: MetacognitiveData) => ({
                task: m.task,
                stage: m.stage,
                confidence: m.overallConfidence,
                iteration: m.iteration
              }))
            }
          }, null, 2)
        }]
      };
    }
  );
}