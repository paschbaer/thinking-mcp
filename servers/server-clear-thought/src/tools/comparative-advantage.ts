import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { SessionState } from '../state/SessionState.js';

export function registerComparativeAdvantage(server: McpServer, _sessionState: SessionState) {
  server.tool(
    'comparative_advantage',
    'Map tasks to the skill holder with highest capability. Skills are ' +
      'matched per task: each agent is scored by its (average) level on the ' +
      'skills the task requires; missing skills count as 0. Optional ' +
      'capacity enables greedy multi-task assignment; optional costs divide ' +
      'the skill score (effective score = skill score / cost)',
    {
      skills: z
        .record(z.string(), z.record(z.string(), z.number()))
        .describe('Map of agent name to that agent\u2019s skill levels, e.g. { "alice": { "sql": 4, "python": 5 } }'),
      tasks: z
        .record(z.string(), z.array(z.string()))
        .describe('Map of task name to the skills the task requires, e.g. { "migrate_db": ["sql", "python"] }'),
      capacity: z
        .record(z.string(), z.number().int().min(0))
        .optional()
        .describe(
          'Max simultaneous tasks per agent (unlisted agents: unlimited). Enables greedy capacity-aware assignment across all tasks'
        ),
      costs: z
        .record(z.string(), z.number().positive())
        .optional()
        .describe('Cost per task per agent (unlisted agents: cost 1); effective score = skill score / cost')
    },
    async ({ skills, tasks, capacity, costs }) => {
      const warnings: string[] = [];
      const effective = (agent: string, required: string[]): number => {
        const levels = skills[agent] ?? {};
        const base =
          required.length > 0
            ? required.reduce((sum, skill) => sum + (levels[skill] ?? 0), 0) / required.length
            : Object.values(levels).reduce((s, v) => s + v, 0) / (Object.keys(levels).length || 1);
        const cost = costs?.[agent] ?? 1;
        return Number((base / cost).toFixed(2));
      };

      const taskEntries = Object.entries(tasks).map(([task, required]) => {
        const breakdown = Object.keys(skills)
          .map((agent) => ({
            agent,
            score: effective(agent, required)
          }))
          .sort((a, b) => b.score - a.score || a.agent.localeCompare(b.agent));
        const missing_skills = required.filter(
          (skill) => !Object.values(skills).some((levels) => (levels[skill] ?? 0) > 0)
        );
        return { task, required, breakdown, missing_skills };
      });

      const capacityAware = capacity !== undefined;
      const remaining = new Map<string, number>();
      if (capacityAware) {
        for (const agent of Object.keys(skills)) {
          remaining.set(agent, capacity[agent] ?? Number.POSITIVE_INFINITY);
        }
      }

      const advantage_map: Array<{
        task: string;
        assignee: string | null;
        score: number;
        breakdown: Array<{ agent: string; score: number }>;
        missing_skills: string[];
      }> = capacityAware
        ? assignGlobally(taskEntries, remaining, warnings)
        : taskEntries.map(({ task, breakdown, missing_skills }) => ({
            task,
            assignee: breakdown[0]?.agent ?? null,
            score: breakdown[0]?.score ?? 0,
            breakdown,
            missing_skills
          }));

      for (const entry of advantage_map) {
        if (entry.missing_skills.length > 0) {
          warnings.push(
            `Task "${entry.task}": no agent has any level in [${entry.missing_skills.join(', ')}]`
          );
        }
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                assignment_mode: capacityAware ? 'capacity-aware-greedy' : 'per-task',
                advantage_map,
                ...(warnings.length ? { warnings } : {}),
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

/**
 * Greedy global assignment: consider every (task, agent) pair by effective
 * score (descending) and assign while the agent has remaining capacity.
 * Near-optimal in practice and fully deterministic; true optimum would need
 * a full assignment algorithm (e.g. Hungarian).
 */
function assignGlobally(
  taskEntries: Array<{
    task: string;
    required: string[];
    breakdown: Array<{ agent: string; score: number }>;
    missing_skills: string[];
  }>,
  remaining: Map<string, number>,
  warnings: string[]
): Array<{
  task: string;
  assignee: string | null;
  score: number;
  breakdown: Array<{ agent: string; score: number }>;
  missing_skills: string[];
}> {
  const pairs: Array<{ task: string; agent: string; score: number; taskIdx: number }> = [];
  taskEntries.forEach(({ task, breakdown }, taskIdx) => {
    for (const candidate of breakdown) {
      pairs.push({ task, agent: candidate.agent, score: candidate.score, taskIdx });
    }
  });
  pairs.sort(
    (a, b) =>
      b.score - a.score ||
      a.taskIdx - b.taskIdx ||
      a.agent.localeCompare(b.agent)
  );

  const assigned = new Map<number, { assignee: string; score: number }>();
  for (const pair of pairs) {
    if (assigned.has(pair.taskIdx)) continue;
    const left = remaining.get(pair.agent) ?? Number.POSITIVE_INFINITY;
    if (left <= 0) continue;
    assigned.set(pair.taskIdx, { assignee: pair.agent, score: pair.score });
    if (remaining.has(pair.agent)) {
      remaining.set(pair.agent, left - 1);
    }
  }

  return taskEntries.map(({ task, breakdown, missing_skills }, taskIdx) => {
    const hit = assigned.get(taskIdx);
    if (!hit) {
      warnings.push(`Task "${task}": no agent with remaining capacity available.`);
    }
    return {
      task,
      assignee: hit?.assignee ?? null,
      score: hit?.score ?? 0,
      breakdown,
      missing_skills
    };
  });
}
