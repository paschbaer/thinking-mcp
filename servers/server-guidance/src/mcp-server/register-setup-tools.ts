/**
 * Registriert die 3 Konfigurations-Assistent-Tools (stateless Wizard):
 * setup_guidance_start / setup_guidance_answer / setup_guidance_generate.
 * Immer verfügbar (nicht profilgebunden) — der Assistent erzeugt eine
 * .guidance/-Konfiguration als Payload; der Server schreibt keine Dateien.
 */
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { GuidanceError } from "../types/errors.js";
import { catalogOverview, generateFiles, type SetupAnswers, type SetupAnswerValue } from "../setup/ConfigAssistant.js";

export const SETUP_TOOL_NAMES = [
  "setup_guidance_start",
  "setup_guidance_answer",
  "setup_guidance_generate",
] as const;

const answersShape = {
  answers: z.record(z.union([z.string(), z.boolean()])).optional(),
};

function toAnswerRecord(raw: Record<string, string | boolean> | undefined): SetupAnswers {
  const out: SetupAnswers = {};
  for (const [k, v] of Object.entries(raw ?? {})) out[k] = v;
  return out;
}

function toJson(payload: unknown): { content: Array<{ type: "text"; text: string }> } {
  return { content: [{ type: "text", text: JSON.stringify(payload) }] };
}

export function registerSetupTools(server: McpServer): void {
  server.tool(
    "setup_guidance_start",
    "Startet den Konfigurations-Assistenten: Frage-Katalog + erste Frage",
    {},
    () => toJson(catalogOverview({})),
  );
  server.tool(
    "setup_guidance_answer",
    "Nimmt akkumulierte Antworten entgegen und liefert die nächste offene Frage (oder done)",
    answersShape,
    async ({ answers }) => {
      if (answers === undefined) {
        throw new GuidanceError("configuration_invalid", "answers object required (accumulate all previous answers)", { recoverable: true });
      }
      return toJson(catalogOverview(toAnswerRecord(answers)));
    },
  );
  server.tool(
    "setup_guidance_generate",
    "Generiert die vollständige .guidance/-Dateimenge als Payload (der Agent schreibt die Dateien selbst)",
    answersShape,
    async ({ answers }) => {
      if (answers === undefined) {
        throw new GuidanceError("configuration_invalid", "answers object required (accumulate all previous answers)", { recoverable: true });
      }
      return toJson(generateFiles(toAnswerRecord(answers)));
    },
  );
}

export type { SetupAnswerValue };
