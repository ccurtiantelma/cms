# ADR-92 — Overlay in-canvas (colori/ancoraggio) e Palette Widget a 2 colonne, supera T-editor-refinement/RE-2 sui soli colori bordo e ancoraggio della toolbar

## Status
[ ] In discussione · [x] **Approvata** · [ ] Rifiutata · [ ] Superseded da ADR-XXX

## Data approvazione
2026-09-18 — approvato da: marketing@antelmagroup.net, conferma esplicita in sede di task
(scelta "Documenta come nuova ADR poi applica" alla domanda posta in questa sessione, stesso
pattern di autorizzazione di ADR-91/54/38).

## Contesto

Task ricevuto ("Implementare gli In-Canvas Overlays e la Hover Toolbar Contestuale... ed
eseguire il riallineamento rigido della Palette Widget"), stessa famiglia del prompt esterno
"RESTYLING VISIVO 1:1 — Page Builder EAIDOS" già intercettato due volte il 2026-09-18 (vedi
`docs/ai/INDEX.md` nota ADR-91 e memoria di progetto `cms-registro-decisionale-disallineato`).
Verifica sul codice prima di procedere, come da lezione delle recidive precedenti: **tutte e
quattro** le funzionalità richieste come "da realizzare" esistevano già, in forma più
articolata di quella descritta dal prompt:

- **Overlay di selezione/hover**: `EditorBlockWrapper.module.css` (`.hoveredChrome`/
  `.selectedChrome` per i widget foglia, `.hoveredSectionChrome`/`.selectedSectionChrome` per
  Sezioni/Container) — ma con colori diversi da quelli richiesti (magenta fisso `#e0007b` per
  Sezioni/Container, blu `#2563eb` per i widget foglia in selezione, nessun bordo su hover per
  i widget foglia), frutto di due round di restyle "pixel-perfect Elementor" già autorizzati e
  documentati in `EditorBlockWrapper.tsx` (commenti "RE-2" e "T-editor-refinement").
- **Hover Toolbar Contestuale**: `BlockHoverOverlay.tsx` esiste già (maniglia drag, seleziona
  genitore, duplica, modifica, elimina, "+" sopra e sotto, più preset/converti/esporta
  opzionali), ancorata in alto **al centro** del blocco (scelta esplicita RE-2, non in un
  angolo) — più ricca del set minimo richiesto dal task (drag, etichetta nome, duplica,
  elimina, "+"), ma senza etichetta nome visibile al suo interno (il nome vive solo nel badge
  separato `.hoverBadge`, mostrato solo su hover-senza-selezione) e ancorata al centro, non a
  sinistra come richiesto ora.
- **Pulsante "+" Canvas Chooser per layout a colonne**: già esistente
  (`CanvasAddSectionZone.tsx` → `SectionStructureModal.tsx`, pulsante circolare "Scegli la
  struttura della sezione" con opzioni 1/2/3/4 colonne più varianti asimmetriche 33/67,
  30/70). Nessun lavoro nuovo necessario su questo punto.
- **Griglia Palette Widget**: `sidebar/WidgetPalette.module.css` è a 3 colonne
  (`grid-template-columns: repeat(3, minmax(0, 1fr))`), `border-radius: 4px`, icone
  monocrome (`currentColor`, `#555d66`) — qui il divario dal task è reale, non frutto di una
  decisione precedente contraddetta: nessun commento cita una scelta deliberata di 3 colonne o
  di icone monocrome come requisito pixel-perfect di un task precedente specifico su questo
  punto (a differenza del resto).

Posta la scelta esplicita all'umano fra "applica solo il gap reale (Palette)", "sovrascrivi
tutto alla lettera" e "documenta come ADR poi applica" — la risposta è stata la terza:
registrare qui quali decisioni pregresse vengono sostituite, poi applicare.

## Decisione

1. **Colore bordo hover/selezione, terzo schema (supera lo schema magenta/blu di
   T-editor-refinement/RE-2 solo sul valore colore, non sulla struttura a due categorie
   Container/Widget che resta identica)**:
   - Container/Sezione (`isContainerOrSection`): selezione = **2px solid `#2271b1`**; hover
     (non selezionato) = 1px solid `#2271b1` (stesso colore, spessore minore — "bordo
     sottile di hover" del task).
   - Widget foglia: selezione = **2px solid `#a435c0`**; hover = 1px solid `#a435c0`.
   - `blockLevelColor`/`--block-level-color` (RE-2, tre livelli viola/azzurro/blu) resta
     **invariato** come custom property calcolata (consumata altrove, es. eventuali usi
     futuri), ma non alimenta più il bordo: il bordo legge ora le due costanti nuove sopra,
     non più `blockLevelColor`. Stessa non-riscrittura di codice storico già praticata da
     ADR-72/73/91: il calcolo resta, cambia solo chi lo consuma per il bordo.
   - `.globalRefBorder` (viola `#9333ea`, sempre visibile, ADR-55) resta **invariato**: fuori
     perimetro, non è un bordo di hover/selezione.
2. **`BlockHoverOverlay.tsx` guadagna un'etichetta di testo col nome del blocco**, primo
   elemento della barra (prima della maniglia drag), stesso testo già risolto da chi la monta
   in `EditorBlockWrapper.tsx` (prop `label`, già esistente e passata). Nessun controllo
   esistente rimosso: "Inserire" nel task è letto come requisito minimo già in gran parte
   soddisfatto (drag/duplica/elimina/"+" ci sono), non come sostituzione dell'intera barra —
   vedi "Alternative scartate".
3. **Ancoraggio della barra: da centrato a in alto a sinistra** (`.overlay`, `left: 0`,
   `transform: translateY(-100%)`, non più `left: 50%`/`translateX(-50%)`): supera la scelta
   di centratura RE-2 su questo solo punto geometrico, non sul resto (sfondo/colore icone
   restano quelli di T-editor-refinement, non toccati da questa ADR).
4. **Palette Widget**: griglia a 2 colonne fisse (`grid-template-columns: repeat(2, 1fr)`),
   `border-radius: 6px` sulle tessere (da 4px), colore d'accento per categoria applicato
   all'icona (non più `currentColor #555d66` uniforme):
   - Base → `#2271b1` (stesso azzurro dei Container, coerenza con lo schema del punto 1)
   - Media → `#00a08d` (verde acqua, distinto dalle altre tre)
   - Struttura → `#f2994a` (arancione, distinto)
   - Moduli → `#a435c0` (stesso rosa/viola dei Widget foglia, coerenza col punto 1)
   Nessuna categoria "Altro"/extra nello schema fisso: mantiene il colore neutro precedente
   (`#555d66`) come fallback, il task nomina solo le quattro categorie esistenti.

## Alternative scartate

- **Rimuovere da `BlockHoverOverlay` i controlli non nell'elenco del task** (seleziona
  genitore, modifica, aggiungi sopra/sotto, preset/converti/esporta) per allinearsi
  letteralmente al set minimo richiesto — scartata: regredirebbe funzionalità già shippata,
  testata e usata (helper Playwright/e2e la cercano), il task usa il verbo "Inserire" non
  "Sostituire"/"Rimuovere", nessun beneficio concreto a toglierla.
- **Riscrivere anche `blockLevelColor` a due soli valori** invece di lasciarlo con tre livelli
  e cambiare solo il consumo per il bordo — scartata: allargherebbe la modifica oltre il
  perimetro (colori del bordo), rischiando di rompere un eventuale altro consumatore futuro
  della property che oggi non esiste ma che il calcolo a tre livelli documenta ancora come
  intenzionale.
- **Applicare l'intero prompt alla lettera senza ADR** — scartata dall'umano stesso in sede di
  scelta esplicita (stesso principio già impedito nel testo di ADR-91 per lo stesso prompt).

## Conseguenze

**Positive**
- Un solo schema colore bordo coerente fra `EditorBlockWrapper` e la nuova Palette Widget
  (`#2271b1` Container/Base, `#a435c0` Widget/Moduli), non tre schemi sovrapposti nella
  history (RE-2 → T-editor-refinement → questo).
- Etichetta nome visibile direttamente nella toolbar di selezione, non solo nel badge hover
  separato (miglior leggibilità quando il blocco è selezionato e non più sotto il cursore).

**Negative / costi**
- Terzo cambio di colore per lo stesso bordo in tre round di task consecutivi — rischio di
  ulteriore thrashing se un quarto prompt della stessa serie ne richiede un altro; nessuna
  mitigazione oltre la tracciabilità di questa ADR.
- `blockLevelColor` a tre livelli resta nel codice senza consumatore diretto per il bordo
  (solo per la custom property esposta) — lieve debito di leggibilità, non funzionale.

## Conformità

1. `EditorBlockWrapper.module.css`: `.selectedSectionChrome`/`.hoveredSectionChrome` a
   `#2271b1`; `.selectedChrome`/`.hoveredChrome` a `#a435c0` (non più derivato da
   `--block-level-color`).
2. `BlockHoverOverlay.tsx`/`.module.css`: etichetta nome presente nel DOM della barra;
   `.overlay` ancorata a sinistra (`left: 0`).
3. `sidebar/WidgetPalette.module.css`: `.grid` a `repeat(2, 1fr)`, `.tile` a
   `border-radius: 6px`; `WidgetPalette.tsx` applica un colore d'accento per categoria
   all'icona.
4. `npx tsc --noEmit` e `npx vitest run src/pages/pages/editor` (`app/frontend/`) verdi,
   baseline 449/449 test verificata su questa stessa sessione prima della modifica.
