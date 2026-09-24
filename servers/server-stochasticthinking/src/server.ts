import { pathToFileURL } from 'node:url';
import { createStatefulServer } from '@smithery/sdk/server/stateful.js';
import createStochasticThinkingServer from './index.js';
import { ServerConfigSchema, type ServerConfig } from './config.js';
import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';

// Create the Express app with stateful server.
// Exported so tests can bind it to an ephemeral port.
export const app = createStatefulServer<ServerConfig>(createStochasticThinkingServer, {
  schema: ServerConfigSchema as z.ZodSchema<ServerConfig>
}).app;

// Add health check endpoint
app.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'stochastic-thinking-mcp',
    timestamp: new Date().toISOString()
  });
});

// Error handling middleware
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error('Server error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

function startServer(): void {
  // Get port from environment or use default
  // (host default 3001 keeps clear-thought on 3000 free; the Docker image
  // overrides PORT to 3000 internally)
  const PORT = process.env.PORT || 3001;

  // Host default loopback; the Docker image sets STOCHASTIC_BIND_HOST=0.0.0.0
  // so the port mapping stays reachable (same pattern as the other servers).
  const HOST = process.env.STOCHASTIC_BIND_HOST || '127.0.0.1';

  const server = app.listen(PORT, HOST, () => {
    console.log(`Stochastic Thinking MCP server running on ${HOST}:${PORT}`);
    console.log(`Health check available at http://localhost:${PORT}/health`);
    console.log(`MCP endpoint available at http://localhost:${PORT}/mcp`);
  });

  // Graceful shutdown handling
  process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully');
    server.close(() => {
      console.log('Server closed');
      process.exit(0);
    });
  });

  process.on('SIGINT', () => {
    console.log('SIGINT received, shutting down gracefully');
    server.close(() => {
      console.log('Server closed');
      process.exit(0);
    });
  });
}

// Only bind a port when this file is executed directly — importing the app
// (e.g. from tests) must not open a listener.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startServer();
}
