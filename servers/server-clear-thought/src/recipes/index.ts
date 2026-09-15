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
        tool: 'sequential_thinking',
        purpose: 'Plan the investigation, form hypotheses (totalThoughts 3–5).',
        argument_hints: 'thought, thoughtNumber, totalThoughts, nextThoughtNeeded — call repeatedly as needed'
      },
      {
        tool: 'debugging_approach',
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
        tool: 'metacognitive_monitoring',
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
        tool: 'decision_framework',
        purpose: 'Weighted decision over the options.',
        argument_hints: 'decisionStatement, options[], analysisType, stage, nextStageNeeded'
      },
      {
        tool: 'metacognitive_monitoring',
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
        tool: 'structured_argumentation',
        purpose: 'State claim + premises + confidence.',
        argument_hints: 'claim, premises[], conclusion, argumentType, confidence (0–1)'
      },
      {
        tool: 'socratic_method',
        purpose: 'Walk clarification → assumptions → evidence → perspectives.',
        argument_hints: 'claim, stage, argumentType'
      },
      {
        tool: 'assumption_xray',
        purpose: 'Surface hidden assumptions in the weakest premise.',
        argument_hints: 'claim, context'
      },
      {
        tool: 'structured_argumentation',
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
        tool: 'creative_thinking',
        purpose: 'Diverge — generate options (several iterations).',
        argument_hints: 'prompt, ideas[], techniques[], connections[]'
      },
      {
        tool: 'analogical_mapper',
        purpose: 'Import solution patterns from other domains.',
        argument_hints: 'problem, seed_domains[]'
      },
      {
        tool: 'systems_thinking',
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
        tool: 'sequential_thinking',
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


/**
 * Guidance enrichment per stage (ready-to-adapt example arguments + what to
 * take from the stage output). Keyed by "<recipeId>::<stageIndex>".
 */
export const STAGE_GUIDANCE: Record<string, { example_arguments: Record<string, unknown>; result_guidance: string }> = {
  'debug-failure::0': {
    example_arguments: { thought: 'Failure: <symptom>. Hypotheses: (1) <h1>, (2) <h2>. Plan: bisect by <method>.', thoughtNumber: 1, totalThoughts: 4, nextThoughtNeeded: true },
    result_guidance: 'Carry the top hypotheses and the bisection plan into the debugging stage.'
  },
  'debug-failure::1': {
    example_arguments: { approachName: 'binary_search', issue: '<symptom>', steps: ['reproduce', 'disable half the pipeline', 'compare outputs'] },
    result_guidance: 'Note which step isolated the fault - that is your candidate cause.'
  },
  'debug-failure::2': {
    example_arguments: { problem: '<symptom>', causes: [{ category: 'methods', causes: ['<candidate 1>'] }, { category: 'technology', causes: ['<candidate 2>'] }] },
    result_guidance: 'Pick the branch with the strongest evidence link to your isolation step.'
  },
  'debug-failure::3': {
    example_arguments: { task: 'Root cause claim for <symptom>', overallConfidence: 0.7, uncertaintyAreas: ['<what is still unverified>'] },
    result_guidance: 'If confidence < 0.7: add a verification step before reporting the cause.'
  },
  'architecture-decision::0': {
    example_arguments: { problem: 'Should we <decision>?', depth: 2, sub_questions: ['cost impact?', 'migration risk?'] },
    result_guidance: 'Use the sub-issues as evaluation criteria for the SWOT and decision stages.'
  },
  'architecture-decision::1': {
    example_arguments: { subject: 'Option: <option A>', strengths: [{ text: '<strength>', impact: 4, likelihood: 4 }], weaknesses: [{ text: '<weakness>', impact: 3, likelihood: 3 }], opportunities: ['<opportunity>'], threats: ['<threat>'] },
    result_guidance: 'Take the ranked TOWS pairs as option profiles for the decision stage.'
  },
  'architecture-decision::2': {
    example_arguments: { decision_options: ['<option A>', '<option B>'], uncertainties: ['<unknown that could flip the choice>'], payoffs: [10000, 8000] },
    result_guidance: 'If VoI for an uncertainty is high: research it first, then re-run this stage.'
  },
  'architecture-decision::3': {
    example_arguments: { decisionStatement: 'Choose <what>', options: [{ name: '<option A>', description: '<one line>' }, { name: '<option B>', description: '<one line>' }], analysisType: 'weighted', stage: 'decision', nextStageNeeded: false },
    result_guidance: 'Record the chosen option and its top criteria in your decision log.'
  },
  'architecture-decision::4': {
    example_arguments: { task: 'Commit to <chosen option>', overallConfidence: 0.8, uncertaintyAreas: ['<residual unknown>'] },
    result_guidance: 'Low confidence -> revisit the VoI-high uncertainties before committing.'
  },
  'stress-test-conclusion::0': {
    example_arguments: { claim: '<the conclusion to test>', premises: ['<premise 1>', '<premise 2>'], conclusion: '<restated>', argumentType: 'deductive', confidence: 0.7 },
    result_guidance: 'Mark the weakest premise - the socratic stage attacks it.'
  },
  'stress-test-conclusion::1': {
    example_arguments: { claim: '<the conclusion>', stage: 'assumptions', argumentType: 'deductive' },
    result_guidance: 'Collect the challenges; map each to the premise it threatens.'
  },
  'stress-test-conclusion::2': {
    example_arguments: { claim: '<weakest premise>', context: '<why you believe it>' },
    result_guidance: 'Falsification tests with high severity become rebuttals in the revision.'
  },
  'stress-test-conclusion::3': {
    example_arguments: { claim: '<revised conclusion>', premises: ['<revised premises>'], conclusion: '<revised>', argumentType: 'deductive', confidence: 0.6 },
    result_guidance: 'Compare confidence before/after - a big drop means more evidence is needed.'
  },
  'open-ended-ideation::0': {
    example_arguments: { prompt: 'Ways to <challenge>', ideas: ['<idea 1>', '<idea 2>'], techniques: ['SCAMPER', 'inversion'] },
    result_guidance: 'Shortlist 3-5 ideas for the analogy and dynamics checks.'
  },
  'open-ended-ideation::1': {
    example_arguments: { problem: '<abstract form of the challenge>', seed_domains: ['biology', 'logistics'] },
    result_guidance: 'Keep only analogies that survive the imperfect-mapping question.'
  },
  'open-ended-ideation::2': {
    example_arguments: { system: '<idea under test>', components: ['<c1>', '<c2>'], relationships: [{ from: '<c1>', to: '<c2>', type: 'positive' }] },
    result_guidance: 'Drop ideas with vicious loops; note reinforcing loops as leverage.'
  },
  'open-ended-ideation::3': {
    example_arguments: { topic: '<challenge>', branches: [{ title: '<theme>', subtopics: ['<idea>'] }] },
    result_guidance: 'The map is the deliverable - one branch per actionable theme.'
  },
  'multi-agent-delegation::0': {
    example_arguments: { skills: { 'agent-a': { typescript: 5, sql: 2 }, 'agent-b': { typescript: 2, sql: 5 } }, tasks: { 'api endpoint': ['typescript'] }, capacity: { 'agent-a': 2, 'agent-b': 1 } },
    result_guidance: 'Use the assignment table as the delegation plan; note unassigned tasks.'
  },
  'multi-agent-delegation::1': {
    example_arguments: { log: '<process log>', categories: ['error', 'timeout', 'retry', 'handover'] },
    result_guidance: 'Top drag points become process fixes for the next round.'
  },
  'multi-agent-delegation::2': {
    example_arguments: { skill: '<skill gap>', current_level: 2, target_level: 4, hours_per_week: 4 },
    result_guidance: 'Attach the ladder to the agent profile for future delegation calls.'
  },
  'long-research-question::0': {
    example_arguments: { claim: '<the question as an assumption>', context: '<why it matters>' },
    result_guidance: 'Reframe the question if a load-bearing hidden assumption surfaces.'
  },
  'long-research-question::1': {
    example_arguments: { query: '<the research question>', downstream_tools: ['assumption_xray', 'structured_argumentation'] },
    result_guidance: 'Carry the strongest 2-3 lens findings into the synthesis.'
  },
  'long-research-question::2': {
    example_arguments: { thought: 'Synthesis: <finding 1> + <finding 2> imply ...', thoughtNumber: 1, totalThoughts: 3, nextThoughtNeeded: true },
    result_guidance: 'The final synthesis thought is the answer backbone.'
  },
  'long-research-question::3': {
    example_arguments: { format: 'json' },
    result_guidance: 'Store the export next to your project notes (or via session_save with dataDir).'
  }
};

export const RECIPE_IDS = Object.keys(RECIPES);
