const fs = require('fs');
const base = '/workspace/servers/server-guidance/';

let sc = fs.readFileSync(base + 'src/scaffold.ts', 'utf8');
const must = (b, a, t) => { if (!sc.includes(b)) { console.error('MISS: ' + t); process.exit(1); } sc = sc.replace(b, a); };

must(`export function scaffoldIfMissing(configDir: string): ScaffoldResult {`,
`export function scaffoldIfMissing(configDir: string, workspaceRoot?: string): ScaffoldResult {`, 'sig');

must(`      {
        version: 2,
        profile: "plain",
        project: { name: project },`,
`      {
        version: 2,
        profile: "plain",
        project: { name: project },
        // specs/008 FR-801/FR-806: the initial configuration carries the
        // workspace path explicitly, so the registry is visible (and
        // editable — additional repos join via workspaces[]) from day one.
        workspaces: [
          { name: "default", root: resolve(workspaceRoot ?? join(configDir, "..")) },
        ],`, 'workspaces');

if (!/import \{[^}]*resolve[^}]*\} from "node:path";/.test(sc)) {
  sc = sc.replace('import { join } from "node:path";', 'import { join, resolve } from "node:path";');
}
fs.writeFileSync(base + 'src/scaffold.ts', sc);

let mn = fs.readFileSync(base + 'src/main.ts', 'utf8');
must(`export function ensureConfiguration(configDir: string): {`,
`export function ensureConfiguration(
  configDir: string,
  workspaceRoot?: string,
): {`, 'ensure-sig');
must(`  const result = scaffoldIfMissing(configDir);`,
`  const result = scaffoldIfMissing(configDir, workspaceRoot);`, 'ensure-call');
must(`  if (!options?.skipScaffold) ensureConfiguration(configDir);`,
`  if (!options?.skipScaffold) ensureConfiguration(configDir, workspaceRoot);`, 'compose-call');
fs.writeFileSync(base + 'src/main.ts', mn);
console.log('scaffold wired (develop)');
