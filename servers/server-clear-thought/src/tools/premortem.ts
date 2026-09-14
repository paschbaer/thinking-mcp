import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export function registerPremortem(server: McpServer, _sessionState: unknown) {
  server.tool(
    'premortem',
    'Run a pre-mortem: imagine the project failed after the given timeframe, ' +
      'rank the failure causes by likelihood × impact and check mitigation ' +
      'coverage. With `failure_causes` provided the analysis is computed; ' +
      'without it a facilitation scaffold with guiding questions is returned',
    {
      project: z.string().trim().min(1).describe('The project or plan under examination'),
      timeframe_months: z
        .number()
        .int()
        .min(1)
        .max(60)
        .optional()
        .describe('Horizon of the failure scenario in months (default 6)'),
      failure_causes: z
        .array(
          z.object({
            cause: z.string().trim().min(1),
            likelihood: z.number().int().min(1).max(5).describe('1 = unlikely, 5 = almost certain'),
            impact: z.number().int().min(1).max(5).describe('1 = negligible, 5 = fatal'),
            mitigation: z.string().trim().optional()
          })
        )
        .optional()
        .describe('Failure causes — providing it switches from facilitation to analysis mode'),
      top_n: z
        .number()
        .int()
        .min(1)
        .optional()
        .describe('How many top risks to report (default 3)')
    },
    async ({ project, timeframe_months, failure_causes, top_n }) => {
      const horizon = timeframe_months ?? 6;
      const mode =
        failure_causes && failure_causes.length > 0 ? 'analysis' : 'facilitation';

      let response: Record<string, unknown>;
      if (mode === 'facilitation') {
        response = {
          mode,
          project,
          timeframe_months: horizon,
          guiding_questions: [
            `It is ${horizon} months from now and "${project}" has failed — what were the three most likely causes?`,
            'Which assumptions did we never validate?',
            'Which dependencies (people, vendors, technology) could break the plan?',
            'What early-warning signals would have appeared weeks before the failure?',
            'For each cause: how likely was it (1–5) and how damaging was it (1–5)?'
          ],
          nextSteps: [
            'Re-run with `failure_causes` filled (cause, likelihood 1–5, impact 1–5, optional mitigation) to rank and quantify the risks.'
          ],
          status: 'success'
        };
      } else {
        const causes = failure_causes!;
        const risks = causes
          .map((c) => ({
            cause: c.cause,
            likelihood: c.likelihood,
            impact: c.impact,
            score: c.likelihood * c.impact,
            mitigation: c.mitigation ?? null
          }))
          .sort((a, b) => b.score - a.score);
        const count = Math.min(top_n ?? 3, risks.length);
        const withMitigation = risks.filter((r) => r.mitigation).length;

        response = {
          mode: 'analysis',
          project,
          timeframe_months: horizon,
          risk_count: risks.length,
          risks,
          top_risks: risks.slice(0, count),
          mitigation_coverage: Math.round((withMitigation / risks.length) * 100),
          nextSteps: [
            'Add mitigations for the highest-scored causes without one.',
            'Re-run once mitigations are planned to verify the coverage improves.'
          ],
          status: 'success'
        };
      }

      return { content: [{ type: 'text', text: JSON.stringify(response, null, 2) }] };
    }
  );
}
