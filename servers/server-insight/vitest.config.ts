import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // forks (not threads): better-sqlite3's native binding is unstable across
    // worker threads — full-suite runs showed napi crashes and silently empty
    // FTS results that never reproduced with --pool=forks or isolated files.
    pool: 'forks',
    // 5s default is too tight for this suite under load: native better-sqlite3
    // + lazy transformers model loading caused spurious timeouts (mcp-surface,
    // golden-g1-g3) that never reproduced in isolation.
    testTimeout: 30_000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
        'tests/',
        '**/*.d.ts',
        '**/*.config.*',
        '**/mockData.ts'
      ]
    }
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    },
    extensions: ['.ts', '.js']
  }
});
