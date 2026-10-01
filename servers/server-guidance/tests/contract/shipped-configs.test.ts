/**
 * WC-4 contract: the SHIPPED configuration files must stay consistent with
 * the validator (loadConfig). No fixture data — the real repo config
 * (.guidance/) and every example adopt-template (examples/*-guidance/) are
 * loaded directly, so validator×data drift (wildcard rules, egress
 * allowlist, containerRoute hosts, schema changes) fails the suite.
 *
 * Host-side substitution: workspaces[] entries reference container-only
 * roots (/workspace, /workspaces/...). WorkspaceRegistry strictly validates
 * explicit roots with existsSync, so the tmp copy drops ONLY the
 * workspaces[] key — the implicit default-workspace fallback explicitly
 * tolerates non-existing roots (workspace-registry.ts). Every other file
 * (workflow, responses, operations, downstream-servers, policies) loads
 * unmodified through the full loadConfig pipeline.
 */
import { describe, expect, it } from "vitest";
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { loadConfig } from "../../src/config.js";

const repoRoot = resolve(__dirname, "../../../..");

const CONFIG_SETS: { name: string; dir: string }[] = [
  { name: "repo .guidance", dir: join(repoRoot, ".guidance") },
  {
    name: "examples/default-guidance",
    dir: join(repoRoot, "servers/server-guidance/examples/default-guidance"),
  },
  {
    name: "examples/python-guidance",
    dir: join(repoRoot, "servers/server-guidance/examples/python-guidance"),
  },
  {
    name: "examples/csharp-guidance",
    dir: join(repoRoot, "servers/server-guidance/examples/csharp-guidance"),
  },
  {
    name: "examples/rust-guidance",
    dir: join(repoRoot, "servers/server-guidance/examples/rust-guidance"),
  },
];

interface ServerEntry {
  enabled?: boolean;
  transport?: { type?: string; http?: { url?: string } };
  containerRoute?: { url?: string };
}

/** Mirrors the validator's comparison exactly: raw URL.host (no scheme-default-port normalization — see config.ts applyHttpTransports). */
function urlHost(url: string): string {
  return new URL(url).host;
}

function makeTmpCopy(configDir: string): string {
  const tmp = mkdtempSync(join(tmpdir(), "shipped-config-contract-"));
  try {
    cpSync(configDir, tmp, { recursive: true });
    const guidancePath = join(tmp, "guidance.json");
    const guidance = JSON.parse(readFileSync(guidancePath, "utf8")) as Record<
      string,
      unknown
    >;
    // Deployment-specific block only — see file header for the rationale.
    delete guidance.workspaces;
    writeFileSync(guidancePath, JSON.stringify(guidance, null, 2));
    return tmp;
  } catch (err) {
    rmSync(tmp, { recursive: true, force: true });
    throw err;
  }
}

function loadShipped(configDir: string): ReturnType<typeof loadConfig> {
  const tmp = makeTmpCopy(configDir);
  try {
    return loadConfig(tmp);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

describe("WC-4: shipped config files load against the validator", () => {
  for (const set of CONFIG_SETS) {
    it(`${set.name}: full loadConfig pass (configuration_invalid-free)`, () => {
      const cfg = loadShipped(set.dir);
      expect(typeof cfg.configVersion).toBe("string");
      expect(cfg.project.name.length).toBeGreaterThan(0);
    });
  }

  it("egress consistency: every transport.http and containerRoute URL host is allowlisted (all servers, incl. disabled)", () => {
    for (const set of CONFIG_SETS) {
      const cfg = loadShipped(set.dir);
      const downstream = cfg.downstreamServers as
        { servers: Record<string, ServerEntry> } | undefined;
      const policies = cfg.policies as
        { egress?: { httpHostAllowlist?: string[] } } | undefined;
      if (!downstream || !policies) continue; // set without downstream egress
      const allowlist = policies.egress?.httpHostAllowlist ?? [];
      const allowlisted = (url: string): boolean =>
        allowlist.includes(urlHost(url));
      for (const [id, server] of Object.entries(downstream.servers)) {
        const httpUrl = server.transport?.http?.url;
        if (httpUrl !== undefined) {
          expect(
            allowlisted(httpUrl),
            `${set.name}: transport.http host of "${id}" (${httpUrl}) not in httpHostAllowlist`,
          ).toBe(true);
        }
        const crUrl = server.containerRoute?.url;
        if (crUrl !== undefined) {
          expect(
            allowlisted(crUrl),
            `${set.name}: containerRoute host of "${id}" (${crUrl}) not in httpHostAllowlist`,
          ).toBe(true);
        }
      }
    }
  });

  it("negative control: an unallowlisted containerRoute host fails the load (drift detection works)", () => {
    const tmp = makeTmpCopy(CONFIG_SETS[1]!.dir); // examples/default-guidance
    try {
      const dsPath = join(tmp, "downstream-servers.json");
      const ds = JSON.parse(readFileSync(dsPath, "utf8")) as {
        servers: Record<string, ServerEntry>;
      };
      const first = Object.values(ds.servers)[0]!;
      first.enabled = true;
      first.containerRoute = { url: "http://evil.example.com:9999/mcp" };
      writeFileSync(dsPath, JSON.stringify(ds, null, 2));
      expect(() => loadConfig(tmp)).toThrowError(/not allowlisted/);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
