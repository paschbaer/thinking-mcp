# Specification: LOW-Residue Closure (Feature 007 Reste + L253-Ersatz)

**Feature ID:** `008-low-residue-closure`
**Namespace:** FR-801+, SC-801+
**Closes tracks:** Interleaving-Parität (Doku/Tests) · Router-Cast-Robustheit · Lock-Cap-Wortlaut · L253-Ersatz (Prompt-Auslieferung übers Paket)
**Status:** Implemented (2026-09-27)
**Date:** 2026-09-27

## Overview

Schließt die verbliebenen LOW-Residuen aus Feature 007 und setzt den
L253-Ersatz um: Der `capture-lessons`-Prompt wird im npm-Paket ausgeliefert
(statt Kopien in fremde Repos zu pflegen — L253 bleibt obsolet-closed), und
die drei offenen LOWs aus dem Feature-007-Final-Review werden entweder im
Code geschlossen oder bewusst mit Test/Wortlaut-fixiert.

## Functional Requirements

- **FR-801** Stream-Semantik dokumentiert und getestet: stdout/stderr werden
  getrennt aufgezeichnet; eine quergestreamte Reihenfolge (out/err interleaved)
  wird **nicht** garantiert — Failing-Opsoberfläche nutzt ausschließlich den
  (redigierten) stderr-Kanal. Test: alternierender out/err-Child wird
  sauber ausgeführt, stderr-Meldung landet redigiert im Fehlerpfad.
- **FR-802** Router-Robustheit: Der Remote-Router-Executor wird als Proxy
  umgesetzt — unbekannte Property-Zugriffe werden an die
  Downstream-Engine-Instanz weitergeleitet (funktionsfähig gebunden),
  damit künftige Member-Nutzung nicht mit `undefined is not a function`
  crasht. Known properties (`execute`, `executeRequired`) behalten ihr
  Routing.
- **FR-803** FR-705-Wortlaut korrigiert (spec 007): Cap 64 ist **soft** —
  held Locks werden nie evicted; die Map darf unter Contention temporär
  den Cap überschreiten. Memory-bank-Eintrag (L-2-Rest) synchronisiert.
- **FR-804** L253-Ersatz — Prompt-Auslieferung übers Paket:
  `prompts/capture-lessons.prompt.md` wird Teil des npm-Pakets (`files`),
  mit Verweis auf den Master (`.github/prompts/`); README dokumentiert die
  Nutzung aus fremden Repos (`node_modules/@paschbaer/guidance/prompts/…`).
  L253 bleibt obsolet-closed (Verweis auf FR-804).

## Success Criteria

- **SC-801**: Test belegt: alternierende stdout/stderr-Ausgaben werden
  getrennt erfasst; der stderr-Inhalt erreicht den Fehlerpfad redigiert
  (FR-801).
- **SC-802**: Router leitet unbekannte Property-Zugriffe funktionsfähig an
  die Downstream-Engine weiter; `execute`/`executeRequired` behalten ihr
  Routing (Regressionstest).
- **SC-803**: specs/007 FR-705-Wortlaut = implementierte Semantik; Plan- und
  Spec-Text konsistent.
- **SC-804**: `prompts/capture-lessons.prompt.md` im Paket (`files`-Test),
  README-Abschnitt vorhanden.
- **SC-805**: Volle Suite grün (≥ 312 + neue), typecheck + build clean.

## Out of Scope

- Echte Byte-Reihenfolge-Garantien über Streams hinweg (POSIX-Limitierung).
- HMAC-Report-Tokens (weiterhin getrackt).
- L253-Umsetzung in fremden Repos (obsolet).
