/**
 * `guidance init` — manuelles Scaffolding einer minimalen Standardkonfiguration
 * ohne Serverstart (Option D). Idempotent: existierende Dateien bleiben unberührt.
 * Nutzung: node dist/init.js [targetDir]   (default: ./.guidance)
 */
import { join, resolve } from "node:path";
import { scaffoldIfMissing } from "./scaffold.js";

const target = resolve(process.argv[2] ?? join(process.cwd(), ".guidance"));
const result = scaffoldIfMissing(target);
if (!result.scaffolded) {
  process.stderr.write(`[guidance-init] guidance.json already exists in ${target} — nothing created.\n`);
} else {
  process.stderr.write(`[guidance-init] created in ${target}:\n`);
  for (const f of result.createdFiles) process.stderr.write(`[guidance-init]   + ${f}\n`);
  process.stderr.write(`[guidance-init] default 7-phase workflow. Customize .guidance/ to your process.\n`);
}
