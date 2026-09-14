import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export function registerFmea(server: McpServer, _sessionState: unknown) {
  server.tool(
    'fmea',
    'Failure Mode and Effects Analysis: compute the Risk Priority Number ' +
      '(RPN = severity × occurrence × detection) for each failure mode, rank ' +
      'them and flag every RPN at or above the threshold. With ' +
      '`failure_modes` provided the analysis is computed; without it a ' +
      'facilitation scaffold with guiding questions is returned',
    {
      scope: z.string().trim().min(1).describe('The system, module or process being analysed'),
      failure_modes: z
        .array(
          z.object({
            failure_mode: z.string().trim().min(1),
            potential_cause: z.string().trim().optional(),
            effect: z.string().trim().optional(),
            severity: z.number().int().min(1).max(10).describe('1 = no effect, 10 = hazardous'),
            occurrence: z.number().int().min(1).max(10).describe('1 = remote, 10 = inevitable'),
            detection: z.number().int().min(1).max(10).describe('1 = certain detection, 10 = undetectable'),
            current_controls: z.string().trim().optional(),
            recommended_action: z.string().trim().optional()
          })
        )
        .optional()
        .describe('Failure modes — providing it switches from facilitation to analysis mode'),
      rpn_threshold: z
        .number()
        .int()
        .min(1)
        .max(1000)
        .optional()
        .describe('RPN at or above which a failure mode is flagged for action (default 100)')
    },
    async ({ scope, failure_modes, rpn_threshold }) => {
      const threshold = rpn_threshold ?? 100;
      const mode =
        failure_modes && failure_modes.length > 0 ? 'analysis' : 'facilitation';

      let response: Record<string, unknown>;
      if (mode === 'facilitation') {
        response = {
          mode,
          scope,
          guiding_questions: [
            'Which components or steps could fail at all? List one failure mode per row.',
            'For each failure mode: what is the effect on the user, and what is the root cause?',
            'How severe is the effect (1–10), how often does it occur (1–10), and how likely is it to be detected BEFORE impact (10 = never detected)?',
            'Which controls exist today, and which action would reduce severity, occurrence or detection?',
            'Set `failure_modes` accordingly — rows at or above an RPN of 100 will be flagged for action.'
          ],
          nextSteps: [
            'Re-run with `failure_modes` filled (failure_mode, severity 1–10, occurrence 1–10, detection 1–10, optional causes/effects/actions) to compute and rank the RPNs.'
          ],
          status: 'success'
        };
      } else {
        const modes = failure_modes!.map((f) => ({
          failure_mode: f.failure_mode,
          potential_cause: f.potential_cause ?? null,
          effect: f.effect ?? null,
          severity: f.severity,
          occurrence: f.occurrence,
          detection: f.detection,
          rpn: f.severity * f.occurrence * f.detection,
          flagged: f.severity * f.occurrence * f.detection >= threshold,
          current_controls: f.current_controls ?? null,
          recommended_action: f.recommended_action ?? null
        }));
        const rows = modes.sort((a, b) => b.rpn - a.rpn);
        const mean = rows.reduce((acc, r) => acc + r.rpn, 0) / rows.length;
        const flagged = rows.filter((r) => r.flagged).length;

        response = {
          mode: 'analysis',
          scope,
          rpn_threshold: threshold,
          rows,
          mean_rpn: Math.round(mean * 100) / 100,
          max_rpn: rows[0].rpn,
          flagged_count: flagged,
          nextSteps: [
            'Start with the flagged rows: define `recommended_action` and re-rate severity/occurrence/detection after mitigation.',
            'Re-run the analysis to verify the RPNs dropped below the threshold.'
          ],
          status: 'success'
        };
      }

      return { content: [{ type: 'text', text: JSON.stringify(response, null, 2) }] };
    }
  );
}
