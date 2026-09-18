import { z } from 'zod';

/**
 * Server configuration schema for the Experience Memory MCP Server (EMMS).
 *
 * Functionality is defined by specs/001-experience-memory-server/spec.md.
 */
export const ServerConfigSchema = z.object({
  // Storage location for the experience memory (details determined by the spec's
  // storage requirements; kept configurable to allow local-first MVP usage).
  storagePath: z.string().optional(),
});

export type ServerConfig = z.infer<typeof ServerConfigSchema>;

export const DEFAULT_CONFIG: ServerConfig = {};
