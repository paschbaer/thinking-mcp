/**
 * FR-104: Client-executed Process Operations (1a).
 * Ersatz-OperationEngine für Remote-Sessions: führt NICHTS aus, sondern
 * liest Reports aus einem Ledger (report_operation_result) und liefert
 * "awaiting_client" für noch nicht gemeldete Operationen. MCP-Downstream-
 * Operationen (server/capability) bleiben serverseitig — im v1 Remote-Modus
 * werden sie als awaiting_client gemeldet, bis Downstream-Support spezifiert
 * wird (dokumentierte Einschränkung).
 */
import type { NormalizedResult, OperationConfig } from "../types/index.js";
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

/** Ledger je Session: Operation-ID → letzter Report. */
export class ClientOpLedger {
  private readonly reports = new Map<string, OpReport>();

  record(report: OpReport): void {
    this.reports.set(report.operationId, report);
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
          status: report.status === "succeeded" ? ("succeeded" as const) : (report.status === "failed" ? ("failed" as const) : ("cancelled" as const)),
          summary: report.summary || `client-reported: ${report.status}`,
          data: { exitCode: report.exitCode, clientReported: true },
          content: [],
        } as unknown as NormalizedResult;
      }
      return {
        operationId: config.operationId,
        status: "input_required" as const,
        summary: "awaiting client execution (remote mode)",
        data: { awaitingClient: true },
        content: [],
      } as unknown as NormalizedResult;
    });
    const allSucceeded = configs
      .filter((c) => c.required)
      .every((c) => results.find((r) => r.operationId === c.operationId)?.status === "succeeded");
    return { allSucceeded, results };
  }
}
