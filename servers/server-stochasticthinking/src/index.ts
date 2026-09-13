import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { z } from "zod";
import { AGENTS_TEMPLATE } from "./tools/agents-guide-template.js";
import { registerAgentsGuide } from "./tools/agents-guide.js";
import { ServerConfigSchema, type ServerConfig } from "./config.js";
import {
  AlgorithmInputError,
  runAlgorithm,
  type BanditRunState
} from "./algorithms/index.js";

// Export the config schema for Smithery
export { ServerConfigSchema as configSchema } from "./config.js";
// Export the embedded agent guide template for documentation tooling
export { AGENTS_TEMPLATE as agentsGuideTemplate } from "./tools/agents-guide-template.js";

// Real algorithm implementations live in src/algorithms/* — the tool below
// computes measured results (value iteration, UCT tree search, bandit pulls
// with session-persisted state, Viterbi/forward-backward, Gaussian-process
// Expected Improvement).

// Tool input shape — zod is the single source of truth for validation,
// JSON schema, and handler argument types.
const stochasticInputShape = {
  algorithm: z
    .enum(["mdp", "mcts", "bandit", "bayesian", "hmm"])
    .describe("Decision algorithm to apply"),
  problem: z.string().describe("Concrete decision problem statement"),
  parameters: z
    .record(z.unknown())
    .describe(
      "Algorithm-specific model inputs — see the parameter tables in the server README (transitions/rewards for mdp, environment for mcts, arms for bandit, observations/bounds for bayesian, matrices + sequence for hmm)"
    ),
  result: z
    .string()
    .optional()
    .describe("Reserved for future use; accepted but not required by the real algorithms")
};

const stochasticOutputSchema = z.object({
  algorithm: z.string(),
  status: z.string(),
  summary: z.string(),
  hasResult: z.boolean(),
  /** Measured artifacts of the computation (value function, visits, …). */
  details: z.record(z.unknown()).optional()
});

// Server Identity
const SERVER_NAME = "stochastic-thinking-server";
const SERVER_VERSION = "0.1.0";

/**
 * Creates a Stochastic Thinking MCP server instance for a specific session
 * @param sessionId - Unique identifier for this session
 * @param config - Server configuration
 * @returns Server instance configured for this session
 */
export default function createStochasticThinkingServer({
  sessionId,
  config,
}: {
  sessionId: string;
  config: ServerConfig;
}): Server {
  if (config.debug) {
    console.error(`[Stochastic Thinking] Creating server for session ${sessionId}`);
  }

  // Per-session bandit run store: runs persist across tool calls within one
  // session (counts, sums, regret, RNG state). One factory instance is
  // created per session, so runs never leak across sessions.
  const banditRuns = new Map<string, BanditRunState>();

  const mcpServer = new McpServer(
    {
      name: SERVER_NAME,
      version: SERVER_VERSION,
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  mcpServer.registerTool(
    "stochasticalgorithm",
    {
      title: "Run stochastic algorithm (real computation)",
      description: `Runs stochastic decision algorithms with real, measured computations:
- Markov Decision Processes (mdp): value iteration over an explicit transition/reward model, returns value function + greedy policy
- Monte Carlo Tree Search (mcts): UCT search on a built-in deterministic gridworld, returns visit counts and mean values per root action
- Multi-Armed Bandit (bandit): real pulls on Bernoulli/Gaussian arms (epsilon-greedy, UCB, Thompson) with per-session run state and measurable regret
- Bayesian Optimization (bayesian): Gaussian-process posterior (RBF kernel) + Expected Improvement over provided observations
- Hidden Markov Models (hmm): Viterbi (log-space) and scaled forward-backward over explicit matrices

Summaries contain the measured numbers (convergence, visits, reward, regret, log-likelihood, EI). Model inputs are provided per algorithm in \`parameters\` — see the parameter tables in the server README.`,
      inputSchema: stochasticInputShape,
      outputSchema: stochasticOutputSchema,
      annotations: {
        readOnlyHint: true, // only server-internal session state is touched
        destructiveHint: false,
        idempotentHint: false, // bandit runs accumulate across calls
        openWorldHint: false
      }
    },
    async ({ algorithm, parameters }) => {
      if (config.debug) {
        console.error(
          `[Stochastic Thinking] Tool call: stochasticalgorithm (session ${sessionId})`
        );
      }

      try {
        const { summary, details } = runAlgorithm(algorithm, parameters, {
          banditRuns
        });
        if (config.debug) {
          console.error(`[Stochastic Thinking] ${summary}`);
        }
        const payload = {
          algorithm,
          status: 'success',
          summary,
          hasResult: true,
          details
        };
        return {
          content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
          structuredContent: payload
        };
      } catch (error) {
        if (!(error instanceof AlgorithmInputError)) throw error;
        const payload = {
          algorithm,
          status: 'failed',
          summary: '',
          hasResult: false,
          details: { error: error.message }
        };
        return {
          isError: true,
          content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
          structuredContent: payload
        };
      }
    }
  );

  registerAgentsGuide(mcpServer);

  // Return the underlying Server instance for the Smithery SDK
  return mcpServer.server;
}
