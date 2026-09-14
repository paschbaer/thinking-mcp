/**
 * Central tool metadata registry (RB-10 completion).
 *
 * Every registered tool gets a human-readable annotation title and a real
 * (top-level-defined) zod output schema applied by the central tool.update()
 * loop in src/index.ts. Schemas list only EVIDENCED top-level fields — all
 * optional, with .passthrough() so payload evolution never breaks client
 * validation. The completeness test (tests/tool-metadata.test.ts) fails when
 * a new tool ships without an entry here.
 */

import { z } from 'zod';

export interface ToolMetadata {
  /** Human-readable annotation title (shown in clients). */
  title: string;
  /** Output schema with ≥ 1 defined top-level property (passthrough). */
  outputSchema: z.ZodObject<Record<string, z.ZodTypeAny>>;
  /**
   * true = repeated calls change session state (accumulated stats, store
   * mutations) → idempotentHint: false in annotations.
   */
  stateful?: boolean;
}

/** status + optional extras, passthrough for payload evolution. */
function schema(extra: Record<string, z.ZodTypeAny> = {}): z.ZodObject<Record<string, z.ZodTypeAny>> {
  return z
    .object({ status: z.string().optional(), ...extra })
    .passthrough() as z.ZodObject<Record<string, z.ZodTypeAny>>;
}

/** Iterative tools accumulate per-session stats under `sessionContext`. */
const sessionContext = { sessionContext: z.unknown().optional() };
/** Dual-mode (facilitation/analysis) scaffolds share these keys. */
const dualMode = {
  guiding_questions: z.unknown().optional(),
  nextSteps: z.unknown().optional()
};

export const TOOL_METADATA: Record<string, ToolMetadata> = {
  // ── Reasoning family (iterative, stateful) ──────────────────────────────
  sequentialthinking: {
    title: 'Sequential Thinking',
    outputSchema: schema({ ...sessionContext, nextThoughtNeeded: z.unknown().optional() }),
    stateful: true
  },
  mentalmodel: { title: 'Mental Model', outputSchema: schema(sessionContext), stateful: true },
  debuggingapproach: {
    title: 'Debugging Approach',
    outputSchema: schema(sessionContext),
    stateful: true
  },
  collaborativereasoning: {
    title: 'Collaborative Reasoning',
    outputSchema: schema(sessionContext),
    stateful: true
  },
  decisionframework: {
    title: 'Decision Framework',
    outputSchema: schema(sessionContext),
    stateful: true
  },
  metacognitivemonitoring: {
    title: 'Metacognitive Monitoring',
    outputSchema: schema(sessionContext),
    stateful: true
  },
  socraticmethod: { title: 'Socratic Method', outputSchema: schema(sessionContext), stateful: true },
  creativethinking: {
    title: 'Creative Thinking',
    outputSchema: schema(sessionContext),
    stateful: true
  },
  systemsthinking: {
    title: 'Systems Thinking',
    outputSchema: schema(sessionContext),
    stateful: true
  },
  scientificmethod: {
    title: 'Scientific Method',
    outputSchema: schema(sessionContext),
    stateful: true
  },
  structuredargumentation: {
    title: 'Structured Argumentation',
    outputSchema: schema(sessionContext),
    stateful: true
  },
  visualreasoning: {
    title: 'Visual Reasoning',
    outputSchema: schema(sessionContext),
    stateful: true
  },

  // ── Dual-mode visualization family ───────────────────────────────────────
  mind_map: {
    title: 'Mind Map',
    outputSchema: schema({
      map: z.unknown().optional(),
      suggested_branch_count: z.unknown().optional(),
      branch_count: z.unknown().optional(),
      ...dualMode
    })
  },
  concept_map: {
    title: 'Concept Map',
    outputSchema: schema({
      map: z.unknown().optional(),
      relations: z.unknown().optional(),
      ...dualMode
    })
  },
  fishbone_diagram: {
    title: 'Fishbone Diagram',
    outputSchema: schema({
      causes: z.unknown().optional(),
      categories: z.unknown().optional(),
      ...dualMode
    })
  },
  swot_analysis: {
    title: 'SWOT Analysis',
    outputSchema: schema({
      strengths: z.unknown().optional(),
      weaknesses: z.unknown().optional(),
      opportunities: z.unknown().optional(),
      threats: z.unknown().optional(),
      towsRanked: z.unknown().optional(),
      scores: z.unknown().optional()
    })
  },
  issue_tree: {
    title: 'Issue Tree',
    outputSchema: schema({
      tree: z.unknown().optional(),
      sub_questions: z.unknown().optional(),
      ...dualMode
    })
  },

  // ── Risk family (B1) ───────────────────────────────────────────────────
  premortem: {
    title: 'Pre-Mortem',
    outputSchema: schema({
      mode: z.unknown().optional(),
      project: z.unknown().optional(),
      timeframe_months: z.unknown().optional(),
      risks: z.unknown().optional(),
      top_risks: z.unknown().optional(),
      mitigation_coverage: z.unknown().optional(),
      ...dualMode
    })
  },
  fmea: {
    title: 'FMEA',
    outputSchema: schema({
      mode: z.unknown().optional(),
      scope: z.unknown().optional(),
      rows: z.unknown().optional(),
      mean_rpn: z.unknown().optional(),
      max_rpn: z.unknown().optional(),
      flagged_count: z.unknown().optional(),
      ...dualMode
    })
  },
  fault_tree: {
    title: 'Fault Tree Analysis',
    outputSchema: schema({
      mode: z.unknown().optional(),
      top_event: z.unknown().optional(),
      top_probability: z.unknown().optional(),
      basic_events: z.unknown().optional(),
      ...dualMode
    })
  },

  // ── Risk toolset (family toolset for the B1 risk tools) ──────────────
  risk: {
    title: 'Risk Toolset',
    outputSchema: schema({ operation: z.unknown().optional() })
  },

  // ── Utility family ────────────────────────────────────────────────────────
  analogical_mapper: {
    title: 'Analogical Mapper',
    outputSchema: schema({ lenses: z.unknown().optional(), suggested_prompts: z.unknown().optional(), ...dualMode })
  },
  assumption_xray: {
    title: 'Assumption X-Ray',
    outputSchema: schema({ assumptions: z.unknown().optional(), falsification_tests: z.unknown().optional() })
  },
  comparative_advantage: {
    title: 'Comparative Advantage',
    outputSchema: schema({ assignments: z.unknown().optional() })
  },
  drag_point_audit: { title: 'Drag Point Audit', outputSchema: schema() },
  safe_struggle_designer: {
    title: 'Safe Struggle Designer',
    outputSchema: schema({ skill: z.unknown().optional() })
  },
  seven_seekers_orchestrator: {
    title: 'Seven Seekers Orchestrator',
    outputSchema: schema({ lenses: z.unknown().optional(), suggested_downstream_tools: z.unknown().optional(), ...dualMode })
  },
  value_of_information: { title: 'Value of Information', outputSchema: schema() },
  existing_tool_example: {
    title: 'Existing Tool Example',
    outputSchema: schema({ text: z.unknown().optional() })
  },
  agents_guide: {
    title: 'Agents Guide',
    outputSchema: schema({
      mode: z.unknown().optional(),
      content: z.unknown().optional(),
      block_replaced: z.unknown().optional(),
      unresolved_placeholders: z.unknown().optional()
    })
  },

  // ── Session family ────────────────────────────────────────────────────────
  session_info: {
    title: 'Session Info',
    outputSchema: schema({
      sessionId: z.unknown().optional(),
      createdAt: z.unknown().optional(),
      lastAccessedAt: z.unknown().optional(),
      stats: z.unknown().optional()
    })
  },
  session_export: {
    title: 'Session Export',
    outputSchema: schema({ format: z.unknown().optional(), export: z.unknown().optional() })
  },
  session_import: {
    title: 'Session Import',
    outputSchema: schema({ restored: z.unknown().optional() }),
    stateful: true
  },

  // ── Toolsets (dispatch to the handlers above → stateful like their ops) ──
  reasoning: { title: 'Reasoning Toolset', outputSchema: schema({ operation: z.unknown().optional() }), stateful: true },
  visualization: {
    title: 'Visualization Toolset',
    outputSchema: schema({ operation: z.unknown().optional() })
  },
  utility: { title: 'Utility Toolset', outputSchema: schema({ operation: z.unknown().optional() }) },
  session: { title: 'Session Toolset', outputSchema: schema({ operation: z.unknown().optional() }), stateful: true }
};
