const fs = require('fs');
const base = '/workspace/servers/server-guidance/';
let ca = fs.readFileSync(base + 'src/setup/ConfigAssistant.ts', 'utf8');
const must = (s, b, a, t) => { if (!s.includes(b)) { console.error('MISS: ' + t); process.exit(1); } return s.replace(b, a); };

ca = must(ca, `const QUESTIONS: SetupQuestion[] = [
  {
    id: "projectName",`,
`const QUESTIONS: SetupQuestion[] = [
  {
    id: "configSource",
    question: "Adopt the proven reference configuration or create a fresh one?",
    help: "adopt = workflow/policies/schemas are taken from the reference config (profile locked to the reference); generic operations are regenerated from your answers below. fresh = everything is generated from your answers only.",
    options: ["fresh", "adopt"],
    required: true,
    default: "fresh",
  },
  {
    id: "projectName",`, 'q-configsource');

ca = must(ca, `  {
    id: "profile",`,
`  {
    id: "referencePath",
    question: "Adopt: path to the reference .guidance/ directory (container path, e.g. /workspace/.guidance)?",
    help: "Required when configSource=adopt. Validated fail-closed (all files present + parseable). Adopt locks profile/insight/gitnexus/gates to the reference.",
    required: false,
  },
  {
    id: "profile",`, 'q-refpath');

fs.writeFileSync(base + 'src/setup/ConfigAssistant.ts', ca);
console.log('questions added');
