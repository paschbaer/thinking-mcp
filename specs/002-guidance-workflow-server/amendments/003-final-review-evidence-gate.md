# Spec Amendment 003: Final-Review Evidence Gate (FRE)

> Status: **DRAFT** (Prinzip vom Nutzer am 2026-09-26 gebilligt; offene
> Entscheidungen Q1–Q3 in §9 mit Defaults)
> Base: `specs/002-guidance-workflow-server/spec.md` (v1 + v2 + v2.1)
>       + `amendments/001-remote-mode.md` + `amendments/002-workflow-chaining.md`
> Date: 2026-09-26
> FR-Nummern: FR-120 … FR-125 (Fortsetzung des Kreises aus Amendment 002)

## 1. Motivation

Das Mandat für einen unabhängigen Final-Review vor der Completion ist
bisher **nur Instruktionstext** in der `complete`-Phase
(`responses.json`: „MANDATORY FINAL REVIEW … over ALL tasks of this
session, complete diff of all commits"). Der Server kann es technisch
nicht erzwingen — seine Completion-Gates sind ausschließlich Operationen
(index-freshness, repository-analysis, capture-session-lessons).

**Vorfall 2026-09-26 (Feature 003):** Der Agent completete den Workflow
unter Bezugnahme auf einen Independent Review, der den Fix-Commit
(`b6edcee`) selbst nicht mehr abdeckte. Der frische Gesamt-Review (nach
Nutzer-Nachfrage) fand genau dadurch einen neuen Defekt (R-011,
Lock-Steal-TOCTOU), den der erste Review nicht sehen konnte. Beweis,
dass die Lücke real ist: **Fixes nach dem Review sind selbst unreviewter
Code.**

## 2. Ziel

Der Final-Review wird zu einem **maschinenprüfbaren Completion-Gate**:
`complete_workflow` scheitert deterministisch (`required_hook_failed`,
wie FR-040), solange kein gültiger Review-Nachweis für exakt den
HEAD-Stand existiert.

## 3. Anforderungen

- **FR-120 (Evidence-File):** Vor dem Completion-Submit schreibt der
  Agent `<stateDir>/final-review.json` (Schema §4). Fehlt es oder ist
  invalide, schlägt das Gate fehl (fail-closed).
- **FR-121 (Gate-Operation):** Neue required-Operation
  `final-review-gate` in `operations.json`, verdrahtet an
  `complete.beforeExit`. Executable: `node
  servers/server-guidance/scripts/check-final-review.mjs .` (cwd =
  workspaceRoot, kein git-Binary nötig — readGitHead-Pattern aus
  `check-index-freshness.mjs`). Validierung:
  1. Datei existiert, strict-schema-valide (§4), `sessionId` nicht-leer
     (Match gegen die Server-Session ist seitens einer Process-Op
     technisch nicht prüfbar — dokumentierte Grenze, §5).
  2. `headCommit` == aktuell aufgelöste HEAD (loose ref, packed-refs,
     worktree-`.git`-Datei wie im Freshness-Script).
  3. `commits[]` enthält `headCommit` und `baseCommit`; `baseCommit` ist
     syntaktisch ein Full-Hash (40 hex) — *Ancestry-Prüfung bewusst out
     of scope* (§6).
  4. `openHighCritical === 0` (Zahl, exakt).
  5. `findings[]`: jede Zeile mit `id`, `severity`
     (`high|critical|medium|low|info`), `status`
     (`fixed|tracked|accepted`), `evidence` (nicht-leer).
  6. `reviewedAt` ISO-String, nach `baseCommit`-Zeitpunkt liegend
     (plausibilisiert, nicht beweisbar — §6).
- **FR-122 (Invalidierung):** Jeder Commit NACH `headCommit` macht das
  Gate invalide (HEAD wandert ⇒ Feld-Mismatch). Damit erzwingt die
  Reihenfolge: Review ist der letzte Schritt vor Completion —
  Doku-/Memory-Bank-Commits nach dem Review erfordern Re-Review. Gewollt.
- **FR-123 (Anti-Gaming-Minimum):** Pflichtfeld `reviewerRef`
  (Sub-Agent-Session-Id oder Review-Tool-Invocations-Referenz) und je
  Finding ein `evidence`-Feld. Die Autorschafts-Unabhängigkeit selbst ist
  **nicht technisch verifizierbar** — dokumentierte Vertrauensgrenze (§6),
  wie FR-104.5 (Client-Reports).
- **FR-124 (Audit):** Gate-Ergebnis wird auditiert
  (`final_review_gate`: `{ outcome, headCommit, openHighCritical }`).
  Kein neuer ErrorCode: Gate-Fehler läuft über den bestehenden
  `required_hook_failed`-Pfad mit Op-Summary als Diagnose.
- **FR-125 (Chain-Interaktion):** Gate-Failure blockiert die Completion
  und damit die Successor-Creation (Amendment 002). Die Kette endet an
  dieser Stelle deterministisch (FR-116-Verhalten) — gewollt: keine
  Kette läuft ohne Final-Review weiter.

## 4. Data Model: `final-review.json`

```jsonc
{
  "formatVersion": 1,
  "sessionId": "session-…",            // muss zur Session passen
  "reviewerRef": "sub-agent-session-…",// FR-123
  "reviewScope": "git diff 16c6f1e..ec924f6 + governing spec …",
  "baseCommit": "<40-hex>",            // erster Session-Commit-Elternteil
  "headCommit": "<40-hex>",            // muss == HEAD sein (FR-121.2)
  "commits": ["<40-hex>", "…"],        // alle Session-Commits
  "reviewedAt": "2026-09-26T13:40:00Z",
  "openHighCritical": 0,               // exakt 0, sonst Gate fail
  "findings": [
    { "id": "R-011", "severity": "medium", "status": "tracked",
      "evidence": "WorkflowEngine.ts acquireWorkspaceOpLock: unlink+recreate" }
  ]
}
```

Ablage unter `stateDir` (nicht Workspace-Wurzel): Permission-sicher im
Container und nicht Teil des Review-Subjekts selbst.

## 5. Trust-Grenzen (dokumentiert, keine technischen Ansprüche)

| Aspekt | Grenze |
|---|---|
| Autorschafts-Unabhängigkeit | self-declared `reviewerRef` — nicht prüfbar |
| Ancestry von `baseCommit` | nicht ohne git-Objekt-Zugriff prüfbar (bewusst weggelassen) |
| `reviewedAt`-Plausibilität | Uhrzeit-basiert, manipulierbar |
| Vollständigkeit von `commits[]` | headCommit-Check fängt vergessene Spitzen-Commits; mittendrin fehlende Commits nicht |

Rationale: Das Gate zielt auf den realen Vorfall („Review älter als der
letzte Code-Stand") — dieser ist mit HEAD-Vergleich zuverlässig
erkennbar. Vollständige Manipulationssicherheit wäre ein eigenes
Nicht-Ziel (der Agent schreibt ohnehin jeden Code).

## 6. Testplan (Must-Pass)

1. Gate ohne Evidence-File → `required_hook_failed`, Phase bleibt
   `complete`, Audit `final_review_gate { outcome: "failed" }`.
2. `headCommit` != HEAD (Commit nach Review simuliert) → fail.
3. `openHighCritical: 1` → fail; `: 0` mit vollständigen Findings → pass.
4. Fehlende Pflichtfelder / additionalProperties → fail (strict).
5. Happy Path: gültiges File + Retry → `completed`, Audit pass.
6. Chained Workflow (Amendment 002): Gate-Failure → kein Successor.
7. Backward Compatibility: Workspace ohne `final-review-gate`-Op
   verhält sich exakt wie bisher (Gate ist Op-basiert, kein Built-in-Zwang).

## 7. Betroffene Stellen

| Datei | Änderung |
|---|---|
| `scripts/check-final-review.mjs` | NEU (readGitHead aus Freshness-Script wiederverwenden/kopieren) |
| `examples/default-guidance/operations.json` + `scaffold.ts` | Gate-Op als Default (required) |
| `README.md` | Completion-Abschnitt: Evidence-File-Workflow |
| `tests/contract/final-review-gate.test.ts` | NEU (Testplan §6, Gates 1–7) |

## 8. Zusammenhang mit anderen Dokumenten

- Ergänzt die Mandats-Texte in `responses.json` (`complete`, §L45–52) um
  die Durchsetzbarkeit; die Instruktionstexte bleiben unverändert
  bestehen.
- §10.2 der Parent-Spec („Before reviewing, verify snapshot…") bleibt
  die prozessuale Grundlage; FRE macht den *Nachweis* maschinenlesbar.

## 9. Offene Entscheidungen (Defaults = Vorschlag)

| # | Frage | Default |
|---|---|---|
| Q1 | Gate per Default im Scaffold/Example? | Ja (`required: true`) — Bestandsgenerationen können die Op entfernen (Op-basiert = opt-out) |
| Q2 | Memory-Bank-Persistenz der Findings automatisiert gegenprüfen? | Nein — zu fragil (freie Markdown-Struktur); bleibt Instruktion |
| Q3 | Evidence-File je Session oder je Workspace? | Je Session-Id im Feld, Datei im gemeinsamen `stateDir` (Überschreiben erlaubt; Audit hält die Historie) |

## 10. Randbefund (separates Follow-up)

**FR-Nummern-Kollision:** `specs/003-guidance-toolchain-bootstrap/spec.md`
nutzt FR-101…110 — derselbe Kreis, den die Amendments 001 (FR-101+) und
002 (FR-110…119) bereits im 002-Namespace belegen (Spec 003 entstand
parallel und unabhängig). Empfehlung: Spec 003 auf eigenen Namespace
umnummerieren (z. B. FR-301…315) mit Alias-Notiz; Trigger: nächste
Änderung an specs/003. Als Follow-up getrackt (memory-bank), nicht Teil
dieses Amendments.
