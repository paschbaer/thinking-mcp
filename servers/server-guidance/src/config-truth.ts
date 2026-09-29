/**
 * specs/014 FR-1103/FR-1106: config-truth boot diagnostics.
 *
 * Pure helpers (output injected) so they are unit-testable without spawning
 * a server. Wired into composeApplication at boot.
 */
import { existsSync, readdirSync, realpathSync } from "node:fs";
import { join } from "node:path";
import type { LoadedConfig } from "./config.js";

const PROCESS_FILES = [
  "workflow.json",
  "operations.json",
  "responses.json",
  "policies.json",
  "downstream-servers.json",
];

/**
 * FR-1103 (legacy monolith): a full process config at the INSTANCE root that
 * additionally registers other workspaces — served as today, but the operator
 * must know that the default workspace is served by the monolith config while
 * the registered repos carry their own.
 */
export function warnLegacyMonolith(
  config: LoadedConfig,
  out: (msg: string) => void = (m) => process.stderr.write(m + "\n"),
): void {
  if (config.registryOnly) return;
  const extra = config.workspaces
    .list()
    .filter((w) => w.root !== config.workspaces.default.root);
  if (extra.length === 0) return; // plain single-repo config — normal
  const files = PROCESS_FILES.filter((f) =>
    existsSync(join(config.configDir, f)),
  );
  if (files.length === 0) return;
  out(
    `[guidance] warning: legacy monolith config detected — process files at the instance config dir (${config.configDir}: ${files.join(", ")}) serve the default workspace while ${extra.length} additional workspace(s) are registered (${extra.map((w) => w.name).join(", ")}). Migrate to a registry-only instance config + repo-level configs, see specs/014-config-truth-composition.`,
  );
}

/**
 * FR-1106 (dormancy hint): in registry-only deployments, repos under the
 * workspace root that carry their own .guidance/guidance.json but are NOT
 * registered in workspaces[] cannot start sessions — surface them once at
 * boot instead of failing obscurely later. Log-only (no fail).
 */
export function warnDormantGuidanceConfigs(
  config: LoadedConfig,
  workspaceRoot: string,
  out: (msg: string) => void = (m) => process.stderr.write(m + "\n"),
): void {
  if (!config.registryOnly) return;
  let entries: string[];
  try {
    entries = readdirSync(workspaceRoot, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
  } catch {
    return; // unreadable root: nothing to scan
  }
  const registered = new Set(
    config.workspaces.list().map((w) => {
      try {
        return realpathSync(w.root);
      } catch {
        return w.root;
      }
    }),
  );
  for (const name of entries) {
    const dir = join(workspaceRoot, name);
    if (!existsSync(join(dir, ".guidance", "guidance.json"))) continue;
    let real = dir;
    try {
      real = realpathSync(dir);
    } catch {
      // keep lexical dir for the comparison
    }
    if (registered.has(real)) continue;
    out(
      `[guidance] warning: dormant .guidance at ${dir} (not registered in workspaces[]) — sessions cannot start for it. Register it in ${config.configDir}/guidance.json (or via the config assistant, target registry-edit) or remove the directory.`,
    );
  }
}
