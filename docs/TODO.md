# TODO — CMS

> Elenco operativo ordinato di tutto ciò che serve per portare il CMS dalla base tecnica
> attuale al prodotto completo. È il punto di ingresso per capire **a che punto siamo** e
> **cosa serve decidere prima di procedere**.
>
> Creato il 2026-08-13. Ultimo aggiornamento: **2026-08-20** — **round F04c chiuso**
> (`PLAN-F04c-editor-maturo.md`, T1–T8, RFC v2 approvata): props di stile responsive
> (ADR-29), metadati d'editor nel registro con ispettore a schede + etichette leggibili
> (ADR-30, **chiude la voce 3.10**), rotta pubblica dei media (ADR-27, **chiude la voce
> 1.12**), duplicazione di un blocco e drag & drop reale via `dnd-kit` (ADR-28). Quattro ADR
> di questo round tutte firmate: **ADR-27, ADR-28, ADR-29, ADR-30**. Copertura di test
> chiusa da `test-engineer` (**voce 3.12**, nuova). Voce **1.11** (WYSIWYG rich text,
> ADR-26) resta esplicitamente fuori: confermata rinviata a un round a sé, F04d.
> Precedente: **2026-08-19** — **voce 1.10 chiusa** (anteprima
> di una bozza non pubblicata, ADR-25 firmata, T1–T6 completati); registrate le voci **1.11**
> (WYSIWYG rich text, ADR-26) e **1.12** (lettura pubblica dei media, ADR-27), entrambe in
> discussione, non firmate — bloccano il proseguimento del round F04b oltre quanto già fatto.
> Precedente: registrata la voce **3.10**
> (etichette leggibili delle prop nell'ispettore), tagliata dal round F04b per restare sotto
> il tetto di task e rinviata al giro successivo.
> Precedente: **riconciliazione documentale**: F02 risultava ancora "in esecuzione, T2" qui e "⏳ Pending" nel progress
> tracker, ma T1–T8 di `PLAN-F02-blocchi.md` sono tutti verificati nel repository (registro,
> validatore, migrazioni, sanitizzazione per `kind`, innesto in `pages.service.ts`, contratto
> generato + gate CI, test, componenti di sola lettura) e F04 ne consuma il registro da prima
> della propria chiusura — **F02 è chiusa**, entrambi i documenti allineati.
> Precedente: **F04 chiusa** (T1–T6 di `PLAN-F04-editor-visivo.md` completati, editor a
> blocchi funzionante dentro la scheda "Contenuto" del dettaglio Pagina, copertura di test
> completa — tutte le suite verdi, nessuna modifica al backend necessaria), **F03 chiusa**
> (T1–T7 di `PLAN-F03-superficie-pubblica.md`, `SPEC-F03-superficie-pubblica.md` redatta,
> verifica end-to-end manuale via `curl`), **F01 chiusa** (ADR-18/19/20 firmate, T1–T8
> completati, residui chiusi).
> Aggiornare a ogni passo completato o decisione presa.

## Legenda

| Simbolo | Significato |
|---|---|
| ✅ | **Fatto** — completato e verificabile nel repo |
| 🔍 | **Analizzato** — studiato e proposto per iscritto, serve solo la tua approvazione |
| 🤝 | **Da decidere insieme** — richiede una tua scelta prima che io possa procedere |
| ⏳ | **Da fare** — chiaro cosa fare, si esegue quando arriva il turno |

---

## FASE 0 — Documentazione e governance

| # | Voce | Stato | Note |
|---|---|---|---|
| 0.1 | Audit della cartella `docs/` | ✅ | 36 file scansionati. Nessuno scarto del vecchio gestionale: la duplicazione era il vero problema |
| 0.2 | Eliminazione dei file duplicati (`instructions.md`, `MATRICE_AGENTI.md`, `RUNBOOK.md`) | ✅ | Contenuto preservato in `CLAUDE.md`, `constitution.md`, `GUIDA_UTILIZZO.md` |
| 0.3 | Correzione della tabella porte (era sbagliata in 3 file) | ✅ | Valori reali: 3000 / 5173 / 5435 / 6381 / 8026 |
| 0.4 | Riscrittura `constitution.md` con la nuova identità headless | ✅ | + 3 principi nuovi: Content is Data, Headless by Default, Public Read is a Different Citizen |
| 0.5 | Redazione delle business rules di dominio | ✅ | Sezione prima vuota, ora completa: stati, permessi, slug, revisioni, SEO/GEO, multilingua, media, form, chatbot, cache |
| 0.6 | Riscrittura `glossary.md` con i termini di dominio | ✅ | |
| 0.7 | Riscrittura `system-architecture.md`, `non-functional-requirements.md`, `README.md`, `GUIDA_UTILIZZO.md` | ✅ | |
| 0.8 | Creazione `roadmap.md` (7 pilastri → F01–F12) | ✅ | Con grafo delle dipendenze e fuori scope dichiarato |
| 0.9 | Riscrittura completa di `CLAUDE.md` | ✅ | 670 righe. Ripristinata il 2026-08-13 dopo che una versione condensata (260 righe) aveva perso le definizioni inline dei 4 ruoli e l'intera Testing Policy |
| 0.10 | Conferma di A1: GEO = Generative Engine Optimization | ✅ | Confermata da ccurti il 2026-08-13 |
| 0.11 | Conferma delle assunzioni A2–A6 | ✅ **parziale** | A2, A3, A4 (con correzione ownership), A5 confermate da ccurti il 2026-08-17. **A6 resta aperta** e non blocca: F11 è l'ultima della fila |
| 0.13 | Correzione della regola sulle colonne obbligatorie (`CLAUDE.md`) | ✅ | Riscritta il 2026-08-17: entità mutabili → struttura completa; tabelle append-only → `id`/`guid`/`createdAt`/`createdBy`. Due eccezioni chieste caso per caso sono diventate una regola sola |
| 0.14 | Correzione della contraddizione nella Documentation Policy | ✅ | Risolta il 2026-08-17: progress-tracker e roadmap si aggiornano **a fine feature, su richiesta umana esplicita**, che vale come autorizzazione puntuale |
| 0.12 | Allineamento dei template in `docs/ai/templates/` alle nuove regole | ✅ | Backend: lock ottimistico su `version` (mancava: il template insegnava la sovrascrittura silenziosa). Frontend: confine Mantine ↔ componenti dei blocchi |

---

## FASE 1 — Decisioni architetturali (bloccano il codice)

Ogni voce richiede RFC → approvazione → ADR, come da Architecture Policy. Nessuna è
ancora stata scritta.

| # | ADR da produrre | Blocca | Stato |
|---|---|---|---|
| 1.0 | **Ownership per riga dei permessi editoriali** — `ADR-18-ownership-per-riga.md` | **F01 (T4)** | ✅ Approvata il 2026-08-17 (P1/P2/P3 incluse) |
| 1.1 | **Formato e versionamento dello schema dei blocchi** — `ADR-21-schema-blocchi-versionamento.md` | **F02, F04** | ✅ Approvata il 2026-08-17, con tre integrazioni firmate (migrazioni difensive, policy di rollback, `plainText` verbatim) e i cinque tipi approvati uno per uno |
| 1.2 | Strategia di versionamento/revisioni (snapshot vs. diff) — `ADR-19-revisioni-immutabili.md` | **F01 (T2)** | ✅ Approvata il 2026-08-17 |
| 1.2b | **Sanitizzazione HTML server-side** — `ADR-20`, libreria `sanitize-html` | **F01 (T3)** | ✅ Approvata il 2026-08-17 |
| 1.3 | **Caching e invalidazione del contenuto pubblico** — `ADR-23-caching-invalidazione-pubblica.md` | **F03** | ✅ Approvata il 2026-08-17, con una correzione firmata: un `DEL` fallito non dà più `500` ma `200` + job BullMQ di retry + audit con l'elenco delle chiavi (il `500` lasciava la pubblicazione in uno stato senza uscita) |
| 1.4 | Modello multilingua | F05 | 🔍 A3 confermata il 2026-08-17 (righe autonome + `translationGroupId` opaco); serve ancora l'ADR formale |
| 1.5 | **Routing e risoluzione degli slug** — `ADR-24-routing-risoluzione-slug.md` | **F03** | ✅ Approvata il 2026-08-17. Vincolo procedurale che ne discende: finché F07 non porta i redirect, **non si cambia lo slug di una pagina già indicizzata** |
| 1.6 | Pipeline di trasformazione media e trattamento SVG | F09 | ⏳ Da fare |
| 1.7 | Scelta e confine del provider del chatbot | F11 | 🤝 Richiede una tua decisione su provider, costi e trattamento dati. Legata ad A6, unica assunzione ancora aperta |
| 1.8 | Generazione di sitemap e structured data | F07 | ⏳ Da fare |
| 1.9 | **Consumer HTML pubblico** (SSR / SSG / prerender) — `ADR-22-consumer-html-pubblico.md` | **F03, F07, F08** | ✅ Approvata il 2026-08-17: SSR a richiesta in `app/public-site` (`node:http` + `renderToStaticMarkup`, nessun pacchetto nuovo), componenti dei blocchi condivisi con `app/frontend` per alias di build. **Il vincolo ereditato da ADR-21 resta in vigore e diventa un gate di CI**: ogni renderer escapa `plainText`, verificato sull'HTML prodotto (F03/T6), più il controllo che `dangerouslySetInnerHTML` compaia esattamente una volta in `components/blocks/`. Nota non intuitiva registrata in ADR-22 § 2: gli Error Boundary **non** girano in SSR, quindi sul pubblico la difesa è il rifiuto a monte dell'albero non servibile |
| 1.10 | **Anteprima di una bozza non pubblicata** (meccanismo di token di anteprima) | F04 | ✅ Chiusa il 2026-08-19. `ADR-25-anteprima-bozza-non-pubblicata.md` approvata (JWT dedicato, 15 minuti, `purpose: 'page-preview'`); `PLAN-anteprima-bozza.md` T1–T6 completati: emissione token (`POST app/pages/:guid/preview-token`, ownership+RBAC, audit-logged), lettura dedicata (`GET api/v1/preview/pages/:token`, terzo prefisso accanto ad `app/`/`public/`, nessuna cache Redis, 404 uniforme), rotta `/__preview/:token` in `app/public-site` con `X-Robots-Tag: noindex` sempre, pulsante "Anteprima" nel dettaglio Pagina, copertura di test completa (unit sul token, integration RBAC/ownership/404, Bruno, e2e Playwright su header noindex) |
| 1.11 | **Editor WYSIWYG per il rich text** — `ADR-26-wysiwyg-rich-text.md` | F04d | 🤝 **Ancora in discussione, non firmata.** Confermata fuori dal round F04c (RFC-F04c-editor-maturo.md v2, Decisione 5): resta un round a sé, F04d. Decisione proposta invariata: Tiptap via `@mantine/tiptap` (cinque pacchetti npm nuovi), solo sulle prop `kind: 'richText'`, toolbar vincolata e verificata contro l'allowlist del profilo `basic` da unit test. Nessuna riga di codice finché non è firmata (dipendenza npm pesante, `CLAUDE.md` § Ask first) |
| 1.12 | **Lettura pubblica dei media** (`GET public/media/:guid`) — `ADR-27-lettura-pubblica-media.md` | F04c, F09 | ✅ Approvata e implementata nel round F04c (T4/T8 di `PLAN-F04c-editor-maturo.md`, chiuso il 2026-08-20). Rotta anonima `GET api/v1/public/media/:guid`, solo righe `entity = 'page-media'`, `Content-Type` dedotto dai byte reali contro una tabella chiusa di firme raster scritta in casa (SVG sempre rifiutato — resta 1.6 per la pipeline di trasformazione), nessuna cache Redis, `Cache-Control` immutabile lato HTTP, 404 uniforme (mai 403). Copertura: integration test (mock DB/storage, nessun `AuthMiddleware` montato) e `bruno/media/*.yml` |

---

## FASE 2 — Sviluppo del dominio

Ordine vincolato dalle dipendenze in `docs/roadmap.md`. **Non si salta la fila**: costruire
l'editor o il SEO prima del modello di contenuto significa doverli rifare.

| # | Feature | Pilastro | Stato | Cosa manca |
|---|---|---|---|---|
| 2.1 | **F01 — Gestione Pagine** | fondativa | ✅ | Chiusa il 2026-08-17. T1–T8 completati (ADR-18/19/20 firmate, schema DB approvato, CRUD + macchina a stati + pubblicazione transazionale + revisioni + frontend). Ultimi due residui chiusi nello stesso passaggio: autore esposto in `PageRevisionSummaryDto`/`PageRevisionDetailDto`, dati di verifica T4–T8 soft-eliminati |
| 2.2 | **F02 — Registro e validazione dei Blocchi** | 1 | ✅ | Chiusa (riconciliata il 2026-08-19). T1–T8 di `PLAN-F02-blocchi.md` verificati nel repository: registro dei tipi + validatore, catene di migrazione per nodo/envelope, sanitizzazione per `kind`, innesto nella pipeline di `pages.service.ts`, contratto generato (`blocks:export`/`blocks:types`) + gate CI `blocks-sync`, copertura di test (unit + e2e + Bruno), componenti di sola lettura in `app/frontend/src/components/blocks/` — già consumati da F04 prima che questa voce fosse aggiornata |
| 2.3 | **F03 — Superficie pubblica + cache** | 2, 7 | ✅ | Chiusa il 2026-08-19. T1–T7 di `PLAN-F03` completati: `SPEC-F03-superficie-pubblica.md` redatta (residuo T1); API pubblica, cache/invalidazione, test T4, `app/public-site` SSR T5, invariante di escaping + test T6 (con i due bug corretti: `writeHead` prima del render, `TS5103` su `tsconfig.json`), Docker/compose/script root T7. Verifica end-to-end manuale eseguita: pagina pubblicata dall'admin e letta via `curl` senza JavaScript |
| 2.4 | **F04 — Editor visivo (page builder)** | 1 | ✅ | Chiusa il 2026-08-19 (F04, T1–T6), **estesa e chiusa di nuovo il 2026-08-20 dal round F04c** (`PLAN-F04c-editor-maturo.md`, T1–T8, RFC v2 approvata): motore dell'albero + store Zustand, shell dell'editor con salvataggio bozza, palette e ispettore **generati dal registro** (un solo componente per tutti i tipi), canvas con selezione/riordino/eliminazione sopra l'unico `BlockRenderer` di F02. **F04c aggiunge**: sette props di stile responsive a token chiusi (`{ default, tablet?, mobile? }`, `enum` con modificatore `responsive`, nessun `kind`/`reason` nuovo, `v` invariato — ADR-29), metadati d'editor unificati nel registro con ispettore a schede Contenuto/Stile ed etichette leggibili (ADR-30, **chiude anche la voce 3.10**), rotta pubblica di lettura dei media (ADR-27, voce 1.12), duplicazione di un blocco (id rigenerati a ogni profondità, limite `MAX_NODES` avvisato prima dell'inserimento) e drag & drop reale via `dnd-kit` con sensore da tastiera e tre segni di rilascio distinti (peer dependency React 19 verificata in T1, nessun override). Quattro ADR di questo round tutte approvate: **ADR-27, ADR-28 (libreria drag & drop), ADR-29, ADR-30**. **Scostamento dal piano ereditato da F04**: l'editor non è una rotta separata ma la scheda "Contenuto" del dettaglio, e si pubblica dalla tendina di stato dell'intestazione. **Limiti noti, dichiarati e non debito aperto**: `richText` resta HTML grezzo (WYSIWYG rinviato a F04d, ADR-26 non firmata, voce 1.11); il campo `mediaRef` dell'ispettore resta disabilitato (nessuna libreria media, F09) — di conseguenza l'`src` di un blocco `image` non è verificabile da un giro E2E che passi solo dal browser, solo dall'API/round-trip a database; anteprima responsive assente (nessuno vede oggi i breakpoint `tablet`/`mobile` salvati, senza controllo UI per scriverli — solo `default` è compilabile dall'ispettore, gli altri due sono scrivibili solo via API/import); colonne, annidamento di `section`, navigator e schermo intero fuori scope (F04d) |
| 2.5 | F05 — Multilingua | 4 | ⏳ | Dipende da 1.4 e F01. Da fare presto: aggiungerla a sito popolato costa migrazioni |
| 2.6 | F06 — Template e Sezioni globali | 1 | ⏳ | Dipende da F02 |
| 2.7 | F07 — SEO per pagina | 2 | ⏳ | Dipende da 1.8, F03, F05 |
| 2.8 | F08 — GEO per pagina | 2 | ⏳ | Dipende da F07. Ambito confermato: `aiSummary`, `keyFacts`, `faq`, `entities`, `aiPolicy`, `llms.txt` |
| 2.9 | F09 — Media editoriali | 6 | ⏳ | Dipende da 1.6 e F02. Si appoggia al `FilesModule` esistente |
| 2.10 | F10 — Moduli di contatto | 3 | ⏳ | Dipende da F02, F03 |
| 2.11 | F11 — Chatbot integrato | 7 | ⏳ | Dipende da 1.7, F03, F08 |
| 2.12 | F12 — Dashboard editoriale | 5 | ⏳ | Dipende da F01, F10. Volutamente in fondo: è una vista su dati che devono esistere prima |

---

## FASE 3 — Debito da chiudere

| # | Voce | Stato | Note |
|---|---|---|---|
| 3.1 | ADR-13 (sessioni/dispositivi) in attesa di approvazione | 🤝 | Codice già in produzione, manca la firma |
| 3.2 | ADR-17 (Zustand) in attesa di approvazione | 🤝 | Codice già implementato e verificato, manca la firma |
| 3.3 | ADR-4 disallineata dal codice (descrive fino a `version: 7`, il codice è oltre) | 🤝 | Va chiusa con una **nuova** ADR, non riscrivendo quella approvata |
| 3.4 | `exceljs@4.4.0` porta un `uuid` con vulnerabilità moderata (transitiva) | ⏳ | Da monitorare, nessuna versione upstream la risolve oggi. Vedi ADR-10 |
| 3.5 | ADR-5, ADR-6, ADR-15 rinviano a file eliminati | ✅ | Non correggibile (ADR immutabili). Mappa dei rinvii in `progress-tracker.md` |
| 3.6 | `AdminService` verifica l'unicità email con una `SELECT` preventiva (`admin.service.ts:187-191,264`) invece di intercettare il vincolo univoco, in violazione di `CLAUDE.md` § Backend ("unicità slug da constraint DB → 409, mai SELECT preventiva") | 🤝 | Debito preesistente a F01, non nato con `pages`. F01 (T3) ha introdotto `app/backend/src/common/db-error.mapper.ts`, riusabile per questo caso, ma **non ha rifattorizzato `AdminService`**: fuori scope del task. Va ripreso a sé, sostituendo la `SELECT` con l'`unique` constraint su `users.email` + `mapPgError` |
| 3.7 | Il gate CI `backend-e2e` (`.github/workflows/ci.yml`) girava su Postgres/Redis reali senza `continue-on-error`, ma scattava solo su `pull_request` — mai su push diretto a `main`/`develop`, il flusso reale con cui questo repo è avanzato finora | ✅ | Chiuso il 2026-08-17, su autorizzazione esplicita: aggiunto `push: branches: [main, develop]` al trigger del workflow, accanto a `pull_request`. Un push diretto ora attiva lo stesso gate di una PR |
| 3.8 | **Debito UI** — "Pagina genitore" (`PagePageDetail.tsx:612-616`, scheda Metadati) è un `TextInput` libero che pretende un guid di 16 caratteri esadecimali scritto a mano | ⏳ | Emerso dall'uso reale il 2026-08-19, **non è un task di F04**: la scheda Metadati è F01, l'editor non la tocca. Deve diventare una tendina con i **titoli** delle pagine (`Select` Mantine, `value` = guid, `label` = titolo), alimentata dall'elenco già esposto da `GET api/v1/app/pages`. Da chiarire quando si affronta, non ora: esclusione della pagina stessa e dei suoi discendenti dalle opzioni (un genitore ciclico oggi è impedito solo lato server), e comportamento oltre le prime N pagine (l'elenco è paginato). Nessun endpoint nuovo previsto |
| 3.9 | **Debito UI** — il campo Locale (`PagePageDetail.tsx:605-610`) rende `it-IT` con il grigio del testo disabilitato, che si legge come placeholder "campo vuoto" invece che come valore reale | ⏳ | Emerso dall'uso reale il 2026-08-19, **non è un task di F04**. Il campo è correttamente bloccato (il locale non è modificabile dopo la creazione, F05): il difetto è solo di resa. Va mostrato come valore leggibile — dato in sola lettura anziché `TextInput disabled`, oppure `readOnly` al posto di `disabled` — conservando la descrizione "Non modificabile dopo la creazione (F05)". Stesso trattamento da valutare per ogni altro campo bloccato che espone un valore vero |
| 3.11 | **Upgrade editor F04b — copertura di test** — undo/redo esposto in UI (scorciatoie `Ctrl+Z`/`Ctrl+Shift+Z`/`Ctrl+Y`, pulsanti), guardia sulle modifiche non salvate (`useUnsavedChangesGuard`, `beforeunload` + intercetto dei click di navigazione interna), inserimento posizionale ("Inserisci sopra/sotto" in `EditorBlockWrapper`), `moveNodeTo`/indent-outdent fra contenitori sono ora coperti da test | ✅ | Chiuso il 2026-08-20 da `test-engineer`. File toccati: `useBlockEditorStore.test.ts` e `block-tree.utils.test.ts` (estesi), `useUnsavedChangesGuard.test.tsx` (nuovo), `page-editor-undo-redo.spec.ts` (nuovo e2e Playwright), `e2e/tests/helpers/page-editor.ts` (esteso). Suite: 152 test, 8 file, tutti verdi. Due limiti dichiarati, non debito aperto: nessun history-limit implementato nel codice (non testato perché non esiste), `beforeunload` non è testabile in jsdom né in Playwright (limite della piattaforma di test, non del codice — copre solo l'intercetto di navigazione interna) |
| 3.10 | **Rifinitura editor** — l'ispettore delle proprietà mostra il **nome tecnico** della prop (`html`, `mediaRef`, `alt`, `level`) come etichetta del campo: `propLabel()` in `PropertyInspector.tsx` restituisce `prop.name` perché il registro dei blocchi non porta alcuna etichetta leggibile | ✅ | **Chiusa il 2026-08-20 dal round F04c** (T3/T6 di `PLAN-F04c-editor-maturo.md`, ADR-30 approvata). L'etichetta vive ora nei **metadati d'editor del registro** (`meta.props[nome].label`, opachi alla validazione, ADR-21 § 2 + ADR-30 § 1), compilata per ogni prop di ogni tipo — nessuna mappa scritta a mano nel frontend. `propLabel()` in `PropertyInspector.tsx` legge da lì; il nome tecnico resta solo un fallback per un difetto del registro (un test d'invariante fallisce se una prop dichiarata non ha voce in `meta.props`, così il debito non si riapre alla prossima prop nuova) |
| 3.12 | **Round F04c — copertura di test** (T8 di `PLAN-F04c-editor-maturo.md`): round-trip responsive, unicità degli id dopo duplicazione, `canDropInto`, rotta pubblica dei media, drag & drop e duplicazione E2E | ✅ | Chiuso il 2026-08-20 da `test-engineer`. **Backend**: `pages-blocks-responsive-roundtrip.e2e-spec.ts` (nuovo, POST→GET→PATCH→GET reale su Postgres/Redis — non eseguito in questo passaggio per assenza di un'istanza Postgres/Redis del progetto raggiungibile nel sandbox, verificato da revisione + `tsc`, stesso pattern di `pages-blocks.e2e-spec.ts` già verde in CI); `public-media.e2e-spec.ts` (nuovo, nessun test esisteva prima per questa rotta — 7/7 verdi, eseguito); `bruno/media/*.yml` (nuovo). **Frontend**: `block-tree.utils.test.ts` esteso (unicità id di `duplicateSubtree` su tre livelli, inverso `removeBlock`), `useBlockEditorStore.test.ts` esteso (`duplicateNodeAction`: selezione, undo, rifiuto oltre `MAX_NODES`), `block-registry.utils.test.ts` (nuovo, `canDropInto` — solo i casi nuovi, non la matrice già coperta da `canContainType`/`moveNodeTo`); tutti eseguiti, 111 test verdi sui quattro file toccati/nuovi (il round-trip responsive dell'ispettore, T6, era già coperto). **E2E**: `page-editor-drag-and-drop.spec.ts` (nuovo: duplicazione da toolbar + drag & drop da tastiera sui tre casi prima/dopo/dentro) e correzione di `e2e/tests/helpers/page-editor.ts` (cercava le prop per nome tecnico, invalidato da T6/ADR-30 — ora risolve l'etichetta leggibile dal registro generato) — **non eseguiti** in questo passaggio (richiedono backend+frontend avviati, assenti nel sandbox), verificati con `tsc --noEmit`. **Bug/limiti segnalati, non corretti da questo ruolo**: l'`src` di un blocco `image` non è verificabile da un giro E2E via browser (il campo `mediaRef` dell'ispettore è disabilitato, F09 non costruita — coperto solo dal round-trip a database); nessun `data-testid` sui campi dell'ispettore, task minimo consigliato per backend/frontend-developer (proposta, non eseguita) |

---

## Decisioni aperte — servono da te

Queste sono le uniche cose che mi bloccano davvero. Ognuna è ribaltabile **ora** a costo
zero; dopo tre feature costa migrazioni di dati.

### D1 — Assunzioni: **chiusa per A2–A5** il 2026-08-17

| # | Domanda | Esito |
|---|---|---|
| A2 | Il contenuto è un albero di blocchi JSON validato, o HTML salvato dall'editor? | ✅ Blocchi JSON — era già l'architettura |
| A3 | Le traduzioni sono pagine autonome o campi affiancati? | ✅ Pagine autonome legate da `translationGroupId` (colonna opaca, non tabella) |
| A4 | Servono ruoli editoriali dedicati o bastano le 4 soglie esistenti? | ✅ Bastano le 4 esistenti, **con** un controllo di ownership per riga (ADR-18) |
| A5 | Una installazione = un sito, o più siti nella stessa installazione? | ✅ **Un sito, più lingue.** Nessun `siteId`; l'unico innesto futuro previsto è `Utils.applyScopeFilter` |
| A6 | Il chatbot risponde solo sui contenuti del sito o è un assistente generalista? | ⏳ **Aperta** — non blocca: F11 è l'ultima della fila |

### D1b — Le tre firme che bloccavano il primo commit di codice di F01 — chiusa il 2026-08-17

| # | Documento | Serviva per | Esito |
|---|---|---|---|
| 1 | `ADR-18-ownership-per-riga.md` | T2 (indice `created_by`) e T4 (tutto l'impianto dei permessi) | ✅ Approvata |
| 2 | `ADR-19-revisioni-immutabili.md` | T2 (schema `page_revisions`) | ✅ Approvata |
| 3 | RFC sanitizzazione + approvazione della dipendenza npm (`ADR-20`) | T3, e quindi ogni percorso di persistenza di contenuto | ✅ Approvata |

Schema DB approvato a parte, come richiesto da `CLAUDE.md` § Ask first.

### D2 — Provider del chatbot (voce 1.7)

Serve una tua scelta su: quale provider, che budget mensile, dove finiscono le
conversazioni degli utenti, per quanto tempo si conservano. Senza queste risposte F11 non
è progettabile — e resta comunque l'ultima della fila.

### D3 — Firme mancanti (voci 3.1, 3.2)

ADR-13 e ADR-17 descrivono codice **già in produzione**. Servono solo approvate o
rifiutate. Se rifiutate, il codice va rimosso.

---

## Prossimo passo consigliato

F02, F03, F04 (con l'estensione del round F04c) e la voce 1.10 (anteprima bozza) sono
chiuse: il registro dei blocchi, l'editor visivo — ora con stile responsive, metadati
d'editor, duplicazione e drag & drop —, la superficie pubblica (con la lettura dei media,
voce 1.12) e l'anteprima di una bozza esistono, funzionano e si possono usare per costruire
e rivedere una Pagina vera dall'inizio alla fine.

1. **Firmare ADR-26** (voce 1.11) prima di scrivere qualunque riga della sua parte di
   codice: WYSIWYG del rich text è l'unica decisione di questa linea ancora in discussione,
   rinviata a un round a sé (F04d) insieme a colonne, annidamento di `section`, navigator e
   schermo intero.
2. **Anteprima responsive** (RFC-F04c-editor-maturo.md § A.5 scarto 5): il round F04c
   produce props per breakpoint (`tablet`/`mobile`) che oggi nessuno può vedere né scrivere
   dall'interfaccia — solo `default` ha un controllo nell'ispettore, gli altri due sono
   raggiungibili solo via API. Primo candidato del giro successivo, va tracciato invece di
   restare fuori radar.

Restano aperte, senza bloccare: **A6** (chatbot, F11 è ultima della fila), l'**ADR formale
sul modello multilingua** (voce 1.4, A3 già confermata), le firme di **ADR-13 e ADR-17**
(voci 3.1/3.2), il **debito UI** delle voci 3.8/3.9 e la **potatura delle Revisioni**,
che va sciolta prima che esista contenuto in volume. **Task minimo consigliato, non ancora
proposto formalmente**: `data-testid` stabili sui campi di `PropertyInspector.tsx` — oggi
gli E2E li individuano per etichetta leggibile (`meta.props[nome].label`), che è un
accoppiamento più fragile di un attributo dedicato.

**Decisione ancora aperta, ora osservata due volte** — rate limit differenziato fra
`/auth/*` e la superficie amministrativa `app/*` (oggi quest'ultima non ne ha nessuno).
Emersa la prima volta durante le verifiche T4–T8 di F01 (429 su `/auth/login` durante i test
manuali), poi di nuovo durante T6 di F04: il limite di 5 tentativi al minuto per IP su
`/auth/login` ha fatto fallire la suite Playwright con una login per test, e ha richiesto di
introdurre un progetto `setup` (`e2e/tests/admin.setup.ts`) che autentica una volta sola e
riusa lo `storageState`. **Osservazione diretta, non solo teorica**: 5/minuto per IP è
stretto sia per l'uso reale (un admin che sbaglia MFA due volte e riprova rimane fuori) sia
per l'automazione dei test, che senza l'aggiramento del `setup` non riesce a girare per
intero. La domanda non è più solo "serve differenziare" ma "il valore stesso di 5/minuto va
alzato per l'uso amministrativo" — resta una decisione umana, non bloccante ma che si è
ripresentata due volte in due feature diverse.

### Debito documentale ancora aperto (segnalato, non sanato)

- Le quattro tabelle **mutabili** esistenti non hanno `version`: divergenza dalla regola di
  `CLAUDE.md`, allineamento come task a sé, mai dentro una feature di dominio
- `audit_log` usa FK `onDelete:'set null'` dove `CLAUDE.md` prescrive `restrict`
- `createdAt`/`updatedAt` sono nullable su tutte le tabelle esistenti, mentre le nuove
  nascono `.notNull()`
- Nessuna gestione del codice PG `23505` esiste oggi nel repository: la mappatura
  constraint → `409` va costruita in F01 (T3), altrimenti uno slug duplicato risponde `500`
