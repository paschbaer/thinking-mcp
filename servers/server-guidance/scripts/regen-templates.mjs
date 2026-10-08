// One-off template regeneration (optional-decoupling phase 1).
// Run: node scripts/regen-templates.mjs  (from servers/server-guidance, dist must be built)
import { writeFileSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildResponses,
  buildOperations,
  TEMPLATE_GN,
} from "../dist/setup/ConfigAssistant.js";

const base = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "examples",
  "default-guidance",
);
writeFileSync(join(base, "responses.json"), buildResponses("", TEMPLATE_GN));

// Merge semantics (do not clobber hand-maintained template additions):
// generator-produced ops are replaced wholesale; ops the generator does NOT
// emit (e.g. docs-drift, final-review-gate, index-freshness) are carried
// over from the existing template verbatim.
const fresh = JSON.parse(
  buildOperations(
    "npm",
    "standard",
    TEMPLATE_GN,
    true,
    "${project.name}",
    "stdio",
  ),
);
const prev = JSON.parse(
  readFileSync(join(base, "operations.json"), "utf8"),
);
const carried = Object.fromEntries(
  Object.entries(prev.operations ?? {}).filter(
    ([id]) => !(id in fresh.operations),
  ),
);
const merged = {
  version: 2,
  operations: { ...carried, ...fresh.operations },
};
// preserve the original key order of the previous template where possible
const order = Object.keys(prev.operations ?? {});
const ordered = {};
for (const k of order) if (k in merged.operations) ordered[k] = merged.operations[k];
for (const k of Object.keys(merged.operations))
  if (!(k in ordered)) ordered[k] = merged.operations[k];
writeFileSync(
  join(base, "operations.json"),
  JSON.stringify({ version: 2, operations: ordered }, null, 2) + "\n",
);
console.log(
  "templates regenerated (carried non-generator ops: " +
    Object.keys(carried).join(", ") +
    ")",
);
