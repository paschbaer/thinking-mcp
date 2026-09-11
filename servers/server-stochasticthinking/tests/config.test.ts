import { describe, expect, it } from 'vitest';
import {
  ServerConfigSchema,
  defaultConfig,
  parseConfig,
  safeParseConfig
} from '../src/config.js';

describe('ServerConfigSchema', () => {
  it('applies defaults for an empty config', () => {
    expect(ServerConfigSchema.parse({})).toEqual({ debug: false });
  });

  it('keeps explicit values', () => {
    expect(ServerConfigSchema.parse({ debug: true })).toEqual({ debug: true });
  });
});

describe('parseConfig', () => {
  it('parses and validates raw input', () => {
    expect(parseConfig({ debug: true })).toEqual({ debug: true });
  });

  it('throws on invalid types', () => {
    expect(() => parseConfig({ debug: 'yes' })).toThrow();
  });
});

describe('safeParseConfig', () => {
  it('falls back to defaults on invalid input', () => {
    expect(safeParseConfig({ debug: 'yes' })).toEqual(defaultConfig);
  });

  it('returns parsed data on valid input', () => {
    expect(safeParseConfig({ debug: true })).toEqual({ debug: true });
  });
});
