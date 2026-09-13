import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { z } from "zod";
import { AGENTS_TEMPLATE } from "./tools/agents-guide-template.js";
import { registerAgentsGuide } from "./tools/agents-guide.js";
import { ServerConfigSchema, type ServerConfig } from "./config.js";

// Export the config schema for Smithery
export { ServerConfigSchema as configSchema } from "./config.js";
// Export the embedded agent guide template for documentation tooling
export { AGENTS_TEMPLATE as agentsGuideTemplate } from "./tools/agents-guide-template.js";

// Stochastic Algorithm Implementations
class StochasticServer {
  public formatOutput(data: StochasticData): string {
    const { algorithm, problem, parameters, result } = data;
    const border = '─'.repeat(Math.max(algorithm.length + 20, problem.length + 4));

    let output = `
┌${border}┐
│ 🎲 Algorithm: ${algorithm.padEnd(border.length - 13)} │
├${border}┤
│ Problem: ${problem.padEnd(border.length - 10)} │
├${border}┤
│ Parameters:${' '.repeat(border.length - 12)} │`;

    for (const [key, value] of Object.entries(parameters)) {
      output += `\n│ • ${key}: ${String(value).padEnd(border.length - key.length - 4)} │`;
    }

    if (result) {
      output += `\n├${border}┤
│ Result: ${result.padEnd(border.length - 9)} │`;
    }

    output += `\n└${border}┘`;
    return output;
  }

  private mdpOneLineSummary(params: AlgorithmParameters): string {
    return `Optimized policy over ${params.states || 'N'} states with discount factor ${params.gamma || 0.9}`;
  }

  private mctsOneLineSummary(params: AlgorithmParameters): string {
    return `Explored ${params.simulations || 1000} paths with exploration constant ${params.explorationConstant || 1.4}`;
  }

  private banditOneLineSummary(params: AlgorithmParameters): string {
    return `Selected optimal arm with ${params.strategy || 'epsilon-greedy'} strategy (ε=${params.epsilon || 0.1})`;
  }

  private bayesianOneLineSummary(params: AlgorithmParameters): string {
    return `Optimized objective with ${params.acquisitionFunction || 'expected improvement'} acquisition`;
  }

  private hmmOneLineSummary(params: AlgorithmParameters): string {
    return `Inferred hidden states using ${params.algorithm || 'forward-backward'} algorithm`;
  }

  public summarize(algorithm: string, parameters: AlgorithmParameters): string {
    switch (algorithm) {
      case 'mdp':
        return this.mdpOneLineSummary(parameters);
      case 'mcts':
        return this.mctsOneLineSummary(parameters);
      case 'bandit':
        return this.banditOneLineSummary(parameters);
      case 'bayesian':
        return this.bayesianOneLineSummary(parameters);
      case 'hmm':
        return this.hmmOneLineSummary(parameters);
      default:
        return '';
    }
  }
}

// Data Interfaces
interface AlgorithmParameters {
  [key: string]: unknown;
}

interface StochasticData {
  algorithm: string;
  problem: string;
  parameters: AlgorithmParameters;
  result?: string;
}

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
      "Algorithm-specific parameters (see the algorithm routing table in the server README)"
    ),
  result: z.string().optional().describe("Previous result to refine the framing")
};

const stochasticOutputSchema = z.object({
  algorithm: z.string(),
  status: z.string(),
  summary: z.string(),
  hasResult: z.boolean()
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

  const stochasticServer = new StochasticServer();

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
      title: "Apply stochastic algorithm",
      description: `A tool for applying stochastic algorithms to decision-making problems.
Supports various algorithms including:
- Markov Decision Processes (MDPs): Optimize policies over long sequences of decisions
- Monte Carlo Tree Search (MCTS): Simulate future action sequences for large decision spaces
- Multi-Armed Bandit: Balance exploration vs exploitation in action selection
- Bayesian Optimization: Optimize decisions with probabilistic inference
- Hidden Markov Models (HMMs): Infer latent states affecting decision outcomes

Each algorithm provides a systematic approach to handling uncertainty in decision-making.`,
      inputSchema: stochasticInputShape,
      outputSchema: stochasticOutputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      }
    },
    async ({ algorithm, problem, parameters, result }) => {
      if (config.debug) {
        console.error(
          `[Stochastic Thinking] Tool call: stochasticalgorithm (session ${sessionId})`
        );
      }
      console.error(
        stochasticServer.formatOutput({ algorithm, problem, parameters, result })
      );

      const payload = {
        algorithm,
        status: 'success',
        summary: stochasticServer.summarize(algorithm, parameters),
        hasResult: !!result
      };
      return {
        content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
        structuredContent: payload
      };
    }
  );

  registerAgentsGuide(mcpServer);

  // Return the underlying Server instance for the Smithery SDK
  return mcpServer.server;
}
