/**
 * The workflow recipes from the agent guide (AGENTS.template.md → "Workflow
 * recipes") encoded as DATA, so `recipe_runner` can walk an agent through
 * them stage by stage. The guide's prose chains and this file must stay in
 * sync — the guide is generated from the same source of truth conceptually;
 * keep both aligned when changing a chain.
 */

export interface RecipeStage {
  /** Tool to call in this stage. */
  tool: string;
  /** What this stage contributes to the overall flow. */
  purpose: string;
  /** Concise pointer to the essential arguments. */
  argument_hints?: string;
  /** Stage is situational (e.g. "only if multiple candidate causes"). */
  optional?: boolean;
}

export interface Recipe {
  id: string;
  title: string;
  description: string;
  stages: RecipeStage[];
}

export const RECIPES: Record<string, Recipe> = {
  'debug-failure': {
    id: 'debug-failure',
    title: 'Debug a failure',
    description: 'Systematic path from failure to a verified root cause.',
    stages: [
      {
        tool: 'sequentialthinking',
        purpose: 'Plan the investigation, form hypotheses (totalThoughts 3–5).',
        argument_hints: 'thought, thoughtNumber, totalThoughts, nextThoughtNeeded — call repeatedly as needed'
      },
      {
        tool: 'debuggingapproach',
        purpose: 'Apply the systematic approach matching the symptom class.',
        argument_hints: 'approachName (binary_search | reverse_engineering | delta_debugging | …), issue, steps[]'
      },
      {
        tool: 'fishbone_diagram',
        purpose: 'Structure candidate causes — only if multiple candidates remain.',
        argument_hints: 'problem; optional causes[] ({ category, causes[] })',
        optional: true
      },
      {
        tool: 'metacognitivemonitoring',
        purpose: 'Confidence check before claiming the root cause.',
        argument_hints: 'task, overallConfidence (0–1), uncertaintyAreas[]'
      }
    ]
  },
  'architecture-decision': {
    id: 'architecture-decision',
    title: 'Architecture / technology decision',
    description: 'Decompose, evaluate options, quantify research value, decide with confidence check.',
    stages: [
      {
        tool: 'issue_tree',
        purpose: 'Decompose the decision into sub-issues.',
        argument_hints: 'problem, depth; optional sub_questions[]'
      },
      {
        tool: 'swot_analysis',
        purpose: 'Strategic assessment per serious option (pass content you already know).',
        argument_hints: 'subject; optional weighted quadrant arrays { text, impact, likelihood, tags }',
        optional: true
      },
      {
        tool: 'value_of_information',
        purpose: 'Is more research worth it? If yes: research, then re-run the swot.',
        argument_hints: 'decision_options[], uncertainties[], payoffs[]'
      },
      {
        tool: 'decisionframework',
        purpose: 'Weighted decision over the options.',
        argument_hints: 'decisionStatement, options[], analysisType, stage, nextStageNeeded'
      },
      {
        tool: 'metacognitivemonitoring',
        purpose: 'Confidence check before committing.',
        argument_hints: 'task, overallConfidence (0–1), uncertaintyAreas[]'
      }
    ]
  },
  'stress-test-conclusion': {
    id: 'stress-test-conclusion',
    title: 'Stress-test a conclusion',
    description: 'State, attack and revise a conclusion before reporting it.',
    stages: [
      {
        tool: 'structuredargumentation',
        purpose: 'State claim + premises + confidence.',
        argument_hints: 'claim, premises[], conclusion, argumentType, confidence (0–1)'
      },
      {
        tool: 'socraticmethod',
        purpose: 'Walk clarification → assumptions → evidence → perspectives.',
        argument_hints: 'claim, stage, argumentType'
      },
      {
        tool: 'assumption_xray',
        purpose: 'Surface hidden assumptions in the weakest premise.',
        argument_hints: 'claim, context'
      },
      {
        tool: 'structuredargumentation',
        purpose: 'Revise the argument; set confidence honestly.',
        argument_hints: 'updated claim/premises/confidence'
      }
    ]
  },
  'open-ended-ideation': {
    id: 'open-ended-ideation',
    title: 'Open-ended ideation',
    description: 'Diverge, import patterns from other domains, check dynamics, structure what survives.',
    stages: [
      {
        tool: 'creativethinking',
        purpose: 'Diverge — generate options (several iterations).',
        argument_hints: 'prompt, ideas[], techniques[], connections[]'
      },
      {
        tool: 'analogical_mapper',
        purpose: 'Import solution patterns from other domains.',
        argument_hints: 'problem, seed_domains[]'
      },
      {
        tool: 'systemsthinking',
        purpose: 'Check the dynamics of the top ideas.',
        argument_hints: 'system, components[], relationships[]'
      },
      {
        tool: 'mind_map',
        purpose: 'Structure the surviving ideas.',
        argument_hints: 'topic; optional branches[] ({ title, subtopics[] })'
      }
    ]
  },
  'multi-agent-delegation': {
    id: 'multi-agent-delegation',
    title: 'Multi-agent delegation',
    description: 'Assign tasks to the best-suited agents and follow up on the process.',
    stages: [
      {
        tool: 'comparative_advantage',
        purpose: 'Map tasks to the best-suited agent (skill × cost, optional capacity).',
        argument_hints: 'skills{}, tasks{}; optional capacity{}, costs{}'
      },
      {
        tool: 'drag_point_audit',
        purpose: 'Audit the process log for friction afterwards.',
        argument_hints: 'log; optional categories[]',
        optional: true
      },
      {
        tool: 'safe_struggle_designer',
        purpose: 'Skill-building plan — if an agent needs it for next time.',
        argument_hints: 'skill, current_level, target_level; optional hours_per_week',
        optional: true
      }
    ]
  },
  'long-research-question': {
    id: 'long-research-question',
    title: 'Long research question',
    description: 'Multi-lens sweep over a research question, then synthesize and persist.',
    stages: [
      {
        tool: 'assumption_xray',
        purpose: 'Surface hidden assumptions in the question itself.',
        argument_hints: 'claim, context'
      },
      {
        tool: 'seven_seekers_orchestrator',
        purpose: 'Multi-lens sweep; use downstream_tools to refine.',
        argument_hints: 'query, optional downstream_tools[]'
      },
      {
        tool: 'sequentialthinking',
        purpose: 'Synthesize the findings.',
        argument_hints: 'thought, thoughtNumber, totalThoughts, nextThoughtNeeded'
      },
      {
        tool: 'session_export',
        purpose: 'Persist findings before the context closes.',
        argument_hints: 'format: json | summary'
      }
    ]
  }
};

export const RECIPE_IDS = Object.keys(RECIPES);
