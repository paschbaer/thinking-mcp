/**
 * Structured leveled operational logging (FR-059): JSON lines to stderr,
 * secret-redacted by the shared redactor. Not a metrics surface (tracked).
 */
import { createRedactor, type Redactor } from "./redaction.js";

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export class OperationalLogger {
  private readonly redactor: Redactor;
  constructor(private readonly minLevel: LogLevel = "info", redactor?: Redactor) {
    this.redactor = redactor ?? createRedactor();
  }
  log(level: LogLevel, event: string, data?: Record<string, unknown>): void {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[this.minLevel]) return;
    const line = this.redactor.redact(JSON.stringify({ ts: new Date().toISOString(), level, event, ...data }));
    process.stderr.write(line + "\n");
  }
  debug(event: string, data?: Record<string, unknown>): void { this.log("debug", event, data); }
  info(event: string, data?: Record<string, unknown>): void { this.log("info", event, data); }
  warn(event: string, data?: Record<string, unknown>): void { this.log("warn", event, data); }
  error(event: string, data?: Record<string, unknown>): void { this.log("error", event, data); }
}
