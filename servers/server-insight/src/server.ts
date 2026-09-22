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
app.use((err: unknown, req: Request, res: Response, next: NextFunction) => {
  console.error('Server error:', err);
  const message = err instanceof Error ? err.message : String(err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? message : undefined,
  });
});

function startServer(): void {
  // Number(): env vars are strings; listen(port, host) requires a numeric port
  // (TS2769 under the 2-arg overload — masked before the host arg was added).
  const PORT = Number(process.env.PORT) || 3002;
  // Default-sicher: nur localhost binden. Der Docker-Container setzt
  // EMMS_BIND_HOST=0.0.0.0, damit das Port-Mapping (3002:3002) erreichbar ist.
  const HOST = process.env.EMMS_BIND_HOST || '127.0.0.1';

  const server = app.listen(PORT, HOST, () => {
    console.log(`Experience Memory MCP server running on ${HOST}:${PORT}`);
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
