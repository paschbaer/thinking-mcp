import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { SessionState } from '../state/SessionState.js';

export function registerSafeStruggleDesigner(server: McpServer, _sessionState: SessionState) {
  server.tool(
    'safe_struggle_designer',
    'Design a safe skill improvement plan: level ladder derived from the ' +
      'level gap, success criteria and prerequisite chain per step, safety ' +
      'measures and a review interval derived from the gap or a deadline. ' +
      'Time constraints (hours_per_week / session_minutes) yield an ' +
      'estimated duration and deadline-overrun warnings',
    {
      skill: z.string().trim().min(1),
      current_level: z.number().int().min(0),
      target_level: z.number().int().min(0),
      hours_per_week: z
        .number()
        .positive()
        .optional()
        .describe('Practice time budget per week — enables an estimated plan duration'),
      session_minutes: z
        .number()
        .int()
        .positive()
        .optional()
        .describe('Length of one practice session in minutes (default 60)'),
      deadline_weeks: z
        .number()
        .positive()
        .optional()
        .describe('Hard deadline in weeks — review interval is derived from it and overruns are warned about')
    },
    async ({ skill, current_level, target_level, hours_per_week, session_minutes, deadline_weeks }) => {
      if (target_level <= current_level) {
        throw new Error(
          `target_level (${target_level}) must be greater than current_level (${current_level})`
        );
      }

      const gap = target_level - current_level;
      const scaffold_steps: string[] = [];
      const success_criteria: string[] = [];
      const prerequisite_chain: Array<{ step: string; requires: string }> = [];

      for (let lvl = current_level + 1; lvl <= target_level; lvl++) {
        const step = `Practice ${skill} at level ${lvl} until ${skill} tasks at this level feel routine`;
        scaffold_steps.push(step);
        success_criteria.push(
          `Level ${lvl}: complete a representative ${skill} task at this level without assistance.`
        );
        prerequisite_chain.push({
          step,
          requires:
            lvl === current_level + 1
              ? `solid routine at level ${current_level}`
              : scaffold_steps[lvl - current_level - 2]
        });
      }

      const sessionsPerWeek = hours_per_week
        ? Math.max(1, Math.floor((hours_per_week * 60) / (session_minutes ?? 60)))
        : undefined;
      const estimated_weeks =
        sessionsPerWeek !== undefined ? Math.ceil(scaffold_steps.length / sessionsPerWeek) : undefined;

      const warnings: string[] = [];
      let review_intervals: string;
      if (deadline_weeks !== undefined) {
        const days = Math.max(2, Math.round((deadline_weeks * 7) / scaffold_steps.length));
        review_intervals = `every ${days} days (deadline-driven: ${deadline_weeks} weeks total)`;
        if (estimated_weeks !== undefined && estimated_weeks > deadline_weeks) {
          warnings.push(
            `Estimated duration ${estimated_weeks} weeks exceeds the ${deadline_weeks}-week deadline at ${hours_per_week} h/week — increase hours_per_week, raise session_minutes efficiency or move the deadline.`
          );
        }
      } else {
        review_intervals = gap <= 2 ? 'weekly' : gap <= 4 ? 'biweekly' : 'monthly';
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                skill,
                level_gap: gap,
                scaffold_steps,
                success_criteria,
                prerequisite_chain,
                safety_measures: [
                  'Take breaks before frustration compounds',
                  'Monitor progress against the success criteria per step',
                  'Keep a fallback: stay productive at the current level while practising'
                ],
                review_intervals,
                ...(estimated_weeks !== undefined
                  ? {
                      estimated_weeks,
                      plan_basis: `${hours_per_week} h/week in ${session_minutes ?? 60}-minute sessions`
                    }
                  : {}),
                ...(warnings.length ? { warnings } : {}),
                nextSteps: [
                  'Schedule the first review to check whether the lowest step is truly routine.',
                  'If a step stalls twice, split it into a smaller level.',
                  ...(deadline_weeks !== undefined && warnings.length
                    ? ['Resolve the deadline warning before committing to the plan.']
                    : [])
                ],
                status: 'success'
              },
              null,
              2
            )
          }
        ]
      };
    }
  );
}
