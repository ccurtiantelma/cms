# RFC-59 — Interattività in-canvas per i widget a `children` (accordion/tabs/carousel/modalTrigger): ownership della ricorsione, mitigazione del click su `modalTrigger`, nessuna nuova UI di navigazione carousel

## Status
[ ] In discussione · [x] Approvato → genera ADR-59 · [ ] Rifiutato

## Proposto da
AI Orchestrator · Data: 2026-09-05

---

## Problema

`docs/ai/plans/PLAN-RE4-interattivita-in-canvas.md` (T1) rileva che i figli dei sette tipi
`accordion`/`accordionItem`/`tabs`/`tabPanel`/`carousel`/`carouselSlide`/`modalTrigger`
(ADR-57) non sono oggi individualmente selezionabili/trascinabili/editabili nel Canvas: la
loro ricorsione è oggi posseduta da `BlockRenderer.tsx` (righe 365-495), non da
`EditorBlockWrapper.tsx`, che è il solo componente a fornire selezione, drag&drop,
eliminazione, dropzone vuota ed editing in-place — esattamente come già accade per
`section`/`container`/`form`/`navMenu` tramite `CONTAINER_COMPONENTS`/
`resolveContainerComponentProps`. Estendere quel confine è un cambio architetturale
("chi possiede la ricorsione dei blocchi contenitore") in tensione diretta con il Done
criterion già approvato di T4 di `PLAN-widget-interattivi-enterprise.md` ("zero
`onClick`/`useState`/`useEffect` nei sette componenti puri") — da qui l'obbligo di ADR
prima di implementare (CLAUDE.md § Architecture).

A questa tensione si aggiungono due questioni concrete emerse nello stesso audit, mai
menzionate nella richiesta RE-4 originale ma decisive per l'implementazione:

1. Il Canvas **non vive in un `<iframe>`** (`useBlockEditorStore.ts`: "nessun componente
   del codebase renderizza il canvas in un iframe") ed è montato dentro un `BrowserRouter`
   reale (verificato in `main.tsx`, non `HashRouter`). Un click reale su
   `<a href="#modal-{id}">`/l'ancora di chiusura di `modalTrigger` produce un side-effect
   nativo del browser su `location.hash` e sulla cronologia della vera URL admin — un
   comportamento che l'utente non si aspetta editando una pagina, mai deciso finora.
2. La richiesta RE-4 cita "frecce/indicatori" per il carousel, ma `CarouselSlideBlock.tsx`
   dichiara esplicitamente "nessun markup di navigazione generato qui", per scelta di
   ADR-57 § 4 (`manual-scroll` = solo scroll/drag nativo). Introdurre frecce solo nel
   Canvas significherebbe inventare un elemento UI mai autorizzato da ADR-57.

Questa RFC non riparte da zero su questi tre punti: l'umano ha già risposto direttamente,
in sede di task, alle tre domande che l'audit di T1 lasciava aperte. Il documento le
registra come decisione formale, confronta esplicitamente le alternative scartate e
lascia esplicitamente aperta, per verifica in fase di implementazione, la sola domanda
che l'umano non ha chiuso: se serva un nuovo stato Zustand UI-effimero per il "pannello
attivo" o se il CSS nativo (DOM non in iframe) già basti.

---

## Soluzione proposta

### 1. Ownership della ricorsione dei figli: estendere `EditorBlockWrapper`

I sette componenti puri di `PLAN-widget-interattivi-enterprise.md` T4 (`Accordion*.tsx`/
`Tabs*.tsx`/`Carousel*.tsx`/`ModalTrigger*.tsx`) **restano bit-per-bit invariati**:
zero-JS, condivisi editor+pubblico, esattamente come oggi. Il gap si chiude non nei
componenti ma nel confine "chi renderizza i loro figli in editor": `EditorBlockWrapper.tsx`
estende `CONTAINER_COMPONENTS`/`resolveContainerComponentProps` ai sette tipi, sullo
stesso modello già in produzione per `section`/`container`/`form`/`navMenu`. Ne segue,
senza alcun nuovo componente di dropzone: un `heading`/`richText`/`image`/`button`/
`container` annidato in uno qualunque dei sette tipi diventa selezionabile, trascinabile,
eliminabile, e un pannello vuoto mostra lo stesso segnaposto generico "Contenitore vuoto —
trascina qui un blocco" + `BlockPalette` già esistente altrove.

Questa scelta riconferma esplicitamente, senza deroga, il Done criterion di T4 di
`PLAN-widget-interattivi-enterprise.md`: nessun `onClick`/`useState`/`useEffect` entra nei
sette componenti puri per effetto di questa RFC.

### 2. Click su `modalTrigger` nel Canvas: mitigato, non lasciato come limite noto

In edit-mode, il click sul trigger (`<a href="#modal-{id}">`) e sull'ancora di chiusura
(`href="#"`) è intercettato con `preventDefault()` e sostituito da un toggle di una classe
CSS equivalente (stesso effetto visivo di apertura/chiusura del pannello `:target`, senza
alcuna scrittura su `location.hash` né voce di cronologia della vera URL admin). Il sito
pubblico (`app/public-site`) resta interamente `:target` puro, zero-JS, invariato — la
mitigazione è un comportamento esclusivo del Canvas React (che già non ha il vincolo
zero-JS di ADR-53, § Conseguenze di ADR-57), mai propagata all'export statico.

### 3. Nessuna nuova UI di navigazione per il carousel

Il punto 1 della richiesta RE-4 relativo a "frecce/indicatori" del carousel non introduce
nuovo markup, né nel Canvas né nel pubblico: resta valido solo scroll/drag nativo
(`manual-scroll`, ADR-57 § 4). Il requisito reale dietro quella riga della richiesta —
poter interagire con il contenuto delle slide in editing — è soddisfatto per intero dalla
decisione 1 (figli delle `carouselSlide` selezionabili/editabili), senza alcun controllo
di navigazione aggiuntivo.

### 4. Domanda aperta, non decisa qui: serve un nuovo stato Zustand UI-effimero?

L'audit di T1 osserva che il Canvas, non essendo in iframe, riceve già gratuitamente il
comportamento nativo di `<details>/<summary>`, del radio-hack (`:checked ~`) e di
`:target` per commutare visivamente il pannello attivo — esattamente come nel pubblico.
Non è quindi scontato che serva un nuovo slice Zustand ("pannello attivo per editing", sul
modello di `hiddenInCanvasIds`/`hoveredBlockId`: mai persistito, mai sulla history
undo/redo) per far sì che i figli del pannello visibile diventino selezionabili in `T2`.
**Questa RFC non decide la domanda**: la registra esplicitamente come **da verificare in
fase di implementazione** (T2 prima — verifica se il CSS nativo già basta; T3 introduce lo
stato Zustand solo se quella verifica dimostra che non basta). Introdurre lo stato per
precauzione, senza prima verificare il comportamento nativo, sarebbe la stessa scorciatoia
già scartata al punto 1 (stato aggiunto per abitudine invece che per necessità dimostrata).

---

## Alternative valutate

- **Stato React (`useState`/`onClick`) nei sette componenti condivisi** — scartata:
  violerebbe direttamente il Done criterion già approvato di T4 di
  `PLAN-widget-interattivi-enterprise.md` ("zero `onClick`/handler React, zero
  `useState`/`useEffect` nei sette componenti"), un criterio verificato e chiuso.
  Introdurlo silenziosamente per un task successivo sarebbe una scorciatoia senza ADR — e
  comprometterebbe la garanzia zero-JS che gli stessi componenti devono mantenere quando
  riusati nell'export statico pubblico (ADR-53 § 2).
- **Due varianti dello stesso componente (una per il Canvas, una per il pubblico)** —
  scartata: duplicherebbe sette componenti e la loro manutenzione futura (ogni incremento
  di `v` diventa un deploy a senso unico moltiplicato su due alberi, ADR-21 § 1), contro il
  principio "un tipo, uno schema esplicito" già scelto in ADR-57.
- **Click su `modalTrigger` non mitigato, accettato come limite noto e documentato** —
  scartata: a differenza dei limiti di accessibilità già accettati in ADR-57 § 4 (nessun
  focus trap, nessuna chiusura da Escape — limiti del pattern `:target` in sé, non
  aggirabili senza JS), qui l'effetto collaterale è evitabile con una singola
  `preventDefault()` e non tocca in alcun modo il markup pubblico zero-JS: lasciarlo
  irrisolto sarebbe un difetto UX gratuito nell'admin, non un limite intrinseco del
  pattern CSS-only.
- **Nuove frecce/indicatori di navigazione per il carousel, solo nel Canvas** — scartata:
  introdurrebbe un elemento UI mai autorizzato da ADR-57 § 4 (`manual-scroll` = solo
  scroll/drag nativo), e la motivazione reale della richiesta RE-4 (poter editare il
  contenuto delle slide) è già soddisfatta dalla decisione 1 senza bisogno di nuovo
  markup né nel Canvas né, tantomeno, nel pubblico.
- **Decidere ora se serve lo stato Zustand, invece di verificarlo in T2/T3** — scartata:
  il Canvas non è in iframe e il comportamento CSS nativo può già bastare; assumere la
  necessità dello stato senza prima verificarlo sarebbe la stessa categoria di
  over-engineering già segnalata nell'audit di T1 per l'editor visivo.

## Impatto

- `EditorBlockWrapper.tsx`: estensione di `CONTAINER_COMPONENTS`/
  `resolveContainerComponentProps` ai sette tipi — nessuna nuova infrastruttura di
  editing, riuso di palette/dropzone/drag&drop già generici.
- `Accordion*.tsx`/`Tabs*.tsx`/`Carousel*.tsx`/`ModalTrigger*.tsx` (i sette componenti
  puri di T4): **zero modifiche**, diff vuoto atteso, verificabile in CI.
- `ModalTrigger` in edit-mode: gestione locale del click (`preventDefault` + classe CSS)
  confinata al Canvas — nessuna modifica al template di export statico pubblico.
- Nessun nuovo markup di navigazione per il carousel, né Canvas né pubblico.
- `useBlockEditorStore.ts`: **eventuale** estensione con uno slice UI-effimero, subordinata
  alla verifica di T2 — non decisa da questa RFC, decisione operativa rinviata a T2/T3 del
  piano.
- Nessuna modifica allo schema blocchi (`v` invariato sui sette tipi), nessuna modifica al
  registro backend, nessun endpoint nuovo/modificato — piano puramente Canvas/editor.

## Rischi

- **Interferenza fra la mitigazione del click e il comportamento CSS nativo**: la classe
  CSS equivalente deve produrre esattamente lo stesso stato visivo che `:target`
  produrrebbe nativamente, altrimenti il Canvas diverge dal pubblico — da verificare
  esplicitamente in T3, non assunto.
- **Verifica del CSS nativo rimandata a T2/T3**: se la verifica dimostra che serve
  comunque lo stato Zustand, il costo si sposta da questa RFC a T3 del piano — accettato
  esplicitamente come parte della decisione di non assumere la risposta ora.
- **Debito pregresso** (T5-T8 di `PLAN-widget-interattivi-enterprise.md` non completati,
  in particolare il gate CI zero-JS di T8): resta esterno a questa RFC, già segnalato nel
  piano come nota all'umano, non introdotto qui.

## Decisione umana

**Esito**: [x] Approvato · [ ] Rifiutato · [ ] Modificato

**Ownership della ricorsione dei figli**: [x] Estendere `EditorBlockWrapper`
(`CONTAINER_COMPONENTS`/`resolveContainerComponentProps` ai sette tipi) · [ ] Altro

**Click su `modalTrigger` nel Canvas**: [x] Mitigare (`preventDefault` + classe CSS
equivalente) · [ ] Accettare come limite noto e documentato · [ ] Altro

**Frecce/indicatori carousel**: [x] Nessuna nuova UI di navigazione, solo scroll/drag
nativo · [ ] Introdurre frecce solo nel Canvas · [ ] Altro

**Stato Zustand UI-effimero per il pannello attivo**: [ ] Deciso ora · [x] Da verificare in
fase di implementazione (T2 prima, T3 solo se il CSS nativo non basta) — non assunto da
questa RFC/ADR.

**Note**: risposte fornite direttamente dall'umano alle tre domande aperte lasciate da T1,
con lo stesso pattern di approvazione già usato per ADR-38/47/50/51/52/53/57 (risposta a
domanda diretta vale come firma formale della decisione, ADR-57 § Data approvazione per il
precedente esatto).

**Approvato da**: marketing@antelmagroup.net · **Data**: 2026-09-05

**Azione successiva**: [x] Genera ADR-59 · [ ] Archivio
