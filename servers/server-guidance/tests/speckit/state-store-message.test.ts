import { describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GuidanceError } from "../../src/types/errors.js";
import { SpecKitStateStore } from "../../src/mcp-server/register-spec-kit-tools.js";

// REV-2 (session-review finding): the missing-artifact error must present both
// resolutions — import (task tracking) or skip task tools (plan-level flow) —
// instead of dead-ending on a single "call import first" hint.
describe("SpecKitStateStore.load — spec_kit_artifact_missing guidance (REV-2)", () => {
  it("throws recoverable spec_kit_artifact_missing with both resolutions in the message", () => {
    const store = new SpecKitStateStore(
      mkdtempSync(join(tmpdir(), "speckit-store-")),
    );
    let err: GuidanceError | undefined;
    try {
      store.load("session-abc");
    } catch (e) {
      err = e as GuidanceError;
    }
    expect(err).toBeInstanceOf(GuidanceError);
    expect(err!.code).toBe("spec_kit_artifact_missing");
    expect(err!.recoverable).toBe(true);
    expect(err!.message).toContain("import_spec_kit_artifacts");
    expect(err!.message).toContain("plan-level submissions");
  });
});
