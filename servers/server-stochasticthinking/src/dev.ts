#!/usr/bin/env node
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
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

// Only run if this file is executed directly. Compare REAL paths so the
// guard also matches when npm invokes the bin through its .bin symlink
// (npx / npm i -g): there argv[1] is the symlink path while import.meta.url
// is the resolved real file, so a plain equality check silently no-ops.
function isDirectInvocation(): boolean {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
}

if (isDirectInvocation()) {
  runDev().catch((error) => {
    console.error('[Stochastic Thinking] Fatal error running dev server:', error);
    process.exit(1);
  });
}
