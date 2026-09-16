import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { SessionState } from '../state/SessionState.js';
import { RECIPES, RECIPE_IDS, STAGE_GUIDANCE } from '../recipes/index.js';

/**
 * Guided navigation through the workflow recipes (roadmap track C,
 * minimal variant: navigation + hints only — the server does not execute
 * the stages). Progress lives in the session's WorkflowStore, so runs
 * persist for the session and are shared between the individual tool and
 * the workflow toolset.
 */

/** Briefing for a single stage — the payload the agent acts on. */
function stageBriefing(recipe: (typeof RECIPES)[string], stageIndex: number) {
  const stage = recipe.stages[stageIndex];
  return {
    index: stageIndex,
    tool: stage.tool,
    purpose: stage.purpose,
    argument_hints: stage.argument_hints ?? null,
    example_arguments: STAGE_GUIDANCE[`${recipe.id}::${stageIndex}`]?.example_arguments ?? null,
    result_guidance: STAGE_GUIDANCE[`${recipe.id}::${stageIndex}`]?.result_guidance ?? null,
    optional: stage.optional ?? false
  };
}

function brief(
  mode: string,
  recipe: (typeof RECIPES)[string],
  stageIndex: number,
  total: number
) {
  return {
    mode,
    recipe: recipe.id,
    title: recipe.title,
    total_stages: total,
    progress: `${stageIndex + 1}/${total}`,
    current_stage: stageBriefing(recipe, stageIndex),
    next_action: 'Do the work, then call again with action=advance.',
    status: 'success'
  };
}

export function registerRecipeRunner(server: McpServer, sessionState: SessionState) {
  // Session-scoped progress store — shared by the individual tool and the
  // workflow toolset (both dispatch into the same handlers).
  const store = sessionState.getWorkflowStore();

  server.tool(
    'recipe_runner',
    'Guided navigation through the workflow recipes (debug a failure, ' +
      'architecture decision, stress-test a conclusion, open-ended ideation, ' +
      'multi-agent delegation, long research question, decision under ' +
      'uncertainty). `start` returns the ' +
      'first stage briefing — the recommended next tool with ready-to-adapt ' +
      'example arguments and result guidance — `advance` moves to the next ' +
      'stage after you did the work, `status` shows where you are, `list` ' +
      'shows all recipes. Navigation only — the stages are executed by YOU ' +
      'calling the tools. Progress persists for the current session.',
    {
      recipe: z
        .enum(RECIPE_IDS as [string, ...string[]])
        .describe('Recipe to navigate'),
      action: z
        .enum(['list', 'start', 'status', 'advance', 'reset'])
        .default('status')
        .describe(
          'list = show all recipes · start = begin at stage 1 · status = where am I · advance = next stage · reset = discard progress'
        )
    },
    async ({ recipe, action }) => {
      if (action === 'list') {
        const response = {
          mode: 'list',
          recipes: RECIPE_IDS.map((id) => ({
            id,
            title: RECIPES[id].title,
            description: RECIPES[id].description,
            stage_tools: RECIPES[id].stages.map((s) => s.tool)
          })),
          status: 'success'
        };
        return { content: [{ type: 'text', text: JSON.stringify(response, null, 2) }] };
      }

      const defined = RECIPES[recipe];
      const total = defined.stages.length;

      if (action === 'reset') {
        store.remove(recipe);
        const response = { mode: 'reset', recipe, status: 'success' };
        return { content: [{ type: 'text', text: JSON.stringify(response, null, 2) }] };
      }

      if (action === 'start') {
        store.add(recipe, { recipeId: recipe, stageIndex: 0 });
        const response = {
          ...brief('started', defined, 0, total),
          description: defined.description,
          next_action: 'Do the work, then call again with action=advance.'
        };
        return { content: [{ type: 'text', text: JSON.stringify(response, null, 2) }] };
      }

      if (action === 'advance') {
        // Friendly auto-start: advancing an unstarted run begins at stage 1.
        if (!store.has(recipe)) {
          store.add(recipe, { recipeId: recipe, stageIndex: 0 });
          const response = {
            ...brief('started', defined, 0, total),
            next_action: 'Do the work, then call again with action=advance.'
          };
          return { content: [{ type: 'text', text: JSON.stringify(response, null, 2) }] };
        }
        const current = store.get(recipe)!;
        const nextIndex = current.stageIndex + 1;
        if (nextIndex >= total) {
          const response = {
            mode: 'completed',
            recipe,
            title: defined.title,
            tools_in_order: defined.stages.map((s) => s.tool),
            next_action: 'Recipe finished — start another recipe or apply the results.',
            status: 'success'
          };
          return { content: [{ type: 'text', text: JSON.stringify(response, null, 2) }] };
        }
        current.stageIndex = nextIndex;
        const response = {
          ...brief('advanced', defined, nextIndex, total),
          next_action: 'Do the work, then call again with action=advance.'
        };
        return { content: [{ type: 'text', text: JSON.stringify(response, null, 2) }] };
      }

      // action === 'status'
      const current = store.get(recipe);
      const response = {
        mode: 'status',
        recipe,
        title: defined.title,
        started: !!current,
        total_stages: total,
        progress: current ? `${current.stageIndex + 1}/${total}` : null,
        current_stage: current ? stageBriefing(defined, current.stageIndex) : null,
        all_stages: defined.stages.map((s, i) => ({
          index: i,
          tool: s.tool,
          purpose: s.purpose,
          optional: s.optional ?? false
        })),
        status: 'success'
      };
      return { content: [{ type: 'text', text: JSON.stringify(response, null, 2) }] };
    }
  );
}
