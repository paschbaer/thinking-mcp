/**
 * Configuration schema and types for the Stochastic Thinking MCP server
 */

import { z } from 'zod';

/**
 * Configuration schema for the Stochastic Thinking MCP server
 *
 * @property debug - Enable debug logging (default: false)
 */
export const ServerConfigSchema = z.object({
  debug: z.boolean().default(false).describe('Enable debug logging')
});

/**
 * Inferred type from the configuration schema
 */
export type ServerConfig = z.infer<typeof ServerConfigSchema>;

/**
 * Default configuration values
 */
export const defaultConfig: ServerConfig = {
  debug: false
};

/**
 * Validates and parses configuration
 * @param config - Raw configuration object
 * @returns Validated configuration
 * @throws {z.ZodError} If configuration is invalid
 */
export function parseConfig(config: unknown): ServerConfig {
  return ServerConfigSchema.parse(config);
}

/**
 * Safely parses configuration with fallback to defaults
 * @param config - Raw configuration object
 * @returns Validated configuration or default configuration
 */
export function safeParseConfig(config: unknown): ServerConfig {
  const result = ServerConfigSchema.safeParse(config);
  if (result.success) {
    return result.data;
  }

  console.warn('Invalid configuration provided, using defaults:', result.error.issues);
  return defaultConfig;
}
