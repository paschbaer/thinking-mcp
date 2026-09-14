#!/usr/bin/env node
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import createClearThoughtServer from './index.js';

async function runDev() {
  const transport = new StdioServerTransport();
  
  // Create server with dev config
  const server = createClearThoughtServer({
    sessionId: 'dev-' + Date.now(),
    config: {
      debug: true,
      maxThoughtsPerSession: 100,
      sessionTimeout: 3600000,
      enableMetrics: false
    }
  });
  
  await server.connect(transport);
  console.error('[Clear Thought] Development server running on stdio');
  console.error('[Clear Thought] Session ID:', 'dev-' + Date.now());
  console.error('[Clear Thought] Debug mode: enabled');
  console.error('[Clear Thought] Press Ctrl+C to exit');
  
  // Handle shutdown
  process.on('SIGINT', () => {
    console.error('\n[Clear Thought] Shutting down...');
    transport.close();
    process.exit(0);
  });
  
  process.on('SIGTERM', () => {
    console.error('\n[Clear Thought] Received SIGTERM, shutting down...');
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
  runDev().catch(error => {
    console.error('[Clear Thought] Fatal error:', error);
    process.exit(1);
  });
}