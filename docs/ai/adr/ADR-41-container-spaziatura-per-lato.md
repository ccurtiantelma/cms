# ADR-41 — Container: spaziatura per lato (secondo step di ADR-39 § 2)

## Status
[ ] In discussione · [x] Approvata · [ ] Rifiutata · [ ] Superseded da ADR-XXX

## Data approvazione
2026-08-27 (approvazione umana esplicita in sessione, contestuale al task che apre questa ADR)

---

## Decisione

1. **`container` guadagna gli stessi otto prop di spaziatura per lato già approvati per
   `section` da ADR-33 § 4**: `stylePaddingTop/Right/Bottom/Left`,
   `styleMarginTop/Right/Bottom/Left`. Stesso `kind: 'enum'`, stessa scala chiusa
   `0 4 8 12 16 24 32 48 64 96`, stesso `responsive: true` (forma per breakpoint di ADR-29
   § 2), stesso default `0`. Zero prop nuove nel senso dello schema: è un riuso letterale
   della forma già approvata, non una nuova firma di `PropKind`.

2. **Questa è esattamente il "secondo step" che ADR-39 § 2 aveva dichiarato fuori scope**:
   *"container in questo step è layout puro (flex/grid), non un settimo veicolo di
   stile; l'allineamento con ADR-38 § 6, se voluto, è materia di un secondo step, non di
   questa firma."* ADR-39 resta valida per tutto il resto che dichiara (il sentinel `'*'`
   di `children.allow`, l'esclusione di `grid`, le sei prop di layout flex) — questa ADR
   non la supera, la **estende** su un punto che ADR-39 stessa aveva rimandato
   esplicitamente, non escluso per motivi tecnici.

3. **Nessun incremento di `v`, nessuna migrazione**: tutte le prop nuove sono opzionali con
   `default` dichiarato, stesso ragionamento di ADR-33 § 5/ADR-39 § 5. Il token del registro
   di ADR-23 § 2 cambia comunque al primo deploy (`container:1:0` → il conteggio delle
   migrazioni resta 0, ma la forma di `props` cambia; se il token è calcolato solo su
   `type:v:migrations.length` come descritto in ADR-39 § 7, **nessun cambiamento di token**
   da questa ADR — coerente con "zero incremento di v": la cache pubblica non si invalida
   per questa modifica, il rendering cambia solo per contenuto che valorizza le nuove prop).

4. **Metadati d'editor obbligatori** (ADR-30 § 4): `tab: 'style'`, etichette in italiano,
   `order` in coda alle sei prop di layout di ADR-39.

5. **Inspector: nessun widget nuovo.** `container` dichiarando tutte e otto le prop di
   spaziatura attiva lo stesso ramo di `StyleTab.tsx` che già raggruppa gli otto prop di
   `section` in `VisualBoxModelInspector` (riconoscimento per insieme di nomi, non per
   `block.type`) — comportamento acquisito gratuitamente dal pattern esistente, zero righe
   nuove nell'Inspector.

## Alternative scartate

- **`SpacingBoxInput` (valori liberi + unità) al posto della scala a token** — componente
  già presente nel codice ma non cablato in nessun punto dell'Inspector reale; introdurrebbe
  una seconda semantica di spaziatura (numero libero + unit) accanto a quella a token già in
  produzione su `section`, per lo stesso motivo già respinto in ADR-33 § "Alternative
  scartate" (nessun vincolo di intervallo dichiarabile con lo schema attuale senza
  `min`/`max` su `NumberPropSpec`). Scartata: incoerenza lessicale fra i due contenitori
  senza un bisogno che la scala a token non copra già.
- **Non aggiungere spacing a `container` in questo round** — rispetterebbe alla lettera
  ADR-39 § 2, ma lascia `container` senza una capacità che `section` ha da ADR-33 e che è
  richiesta esplicitamente da questo task; ADR-39 § 2 la definisce "secondo step", non
  "mai" — questa ADR è quel secondo step.

## Conseguenza

`container.block.ts` guadagna otto `PropSpec` (`enum`, riuso della scala già esistente nel
foglio dei token). Nessun `kind` nuovo, nessuna riga nuova in
`BlockPropSanitizerService`/`BlockTreeValidatorService` (stesso ramo `enum` responsive già
coperto da ADR-29). `Container.tsx`/`Container.module.css` applicano
`resolveResponsiveClassNames` per le otto prop, stesso pattern già in uso in `Section.tsx`
contro `style-tokens.module.css` (le classi `padding*`/`margin*` sono già presenti nel
foglio, riusate senza duplicazione). Rigenerazione obbligatoria `blocks:export` +
`blocks:types` (gate CI `blocks-sync`). Il test di invarianza del registro (ADR-30 § 4)
copre automaticamente le otto prop nuove.
