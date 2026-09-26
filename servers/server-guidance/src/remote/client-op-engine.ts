/**
 * FR-104: Client-executed Process Operations (1a).
 * Ersatz-OperationEngine für Remote-Sessions: führt NICHTS aus, sondern
 * liest Reports aus einem Ledger (report_operation_result) und liefert
 * "awaiting_client" für noch nicht gemeldete Operationen. MCP-Downstream-
 * Operationen (server/capability) bleiben serverseitig — im v1 Remote-Modus
 * werden sie als awaiting_client gemeldet, bis Downstream-Support spezifiert
 * wird (dokumentierte Einschränkung).
 */
import { randomUUID } from "node:crypto";
import type { NormalizedResult, OperationConfig } from "../types/index.js";
import { GuidanceError } from "../types/errors.js";
import type { OperationContext } from "../orchestration/OperationEngine.js";

export interface OpReport {
  operationId: string;
  status: "succeeded" | "failed" | "timed_out" | "cancelled";
  exitCode?: number;
  summary: string;
  logs?: string;
  requestId?: string;
  reportedAt: string;
}

/** Ledger je Session: Operation-ID → letzter Report + One-Time-Report-Tokens
 *  (spec 005 FR-404: Client-Report-Integrität, FR-104.5-Nachfolger). */
export class ClientOpLedger {
  private readonly reports = new Map<string, OpReport>();
  private readonly pendingTokens = new Map<string, string>();

  record(report: OpReport): void {
    this.reports.set(report.operationId, report);
  }

  /** FR-404: idempotentes Minting — dieselbe Pending-Op liefert dasselbe
   *  Token, bis es durch einen akzeptierten Report verbrannt wurde. */
  mintToken(operationId: string): string {
    let token = this.pendingTokens.get(operationId);
    if (!token) {
      token = randomUUID().replace(/-/g, "");
      this.pendingTokens.set(operationId, token);
    }
    return token;
  }

  /** FR-404: Einmal-Binding — nur der passende Token akzeptiert; Burn on
   *  accept. Mismatch/fehlend/ungekannt → client_report_invalid. */
  validateAndBurn(operationId: string, token: string | undefined): void {
    const expected = this.pendingTokens.get(operationId);
    if (!expected) {
      throw new GuidanceError("client_report_invalid", `no pending client operation ${operationId}`, { recoverable: true });
    }
    if (token !== expected) {
      throw new GuidanceError("client_report_invalid", `report token mismatch for ${operationId}`, { recoverable: true });
    }
    this.pendingTokens.delete(operationId);
  }

  pendingSnapshot(): Record<string, string> {
    return Object.fromEntries(this.pendingTokens);
  }

  restorePending(tokens: Record<string, string> | undefined): void {
    for (const [opId, token] of Object.entries(tokens ?? {})) this.pendingTokens.set(opId, token);
  }

  get(operationId: string): OpReport | undefined {
    return this.reports.get(operationId);
  }

  all(): OpReport[] {
    return [...this.reports.values()];
  }
}

export class ClientOpEngine {
  constructor(private readonly ledger: ClientOpLedger) {}

  async executeRequired(configs: OperationConfig[], _ctx: OperationContext): Promise<{ allSucceeded: boolean; results: NormalizedResult[] }> {
    const results: NormalizedResult[] = configs.map((config) => {
      const report = this.ledger.get(config.operationId);
      if (report) {
        return {
          operationId: config.operationId,
          status: report.status === "succeeded" ? ("succeeded" as const) : report.status,
          summary: report.summary || `client-reported: ${report.status}`,
          data: { exitCode: report.exitCode, clientReported: true },
          content: [],
        } as unknown as NormalizedResult;
      }
      return {
        operationId: config.operationId,
        status: "input_required" as const,
        summary: "awaiting client execution (remote mode)",
        data: { awaitingClient: true, opToken: this.ledger.mintToken(config.operationId) },
        content: [],
      } as unknown as NormalizedResult;
    });
    const allSucceeded = configs
      .filter((c) => c.required)
      .every((c) => results.find((r) => r.operationId === c.operationId)?.status === "succeeded");
    return { allSucceeded, results };
  }
}
