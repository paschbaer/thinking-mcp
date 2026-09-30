/**
 * specs/014 FR-1103/FR-1106: config-truth boot diagnostics.
 *
 * Pure helpers (output injected) so they are unit-testable without spawning
 * a server. Wired into composeApplication at boot.
 */
import { existsSync, readdirSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
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
 * specs/014 follow-up DB-1 (slim variant): per registered workspace with a
 * package.json, warn when dependencies are missing (no node_modules) or
 * INCOMPATIBLE (native addon present but unloadable — Windows/ABI install).
 * Pure detection; the fix (npm ci in the repo) is the operator's/agent's call.
 */
export function warnNodeDeps(
  config: LoadedConfig,
  workspaceRoot: string,
  out: (msg: string) => void = (m) => process.stderr.write(m + "\n"),
  probe?: (addonPath: string) => boolean,
): void {
  const loadable =
    probe ??
    ((addon: string) => {
      const res = spawnSync(
        process.execPath,
        ["-e", `require(${JSON.stringify(addon)})`],
        { timeout: 10_000 },
      );
      return res.status === 0;
    });
  for (const w of config.workspaces.list()) {
    const pkg = join(w.root, "package.json");
    if (!existsSync(pkg)) continue; // not a Node repo (e.g. Rust)
    const nm = join(w.root, "node_modules");
    if (!existsSync(nm)) {
      out(
        `[guidance] warning: workspace "${w.name}" (${w.root}) has a package.json but no node_modules — run "npm install" in the repo (or ask the agent), otherwise build/test gates will fail.`,
      );
      continue;
    }
    // Native-compatibility probe: load ONE bundled .node addon. Unloadable
    // (Windows/other-ABI install) means the container cannot run this tree.
    let addon: string | undefined;
    try {
      const res = spawnSync(
        "find",
        [nm, "-name", "*.node", "-type", "f", "-print", "-quit"],
        { timeout: 30_000 },
      );
      addon = res.stdout?.toString().split("\n")[0]?.trim() || undefined;
    } catch {
      addon = undefined;
    }
    if (addon && !loadable(addon)) {
      out(
        `[guidance] warning: workspace "${w.name}" (${w.root}) has a node_modules with a native addon that does NOT load in this container (platform/ABI mismatch — likely installed on a different OS). Fix: delete node_modules and run "npm ci" INSIDE the container (or ask the agent), otherwise build/test gates will fail.`,
      );
    }
  }
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
