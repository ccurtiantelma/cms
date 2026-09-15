# RFC-63 — "FASE 4: Sidebar Widget & Pannello Proprietà": verifica dello stato reale prima di un round di scrittura

## Status
[ ] In discussione · [x] **Approvato** · [ ] Rifiutato

## Proposto da
AI Orchestrator (via sessione interattiva) · Data: 2026-09-14

---

## Problema

Il task che origina questa RFC chiedeva l'implementazione diretta, come Frontend Developer, di
tre punti su `BlockPalette.tsx` e `PropertyInspector.tsx`: (1) sidebar widget ad Accordion per
categorie (Layout/Elementi Base/Media/Avanzati) con ricerca in tempo reale, icona/label/maniglia
drag `@dnd-kit`, passaggio metadati per le props di default; (2) Property Inspector a Tab
("Contenuto"/"Stile"/"Avanzate") con controlli responsive `unitValue` (px/%/em/rem), spaziature
per lato (ADR-71), Color Picker avanzato, allineamenti, controlli Flexbox/Grid nei container; (3)
sincronizzazione live col Zustand store/Iframe canvas con Undo/Redo, più i test Jest/RTL.

Il controllo documentale preliminare imposto da `CLAUDE.md`/`docs/ai/INDEX.md` ("non inventare...
regole non presenti in `docs/`", "se il dominio non compare... STOP e chiedi") ha trovato che
**il task breakdown ufficiale del dominio** (`SPEC-F04-super-elementor.md` § "Task breakdown",
T0–T7, discendente da `RFC-F04e-super-elementor.md` e `ADR-70/71/72`) **non contiene una "Fase
4 Sidebar/Inspector"**: copre esclusivamente il canvas in iframe (`createPortal`, ponte Zustand,
misura cross-frame `dnd-kit`) e le maniglie di resize `unitValue` (T4–T6, su
`container.styleFlexBasis` e sulle nuove props di ADR-71). Una ricerca (`grep`) su tutto
`docs/ai/` per "Fase 4"/"Accordion"/"Flexbox/Grid nei container" non ha trovato alcuna RFC/ADR/
plan che descriva quanto richiesto.

Più rilevante: **la lettura del codice sorgente mostra che gran parte di quanto richiesto esiste
già, in produzione**, non come lavoro mancante:

| Richiesta | Stato reale verificato nel codice |
|---|---|
| "Riprogetta `BlockPalette.tsx`" con Accordion/categorie/ricerca | `BlockPalette.tsx` (236 righe) è un **picker "Menu" click-to-add** montato da `CanvasContextMenu.tsx`, `CanvasAddSectionZone.tsx`, `EditorBlockWrapper.tsx`, `BlockHoverOverlay.tsx` — legato a un contenitore preciso ("Aggiungi blocco"/"Inserisci sopra"/"Aggiungi dentro"), non la sidebar. **La sidebar widget è `sidebar/WidgetPalette.tsx`** (montata da `sidebar/WidgetSidebar.tsx`), e **ha già** Accordion Mantine multi-categoria (`Base`/`Media`/`Struttura`/`Moduli`, non gli stessi 4 nomi richiesti ma stessa struttura), `TextInput` di ricerca in tempo reale (`query`, filtro su `label`+`type`), tessere con icona (`blockIcon`) + label + maniglia drag (`useDraggable` di `@dnd-kit/core`, id `new-block:<type>`), e passaggio di `defaultPropsFor(descriptor)` sia al drag (`FullScreenEditorLayout.handleDragEnd`) sia al click-to-add. Commento di testa del file: già frutto di un "restyle Elementor Pro" (`PLAN-F04c-editor-maturo.md` T-restyle). |
| Tab "Contenuto"/"Stile"/"Avanzate" nel Property Inspector | `PropertyInspector.tsx` monta già `InspectorTabs.tsx` con `inspector/ContentTab.tsx`/`StyleTab.tsx`/`AdvancedTab.tsx`, raggruppamento via `groupPropsByTab` su `meta.props[...].tab`, governato da **ADR-30 § 1** e **ADR-37 § 5** (una scheda vuota non compare, con una sola scheda popolata `Tabs` non appare). Non è un gap, è un invariante già testato. |
| Controlli responsive `unitValue` (px/%/em/rem) e spaziature per lato | `container.styleFlexBasis` (`kind: 'unitValue'`, ADR-38 § 2) e le otto props di spaziatura per lato (ADR-41) esistono già; `ADR-71-resize-handles-unita-dinamiche.md` (approvata 2026-09-14, stesso round di questa richiesta) **ha già deciso** il resto: `styleWidth`/`styleHeight`/margini per lato nuovi, **solo `px`/`%`** pilotabili da maniglia (non `em`/`rem` — ADR-71 § 2 Alternative valutate, scartato esplicitamente), **non `responsive`** (ADR-71 § 4). Il lavoro reale è T4–T6 di `SPEC-F04-super-elementor.md`, non ancora scritto (nessun `ResizeHandle.tsx` nel repository), diverso da "controlli responsive px/%/em/rem" come descritto nel task. |
| Color Picker avanzato, allineamenti | `inspector/PropField.tsx` monta già `ThemeEditorColorPicker` (3 punti d'uso) e icone dedicate per `flexDirection`/`justifyContent`/`alignItems` (commento di testa, righe 75-79) su `container` (ADR-39). |
| Controlli Flexbox/Grid nei container | Flexbox su `container` esiste già (ADR-39/41). **"Grid nei container" è una richiesta nuova, mai valutata**: `RFC-58-flexbox-container-section-parity.md` (approvata 2026-09-05, Opzione A) ha **già deciso esplicitamente** che `section` resta CSS Grid (ADR-31) e `container` resta Flex (ADR-39), **senza duplicare i vocabolari**, respingendo l'idea di dare a un tipo il vocabolario dell'altro senza una nuova ADR dedicata. Aggiungere una modalità Grid a `container` riaprirebbe quella decisione firmata cinque giorni fa. |
| Sincronizzazione live Zustand + Undo/Redo | Già esistente e invariata da round precedenti (`updateBlockPropsAction`, `commit`/`setAndCommit` in `PropertyForm`, `PropertyInspector.tsx` righe 122-136) — nessun gap. |

Per `docs/constitution.md` § "Gerarchia delle decisioni" (RFC → ADR → Spec → Plan → Task →
Code) e § "AI Governance" ("le AI non possono... auto-approvare RFC, ADR"), i soli due punti
sopra che rappresentano lavoro realmente nuovo e non coperto da firma esistente — rinominare le
categorie della sidebar, e un'eventuale modalità Grid per `container` — richiedono una decisione
esplicita prima di scrivere codice, non un'implementazione diretta.

---

## Soluzione proposta

Tre decisioni indipendenti.

### Decisione 1 — Le quattro categorie richieste per `WidgetPalette.tsx`

**Opzione (a) — Nessuna modifica.** Le categorie attuali (`Base`/`Media`/`Struttura`/`Moduli`,
`WidgetPalette.tsx` righe 36-47) restano. Costo zero.

**Opzione (b) — Rinominare/riorganizzare in "Layout"/"Elementi Base"/"Media"/"Avanzati".**
Modifica additiva della sola mappa `CATEGORY_BY_TYPE`/`CATEGORY_ORDER` (nessuno schema, nessuna
`v`, nessun impatto backend): `Struttura` → `Layout` (contiene `section`/`container`), `Base` →
`Elementi Base`, `Media` invariato, nuova categoria `Avanzati` per i tipi che oggi cadono nel
fallback `descriptor.meta?.category ?? 'Altro'` (es. `form`/`form-field`/`form-submit`, oggi in
`Moduli` — da redistribuire fra `Avanzati` o restare `Moduli` sotto l'ombrello "Avanzati", da
decidere in sede di firma). Nessuna ADR necessaria: è un cambio di etichetta/raggruppamento UI
sullo stesso registro esistente, stesso principio già usato per `meta.label` (ADR-30 § 4), non
un cambio di `PropSpec`/schema.

### Decisione 2 — Modalità Grid per `container` ("controlli... per la disposizione Flexbox/Grid")

**Opzione (a) — Non introdurla (raccomandata).** `RFC-58` (approvata 2026-09-05, Opzione A) ha
già stabilito che `section` = CSS Grid, `container` = Flex, **senza duplicare i vocabolari** fra
i due tipi — la stessa RFC valutava e scartava esplicitamente l'idea simmetrica (dare a `section`
il vocabolario flex di `container`). Una modalità Grid dentro `container` sarebbe la stessa
categoria di richiesta, ribaltata: andrebbe valutata con lo stesso rigore (nuova prop
`layoutMode`, duplicazione di vocabolario, impatto su `blocks:export`/cache pubblica ADR-23),
non introdotta come dettaglio di UI del Property Inspector.

**Opzione (b) — Aprire una nuova RFC dedicata** (stesso schema di RFC-58: Problema/Opzioni/
Impatto/Rischi) per valutare se `container` debba guadagnare `layoutMode: flex | grid`, con le
stesse domande che RFC-58 ha già posto per il caso simmetrico (duplicazione vocabolario,
`v`/migrazione, cache pubblica).

### Decisione 3 — Lavoro già autorizzato, non toccato da questa RFC

`ADR-71` (§ 4.2 di `SPEC-F04-super-elementor.md`, task T4-T6) autorizza già `ResizeHandle.tsx`
su `styleWidth`/`styleHeight`/margini per lato, **solo `px`/`%`**, **non responsive**. Questo è
il solo pezzo di "controlli responsive per unitValue e spaziature" del task originale che ha
già una firma umana e nessun conflitto — resta il lavoro raccomandato da eseguire, indipendente
dall'esito delle Decisioni 1/2 sopra, e già in coda nel breakdown di `SPEC-F04-super-elementor.md`
(bloccato solo dal completamento di T1-T3, in corso secondo `git status` al momento di questa
RFC: `IframeCanvas.tsx`, bridge portal, non ancora committati).

---

## Alternative valutate

- **Implementare tutto il task come descritto, ignorando la sovrapposizione con `WidgetPalette.tsx`
  e le decisioni già firmate di RFC-58/ADR-71** — scartata: produrrebbe una riscrittura duplicata
  di `BlockPalette.tsx` (il picker sbagliato) e riaprirebbe implicitamente RFC-58/ADR-71 senza
  una firma dedicata, violando `docs/constitution.md` § Gerarchia delle decisioni.
- **Trattare l'intero task come "già fatto, nessuna azione"** — scartata: le Decisioni 1 e 2
  sono richieste reali (nomi categoria, eventuale Grid nei container) che non hanno oggi una
  risposta scritta, anche se la maggior parte dell'infrastruttura sottostante esiste già.

---

## Impatto

**Decisione 1, Opzione (b)**: impatto minimo, un solo file (`WidgetPalette.tsx`, mappa
categorie), nessuna `v`, nessun impatto backend/cache pubblica, nessun test Bruno. Rischio: la
redistribuzione dei tipi con `category` di fallback (`Moduli`/`Altro`) va decisa esplicitamente
per non lasciare tipi orfani in un gruppo che non compare più.

**Decisione 2, Opzione (b)**: stesso genere di impatto di RFC-58 Opzione B (§ "Impatto" di
quella RFC): nuova prop `layoutMode` su `container`, rigenerazione `blocks:export`+
`blocks:types`, token di registro cambiato (cache pubblica fredda al deploy, ADR-23 § 2), nessun
bump di `v` se la prop resta opzionale con default `flex`.

**Decisione 3**: nessun impatto nuovo, è il lavoro già pianificato in `SPEC-F04-super-elementor.md`.

---

## Rischi

- **Se si procede senza questa firma**, il rischio concreto è duplicare `WidgetPalette.tsx` con
  una riscrittura di `BlockPalette.tsx` che non è la sidebar — un lavoro visibile ma sul
  componente sbagliato, che non soddisfa la richiesta reale e introduce un secondo sistema di
  categorie/ricerca da mantenere in parallelo.
- **Decisione 2 non chiusa esplicitamente**: se approvata implicitamente insieme al resto senza
  una nota che ne isoli il superamento di RFC-58, un round futuro potrebbe interpretarla come
  "già inclusa" nella parità Flexbox già approvata — va scritta a chiare lettere nella firma,
  stesso rischio già segnalato in RFC-58 § Rischi punto 3 per un caso analogo.

---

## Decisione umana

**Decisione 1 — Categorie della sidebar**
**Esito**: [ ] (a) Nessuna modifica · [x] (b) Rinominare in Layout/Elementi Base/Media/Avanzati · [ ] Rinviato

**Decisione 2 — Modalità Grid per `container`**
**Esito**: [x] (a) Non introdurla · [ ] (b) Nuova RFC dedicata prima di procedere · [ ] Rinviato

**Decisione 3 — Conferma proseguire T4-T6 di `SPEC-F04-super-elementor.md`**
**Esito**: [x] Confermato, nessuna modifica · [ ] Rinviato

**Note**: Decisione 1 (b): la redistribuzione dei tipi di fallback (`Moduli`/`Altro`, vedi
"Soluzione proposta" § Decisione 1) resta da decidere in sede di implementazione — non
eseguita in questo round, nessuna modifica a `WidgetPalette.tsx` ancora scritta.
Decisione 2 (a): conferma esplicita che RFC-58 (`section` = Grid, `container` = Flex) non
viene riaperta da questa firma — nessuna nuova ADR, nessuna prop `layoutMode`.
Decisione 3: verifica di codice in sede di firma (non solo di intenzione) — `ResizeHandle.tsx`,
`components/ContainerResizeHandle.tsx` e le nuove props `styleWidth`/`styleHeight`/
`styleMargin{Top,Bottom,Left,Right}` (backend, `app/backend/src/blocks/types/*.block.ts`)
**risultano già implementati e committati** (`160ddd7`, 2026-09-14 17:52, precedente a questa
firma), wiring in `EditorBlockWrapper.tsx` via `resolveResizePropSpec`/`updateBlockPropsAction`
conforme ad ADR-71. T4-T6 di `SPEC-F04-super-elementor.md` sono quindi da considerare già
eseguiti, non da avviare ex novo — vedi checkbox aggiornate nel Task breakdown della spec.
Suite di test verificata verde in sede di firma: `ResizeHandle.test.tsx`,
`ContainerResizeHandle.test.tsx`, `EditorBlockWrapper.test.tsx`, `PropertyInspector.test.tsx`
(143/143), `block-registry.spec.ts`/`block-tree-validator.service.spec.ts`/
`block-prop-sanitizer.service.spec.ts` backend (275/275). Un solo fallimento riscontrato
nell'intera suite frontend (`AntelmaCloningParity.test.tsx`, footer "Partita Iva e Codice
Fiscale" assente dalla fixture `antelma-contatti.seed.ts`), preesistente al commit `523701e`
(2026-09-14 09:50, precedente a entrambi i commit `ref ai`) e indipendente da questa RFC e da
ADR-71 — non una regressione di questo round, non corretto qui (fuori scope).

**Approvato da**: marketing@antelmagroup.net · **Data**: 2026-09-14

**Azione successiva**: [ ] Genera ADR (solo se Decisione 2 = b, dopo la RFC dedicata) · [ ] Aggiorna `WidgetPalette.tsx` (solo se Decisione 1 = b, non eseguito in questo round) · [x] Procedi con T4 (`ResizeHandle.tsx`) di `SPEC-F04-super-elementor.md` — verificato già implementato, non da riscrivere · [ ] Archivio
