#!/usr/bin/env node
import { pathToFileURL } from 'node:url';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import createStochasticThinkingServer from './index.js';
import { defaultConfig } from './config.js';

async function runDev() {
  const transport = new StdioServerTransport();
  const sessionId = 'dev-' + Date.now();

  // Create server with dev config
  const server = createStochasticThinkingServer({
    sessionId,
    config: {
      ...defaultConfig,
      debug: true
    }
  });

  await server.connect(transport);
  console.error('[Stochastic Thinking] Development server running on stdio');
  console.error('[Stochastic Thinking] Session ID:', sessionId);
  console.error('[Stochastic Thinking] Debug mode: enabled');
  console.error('[Stochastic Thinking] Press Ctrl+C to exit');

  // Handle shutdown
  process.on('SIGINT', () => {
    console.error('\n[Stochastic Thinking] Shutting down...');
    transport.close();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    console.error('\n[Stochastic Thinking] Received SIGTERM, shutting down...');
    transport.close();
    process.exit(0);
  });
}

// Only run if this file is executed directly (works for relative and
// absolute argv paths, incl. tsx).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runDev().catch((error) => {
    console.error('[Stochastic Thinking] Fatal error running dev server:', error);
    process.exit(1);
  });
}
