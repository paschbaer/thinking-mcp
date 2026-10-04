#!/usr/bin/env node
// Vendoring sync for the shared spec-016 workflow modules (S016-ADOPT).
//
// servers/shared-workflow/src is the CANONICAL source of truth. The HTTP MCP
// servers in this repo consume it as VENDORED COPIES (not package deps) so
// their Docker builds (npm ci in an isolated server-dir context) and MCPB
// bundles stay self-contained. This script copies the canonical files into
// every target server's src/workflow/ directory.
//
// Drift guard: each server carries a hash-consistency test comparing its
// vendored file against the canonical file — direct edits to a vendored copy
// fail that test and point here.
//
// Usage: node scripts/sync-shared-workflow.mjs   (from servers/shared-workflow)

import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const pkgRoot = resolve(here, "..");
const repoRoot = resolve(pkgRoot, "..", "..");

const canonical = ["src/transition-protocol.ts", "src/operation-registry.ts"];

const targets = [
  "servers/server-guidance/src/workflow",
  "servers/server-insight/src/workflow",
  "servers/server-clear-thought/src/workflow",
];

const sha256 = (p) =>
  createHash("sha256").update(readFileSync(p)).digest("hex");

let changed = 0;
for (const target of targets) {
  const dir = join(repoRoot, target);
  mkdirSync(dir, { recursive: true });
  for (const rel of canonical) {
    const src = join(pkgRoot, rel);
    const dst = join(dir, rel.split("/").pop());
    const before = (() => {
      try {
        return sha256(dst);
      } catch {
        return "(missing)";
      }
    })();
    copyFileSync(src, dst);
    if (before !== sha256(dst)) changed++;
    console.log(
      `${target}/${rel.split("/").pop()}: ${sha256(dst).slice(0, 12)}`,
    );
  }
}
console.log(
  changed > 0 ? `synced (${changed} file(s) changed)` : "already in sync",
);
