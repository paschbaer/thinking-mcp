import { describe, expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Regression guard for the npm bin invocation path: npm runs package bins
 * through a symlink in node_modules/.bin (also for npx / npm i -g). The
 * direct-execution guard in dev.ts must therefore compare REAL paths —
 * a plain argv[1] === import.meta.url check silently no-ops there.
 */

const devJs = fileURLToPath(new URL('../dist/dev.js', import.meta.url));

const STARTUP_MARKER = 'running on stdio';

/** Resolves alive=true as soon as the startup marker appears in stderr; false on exit or timeout. */
function probeForStartup(target: string, timeoutMs = 120000): Promise<{ alive: boolean; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [target], {
      stdio: ['ignore', 'ignore', 'pipe']
    });
    let stderr = '';
    let settled = false;
    const done = (alive: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        child.kill('SIGTERM');
      } catch {
        // already gone
      }
      resolve({ alive, stderr });
    };
    const timer = setTimeout(() => done(false), timeoutMs);
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += String(chunk);
      if (stderr.includes(STARTUP_MARKER)) done(true);
    });
    child.on('exit', () => done(false));
  });
}

const itUnix = process.platform === 'win32' ? it.skip : it;

describe('published bin invocation (npm .bin symlink)', () => {
  const link = join(tmpdir(), `dev-bin-symlink-test-${process.pid}`);

  itUnix(
    'starts the server when invoked through a .bin-style symlink (npx scenario)',
    async () => {
      if (!existsSync(devJs)) {
        throw new Error('dist/dev.js missing — run npm run build before the test suite');
      }
      await rm(link, { force: true });
      await symlink(devJs, link);
      try {
        const viaSymlink = await probeForStartup(link);
        expect(
          viaSymlink.alive,
          'server must reach startup when the bin is started via a symlink (silent exit = broken guard)'
        ).toBe(true);

        const direct = await probeForStartup(devJs);
        expect(direct.alive, 'direct invocation must still start the server').toBe(true);
      } finally {
        await rm(link, { force: true });
      }
    },
    150000
  );
});
