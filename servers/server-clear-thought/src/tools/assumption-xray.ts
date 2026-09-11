import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { SessionState } from '../state/SessionState.js';

interface Heuristic {
  kind: string;
  re: RegExp;
  confidence: number;
  falsification_test: string;
  label: (evidence: string) => string;
}

const HEURISTICS: Heuristic[] = [
  {
    kind: 'universal',
    re: /\b(all|every|always|never|none|no one|nobody|everyone)\b/i,
    confidence: 0.7,
    falsification_test: 'Find a single counterexample that violates the universal claim.',
    label: (evidence) => `Universality assumption around "${evidence}" — does it really hold in every case?`
  },
  {
    kind: 'causal',
    re: /\b(because|cause|causes|due to|leads? to|results? in|therefore|thus)\b/i,
    confidence: 0.6,
    falsification_test: 'Run an experiment that isolates the alleged cause from confounders.',
    label: (evidence) => `Causal assumption around "${evidence}" — is the causality proven or only correlated?`
  },
  {
    kind: 'necessity',
    re: /\b(must|should|will|cannot|can't|impossible|required)\b/i,
    confidence: 0.55,
    falsification_test: 'Check whether the necessity still holds under changed constraints.',
    label: (evidence) => `Necessity/modality assumption around "${evidence}" — is it truly necessary?`
  },
  {
    kind: 'comparative',
    re: /\b(best|worst|faster|slower|cheaper|more than|less than|most|least)\b/i,
    confidence: 0.5,
    falsification_test: 'Benchmark quantitatively against the alternative being implicitly excluded.',
    label: (evidence) => `Comparative assumption around "${evidence}" — measured against what baseline?`
  }
];

function extractContext(claim: string, match: RegExpExecArray): string {
  const start = Math.max(0, match.index - 40);
  const end = Math.min(claim.length, match.index + match[0].length + 40);
  const snippet = claim.slice(start, end).trim();
  return start > 0 ? `…${snippet}` : snippet;
}

export function registerAssumptionXray(server: McpServer, _sessionState: SessionState) {
  server.tool(
    'assumption_xray',
    'Surface assumptions in a claim via heuristic extraction (universality, ' +
      'causality, necessity, comparatives) with matched evidence, heuristic ' +
      'confidence and falsification tests for each',
    {
      claim: z.string().trim().min(1),
      context: z.string().trim().min(1).optional()
    },
    async ({ claim, context }) => {
      const assumptions: Array<{
        kind: string;
        assumption: string;
        evidence: string;
        confidence: number;
        falsification_test: string;
      }> = [];

      for (const heuristic of HEURISTICS) {
        const re = new RegExp(heuristic.re.source, 'gi');
        let match: RegExpExecArray | null;
        while ((match = re.exec(claim)) !== null && assumptions.length < 6) {
          const evidence = extractContext(claim, match);
          assumptions.push({
            kind: heuristic.kind,
            assumption: heuristic.label(match[0]),
            evidence,
            confidence: heuristic.confidence,
            falsification_test: heuristic.falsification_test
          });
        }
        if (assumptions.length >= 6) break;
      }

      const mode = assumptions.length > 0 ? 'analysis' : 'no_marker';
      const probing_questions = [
        'What must be true for this claim to hold?',
        'Which term is doing the most work, and how would you define it precisely?',
        'What evidence would change your mind about this claim?'
      ];

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                mode,
                claim,
                context: context ?? null,
                assumptions,
                confidence: assumptions.length
                  ? Number((assumptions.reduce((s, a) => s + a.confidence, 0) / assumptions.length).toFixed(2))
                  : 0,
                ...(mode === 'no_marker'
                  ? {
                      probing_questions,
                      note: 'No strong assumption markers (quantifiers, causality, necessity, comparatives) found. Use the probing questions to dig manually.'
                    }
                  : {}),
                nextSteps: assumptions.length
                  ? [
                      'Work through the falsification_test of each assumption, weakest confidence first.',
                      'Explicitly confirm or reject each assumption before acting on the claim.'
                    ]
                  : [],
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
