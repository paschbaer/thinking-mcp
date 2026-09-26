# Spec Amendment: Workflow-Chaining (`chain`) — v1.1

> Status: **APPROVED** (open questions Q1–Q3 decided, see §9; v1.1: Q-B
> revidiert durch Nutzer — Mixed-Manifeste erlaubt, s. §12)
> Base: `specs/002-guidance-workflow-server/spec.md` (v1 + v2 + v2.1)
>       + `amendments/001-remote-mode.md`
> Date: 2026-09-25
> Decisions locked by user: (Q1) unresolved Template-Variablen → **hart
> ablehnen** auf Successor-Creation-Ebene · (Q2) Kettenmanifest am **Kopf
> erzeugen und auf den Nachfolger kopieren** (Restkette wandert mit) ·
> (Q3, revidiert 2026-09-25) `spec-kit` lehnt `chain` **nicht** ab —
> stattdessen Tasklisten aus `speckit.tasks` als Chain-Quelle (§11:
> `chain.source: "spec_kit_tasks"`, FR-117/FR-118)
> FR-Nummern: FR-110 … FR-118 (Fortsetzung des Nummernkreises aus Amendment 001)

## 1. Motivation

`guidance` orchestriert Phasen eines **einzelnen** Workflows autark
(Transitions bei `submission_valid` / `required_operations_succeeded`,
`WorkflowEngine.selectTransition`). Ketten **mehrerer** Workflows ohne
Nutzerinput sind heute nicht möglich: `complete_workflow` endet terminal
(`completed`), es gibt keine Queue, keinen Nachfolger-Zeiger und keinen
Auto-Start. Der Client müsste Chain-Logik selbst implementieren — inklusive
Kontextübergabe (z. B. „fixe die im Verification-Run gefundenen Fehler"),
die Kenntnis des Vorgänger-Abschlussberichts erfordert.

Dieses Amendment führt **Layer 1** ein: eine explizite, client-deklarierte
Chain (`chain`-Manifest bei `start_workflow`), die bei Completion **lazy** den
nächsten Nachfolger erzeugt und `nextSessionId` in der Completion-Response
liefert. Die Client-Loop reduziert sich auf: `complete_workflow` →
`get_current_guidance(nextSessionId)` → Submit-Sequenz.

**Layer 2 (deklarative `successors` in `workflow.json` als Runbook mit
Guard-Conditions) ist explizit OUT OF SCOPE** dieses Amendments und wird bei
Bedarf in einem Folgenden Amendment spezifiziert.

Grundsatz (unverändert): Der Treiber bleibt der Agent/Client. Der Server
erzeugt Session-Zustand und verlässt sich nicht auf Ereignisse außerhalb des
Request/Response-Modells.

## 2. Data Model — `WorkflowSession` Erweiterung

Neue **optionale** Felder in `WorkflowSession` (`src/types/index.ts`).
Abwärtskompatibel: bestehende Sessions ohne diese Felder bleiben ladbar
(`chainFrom: undefined` ≠ `null`-Semantik erforderlich — Felder einfach
weglassen, nicht auf `null` normalisieren).

```ts
chainFrom?: string | null;   // sessionId des Vorgängers (Provenance)
chainIndex?: number;         // Position in der Kette, 0-basiert
                             // (0 = Kettenkopf, 1 = erster Nachfolger, …)
chainSpec?: {                // NUR am Kettenkopf gesetzt
  steps: { request: string; workflowId?: string }[]; // Form A
  source?: "spec_kit_tasks";                         // Form B (§11)
  requestTemplate?: string;                          // Form B
  featureId?: string;                                // Form B
  taskFilter?: { statuses?: string[] };              // Form B
  chainedTaskIds?: string[];                         // Form B: bereits
};                                  // verketttete Tasks (fortschreibungspflichtig)
chainTaskScope?: {           // nur am Nachfolger (Form B, FR-118)
  taskId: string; featureId: string;
};
chainUpNext?: number;        // Index des nächsten auszuführenden Schritts
                             // (relativ in chainSpec.steps)
```

**Q2-Entscheidung (Kopf-Kopie):** `chainSpec` + `chainUpNext` werden bei
Successor-Creation **in die Nachfolger-Session kopiert** (nicht referenziert).
Damit läuft jede Kette autark: Jede Session entscheidet nur über ihren
*einen* nächsten Schritt, und Ketten überleben `pruneFinishedSessions` des
Kopfs. Kosten: Redundanz im State-Verzeichnis — bewusst akzeptiert.

## 3. Tool-Contract-Änderungen

### 3.1 `start_workflow` (`src/mcp-server/register-tools.ts`)

Neues optionales Feld `chain`:

```ts
chain: z.union([
  z.object({                     // Form A: explizite Steps (plain + spec-kit)
    steps: z.array(z.object({
      request: z.string().min(1),        // Literal ODER Template (§5)
      workflowId: z.string().optional(), // Default: workflowId des Vorgängers
    })).min(1).max(16),
  }),
  z.object({                     // Form B: task-abgeleitet (nur spec-kit, §11)
    source: z.literal("spec_kit_tasks"),
    requestTemplate: z.string().min(1),
    featureId: z.string().optional(),
    taskFilter: z.object({
      statuses: z.array(z.string()).optional(), // Default: ["pending"]
    }).optional(),
  }),
]).optional()
```

- Obere Grenze 16 Steps pro Manifest (`maxStepsPerManifest`, §7); Verstoß →
  `configuration_invalid` (recoverable). Form B zählt nicht gegen dieses
  Limit (Steps entstehen lazy, das Depth-Limit FR-111 greift stattdessen).
- **Q3 (revidiert):** `chain` ist in beiden Profilen erlaubt. Das
  `spec-kit`-Profil erhält zusätzlich eine task-abgeleitete Chain-Quelle
  (`chain.source: "spec_kit_tasks"`, §11): die von `speckit.tasks`
  erzeugte, abhängigkeitsgeordnete Taskliste wird pro Completion in den
  nächsten Chain-Schritt übersetzt — ein voller Workflow (mit Phase- und
  Verify-Gates) pro Task.

### 3.2 `complete_workflow` — erweiterte Response

Nur wenn der Vorgänger mit `chain` gestartet wurde, enthält die Erfolgs-Response
zwei zusätzliche Felder:

```jsonc
{
  "accepted": true,
  "status": "completed",
  "currentPhase": "completed",
  "nextSessionId": "session-<uuid>",   // Session des nächsten Schritts
  "chain": [                            // immer genau 1 Eintrag (der erzeugte Schritt)
    { "sessionId": "session-<uuid>", "request": "<resolved>", "status": "active" | "blocked" }
  ]
}
```

- Kettenende (`chainUpNext` erschöpft oder kein `chainSpec`): Response
  **ohne** `nextSessionId`/`chain` — das ist das Signal an die Client-Loop,
  die Kette zu beenden.
- `start_workflow` selbst gibt die Felder nicht zurück (der Kopf hat keinen
  Nachfolger bei Start; Successors entstehen ausschließlich lazy bei
  Completion).

## 4. Engine-Flow (`src/workflow/WorkflowEngine.ts`)

### 4.1 `startWorkflow` (aktuell L285–369)

Persistiert `chainSpec = { steps: input.chain.steps }`, `chainUpNext = 0`,
`chainIndex = 0`, `chainFrom = null` am Kopf. Sonst unverändert.

### 4.2 `completeWorkflowLocked` (aktuell L598–671) — Kern-Erweiterung

Nach dem Erfolgs-Update des Vorgängers (L663–668), **innerhalb** des
`withLock` des Vorgängers:

1. `chainSpec`/`chainUpNext` lesen. Erschöpft oder fehlend → normales Ende
   (Schritt 5 entfällt).
2. Schritt bestimmen — Form A: `step = chainSpec.steps[chainUpNext]`;
   Form B (`source: "spec_kit_tasks"`): nächsten Kandidaten gemäß FR-117
   aus dem Spec-Kit-State ermitteln. Danach Request-Template auflösen (§5).
   **Q1-Entscheidung:** Unresolved Template-Variable → `GuidanceError`
   (`chain_template_unresolved`, **recoverable**) und die Completion schlägt
   **nicht** fehl, sondern der Vorgänger bleibt `completed` und die Response
   trägt `chain: [{ status: "failed", error: "chain_template_unresolved", … }]`
   ohne `nextSessionId`. Rationale: Eine harte Ablehnung der *Completion*
   würde einen sauberen Workflow in einen Wiederholungs-Zustand zwingen, nur
   weil der *Nachfolger*-Request kaputt ist. Die Kette endet deterministisch
   mit einem diagnosbaren Fehlerereignis. (Präzisierung zu Q1: „hart ablehnen"
   gilt für die **Successor-Creation** — der Successor wird bei unresolved
   Variablen nicht erzeugt, auch nicht in invalidem Zustand.)
3. Successor-Session **innerhalb des Locks** anlegen:
   `status: "active"`, `chainFrom = <predecessor>`, `chainIndex = chainUpNext + 1`,
   `chainSpec` + `chainUpNext = chainUpNext + 1` **kopiert**, Request = aufgelöst,
   `workflowId = step.workflowId ?? predecessor.workflowId`.
   Unkritisch bezüglich Locks: `SessionRepository.withLock` ist per-Session,
   die Successor-Session ist neu ⇒ keine Lock-Inversion, kein Deadlock.
4. **Außerhalb des Locks:** Lifecycle des Successors ausführen
   (`beforeEnter`/`afterEnter` der Initial-Phase). Refactoring: Der
   Lifecycle-Block aus `startWorkflow` (L309–359 inkl. FR-040-Blocking) wird
   in `private async activateSession(session)` extrahiert; `startWorkflow`
   delegiert daran, der Successor-Pfad ruft dieselbe Methode. Required-Failure
   → Successor geht `blocked` (bestehendes FR-040-Muster). **Der Vorgänger
   bleibt `completed` — kein Rollback.**
5. Audit-Events:
   - `chain_successor_created` — data: `{ from, to, chainIndex }`
   - bei Lifecycle-Failure zusätzlich bestehendes `hook_failed`
   - bei Template-Fehlschlag: `chain_failed` — data:
     `{ chainIndex, reason: "chain_template_unresolved", error }`
   - bei Depth-Limit-Verstoß: `chain_failed` — data:
     `{ chainIndex, reason: "chain_depth_exceeded" }`

### 4.3 Kettenfortschritt über mehrere Ebenen

Der Successor trägt die Restkette (kopiertes `chainSpec` + inkrementiertes
`chainUpNext`). Bei *seiner* Completion erzeugt `completeWorkflowLocked`
denselben Codepfad für den übernächsten Schritt — **keine Rekursion im
Server**, der Client folgt nur `nextSessionId` von Completion zu Completion.

## 5. Template-Auflösung (`template-resolver.ts`)

Auflösung **zur Completion-Zeit** (erst dann existiert der Abschlussbericht).
Neue Kontextvariablen:

| Variable | Quelle |
|---|---|
| `${chain.parentRequest}` | `session.request` des Vorgängers |
| `${chain.completionSummary}` | `report.summary` aus `complete_workflow` |
| `${chain.changedFiles}` | `changedFiles` aus dem `implement`-Submission des Vorgängers (komma-separiert) |
| `${chain.taskId}` / `${chain.taskTitle}` / `${chain.featureId}` | nur Form B: Felder des abgeleiteten Task-Kandidaten (FR-117) |
| `${project.name}`, `${session.request}` | wie bisher |

Unbekannte Variable ⇒ `chain_template_unresolved` (siehe §4.2 Schritt 2).
Beispiel-Manifest:

```jsonc
{ "chain": { "steps": [
  { "request": "Fix the failing tests reported by the verification run for: ${chain.parentRequest}. Completion summary: ${chain.completionSummary}" },
  { "request": "Run a full regression review after the fix covering: ${chain.changedFiles}" }
]}}
```

## 6. Client-Loop (Ergebnis)

```
start_workflow({ request: "A", chain: { steps: [...] } })
→ Submit-Sequenz (get_current_guidance → submit_* …)
→ complete_workflow(...)            → Response enthält nextSessionId
→ get_current_guidance(nextSessionId)
→ Submit-Sequenz …
→ … bis eine complete_workflow-Response OHNE nextSessionId kommt
```

Nutzerinput ist nur nötig, wenn der Agent selbst `report_blocker
(requiresUserDecision: true)` ruft oder ein Successor per FR-040 in
`blocked` startet — die Kette endet dann deterministisch an dieser Stelle
(kein Auto-Resume).

## 7. Konfiguration & Guardrails (`src/config.ts`)

```jsonc
"chain": { "enabled": true, "maxChainDepth": 8, "maxStepsPerManifest": 16 }
```

- **FR-110 (Feature Gate):** `chain.enabled: false` (Default) ⇒ `start_workflow`
  mit `chain` → `configuration_invalid` (fail-closed, konsistent mit
  `assertWorkspaceInside` / Spec-Kit-Gating R17).
- **FR-111 (Depth Limit):** `completeWorkflowLocked` verweigert die
  Successor-Creation, wenn `chainIndex >= maxChainDepth` → Response mit
  `chain: [{ status: "failed", error: "chain_depth_exceeded" }]` ohne
  `nextSessionId`; Audit `chain_failed`. Verhindert Runaway-Ketten.
- **FR-112 (Profil-Zugang, revidiert):** `chain` ist in `plain` UND
  `spec-kit` erlaubt. Im `spec-kit`-Profil gilt zusätzlich:
  Form A (explizite Steps) unverändert nutzbar (workflow-übergreifende
  Ketten, z. B. über Features hinweg); Form B (`source: "spec_kit_tasks"`)
  ausschließlich dort (§11). Im `plain`-Profil ist Form B abzulehnen
  (`configuration_invalid`, recoverable).
- **FR-117 (Task-Derived Chain, Form B):** Ist `chain.source ===
  "spec_kit_tasks"`, ermittelt `completeWorkflowLocked` den nächsten Schritt
  zur Completion-Zeit aus dem importierten Spec-Kit-State der Session
  (brücke: optionaler `specKitTasks(sessionId)`-Deps-Callback, der pending
  Tasks in tasks.md-Reihenfolge liefert — dieselbe Ordnung, aus der
  `readyTasks` arbeitet): erster Task, dessen Status im `taskFilter.statuses`
  (Default `["pending"]`) liegt und nicht in `chainedTaskIds` steht.
  Request = `requestTemplate` mit `chain.taskId`/`chain.taskTitle`/
  `chain.featureId` aufgelöst (§5-Erweiterung). Resolviert kein Kandidat →
  Kette endet regulär (Response OHNE `nextSessionId` — task-abgeleitete
  Ketten enden stumm, nicht mit Fehler). Nach erfolgreicher Creation wird
  die Task-ID an `chainedTaskIds` angehängt und mit der Restkette kopiert
  (FR-114). Der Successor wird im `spec-kit`-Profil angelegt und MUSS die
  Artefakte selbst importieren (`import_spec_kit_artifacts` — Teil der
  Understand-Instruktion via FR-118).
- **FR-118 (Task-Scope im Successor):** Form-B-Successors tragen
  `chainTaskScope: { taskId, featureId }`. `guidanceFor()` hängt in ALLEN
  Phasen-Instruktionen einen Scope-Anhang an: „This workflow is chained for
  spec-kit task <taskId> of feature <featureId> ONLY. Import the artifacts
  first (import_spec_kit_artifacts), then start/submit/complete exactly this
  task; do not touch other tasks." Untercheidung zum Batch-Betrieb: pro
  Chain-Schritt läuft ein voller Workflow (understand→…→complete mit
  Verify-Gates) für genau einen Task — geeignet für große Tasks, die je
  eine eigene Verifikation verdienen; kleine Tasks bleiben im normalen
  Batch-Betrieb EINES Workflows (Entscheidungsregel für die Nutzung).
- **FR-113 (Lazy Creation):** Successor-Sessions entstehen ausschließlich in
  `completeWorkflowLocked` des Vorgängers. Es gibt kein Vorab-Anlegen, kein
  Queue-Objekt und keinen Event-basierten Auto-Start.
- **FR-114 (Kopie statt Referenz):** `chainSpec`/`chainUpNext` werden an den
  Nachfolger kopiert (Q2); Ketten überleben `pruneFinishedSessions` des Kopfs.
- **FR-115 (No Rollback):** Der Vorgänger bleibt bei jedem Successor-Fehler
  (Template, Depth, Lifecycle) `completed`. Fehlgeschlagene Kettenschritte
  sind an `chain`-Status + Audit diagnoseierbar, niemals an einem
  zurückgerollten Vorgänger.
- **FR-116 (Halt bei Blockade):** Startet ein Successor `blocked` (FR-040) oder
  wird in der Kette `report_blocker(requiresUserDecision: true)` gerufen,
  endet die Kette an dieser Stelle. Kein Auto-Resume, kein Auto-Skip.

## 8. Betroffene Stellen (Implementierungsübersicht)

| Datei | Änderung |
|---|---|
| `src/mcp-server/register-tools.ts` | `chain`-Schema bei `start_workflow` (§3.1) |
| `src/workflow/WorkflowEngine.ts` | `chainSpec` in `startWorkflow` (L285); Lifecycle-Refactor → `activateSession()`; Successor-Creation in `completeWorkflowLocked` (L656–670); Depth-Gate |
| `src/types/index.ts` | `WorkflowSession`: 4 neue optionale Felder (L107–128) |
| `src/config.ts` | `chain`-Konfiguration + Defaults (§7) |
| `src/orchestration/template-resolver.ts` | `chain.*`-Kontextvariablen inkl. `chain.task*` (§5) |
| `src/workflow/WorkflowEngine.ts` (Deps) | optionaler `specKitTasks(sessionId)`-Callback (Spec-Kit-State-Brücke, FR-117); Injektion über `EngineDeps` |
| `src/workflow/WorkflowEngine.ts` (`guidanceFor`) | `chainTaskScope`-Instruktionsanhang (FR-118) |
| `src/state/SessionRepository.ts` | keine Schema-Änderung; `pruneFinishedSessions` nur insoweit prüfen, als Kopien (FR-114) keine Kopfkante benötigen |
| `tests/` | s. §10 |
| Docs | README-Sektion „Workflow-Chaining" + Client-Loop-Hinweis in AGENTS.md/CLAUDE.md |

## 9. Entscheidungen (locked)

| # | Frage | Entscheidung |
|---|---|---|
| Q1 | Unresolved Template-Variable | Hart ablehnen auf Successor-Creation-Ebene: kein Successor wird erzeugt; Vorgänger bleibt `completed`; Response meldet `chain_failed`/`chain_template_unresolved` (Präzisierung in §4.2) |
| Q2 | Manifest-Ort | Am Kettenkopf erzeugt, auf jeden Nachfolger **kopiert** (Restkette wandert mit; robust gegen Pruning) |
| Q3 (revidiert) | Profil-Scope | `chain` in beiden Profilen erlaubt; `spec-kit` erhält zusätzlich Form B (`source: "spec_kit_tasks"`, §11) — Taskliste aus `speckit.tasks` als Chain-Quelle, ein voller Workflow pro Task (FR-117/FR-118) |
| Q-B (revidiert in v1.1) | Mixed-Manifest | `steps` und `source` sind KOMBINIERBAR (§12): explizite Steps laufen zuerst, danach die task-abgeleitete Kette; mindestens eines von beiden erforderlich |

## 10. Testplan (Must-Pass vor Merge)

1. **Happy Path (3 Schritte):** Kopf mit 2-Step-Chain; beide Completions
   liefern `nextSessionId`; dritte Completion liefert KEINES; Requests
   korrekt aus Templates aufgelöst; Audit-Kette
   `chain_successor_created` × 2.
2. **Unresolved Variable:** Step-Request mit `${chain.unknown}` → keine
   Successor-Session erzeugt, Vorgänger `completed`, Response `chain_failed`
   mit `chain_template_unresolved`, Audit-Eintrag vorhanden.
3. **Blocked Successor (FR-040-Pfad):** required `beforeEnter`-Op schlägt
   fehl → Successor `blocked`, Vorgänger `completed`, `get_workflow_state`
   des Successors zeigt Blocker.
4. **Depth Limit:** `maxChainDepth: 2`, Kette mit 3 Schritten → dritte
   Creation verweigert, `chain_depth_exceeded`.
5. **Plain-Profil + Form B (FR-112):** `chain.source` im plain-Profil →
   `configuration_invalid`.
6. **Feature Gate (FR-110):** `chain.enabled: false` → `configuration_invalid`.
7. **Form B Happy Path (spec-kit):** Kopf mit `source: "spec_kit_tasks"`,
   3 pending Tasks → 3 aufeinanderfolgende Completions mit jeweils
   `nextSessionId`, Requests korrekt aus `requestTemplate` aufgelöst;
   4. Completion endet stumm (kein `nextSessionId`); `chainedTaskIds`
   wächst korrekt mit; jeder Successor führt `chainTaskScope` und bekommt
   den Scope-Anhang in der Guidance.
8. **Form B exhausted (FR-117):** keine pending Tasks → stummes Kettenende
   (kein `chain_failed`).
9. **Backward Compatibility:** Session-JSON ohne Chain-Felder lädt und
   komplettiert unverändert (keine `nextSessionId` in der Response).
10. **Pruning-Robustheit (FR-114):** Kopf wird geprunet, Nachfolger
   komplettiert trotzdem und erzeugt den nächsten Schritt.

## 11. Spec-Kit-Integration (Form B) — Architektur-Begründung

### 11.1 Warum die Taskliste als Chain-Quelle passt

`speckit.tasks` erzeugt eine **abhängigkeitsgeordnete** Taskliste — genau
die Ordnungseigenschaft, die eine sequenzielle Kette braucht. Form B nutzt
diese Ordnung direkt statt eine zweite Reihenfolge im Manifest zu pflegen:
der Chain-Mechanismus erfindet die Reihenfolge nicht neu, er erbt sie.

### 11.2 Zwei Orchestrierungsebenen, bewusst getrennt

| Ebene | Mechanismus | Granularität | Gates pro Einheit |
|---|---|---|---|
| Tasks in EINEM Workflow | Batch-Tools (`get_next_task` → `start_task` → …) | Task | Task-Review + Batch-Invarianten |
| Tasks als CHAIN (Form B) | `completeWorkflowLocked` + FR-117/118 | Task | **vollständiger Workflow** (understand → … → verify → complete) je Task |

Form B ist kein Ersatz für den Batch-Betrieb, sondern die Variante für
Tasks, die jeweils eine eigene Verifizierung verdienen (große, riskante oder
unabhängig testbare Einheiten). Entscheidungsregel für die Nutzung:
Batch-Betrieb als Default; Form B, wenn ein Task-spezifischer Verify-Lauf
(lint/test/build pro Task) erwünscht ist.

### 11.3 State-Brücke (Implementierungsnotiz)

`WorkflowEngine` und Spec-Kit sind bisher getrennte Integrationen (Spec-Kit
hat eigenen per-Session StateStore, lazy Engine-Cache in
`register-spec-kit-tools.ts`). Für FR-117 erhält `WorkflowEngine` über
`EngineDeps` einen optionalen Callback `specKitTasks(sessionId)` (liefert
pending Tasks in tasks.md-Reihenfolge). Die Injektion erfolgt im
Server-Bootstrap (`server.ts`/`GuidanceServer.ts`): dort sind beide Welten
bereits verdrahtet; der Engine-Konstruktor bleibt ohne direkte
Spec-Kit-Abhängigkeit (kein Dependency-Zyklus, testbar via Fake-Callback).

### 11.4 Abgrenzung zu FR-111 (Depth Limit)

Form-B-Ketten haben eine natürliche Obergrenze (Anzahl pending Tasks),
trotzdem greift `maxChainDepth` weiterhin als Backstop gegen Endlosketten
(z. B. wenn Tasks von außen nachgetragen werden).

## 12. Mixed-Manifeste (v1.1, CHN-3)

**FR-119 (Mixed Semantics):** `steps` und `source` sind im Manifest
**kombinierbar** (Q-B revidiert). Semantik: Die expliziten Steps (Form A)
laufen zuerst in deklarierter Reihenfolge; nach ihrer Erschöpfung fallt die
Kette in die task-abgeleitete Phase (Form B) und erzeugt Successors für die
pending Tasks. Mindestens eines von beiden ist erforderlich
(`configuration_invalid` sonst).

- Das Depth-Limit (FR-111) wirkt **kettenglobal**: `chainIndex` zählt
  formübergreifend; die Gate-Ordering-Regeln je Form bleiben unverändert
  (Form A: Erschöpfung vor Depth [LOW-4]; Form B: Depth als Backstop [§11.4]).
- Die Kopf-Kopie (FR-114) umfasst das **gesamte** Manifest-Objekt;
  `chainedTaskIds` wird nur durch task-abgeleitete Schritte fortgeschrieben
  (Form-A-Schritte appenden keinen Eintrag).
- Form-B-Profil-Gate (FR-112 rev.): ein Mixed-Manifest mit `source` im
  `plain`-Profil wird vollständig abgelehnt (keine stillen Degradierungen).
- Reine Form-A- und reine Form-B-Manifeste sind Teilmengen und verhalten
  sich unverändert (Rückwärtskompatibilität).
