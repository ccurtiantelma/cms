# Plan — RE-4: Interattività in-canvas per widget a `children` (accordion/tabs/carousel/modalTrigger)

## Richiesta di riferimento
"EAIDOS CMS - REFACTORING CORE / PROMPT RE-4" (testo integrale nel task Orchestrator).

## Documenti letti
`docs/constitution.md` · `docs/business-rules.md` ·
`docs/ai/adr/ADR-53-air-gapped-ssg-zero-db.md` (Approvata) ·
`docs/ai/adr/ADR-57-widget-interattivi-css-only-children.md` (Approvata) ·
`docs/ai/rfc/RFC-57-widget-interattivi-enterprise-css-only.md` ·
`docs/ai/plans/PLAN-widget-interattivi-enterprise.md` (T1-T4 implementati, **T5-T8 non risultano completati**) ·
ispezione diretta (sola lettura) di: i sette componenti in
`app/frontend/src/components/blocks/blocks/{Accordion,AccordionItem,Tabs,TabPanel,Carousel,CarouselSlide,ModalTrigger}Block.tsx`,
`app/frontend/src/components/blocks/BlockRenderer.tsx`,
`app/frontend/src/pages/pages/editor/EditorBlockWrapper.tsx`,
`app/frontend/src/hooks/useBlockEditorStore.ts`,
`app/frontend/src/components/blocks/blocks/{Heading,RichText,Button}.tsx`,
`app/frontend/src/main.tsx` (routing).

---

## Audit strategico

### Falla logica / gap reale rilevato (non dichiarato nella richiesta RE-4, ma decisivo)

**I figli dei sette tipi non sono oggi individualmente editabili nel Canvas, indipendentemente da qualunque "stato attivo".**
`BlockRenderer.tsx` possiede l'intera ricorsione dei `case 'accordion'/'accordionItem'/'tabs'/'tabPanel'/'carousel'/'carouselSlide'/'modalTrigger'` (righe 365-495): i nipoti (`child.children.map(grandChild => <BlockRenderer node={grandChild} />)`) sono montati **senza** passare da `EditorBlockWrapper`, che è invece il solo componente che fornisce selezione, drag&drop, eliminazione, dropzone vuota (`.emptyContainer` + `BlockPalette`) e la prop `editing` che attiva l'editing in-place. Il commento di testa di `BlockRenderer.tsx` lo dichiara esplicitamente per ogni altro contenitore ("l'editor usa `CONTAINER_COMPONENTS` direttamente... dove l'editing non esiste") ma per questi sette tipi lo **stesso identico limite si applica**, perché non sono registrati in `CONTAINER_COMPONENTS` (`EditorBlockWrapper.tsx`, solo `section`/`container`/`form`/`navMenu`). Conseguenza pratica oggi: un `heading`/`richText`/`image`/`button`/`container` messo dentro un `accordionItem`/`tabPanel`/`carouselSlide`/`modalTrigger` **non è selezionabile, non è trascinabile, non è eliminabile e non entra mai in editing in-place** — è markup inerte. Questo è il vero motivo per cui la richiesta RE-4 arriva ora: i punti 1-3 della richiesta, letti insieme, puntano tutti a questo unico buco, non a tre problemi indipendenti.

### Tensione architetturale (punto 2 del compito Orchestrator)

**Opzione (a) — branch `editMode`/`isEditing` nei sette componenti condivisi**: scartata. Introdurrebbe `onClick`/`useState`/`useEffect` esattamente nei file il cui Done criterion di T4 (`PLAN-widget-interattivi-enterprise.md`) recita testualmente *"zero `onClick`/handler React, zero `useState`/`useEffect` nei sette componenti"* — un criterio già verificato e chiuso. Violarlo silenziosamente per un task successivo è la definizione di scorciatoia senza ADR.

**Opzione (b) — due varianti (componente canvas vs componente pubblico)**: non necessaria e rischiosa. Duplicherebbe sette componenti e la loro manutenzione futura (ADR-21 § "un incremento di `v`... resta un deploy a senso unico", moltiplicato su due alberi invece di uno), contro il principio "un tipo, uno schema esplicito" già scelto in ADR-57.

**Opzione reale, non fra quelle proposte dal compito**: **i sette componenti puri restano bit-per-bit invariati** (zero-JS, condivisi editor+pubblico esattamente come oggi); l'interattività "di editing" si ottiene **estendendo l'ownership della ricorsione dei figli da `BlockRenderer` a `EditorBlockWrapper`**, sullo stesso modello già in produzione per `section`/`container`/`form`/`navMenu` (`CONTAINER_COMPONENTS`). Osservazione decisiva: il Canvas **non vive in un `<iframe>`** (commento esplicito in `useBlockEditorStore.ts`: "nessun componente del codebase renderizza il canvas in un iframe") — è DOM reale della pagina admin. Questo significa che il comportamento CSS-only (`<details>/<summary>`, radio-hack `:checked`, `:target`) **già commuta visivamente il pannello attivo oggi, nativamente, senza una riga di JavaScript**, esattamente come nel sito pubblico. Non è quindi affatto scontato che serva "stato React `activeTabId`/`activeSlideIndex`/`isAccordionOpen`" come richiesto testualmente al punto 1: potrebbe bastare rendere selezionabili i figli già mostrati dal CSS nativo. Questo è precisamente il tipo di alternativa che una RFC deve confrontare esplicitamente prima di scegliere, e per questo **non la si assume qui**: è materia della RFC/ADR di T1.

**Conclusione**: questa non è un'estensione compatibile per via di un semplice prop-drilling — è un cambio del confine "chi possiede la ricorsione dei blocchi contenitore" per quattro (cinque, contando `modalTrigger` come contenitore a regione singola) tipi che oggi non lo hanno, in tensione diretta con un Done criterion già approvato. **Serve una ADR prima di implementare** (CLAUDE.md § Architecture Policy: "ogni altra decisione architetturale... cambi di pattern strutturali", nessuna eccezione; Orchestrator § "verifica che ogni decisione architetturale abbia una ADR: se manca, il primo task è produrla").

### Punto 3 della richiesta (editing in-place contentEditable) — già coperto, quasi per intero

`Heading.tsx`, `RichText.tsx`, `Button.tsx` supportano **già** `editable`/`onTextChange`+`onTextInput` / `onHtmlChange`+`onHtmlInput` / `onLabelChange`+`onLabelInput`, attivati da `EditorBlockWrapper.tsx` quando il nodo è `isSelected` (`editing={isSelected ? {...} : undefined}`, righe 1673-1691), con commit su `blur` via `updateBlockPropsAction` (che finisce nel normale salvataggio → sanitizzazione server-side pre-persistenza già in vigore, ADR-20/ADR-21 — **nessun percorso nuovo di persistenza, nessuna nuova regola di sanitizzazione**). Non serve alcuna nuova ADR per questo meccanismo generico: esiste, è già collaudato altrove nell'editor. **Richiedere "doppio click"** come nuovo gate sarebbe un secondo meccanismo di attivazione dell'editing accanto a quello già esistente (attivazione su selezione singola) — ridondante e potenzialmente incoerente in UX. Il solo vero lavoro mancante per questo punto è: far sì che i tre componenti, quando annidati dentro i sette widget, **arrivino ad avere `isSelected`** — che è esattamente il gap architetturale sopra, non un problema di editing in-place in sé.

### Rischi architetturali / Over-engineering (CLAUDE.md: rischio dichiarato concentrato in editor visivo e chatbot)

- **"Doppio click" come nuovo meccanismo di attivazione** duplica quanto già esiste (attivazione su selezione singola, generica per `heading`/`richText`/`button` in tutta la pagina). Rimedio: riusare il meccanismo esistente, non introdurne un secondo — vedi T4 del piano sotto.
- **"Frecce/indicatori del Carosello"** citati al punto 1 della richiesta **non esistono nel markup attuale**: `CarouselSlideBlock.tsx` dichiara esplicitamente "nessun markup di navigazione (frecce/dots) generato qui", per scelta di ADR-57 § 4 (`manual-scroll` = solo scroll/drag nativo + ancora `#slide-N`). Introdurre frecce solo per il Canvas significherebbe inventare un elemento UI mai deciso in ADR-57 — va dichiarato ed eventualmente autorizzato nella stessa RFC di T1, non implementato di riflesso.
- **`modalTrigger` in `BrowserRouter` (non `HashRouter`, verificato in `main.tsx`)**: un click reale su `<a href="#modal-{id}">`/il link "Chiudi" (`href="#"`) dentro il Canvas cambia `location.hash` della vera URL della pagina admin e produce una entry nella cronologia del browser (comportamento nativo del browser per un'ancora, non di React Router) — un effetto collaterale sull'URL/cronologia dell'admin che l'utente non si aspetta editando una pagina. Va deciso esplicitamente (accettato come limite noto, oppure intercettato) nella RFC di T1, non scoperto in produzione.
- **Debito pregresso non risolto**: T5-T8 di `PLAN-widget-interattivi-enterprise.md` (Property Inspector fields, test Vitest dei sette componenti, Bruno/Supertest, gate CI zero-JS) risultano non completati. Costruire ulteriore interattività di Canvas sopra una base ancora priva del proprio gate CI zero-JS (T8) è un rischio diretto: quel gate è lo strumento che avrebbe impedito una regressione zero-JS silenziosa introdotta da questo stesso piano. T6 di questo piano assume esplicitamente quel gate come prerequisito operativo, non lo duplica.

---

## Piano operativo (max 8 task, ordinati per dipendenze)

### T1 — RFC + ADR: ownership della ricorsione e interattività di editing per i widget a `children`
- **Output atteso**: `docs/ai/rfc/RFC-59-interattivita-canvas-widget-children.md`; dopo approvazione umana esplicita, `docs/ai/adr/ADR-59-<titolo-deciso-dall-umano>.md`.
- **Dipendenze**: nessuna.
- **Contenuto minimo richiesto nella RFC** (da confrontare esplicitamente, non assumere):
  1. Chi possiede la ricorsione dei figli di `accordionItem`/`tabPanel`/`carouselSlide`/`modalTrigger` in editor — oggi `BlockRenderer`, mai `EditorBlockWrapper` (gap rilevato in questo audit). Opzione raccomandata: estendere l'analogo di `CONTAINER_COMPONENTS` ai quattro contenitori (e trattare le tre voci + `modalTrigger` come li tratta oggi `section`), **senza toccare** i sette componenti puri di T4.
  2. Se serve un nuovo stato Zustand UI-effimero ("pannello attivo per editing", sul modello già in produzione di `hiddenInCanvasIds`/`hoveredBlockId`: mai persistito, mai sulla history undo/redo) o se il comportamento CSS nativo (`<details>`/radio-hack/`:target`, DOM non in iframe) già commuta il pannello visibile senza bisogno di alcun JS — la RFC deve dimostrare la scelta, non assumerla.
  3. Riconciliazione esplicita col Done criterion di T4 di `PLAN-widget-interattivi-enterprise.md` ("zero `onClick`/`useState`/`useEffect` nei sette componenti"): riconfermato (i sette file restano bit-per-bit invariati) o esplicitamente derogato con motivazione — mai lasciato ambiguo.
  4. Trattamento del click sul trigger/chiusura di `modalTrigger` dentro `BrowserRouter` (side-effect reale su `location.hash`/cronologia del browser admin, verificato in questo audit): limite noto e documentato, oppure mitigazione (es. `preventDefault` solo in modalità editing + toggle di una classe CSS equivalente).
  5. Le "frecce/indicatori" del carousel citate nella richiesta: dichiarare esplicitamente se si introduce nuovo markup solo-Canvas (mai nel sito pubblico, che resta CSS-only per ADR-53) o se si scarta il concetto in favore dello scroll/drag nativo già esistente.
- **Criterio di Done**: RFC scritta con le cinque decisioni sopra esplicite; ADR approvata dall'umano con firma esplicita (stesso pattern di ADR-38/47/50/51/52/53/57), numero **59** (primo libero dopo ADR-58).
- **Agente**: Orchestrator (redige la RFC su questo task; l'approvazione umana la trasforma in ADR — nessun ruolo AI si auto-approva).
- **Stato: COMPLETATO (2026-09-05)** — `docs/ai/rfc/RFC-59-interattivita-canvas-widget-children.md` e `docs/ai/adr/ADR-59-ricorsione-editorblockwrapper-widget-children.md`, Approvata. Decisioni 1/3/5 confermate come da raccomandazione (ownership a `EditorBlockWrapper`, criterio T4 riconfermato senza deroga, nessuna nuova UI di navigazione carousel); decisione 4 = mitigazione (`preventDefault` + classe CSS equivalente); decisione 2 (stato Zustand) **non chiusa qui per scelta esplicita** — demandata a verifica in T2 (CSS nativo) e a T3 solo se necessario, come registrato in ADR-59 § 4.

### T2 — Ownership dei figli dei quattro widget contenitore nel Canvas (secondo la decisione di ADR-59)
- **Output atteso**: `app/frontend/src/pages/pages/editor/EditorBlockWrapper.tsx` (estensione dell'ownership di rendering dei figli per `accordion`/`accordionItem`/`tabs`/`tabPanel`/`carousel`/`carouselSlide`/`modalTrigger`, sul modello esatto di `CONTAINER_COMPONENTS`/`resolveContainerComponentProps`).
- **Dipendenze**: T1 (ADR-59 approvata).
- **Criterio di Done**: un `heading`/`richText`/`image`/`button`/`container` annidato in uno qualunque dei sette tipi è selezionabile, trascinabile, eliminabile nel Canvas esattamente come dentro `container`/`section`; un pannello vuoto (`accordionItem`/`tabPanel`/`carouselSlide`) mostra lo stesso segnaposto già generico "Contenitore vuoto — trascina qui un blocco" + `BlockPalette` (nessun nuovo componente dropzone scritto — soddisfa il punto 2 della richiesta RE-4 riusando l'infrastruttura esistente, coerente con ADR-57 § Conseguenze "nessuna nuova infrastruttura di editing"); **i sette componenti puri di T4 restano bit-per-bit invariati** (diff vuoto su `Accordion*.tsx`/`Tabs*.tsx`/`Carousel*.tsx`/`ModalTrigger*.tsx`, verificato); `npx tsc --noEmit` pulito in `app/frontend`.
- **Agente**: frontend-developer.

### T3 — Stato "pannello attivo" per l'editing (solo se ADR-59 lo richiede)
- **Output atteso**: se ADR-59 conclude che il CSS nativo non basta, estensione di `app/frontend/src/hooks/useBlockEditorStore.ts` con un nuovo slice UI-effimero (mai persistito, mai sulla history undo/redo — stesso principio di `hiddenInCanvasIds`) più il relativo wiring in `EditorBlockWrapper.tsx`. Se ADR-59 conclude il contrario, questo task si chiude come verifica (nessun nuovo codice) con evidenza che il comportamento nativo già soddisfa il punto 1 della richiesta.
- **Dipendenze**: T1, T2.
- **Criterio di Done**: cliccare l'intestazione di un tab / il `<summary>` di un accordion / un'ancora di slide nel Canvas rende visibile e selezionabile il contenuto corrispondente, senza introdurre `onClick`/`useState`/`useEffect` nei sette componenti puri (verificato — invariato rispetto a T2); l'apertura/chiusura di `modalTrigger` segue esattamente la mitigazione o il limite dichiarato in ADR-59 (mai un comportamento scoperto e non documentato sulla cronologia del browser admin).
- **Agente**: frontend-developer.

### T4 — Verifica editing in-place (Heading/RichText/Button) dentro i quattro widget, nessun meccanismo nuovo
- **Output atteso**: nessun nuovo componente. Solo se emergono casi scoperti dalla combinazione con T2/T3, estensione minima e dichiarata in `EditorBlockWrapper.tsx` (il mapping `editing` esistente è già generico per ogni nodo `isSelected`).
- **Dipendenze**: T2, T3.
- **Criterio di Done**: un `heading`/`richText`/`button` annidato in uno dei sette widget, una volta selezionato (via T2), entra in editing in-place con lo **stesso** meccanismo già esistente altrove nell'editor (`editable`/`onTextChange`/`onHtmlChange`/`onLabelChange`, commit su `blur`, sanitizzazione server-side pre-esistente invariata); **nessun meccanismo di attivazione "doppio click" introdotto** — la richiesta è soddisfatta riusando l'attivazione su selezione già in produzione, evitando un secondo meccanismo duplicato (vedi Rischi/Over-engineering).
- **Agente**: frontend-developer.

### T5 — Test Vitest: selezione/dropzone/editing/stato-attivo nei quattro widget
- **Output atteso**: `*.test.tsx` nuovi/estesi accanto a `EditorBlockWrapper` e ai sette componenti (stesso pattern di `NavMenuBlock.test.tsx`/`Container.test.tsx`), copertura dei comportamenti di T2-T4.
- **Dipendenze**: T2, T3, T4.
- **Criterio di Done**: test verde per — click su tab-label cambia pannello visibile e i blocchi al suo interno diventano selezionabili; `<details>` apribile e contenuto interno selezionabile; dropzone vuota di `accordionItem`/`tabPanel`/`carouselSlide` mostra la palette e accetta un drop; editing in-place di un `heading` annidato committa su `blur` via lo store; **test di regressione esplicito**: i sette file di T4 di `PLAN-widget-interattivi-enterprise.md` non contengono `onClick`/`useState`/`useEffect` (asserzione sul sorgente, non solo sul comportamento runtime). `npm run test --workspace=app/frontend` verde.
- **Agente**: test-engineer.

### T6 — Gate CI zero-JS sull'export statico: nessuna fuga di stato di editing nel pubblico
- **Output atteso**: estensione del gate CI zero-JS già pianificato (T8 di `PLAN-widget-interattivi-enterprise.md`, tuttora non completato — questo task **presuppone** quel gate come prerequisito operativo e ne estende la fixture, non lo duplica).
- **Dipendenze**: T2, T3.
- **Criterio di Done**: l'HTML prodotto dal job di export (ADR-53) per una pagina di fixture con tutti e sette i tipi non contiene alcun attributo introdotto da questo piano (nessun `data-active-panel`/equivalente, nessuno `<script>`, nessun `on*`) — bit-per-bit conforme ad ADR-53/ADR-57 come prima di questo piano; il test fallisce deliberatamente se un commit futuro fa trapelare stato di editing nell'export pubblico.
- **Agente**: test-engineer.

---

## Nota sul debito pregresso (non task di questo piano, da segnalare all'umano)

T5-T8 di `PLAN-widget-interattivi-enterprise.md` risultano non completati (Property Inspector, test Vitest dei sette componenti base, Bruno/Supertest, gate CI zero-JS). T6 di questo piano presuppone l'esistenza del gate CI di quel T8: se l'umano conferma che quel task resta non pianificato a breve, va eseguito **prima o contestualmente** a T6 di questo piano, altrimenti T6 costruirebbe un'estensione senza la base che dovrebbe estendere.

---

## Checklist Done globale

### Implementazione
- [x] T1 — RFC-59/ADR-59 approvate (2026-09-05): ownership ricorsione, mitigazione click `modalTrigger`, nessuna nuova UI carousel decise; stato Zustand demandato a verifica T2/T3
- [ ] T2-T6 implementati nell'ordine di dipendenza
- [ ] I sette componenti puri di T4 (`PLAN-widget-interattivi-enterprise.md`) restano bit-per-bit invariati
- [ ] Nessun `any` TypeScript senza commento
- [ ] Nessun `console.log` rimasto

### Test
- [ ] Test Vitest scritti e superati (T5)
- [ ] Gate CI zero-JS esteso e verde (T6, previo completamento del prerequisito T8 di `PLAN-widget-interattivi-enterprise.md`)
- [ ] Nessun test placeholder

### Build e qualità
- [ ] `npx tsc --noEmit` pulito su `app/frontend` (T2-T4)
- [ ] `npm run build --workspace=app/frontend` superata
- [ ] Lint superato

### Contratti e documentazione
- [ ] Nessuna modifica al registro blocchi backend, nessun endpoint nuovo/modificato (piano puramente Canvas/editor) — `openapi:export`/`blocks:export` non necessari
- [ ] ADR-59 approvata resta immutabile una volta firmata; eventuali deviazioni emerse in implementazione vanno in una nuova ADR, mai in una riscrittura

### Commit
- [ ] Commit atomico per task, Conventional Commits
