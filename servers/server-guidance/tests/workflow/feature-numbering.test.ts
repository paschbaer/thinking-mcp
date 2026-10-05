/** specs/017 FR-10: feature numbering aligned with get_highest_from_specs. */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  highestFeatureNumber,
  nextFeatureNumber,
} from "../../src/integrations/spec-kit/feature-numbering.js";

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "specs-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("feature numbering (specs/017 FR-10)", () => {
  it("returns 001 when specs/ is empty or missing", () => {
    expect(nextFeatureNumber(root)).toBe("001");
    expect(nextFeatureNumber(join(root, "missing"))).toBe("001");
  });

  it("picks highest NNN- dir + 1, zero-padded to 3 digits (create-new-feature.sh parity)", () => {
    for (const dir of ["001-auth", "017-spec-kit-mode", "009-misc", "notes"]) {
      mkdirSync(join(root, dir));
    }
    expect(highestFeatureNumber(root)).toBe(17);
    expect(nextFeatureNumber(root)).toBe("018");
  });

  it("rolls over to 4 digits only past 999 (padStart contract)", () => {
    mkdirSync(join(root, "999-last"));
    expect(nextFeatureNumber(root)).toBe("1000");
  });
});
