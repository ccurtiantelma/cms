# ADR-59 — Interattività in-canvas dei widget a `children`: ownership della ricorsione a `EditorBlockWrapper`, mitigazione del click su `modalTrigger`, nessuna nuova UI di navigazione carousel

## Status
[ ] In discussione · [x] **Approvata** · [ ] Rifiutata · [ ] Superseded da ADR-XXX

## Data approvazione
**2026-09-05**, firmata dall'umano in sede di task (stesso pattern di autorizzazione di
ADR-38/47/50/51/52/53/57): l'umano ha risposto direttamente alle tre domande aperte lasciate
da T1 di `docs/ai/plans/PLAN-RE4-interattivita-in-canvas.md`, confermando in risposta a
domanda diretta che questa direttiva tecnica vale come firma formale della decisione.

## RFC di riferimento
`docs/ai/rfc/RFC-59-interattivita-canvas-widget-children.md`.

---

## Decisione

1. **Ownership della ricorsione dei figli, estesa a `EditorBlockWrapper`.** I sette
   componenti puri di `PLAN-widget-interattivi-enterprise.md` T4 (`accordion`/
   `accordionItem`/`tabs`/`tabPanel`/`carousel`/`carouselSlide`/`modalTrigger`, ADR-57)
   restano bit-per-bit invariati, zero-JS, condivisi editor+pubblico. `EditorBlockWrapper.tsx`
   estende `CONTAINER_COMPONENTS`/`resolveContainerComponentProps` ai sette tipi, sullo stesso
   modello già in produzione per `section`/`container`/`form`/`navMenu`: i loro figli
   diventano selezionabili, trascinabili, eliminabili, con la stessa dropzone vuota generica
   già esistente — nessuna nuova infrastruttura di editing.
2. **Click su `modalTrigger` nel Canvas: mitigato.** In edit-mode il click sul trigger e
   sull'ancora di chiusura è intercettato con `preventDefault()` e sostituito da un toggle di
   classe CSS equivalente, senza scrivere su `location.hash` né sulla cronologia della vera URL
   admin (il Canvas non è in iframe ed è montato in `BrowserRouter` reale). Il sito pubblico
   resta `:target` puro, zero-JS, invariato — la mitigazione è confinata al Canvas.
3. **Nessuna nuova UI di navigazione per il carousel.** Le "frecce/indicatori" citate nella
   richiesta RE-4 non si implementano, né nel Canvas né nel pubblico: resta valido solo
   scroll/drag nativo (`transition: manual-scroll`, ADR-57 § 4). Il bisogno reale (editare il
   contenuto delle slide) è soddisfatto per intero dal punto 1.
4. **Stato Zustand UI-effimero per il "pannello attivo": non deciso qui.** Resta esplicitamente
   aperta la domanda se serva un nuovo slice Zustand (sul modello di `hiddenInCanvasIds`/
   `hoveredBlockId`: mai persistito, mai sulla history undo/redo) o se il comportamento CSS
   nativo (`<details>`/radio-hack/`:target`, DOM non in iframe) già commuti il pannello visibile
   senza JS. Da verificare in T2 del piano prima di scrivere nuovo codice; lo stato si introduce
   in T3 solo se quella verifica dimostra che il CSS nativo non basta.

## Alternative scartate

- **Stato React (`useState`/`onClick`) nei sette componenti condivisi** — violerebbe il Done
  criterion già approvato di T4 di `PLAN-widget-interattivi-enterprise.md` ("zero
  `onClick`/handler React, zero `useState`/`useEffect`") e comprometterebbe la garanzia
  zero-JS richiesta dall'export statico pubblico (ADR-53 § 2).
- **Due varianti dello stesso componente (Canvas vs pubblico)** — duplicherebbe sette
  componenti e la loro manutenzione (ogni incremento di `v` diventa un deploy a senso unico
  moltiplicato su due alberi, ADR-21 § 1), contro "un tipo, uno schema esplicito" di ADR-57.
- **Click su `modalTrigger` non mitigato, accettato come limite noto** — a differenza dei
  limiti intrinseci di `:target` già accettati in ADR-57 § 4, l'effetto collaterale su
  `location.hash`/cronologia è evitabile con una `preventDefault()` e non tocca il markup
  pubblico: lasciarlo sarebbe un difetto UX gratuito, non un limite del pattern.
- **Nuove frecce/indicatori carousel, solo nel Canvas** — introdurrebbe un elemento UI mai
  autorizzato da ADR-57 § 4; il bisogno reale è già coperto dal punto 1 di questa decisione.
- **Decidere ora la necessità dello stato Zustand, senza verifica** — il Canvas non è in
  iframe e il CSS nativo può già bastare: assumere lo stato senza verificarlo sarebbe la
  stessa categoria di over-engineering già segnalata per l'editor visivo.

## Conseguenze

- `EditorBlockWrapper.tsx` acquisisce l'ownership di rendering dei figli per i sette tipi;
  `BlockRenderer.tsx` la perde per questi stessi tipi in contesto editor (resta invariato per
  il rendering pubblico/non editor).
- I sette componenti puri (`Accordion*.tsx`/`Tabs*.tsx`/`Carousel*.tsx`/`ModalTrigger*.tsx`)
  restano a diff vuoto — verificabile in CI come regressione zero-JS.
- La mitigazione del click su `modalTrigger` è codice esclusivo del Canvas React (che non ha
  il vincolo zero-JS di ADR-53), mai propagato al job di export statico pubblico.
- Nessun nuovo markup di navigazione carousel in nessuna delle due superfici.
- L'eventuale nuovo slice Zustand (se T2 dimostra che il CSS nativo non basta) segue lo stesso
  principio già in produzione per stato UI-effimero: mai persistito, mai sulla history
  undo/redo.
- Nessuna modifica allo schema blocchi (`v` invariato sui sette tipi di ADR-57), nessun
  endpoint nuovo/modificato, nessuna modifica al registro backend.
