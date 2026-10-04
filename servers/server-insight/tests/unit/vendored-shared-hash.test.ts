/**
 * Vendoring drift guard: the files under src/workflow/ are vendored copies of
 * the canonical source of truth in servers/shared-workflow/src. A direct edit
 * here breaks single-source maintenance — edit the canonical file and run
 * `node scripts/sync-shared-workflow.mjs` (from servers/shared-workflow).
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const canonicalDir = resolve(here, "../../../shared-workflow/src");
const vendoredDir = resolve(here, "../../src/workflow");

describe("vendored shared-workflow copies", () => {
  for (const file of ["transition-protocol.ts", "operation-registry.ts"]) {
    it(`${file} matches the canonical shared-workflow copy`, () => {
      const sha = (p: string) =>
        createHash("sha256").update(readFileSync(p)).digest("hex");
      expect(sha(resolve(vendoredDir, file))).toBe(
        sha(resolve(canonicalDir, file)),
      );
    });
  }
});
