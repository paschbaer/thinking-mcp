const fs = require('fs');
const base = '/workspace/';

// plan.md: Kopierlisten + Typo
let pl = fs.readFileSync(base + 'specs/009-config-assistant-extensions/plan.md', 'utf8');
pl = pl.replace(`            kopiere   workflow.json, policies.json, schemas/`,
`            kopiere   workflow.json, schemas/`);
pl = pl.replace(`  müsste der Assistent den Pfad...`, `  müsste der Assistent den Pfad…`);
pl = pl.replace(/und宵/g, 'und');
fs.writeFileSync(base + 'specs/009-config-assistant-extensions/plan.md', pl);

// tasks.md: T7
let t = fs.readFileSync(base + 'specs/009-config-assistant-extensions/tasks.md', 'utf8');
t = t.replace(`- [ ] T7 Adopt-Generator: Kopie workflow/policies/schemas; Regeneration
  responses (ohne Referenz-Shell-Satz, F-4) + operations (buildOperations,
  F-1); guidance.json mit \`adoption\`-Block (FR-906, AC-4)`,
`- [ ] T7 Adopt-Generator: Kopie workflow/schemas; Regeneration policies
  (buildPolicies, FR-910), responses (ohne Referenz-Shell-Satz, F-4) +
  operations (buildOperations, F-1); guidance.json mit \`adoption\`-Block
  (FR-906, AC-4)`);
fs.writeFileSync(base + 'specs/009-config-assistant-extensions/tasks.md', t);

// spec.md: FR-909-Dangling-Verweis + FR-902 Satzbruch + realpath-Regel (N-D2)
let sp = fs.readFileSync(base + 'specs/009-config-assistant-extensions/spec.md', 'utf8');
sp = sp.replace(`(FR-909, via \`buildDownstream\``,
`(via \`buildDownstream\`, N-1)`);
// FR-902 Satzbruch glätten (R-5-Einschub)
sp = sp.replace(\`  (lesbar + \\`profile\\`-Feld auswertbar, FR-908) — fehlt oder invalide ⇒ fail-closed
  Pfad-Sicherheit (R-5): der Referenz-Pfad muss außerhalb des Ziel-\\`.guidance/\\`
  liegen (Selbst-Überschreibungs-Loop); die rekursive Kopie von \\`schemas/\\`
  folgt keinen Symlinks, die den Referenz-Root verlassen (Pfad-Escape-Vektor)\`,
\`  (lesbar + \\`profile\\`-Feld auswertbar, FR-908) — fehlt oder invalide ⇒
  fail-closed. Pfad-Sicherheit (R-5): der Referenz-Pfad muss außerhalb des
  Ziel-\\`.guidance/\\` liegen (Selbst-Überschreibungs-Loop); die Prüfung erfolgt
  über aufgelöste (realpath-) Pfade; die rekursive Kopie von \\`schemas/\\`
  folgt keinen Symlinks, die den Referenz-Root verlassen (Pfad-Escape-Vektor)\`);
fs.writeFileSync(base + 'specs/009-config-assistant-extensions/spec.md', sp);
console.log('N-D1..N-D4 fixed');
