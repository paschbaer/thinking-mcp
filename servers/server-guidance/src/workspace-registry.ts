/**
 * Workspace-Registry (specs/008 FR-801/FR-806): fail-closed set of workspaces
 * served by this guidance instance. Membership is decided ONLY on
 * realpath-resolved roots (FR-802) — symlinks and alias paths collapse onto
 * the same entry, Windows case differences are normalized by realpath.
 *
 * A missing workspaces[] block yields exactly one entry ("default" →
 * workspaceRoot) so single-workspace setups keep their behavior (AC-3).
 */
import { existsSync, realpathSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { ConfigurationError } from "./config.js";
import { GuidanceError } from "./types/errors.js";

export interface WorkspaceEntry {
  name: string;
  /** Realpath-resolved absolute root (canonical membership key). */
  root: string;
  projectName: string;
}

export interface RawWorkspaceEntry {
  name: string;
  root: string;
  projectName?: string;
}

const NAME_PATTERN = /^[a-z][a-z0-9-]{0,63}$/;

export class WorkspaceRegistry {
  private constructor(
    private readonly byName: Map<string, WorkspaceEntry>,
    private readonly byRoot: Map<string, WorkspaceEntry>,
  ) {}

  static build(
    entries: RawWorkspaceEntry[] | undefined,
    fallbackRoot: string,
  ): WorkspaceRegistry {
    const byName = new Map<string, WorkspaceEntry>();
    const byRoot = new Map<string, WorkspaceEntry>();
    const add = (raw: RawWorkspaceEntry): void => {
      if (!NAME_PATTERN.test(raw.name)) {
        throw new ConfigurationError(
          "configuration_invalid",
          `workspaces: invalid name ${JSON.stringify(raw.name)} (expected ^[a-z][a-z0-9-]{0,63}$)`,
        );
      }
      if (!isAbsolute(raw.root)) {
        throw new ConfigurationError(
          "configuration_invalid",
          `workspaces[${raw.name}]: root must be absolute: ${raw.root}`,
        );
      }
      const abs = resolve(raw.root);
      if (!existsSync(abs)) {
        throw new ConfigurationError(
          "configuration_invalid",
          `workspaces[${raw.name}]: root does not exist: ${abs}`,
        );
      }
      let real: string;
      try {
        real = realpathSync(abs);
      } catch (err) {
        throw new ConfigurationError(
          "configuration_invalid",
          `workspaces[${raw.name}]: root unresolvable: ${String(err)}`,
        );
      }
      if (byName.has(raw.name)) {
        throw new ConfigurationError(
          "configuration_invalid",
          `workspaces: duplicate name ${raw.name}`,
        );
      }
      const rootOwner = byRoot.get(real);
      if (rootOwner) {
        throw new ConfigurationError(
          "configuration_invalid",
          `workspaces: duplicate root (${raw.name} and ${rootOwner.name} both resolve to ${real})`,
        );
      }
      const entry: WorkspaceEntry = {
        name: raw.name,
        root: real,
        projectName: raw.projectName ?? raw.name,
      };
      byName.set(raw.name, entry);
      byRoot.set(real, entry);
    };
    if (entries && entries.length > 0) {
      for (const e of entries) add(e);
    } else {
      // Implicit default (AC-3): tolerates a not-yet-existing root — remote
      // sessions boot with sentinel roots (/remote-sessions/<id>) that are
      // materialized later. Explicit entries stay strictly validated.
      const abs = resolve(fallbackRoot);
      let real: string;
      try {
        real = realpathSync(abs);
      } catch {
        real = abs;
      }
      byName.set("default", { name: "default", root: real, projectName: "default" });
      byRoot.set(real, byName.get("default")!);
    }
    return new WorkspaceRegistry(byName, byRoot);
  }

  /**
   * FR-802: membership ONLY after realpathSync on both sides. Accepts a
   * registered name or an exact (realpath-equal) root — anything else is
   * rejected fail-closed (AC-2), including sub-paths of registered roots.
   */
  resolve(candidate: string): WorkspaceEntry {
    let real: string | null = null;
    try {
      real = realpathSync(resolve(candidate));
    } catch {
      real = null;
    }
    const hit =
      (real !== null ? this.byRoot.get(real) : undefined) ??
      this.byName.get(candidate);
    if (!hit) {
      throw new GuidanceError(
        "workspace_not_registered",
        `workspace not registered: ${JSON.stringify(candidate.slice(0, 64))}`,
        { recoverable: true },
      );
    }
    return hit;
  }

  /** Deterministic order (by name) — feeds configurationVersion (FR-801). */
  list(): WorkspaceEntry[] {
    return [...this.byName.values()].sort((a, b) => (a.name < b.name ? -1 : 1));
  }

  /** The implicit single-workspace entry (AC-3); first entry as fallback. */
  get default(): WorkspaceEntry {
    return this.byName.get("default") ?? this.list()[0]!;
  }
}
