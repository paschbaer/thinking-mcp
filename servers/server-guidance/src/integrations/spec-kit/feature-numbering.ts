/** specs/017 FR-10 (DQ-3): feature numbering aligned with
 *  `.specify/scripts/bash/create-new-feature.sh` (`get_highest_from_specs`):
 *  the next feature number is the highest existing `NNN-` directory in
 *  `specs/` plus 1, zero-padded to 3 digits — so session-created feature
 *  directories and `speckit-specify` output can never diverge. */
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

export function highestFeatureNumber(specsRoot: string): number {
  if (!existsSync(specsRoot)) return 0;
  let highest = 0;
  for (const entry of readdirSync(specsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const match = /^(\d{3})-/.exec(entry.name);
    if (match) highest = Math.max(highest, Number.parseInt(match[1]!, 10));
  }
  return highest;
}

export function nextFeatureNumber(specsRoot: string): string {
  return String(highestFeatureNumber(specsRoot) + 1).padStart(3, "0");
}
