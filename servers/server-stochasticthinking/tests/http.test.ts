import { describe, expect, it } from 'vitest';
import { app } from '../src/server.js';

describe('HTTP app', () => {
  it('GET /health reports ok for the stochastic-thinking service', async () => {
    const server = app.listen(0);
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const port = (server.address() as { port: number }).port;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe('ok');
      expect(body.service).toBe('stochastic-thinking-mcp');
      expect(typeof body.timestamp).toBe('string');
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
