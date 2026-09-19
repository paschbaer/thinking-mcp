import { pathToFileURL } from 'node:url';
import { createStatefulServer } from '@smithery/sdk/server/stateful.js';
import createExperienceMemoryServer from './index.js';
import { ServerConfigSchema, type ServerConfig } from './config.js';
import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';

// Create the Express app with stateful server.
// Exported so tests can bind it to an ephemeral port.
export const app = createStatefulServer<ServerConfig>(createExperienceMemoryServer, {
  schema: ServerConfigSchema as z.ZodSchema<ServerConfig>,
}).app;

// Add health check endpoint
app.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'experience-memory-mcp',
    timestamp: new Date().toISOString(),
  });
});

// Error handling middleware
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error('Server error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
});

function startServer(): void {
  const PORT = process.env.PORT || 3002;

  const server = app.listen(PORT, () => {
    console.log(`Experience Memory MCP server running on port ${PORT}`);
    console.log(`Health check available at http://localhost:${PORT}/health`);
  });

  const shutdown = async () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 5000).unref();
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

// Only start when run directly (not when imported by tests).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startServer();
}
