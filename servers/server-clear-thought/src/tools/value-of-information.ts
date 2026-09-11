import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { SessionState } from '../state/SessionState.js';

export function registerValueOfInformation(server: McpServer, _sessionState: SessionState) {
  server.tool(
    'value_of_information',
    'Estimate the value of resolving each uncertainty (EVPI-style): ' +
      'payoffs[i] is the opportunity cost if uncertainty i resolves ' +
      'unfavorably. Supports probability weighting, per-option payoff ' +
      'matrices and partial VoI for a subset of uncertainties',
    {
      decision_options: z
        .array(z.string())
        .describe('The options under consideration'),
      uncertainties: z
        .array(z.string())
        .describe('Open questions whose resolution could change the decision'),
      payoffs: z
        .array(z.number())
        .describe(
          'Opportunity cost per uncertainty (same order as uncertainties): how much value is lost if it resolves unfavorably. Missing entries count as 0.'
        ),
      probabilities: z
        .array(z.number().min(0).max(1))
        .optional()
        .describe(
          'Probability (0-1) that each uncertainty resolves unfavorably, same order as uncertainties. Omit for a uniform prior (probability 1 each, i.e. worst-case weighting).'
        ),
      option_payoffs: z
        .record(z.string(), z.array(z.number()))
        .optional()
        .describe(
          'Per-option payoff vectors (key = option name from decision_options, value aligned with uncertainties) — returns a per-option VoI ranking'
        ),
      sampled_uncertainties: z
        .array(z.string())
        .optional()
        .describe(
          'Subset of uncertainties a quick investigation would resolve — returns the partial VoI and its share of the total'
        )
    },
    async (args) => {
      const { decision_options, uncertainties, payoffs, probabilities, option_payoffs, sampled_uncertainties } = args;

      if (uncertainties.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  mode: 'facilitation',
                  decision_options,
                  guiding_questions: [
                    'What could still change the decision between the options?',
                    'For each open question: how much value is lost if it resolves against the preferred option?',
                    'What would it cost (time/money) to resolve each question?'
                  ],
                  nextSteps: [
                    'Call again with `uncertainties` and `payoffs` filled from your answers.'
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

      const warnings: string[] = [];
      if (payoffs.length > uncertainties.length) {
        warnings.push('More payoffs than uncertainties — extra entries were ignored.');
      }
      if (payoffs.length < uncertainties.length) {
        warnings.push('Fewer payoffs than uncertainties — missing entries were treated as 0.');
      }
      if (probabilities !== undefined && probabilities.length < uncertainties.length) {
        warnings.push('Fewer probabilities than uncertainties — missing entries were treated as probability 1.');
      }
      const probs = uncertainties.map((_, i) => probabilities?.[i] ?? 1);
      if (probabilities && probabilities.length > uncertainties.length) {
        warnings.push('More probabilities than uncertainties — extra entries were ignored.');
      }

      const impacts = uncertainties.map((_, i) => payoffs[i] ?? 0);
      const expectedImpacts = impacts.map((impact, i) => impact * probs[i]);
      const voi_score = Number(
        (expectedImpacts.reduce((sum, v) => sum + v, 0) / (expectedImpacts.length || 1)).toFixed(2)
      );

      const ranked_uncertainties = uncertainties
        .map((uncertainty, i) => ({
          uncertainty,
          impact: impacts[i],
          probability: probs[i],
          expected_impact: Number(expectedImpacts[i].toFixed(2))
        }))
        .sort((a, b) => b.expected_impact - a.expected_impact);

      const high_impact_questions = ranked_uncertainties
        .filter((r) => r.expected_impact > 0)
        .slice(0, 3)
        .map(
          (r) =>
            `Resolve "${r.uncertainty}" early — expected opportunity cost ${r.expected_impact} (impact ${r.impact} × p ${r.probability}).`
        );

      // Partial VoI: expected value captured by resolving only a subset.
      let partial_voi: {
        uncertainties: string[];
        expected_value: number;
        share_of_total: number;
        interpretation: string;
      } | undefined;
      if (sampled_uncertainties && sampled_uncertainties.length > 0) {
        const indexByName = new Map(uncertainties.map((u, i) => [u, i]));
        const sampled = sampled_uncertainties
          .map((name) => {
            const idx = indexByName.get(name);
            if (idx === undefined) return null;
            return { uncertainty: name, expected_value: Number(expectedImpacts[idx].toFixed(2)) };
          })
          .filter((s): s is { uncertainty: string; expected_value: number } => s !== null);
        const notFound = sampled_uncertainties.filter((name) => !indexByName.has(name));
        if (notFound.length > 0) {
          warnings.push(`sampled_uncertainties not found and ignored: [${notFound.join(', ')}]`);
        }
        const sampledTotal = Number(sampled.reduce((sum, s) => sum + s.expected_value, 0).toFixed(2));
        const totalExpected = Number(expectedImpacts.reduce((sum, v) => sum + v, 0).toFixed(2));
        const share = totalExpected > 0 ? Number((sampledTotal / totalExpected).toFixed(2)) : 0;
        partial_voi = {
          uncertainties: sampled.map((s) => s.uncertainty),
          expected_value: sampledTotal,
          share_of_total: share,
          interpretation:
            share >= 0.7
              ? 'A cheap investigation of this subset already captures most of the total VoI — start there.'
              : 'This subset captures only part of the total VoI — plan follow-up research for the rest.'
        };
      }

      // Per-option VoI from the optional payoff matrix.
      let per_option:
        | Array<{ option: string; voi_score: number; top_uncertainty: { uncertainty: string; expected_impact: number } }>
        | undefined;
      if (option_payoffs) {
        per_option = Object.entries(option_payoffs).map(([option, optionPayoffs]) => {
          const optionImpacts = uncertainties.map((_, i) => optionPayoffs[i] ?? 0);
          const optionExpected = optionImpacts.map((impact, i) => impact * probs[i]);
          const optionVoi = Number(
            (optionExpected.reduce((sum, v) => sum + v, 0) / (optionExpected.length || 1)).toFixed(2)
          );
          let top = { uncertainty: uncertainties[0] ?? '', expected_impact: 0 };
          optionExpected.forEach((v, i) => {
            if (v > top.expected_impact) top = { uncertainty: uncertainties[i], expected_impact: Number(v.toFixed(2)) };
          });
          if (!decision_options.includes(option)) {
            warnings.push(`option_payoffs key "${option}" is not in decision_options — included anyway.`);
          }
          return { option, voi_score: optionVoi, top_uncertainty: top };
        });
        per_option.sort((a, b) => (b.voi_score as number) - (a.voi_score as number));
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                mode: 'analysis',
                decision_options,
                baseline: probabilities
                  ? 'probability-weighted expected opportunity cost'
                  : 'uniform prior over uncertainties; EVPI-style estimate',
                voi_score,
                ranked_uncertainties,
                high_impact_questions,
                ...(partial_voi ? { partial_voi } : {}),
                ...(per_option ? { per_option } : {}),
                ...(warnings.length ? { warnings } : {}),
                nextSteps: [
                  'voi_score is the expected value per resolved uncertainty — compare it against the cost of the research.',
                  partial_voi
                    ? partial_voi.share_of_total >= 0.7
                      ? 'Run the sampled investigation first — it captures most of the total VoI.'
                      : 'The sampled subset is not enough — plan research for the remaining uncertainties.'
                    : 'Resolve the top-ranked uncertainty first, then re-run with updated payoffs.',
                  ...(per_option
                    ? ['Research the top uncertainty of the option you are currently favoring.']
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
