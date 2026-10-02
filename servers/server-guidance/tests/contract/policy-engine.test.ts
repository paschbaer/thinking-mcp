import { describe, expect, it } from "vitest";
import { PolicyEngine } from "../../src/policy/PolicyEngine.js";
import type {
  NormalizedResult,
  OperationConfig,
} from "../../src/types/index.js";

const engine = new PolicyEngine();

describe("PolicyEngine (FR-052/053, FR-048-adjacent)", () => {
  it("denies any payload to untrusted servers", () => {
    expect(() =>
      engine.evaluateEgress({
        serverId: "u",
        trustLevel: "untrusted",
        args: { a: 1 },
      }),
    ).toThrowError(/data_egress_denied/);
  });

  it("restricts restricted servers to scalar inputs", () => {
    expect(() =>
      engine.evaluateEgress({
        serverId: "r",
        trustLevel: "restricted",
        args: { ok: "v" },
      }),
    ).not.toThrow();
    expect(() =>
      engine.evaluateEgress({
        serverId: "r",
        trustLevel: "restricted",
        args: { nested: { x: 1 } },
      }),
    ).toThrowError(/data_egress_denied/);
  });

  it("allows trusted servers to receive project data", () => {
    expect(() =>
      engine.evaluateEgress({
        serverId: "t",
        trustLevel: "trusted",
        args: { repo: "/ws" },
      }),
    ).not.toThrow();
  });

  it("approval decision resolves from policies.approvals (defaults: destructive/credential_sensitive require, others allow)", () => {
    const destructive: Pick<OperationConfig, "riskClass"> = {
      riskClass: "destructive",
    };
    expect(engine.requiresApproval(destructive)).toBe(true);
    expect(engine.requiresApproval({ riskClass: "credential_sensitive" })).toBe(
      true,
    );
    // Unattended defaults (REV-US2-F1 rework).
    expect(engine.requiresApproval({ riskClass: "workspace_write" })).toBe(
      false,
    );
    expect(engine.requiresApproval({ riskClass: "read_only" })).toBe(false);
    expect(engine.requiresApproval({ riskClass: "external_write" })).toBe(
      false,
    );
    // Explicit policies.approvals entries override the defaults.
    expect(
      engine.requiresApproval(
        { riskClass: "workspace_write" },
        {
          workspace_write: "require",
        },
      ),
    ).toBe(true);
    expect(engine.requiresApproval(destructive, { destructive: "allow" })).toBe(
      false,
    );
    expect(() =>
      engine.evaluateEgress({
        serverId: "p",
        trustLevel: "trusted",
        riskClass: "destructive",
        args: {},
        approved: false,
      }),
    ).toThrowError(/authorization_required/);
    expect(() =>
      engine.evaluateEgress({
        serverId: "p",
        trustLevel: "trusted",
        riskClass: "destructive",
        args: {},
        approved: true,
      }),
    ).not.toThrow();
  });

  it("applies exposure modes to normalized results (FR-037, §30)", () => {
    const result: NormalizedResult = {
      operationId: "op",
      status: "succeeded",
      summary: "fine",
      data: { a: 1 },
      content: [{ secret: "x" }],
      warnings: [],
      errors: [{ message: "e" }],
      protocolMetadata: {},
      validated: true,
    };
    expect(engine.applyExposure(result, "none").content).toEqual([]);
    expect(engine.applyExposure(result, "none").warnings).toEqual([]);
    expect(engine.applyExposure(result, "status_only").data).toEqual({});
    expect(engine.applyExposure(result, "summary_and_errors").content).toEqual(
      [],
    );
    expect(
      engine.applyExposure(result, "summary_and_errors").errors,
    ).toHaveLength(1);
    expect(engine.applyExposure(result, "summary_and_errors").data).toEqual({});
    expect(engine.applyExposure(result, "summary").data).toEqual({});
    expect(() =>
      engine.evaluateEgress({
        serverId: "p",
        trustLevel: "trusted",
        riskClass: "credential_sensitive",
        args: {},
        approved: false,
      }),
    ).toThrowError(/authorization_required/);
    expect(engine.applyExposure(result, "raw").content).toHaveLength(1);
  });

  it("WC-1-B: unconfigured tools on wildcard servers require explicit approval", () => {
    // Wildcard + no operations.json entry -> recoverable authorization_required.
    expect(() =>
      engine.assertUnconfiguredWildcard("w", "mysteryTool", ["*"], false),
    ).toThrowError(/authorization_required/);
    expect(() =>
      engine.assertUnconfiguredWildcard("w", "mysteryTool", ["*"], false),
    ).toThrowError(/mysteryTool.*wildcard server w/s);
    // Configured tool on a wildcard server: unchanged behavior.
    expect(() =>
      engine.assertUnconfiguredWildcard("w", "knownTool", ["*"], true),
    ).not.toThrow();
    // Non-wildcard servers are the allowlist's job (assertAllowed), not ours.
    expect(() =>
      engine.assertUnconfiguredWildcard("x", "unknownTool", ["known"], false),
    ).not.toThrow();
  });
});
