import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

/**
 * D2 — Workflow prompts: one prompt per agent-guide recipe. Each prompt
 * renders a user message that names the situation and instructs the agent
 * to run the matching recipe via `recipe_runner`.
 */

interface PromptDef {
  name: string;
  title: string;
  description: string;
  /** Prompt argument name and description. */
  arg: { name: string; description: string };
  recipeId: string;
  framing: (value: string) => string;
}

const PROMPTS: PromptDef[] = [
  {
    name: 'debug-failure',
    title: 'Debug a failure',
    description: 'Guided debugging workflow: plan, apply a systematic approach, verify the root cause.',
    arg: { name: 'failure_description', description: 'What is failing, where, since when, and how it manifests' },
    recipeId: 'debug-failure',
    framing: (v) =>
      `I'm facing this failure: ${v}\n\n` +
      "Please work through the debug-failure workflow: call the recipe_runner tool with recipe 'debug-failure' and action 'start', then execute each stage briefing (sequentialthinking, debuggingapproach, optionally fishbone_diagram, metacognitivemonitoring) with my failure as the subject."
  },
  {
    name: 'architecture-decision',
    title: 'Architecture / technology decision',
    description: 'Guided decision workflow: decompose, SWOT the options, check research value, decide.',
    arg: { name: 'decision', description: 'The decision to make and the options you already see' },
    recipeId: 'architecture-decision',
    framing: (v) =>
      `We need to make this decision: ${v}\n\n` +
      "Please work through the architecture-decision workflow: call recipe_runner with recipe 'architecture-decision' and action 'start', then execute the stages (issue_tree, swot_analysis per serious option, value_of_information, decisionframework, metacognitivemonitoring)."
  },
  {
    name: 'stress-test-conclusion',
    title: 'Stress-test a conclusion',
    description: 'Guided stress-test: state the argument, attack it, revise honestly.',
    arg: { name: 'conclusion', description: 'The conclusion you are about to report or act on' },
    recipeId: 'stress-test-conclusion',
    framing: (v) =>
      `Before I rely on this conclusion, stress-test it: ${v}\n\n` +
      "Please work through the stress-test workflow: call recipe_runner with recipe 'stress-test-conclusion' and action 'start', then execute the stages (structuredargumentation, socraticmethod, assumption_xray, revise)."
  },
  {
    name: 'open-ended-ideation',
    title: 'Open-ended ideation',
    description: 'Guided ideation: diverge, import analogies, check dynamics, structure the survivors.',
    arg: { name: 'topic', description: 'The challenge or question to ideate about' },
    recipeId: 'open-ended-ideation',
    framing: (v) =>
      `Let's ideate broadly about: ${v}\n\n` +
      "Please work through the ideation workflow: call recipe_runner with recipe 'open-ended-ideation' and action 'start', then execute the stages (creativethinking, analogical_mapper, systemsthinking, mind_map)."
  },
  {
    name: 'multi-agent-delegation',
    title: 'Multi-agent delegation',
    description: 'Guided delegation: match tasks to agents, audit the process, plan skill-building.',
    arg: { name: 'tasks_and_agents', description: 'The tasks to delegate and the agents available (with skill levels if known)' },
    recipeId: 'multi-agent-delegation',
    framing: (v) =>
      `Help me delegate these tasks: ${v}\n\n` +
      "Please work through the delegation workflow: call recipe_runner with recipe 'multi-agent-delegation' and action 'start', then execute the stages (comparative_advantage, drag_point_audit afterwards, safe_struggle_designer if needed)."
  },
  {
    name: 'long-research-question',
    title: 'Long research question',
    description: 'Guided research: multi-lens sweep, synthesize, persist the findings.',
    arg: { name: 'research_question', description: 'The question to research' },
    recipeId: 'long-research-question',
    framing: (v) =>
      `Research this question thoroughly: ${v}\n\n` +
      "Please work through the research workflow: call recipe_runner with recipe 'long-research-question' and action 'start', then execute the stages (assumption_xray, seven_seekers_orchestrator, sequentialthinking, session_export to persist the findings)."
  }
];

export function registerWorkflowPrompts(server: McpServer): void {
  for (const def of PROMPTS) {
    server.registerPrompt(
      def.name,
      {
        title: def.title,
        description: def.description,
        argsSchema: {
          [def.arg.name]: z.string().min(1).describe(def.arg.description)
        }
      },
      (args: Record<string, unknown>) => {
        const value = String(args[def.arg.name] ?? '');
        return {
          messages: [
            {
              role: 'user' as const,
              content: { type: 'text' as const, text: def.framing(value) }
            }
          ]
        };
      }
    );
  }
}
