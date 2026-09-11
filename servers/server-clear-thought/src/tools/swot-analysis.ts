import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { SessionState } from '../state/SessionState.js';

/** Normalized quadrant entry as it appears in the tool output. */
interface NormalizedEntry {
  text: string;
  impact: number; // 1..5
  likelihood: number; // 1..5
  tags: string[];
}

/** Internal entry, keeps provenance for meta.weightedEntries. */
interface Entry extends NormalizedEntry {
  fromObject: boolean;
}

type QuadrantInput = Array<
  string | { text: string; impact?: number; likelihood?: number; tags?: string[] }
>;

interface Quadrants {
  strengths: Entry[];
  weaknesses: Entry[];
  opportunities: Entry[];
  threats: Entry[];
}

type QuadrantKey = keyof Quadrants;
type MatchMode = 'all' | 'tags';
type TowsFamily = 'so' | 'wo' | 'st' | 'wt';

const DEFAULT_WEIGHT = 3;

/** Facilitation prompts per quadrant — the calling model fills the content. */
const GUIDING_QUESTIONS: Record<QuadrantKey, string[]> = {
  strengths: [
    'What internal advantages does the subject have (skills, assets, position)?',
    'What does it demonstrably do better than the alternatives?',
    'Which unique resources are hard for others to copy?'
  ],
  weaknesses: [
    'Where does the subject lack capability, data, or coverage?',
    'What do critics of the subject point out first?',
    'Which internal dependencies slow it down?'
  ],
  opportunities: [
    'Which external trends or gaps play into the subject\'s hands?',
    'What could it enable that is currently out of reach?',
    'Where is demand unmet by today\'s alternatives?'
  ],
  threats: [
    'Which external forces could make the subject obsolete or risky?',
    'What happens if key assumptions change (cost, regulation, competition)?',
    'What is the realistic worst case within the next 6-12 months?'
  ]
};

const entryObjectSchema = z.object({
  text: z.string().trim().min(1).describe('The factor, stated as a single sentence'),
  impact: z.number().int().min(1).max(5).optional().describe('Impact 1-5 (default 3)'),
  likelihood: z.number().int().min(1).max(5).optional().describe('Likelihood 1-5 (default 3)'),
  tags: z.array(z.string()).optional().describe('Labels used for tag-based pairing (matchMode "tags")')
});

const entrySchema = z.union([z.string(), entryObjectSchema]);

/** Normalize a quadrant: plain strings get default weights and no tags. */
function normalizeQuadrant(items: QuadrantInput | undefined): Entry[] {
  return (items ?? [])
    .map((item): Entry => {
      if (typeof item === 'string') {
        return { text: item.trim(), impact: DEFAULT_WEIGHT, likelihood: DEFAULT_WEIGHT, tags: [], fromObject: false };
      }
      return {
        text: item.text.trim(),
        impact: item.impact ?? DEFAULT_WEIGHT,
        likelihood: item.likelihood ?? DEFAULT_WEIGHT,
        tags: (item.tags ?? []).map((tag) => tag.trim()).filter((tag) => tag.length > 0),
        fromObject: true
      };
    })
    .filter((entry) => entry.text.length > 0);
}

const entryScore = (entry: Entry): number => entry.impact * entry.likelihood; // 1..25

const tagKey = (tag: string): string => tag.toLowerCase();

/** Intersection of both tag sets, spelled as on the first pair side. */
function sharedTagsFrom(a: Entry, b: Entry): string[] {
  const bKeys = new Set(b.tags.map(tagKey));
  const seen = new Set<string>();
  const shared: string[] = [];
  for (const tag of a.tags) {
    const key = tagKey(tag);
    if (bKeys.has(key) && !seen.has(key)) {
      seen.add(key);
      shared.push(tag);
    }
  }
  return shared;
}

interface RankedPair {
  a: Entry;
  b: Entry;
  score: number; // pairScore = entryScore(a) * entryScore(b)
  text: string;
  tags: string[]; // mirrored union of both entries' tags
  sharedTags: string[];
  order: number; // input sequence, used as explicit tiebreaker for stable sorting
}

function pairText(family: TowsFamily, a: Entry, b: Entry): string {
  switch (family) {
    case 'so':
      return `SO: Leverage "${a.text}" to capture "${b.text}".`;
    case 'wo':
      return `WO: Address "${a.text}" to unlock "${b.text}".`;
    case 'st':
      return `ST: Use "${a.text}" to mitigate "${b.text}".`;
    case 'wt':
      return `WT: Reduce exposure where "${a.text}" meets "${b.text}".`;
  }
}

const FAMILY_DEFS: Array<{ family: TowsFamily; aKey: QuadrantKey; bKey: QuadrantKey }> = [
  { family: 'so', aKey: 'strengths', bKey: 'opportunities' },
  { family: 'wo', aKey: 'weaknesses', bKey: 'opportunities' },
  { family: 'st', aKey: 'strengths', bKey: 'threats' },
  { family: 'wt', aKey: 'weaknesses', bKey: 'threats' }
];

/**
 * Ranks one TOWS family: build candidates (matchMode "tags" keeps only pairs
 * with a shared tag), sort by pairScore descending with input-order
 * tiebreaker, then cut at topN (0 = no limit).
 */
function rankFamily(
  aSide: Entry[],
  bSide: Entry[],
  family: TowsFamily,
  matchMode: MatchMode,
  topN: number
): { pairs: RankedPair[]; truncated: boolean; candidates: RankedPair[] } {
  let order = 0;
  const candidates: RankedPair[] = [];
  for (const a of aSide) {
    for (const b of bSide) {
      const sharedTags = sharedTagsFrom(a, b);
      if (matchMode === 'tags' && sharedTags.length === 0) continue;
      candidates.push({
        a,
        b,
        score: entryScore(a) * entryScore(b),
        text: pairText(family, a, b),
        tags: [...a.tags, ...b.tags],
        sharedTags,
        order: order++
      });
    }
  }
  candidates.sort((p, q) => q.score - p.score || p.order - q.order);
  const pairs = topN > 0 ? candidates.slice(0, topN) : candidates;
  return { pairs, truncated: topN > 0 && candidates.length > topN, candidates };
}

interface RankedTows {
  tows: Record<TowsFamily, string[]>;
  towsRanked: Record<TowsFamily, RankedPair[]>;
  truncatedPerQuadrant: Record<TowsFamily, boolean>;
  paired: Record<QuadrantKey, Set<Entry>>;
}

/** Builds all four TOWS families from the normalized quadrants. */
function buildTows(quads: Quadrants, matchMode: MatchMode, topN: number): RankedTows {
  const result: RankedTows = {
    tows: { so: [], wo: [], st: [], wt: [] },
    towsRanked: { so: [], wo: [], st: [], wt: [] },
    truncatedPerQuadrant: { so: false, wo: false, st: false, wt: false },
    paired: {
      strengths: new Set(),
      weaknesses: new Set(),
      opportunities: new Set(),
      threats: new Set()
    }
  };
  for (const { family, aKey, bKey } of FAMILY_DEFS) {
    const { pairs, truncated, candidates } = rankFamily(quads[aKey], quads[bKey], family, matchMode, topN);
    result.tows[family] = pairs.map((pair) => pair.text);
    result.towsRanked[family] = pairs;
    result.truncatedPerQuadrant[family] = truncated;
    for (const pair of candidates) {
      result.paired[aKey].add(pair.a);
      result.paired[bKey].add(pair.b);
    }
  }
  return result;
}

interface WeightedScores {
  strengths: number;
  weaknesses: number;
  opportunities: number;
  threats: number;
  balance: number;
  riskExposure: number;
}

interface Scores {
  strengths: number;
  weaknesses: number;
  opportunities: number;
  threats: number;
  balance: number;
  riskExposure: number;
  weighted: WeightedScores;
}

function buildScores(quads: Quadrants): Scores {
  const weightedOf = (items: Entry[]) =>
    items.reduce((sum, entry) => sum + entry.impact * entry.likelihood, 0);
  const counts = [
    quads.strengths.length,
    quads.weaknesses.length,
    quads.opportunities.length,
    quads.threats.length
  ];
  const total = counts.reduce((sum, count) => sum + count, 0);
  const max = Math.max(...counts);
  const min = Math.min(...counts);
  const Sw = weightedOf(quads.strengths);
  const Ww = weightedOf(quads.weaknesses);
  const Ow = weightedOf(quads.opportunities);
  const Tw = weightedOf(quads.threats);
  const weightedTotal = Sw + Ow + Ww + Tw;
  return {
    strengths: quads.strengths.length,
    weaknesses: quads.weaknesses.length,
    opportunities: quads.opportunities.length,
    threats: quads.threats.length,
    // 1 = quadrants evenly filled, 0 = single quadrant dominates an empty
    // set. Empty quadrants DO lower the balance on purpose: a deliberately
    // half-filled SWOT reads as less balanced, signaling incomplete coverage.
    balance: total === 0 ? 0 : Number((1 - (max - min) / total).toFixed(2)),
    // share of internal + external negative factors (entry counts)
    riskExposure: total === 0 ? 0 : Number(((quads.weaknesses.length + quads.threats.length) / total).toFixed(2)),
    // v2: same ratios on weighted sums (impact x likelihood per entry)
    weighted: {
      strengths: Sw,
      weaknesses: Ww,
      opportunities: Ow,
      threats: Tw,
      balance: Number(((Sw + Ow) / Math.max(weightedTotal, 1)).toFixed(2)),
      riskExposure: Number(((Ww + Tw) / Math.max(weightedTotal, 1)).toFixed(2))
    }
  };
}

export function registerSwotAnalysis(server: McpServer, _sessionState: SessionState) {
  server.tool(
    'swot_analysis',
    'Structured SWOT analysis: returns a facilitation scaffold by default; ' +
      'with quadrant content provided it returns the structured analysis, ' +
      'weighted scores, ranked TOWS (SO/WO/ST/WT) strategies, and match metadata',
    {
      subject: z
        .string()
        .trim()
        .min(1)
        .describe('Subject of the analysis (e.g. an architecture or technology decision)'),
      strengths: z
        .array(entrySchema)
        .optional()
        .describe('Internal, positive factors (string or {text, impact, likelihood, tags}). Providing any quadrant content switches to analysis mode.'),
      weaknesses: z
        .array(entrySchema)
        .optional()
        .describe('Internal, negative factors (string or {text, impact, likelihood, tags})'),
      opportunities: z
        .array(entrySchema)
        .optional()
        .describe('External, positive factors (string or {text, impact, likelihood, tags})'),
      threats: z
        .array(entrySchema)
        .optional()
        .describe('External, negative factors (string or {text, impact, likelihood, tags})'),
      topN: z
        .number()
        .int()
        .min(0)
        .max(50)
        .default(5)
        .describe('Max strategic pairs per TOWS quadrant. Default 5; 0 = no limit'),
      matchMode: z
        .enum(['all', 'tags'])
        .default('all')
        .describe('"all" = full cross product; "tags" = pairs only when entries share at least one tag (case-insensitive)')
    },
    async (args) => {
      const quads: Quadrants = {
        strengths: normalizeQuadrant(args.strengths),
        weaknesses: normalizeQuadrant(args.weaknesses),
        opportunities: normalizeQuadrant(args.opportunities),
        threats: normalizeQuadrant(args.threats)
      };
      const hasContent = Object.values(quads).some((items) => items.length > 0);
      const mode = hasContent ? 'analysis' : 'facilitation';

      // normalized entries only (no internal provenance flag in the output)
      const toOutput = (entry: Entry): NormalizedEntry => ({
        text: entry.text,
        impact: entry.impact,
        likelihood: entry.likelihood,
        tags: entry.tags
      });

      const response: Record<string, unknown> = {
        subject: args.subject,
        mode,
        strengths: quads.strengths.map(toOutput),
        weaknesses: quads.weaknesses.map(toOutput),
        opportunities: quads.opportunities.map(toOutput),
        threats: quads.threats.map(toOutput),
        status: 'success'
      };

      if (hasContent) {
        const topN = args.topN ?? 5; // schema default; defensive for direct calls
        const matchMode = args.matchMode ?? 'all';
        const { tows, towsRanked, truncatedPerQuadrant, paired } = buildTows(quads, matchMode, topN);
        const unpaired =
          matchMode === 'tags'
            ? {
                strengths: quads.strengths.filter((e) => !paired.strengths.has(e)).map((e) => e.text),
                weaknesses: quads.weaknesses.filter((e) => !paired.weaknesses.has(e)).map((e) => e.text),
                opportunities: quads.opportunities.filter((e) => !paired.opportunities.has(e)).map((e) => e.text),
                threats: quads.threats.filter((e) => !paired.threats.has(e)).map((e) => e.text)
              }
            : { strengths: [], weaknesses: [], opportunities: [], threats: [] };
        const toRankedOutput = (pair: RankedPair) => ({
          pair: [pair.a.text, pair.b.text],
          score: pair.score,
          text: pair.text,
          tags: pair.tags,
          sharedTags: pair.sharedTags
        });
        response.tows = tows;
        response.towsRanked = {
          so: towsRanked.so.map(toRankedOutput),
          wo: towsRanked.wo.map(toRankedOutput),
          st: towsRanked.st.map(toRankedOutput),
          wt: towsRanked.wt.map(toRankedOutput)
        };
        response.scores = buildScores(quads);
        response.meta = {
          topN,
          matchMode,
          truncatedPerQuadrant,
          weightedEntries: {
            strengths: quads.strengths.filter((e) => e.fromObject).length,
            weaknesses: quads.weaknesses.filter((e) => e.fromObject).length,
            opportunities: quads.opportunities.filter((e) => e.fromObject).length,
            threats: quads.threats.filter((e) => e.fromObject).length
          },
          unpaired
        };
        response.nextSteps = [
          'towsRanked lists strategic pairs sorted by impact x likelihood; provide weights (impact/likelihood) and tags to steer ranking and matching.',
          'Derive concrete actions from the TOWS strategies (SO grow, WO fix, ST defend, WT protect).',
          'Feed the prioritized result into decisionframework or mentalmodel (first_principles) for the follow-up decision.'
        ];
      } else {
        response.guidingQuestions = GUIDING_QUESTIONS;
        response.nextSteps = [
          'Answer the guiding questions per quadrant (the calling model supplies the content).',
          'Call swot_analysis again with the filled strengths/weaknesses/opportunities/threats arrays to receive TOWS strategies and scoring.'
        ];
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response, null, 2)
          }
        ]
      };
    }
  );
}
