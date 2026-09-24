/**
 * Policy engine (FR-048/052/053): capability allowlists are enforced by the
 * ClientManager invoker; this module adds data-egress evaluation and
 * risk-class approval requirements.
 */
import type { OperationConfig, RiskClass, TrustLevel } from "../types/index.js";
import { GuidanceError } from "../types/errors.js";
import { containsSecretPattern } from "./redaction.js";

export interface EgressInput {
  serverId: string;
  trustLevel: TrustLevel;
  riskClass?: RiskClass;
  args: Record<string, unknown>;
  approved?: boolean;
}

const TRUST_TO_EGRESS: Record<TrustLevel, "none" | "validated_inputs_only" | "project_data" | "project_data_with_approval"> = {
  untrusted: "none",
  restricted: "validated_inputs_only",
  trusted: "project_data",
  privileged: "project_data_with_approval",
};

export class PolicyEngine {
  /**
   * Deterministic egress evaluation (FR-052): untrusted servers receive no
   * payload; restricted servers receive only validated scalar inputs; a risk
   * class of destructive/credential-sensitive requires explicit approval (FR-053).
   */
  evaluateEgress(input: EgressInput): void {
    const mode = TRUST_TO_EGRESS[input.trustLevel];
    const hasPayload = Object.keys(input.args ?? {}).length > 0;
    if (mode === "none" && hasPayload) {
      throw new GuidanceError("data_egress_denied", `server ${input.serverId} is untrusted and cannot receive data`, { recoverable: false });
    }
    if (mode === "validated_inputs_only") {
      for (const value of Object.values(input.args)) {
        if (typeof value === "object" && value !== null) {
          throw new GuidanceError("data_egress_denied", `server ${input.serverId} may only receive scalar validated inputs`, { recoverable: false });
        }
        // 2c: content-level check — restricted servers must not receive
        // high-confidence secret values even in scalar form (structured
        // checks alone let literal credentials pass).
        if (typeof value === "string" && containsSecretPattern(value)) {
          throw new GuidanceError("data_egress_denied", `server ${input.serverId} arg looks like a credential and was blocked`, { recoverable: false });
        }
      }
    }
    if ((input.riskClass === "destructive" || input.riskClass === "credential_sensitive") && input.approved !== true) {
      throw new GuidanceError("authorization_required", `operation on ${input.serverId} requires explicit authorization (${input.riskClass})`, { recoverable: true });
    }
  }

  /** Exposure filter (FR-037/§30): strips content the agent may not see. */
  applyExposure<T extends { content: unknown[]; data: Record<string, unknown>; summary: string; errors: { message: string }[] }>(
    result: T,
    mode: "none" | "status_only" | "summary" | "summary_and_errors" | "normalized" | "raw",
  ): T {
    switch (mode) {
      case "none":
        return { ...result, content: [], data: {}, summary: "", errors: [], warnings: [] };
      case "status_only":
        return { ...result, content: [], data: {}, warnings: [] };
      case "summary":
        return { ...result, content: [], data: {}, warnings: [] };
      case "summary_and_errors":
        return { ...result, content: [], data: {}, warnings: [] };
      default:
        return result;
    }
  }

  /** Loads operation risk classes into the approval gate. */
  requiresApproval(config: Pick<OperationConfig, "riskClass">): boolean {
    return config.riskClass === "destructive" || config.riskClass === "credential_sensitive";
  }
}
