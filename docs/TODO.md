# TODO — CMS

> Elenco operativo ordinato di tutto ciò che serve per portare il CMS dalla base tecnica
> attuale al prodotto completo. È il punto di ingresso per capire **a che punto siamo** e
> **cosa serve decidere prima di procedere**.
>
> Creato il 2026-08-13. Ultimo aggiornamento: **2026-08-17** — **F01 chiusa** (ADR-18/19/20
> firmate, T1–T8 completati, residui chiusi), **ADR-21 firmata**: voce 1.1 chiusa, e
> **SPEC-F02-blocchi.md approvata** da ccurti: T1 di `PLAN-F02-blocchi.md` chiuso senza residui,
> F02 in esecuzione da T2 (registro dei tipi + interprete di validazione, backend-developer).
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

---

## FASE 2 — Sviluppo del dominio

Ordine vincolato dalle dipendenze in `docs/roadmap.md`. **Non si salta la fila**: costruire
l'editor o il SEO prima del modello di contenuto significa doverli rifare.

| # | Feature | Pilastro | Stato | Cosa manca |
|---|---|---|---|---|
| 2.1 | **F01 — Gestione Pagine** | fondativa | ✅ | Chiusa il 2026-08-17. T1–T8 completati (ADR-18/19/20 firmate, schema DB approvato, CRUD + macchina a stati + pubblicazione transazionale + revisioni + frontend). Ultimi due residui chiusi nello stesso passaggio: autore esposto in `PageRevisionSummaryDto`/`PageRevisionDetailDto`, dati di verifica T4–T8 soft-eliminati |
| 2.2 | **F02 — Registro e validazione dei Blocchi** | 1 | ⏳ **In esecuzione — T2** | T1 chiuso: ADR-21 firmata e `SPEC-F02-blocchi.md` approvata da ccurti il 2026-08-17. In corso T2 (registro dei tipi + interprete di validazione, backend-developer). Vedi `docs/ai/plans/PLAN-F02-blocchi.md` |
| 2.3 | F03 — Superficie pubblica + cache | 2, 7 | ⏳ | T2–T7 di `PLAN-F03` chiusi (API pubblica, cache/invalidazione, test T4, `app/public-site` SSR T5, invariante di escaping + test T6 completo, Docker/compose/script root T7). Residuo unico: `SPEC-F03-superficie-pubblica.md` (T1) non ancora redatta/approvata — gate esplicito di chiusura in `PLAN-F03`. Nota tecnica non bloccante per F03 ma da correggere: lo step "Typecheck" del job CI `public-site` fallisce (`TS5103`, `tsconfig.json` di `app/public-site` con `ignoreDeprecations: "6.0"` incompatibile col `typescript@5.9.3` installato) — preesistente, non introdotto da T6/T7 |
| 2.4 | F04 — Editor visivo (page builder) | 1 | ⏳ | Dipende da F02. **Massimo rischio di over-engineering**: va costruita per incrementi |
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

F01 è chiusa e 1.1 è chiusa: ADR-21 è stata firmata il 2026-08-17. T1 di
`docs/ai/plans/PLAN-F02-blocchi.md` è chiuso senza residui: ADR-21 firmata, cinque tipi
approvati uno per uno, `docs/ai/specs/SPEC-F02-blocchi.md` approvata da ccurti lo stesso
giorno (body parser 1 MiB solo su superficie admin — A-F02-1 —, profilo `inline` senza
consumatori ma coperto da T7 — A-F02-2 —, `heading` senza `h1`). Il passo in corso è **T2**
(registro dei tipi + interprete di validazione, backend-developer). Nessun blocco
architetturale residuo: **1.3, 1.5 e 1.9 sono state firmate il 2026-08-17** (ADR-22/23/24),
quindi T1 di `docs/ai/plans/PLAN-F03-superficie-pubblica.md` è chiuso salvo la redazione di
`SPEC-F03`, e nessuna decisione architetturale blocca più né F02 né F03.

Decisione ancora aperta, non bloccante, emersa nella chiusura di F01: se serve un rate
limit differenziato fra `/auth/*` e la superficie amministrativa `app/*` (oggi quest'ultima
non ne ha nessuno — vedi nota in `docs/ai/progress-tracker.md` § "F01 — chiusura").

Tutto il resto può aspettare senza bloccare nulla.

### Debito documentale ancora aperto (segnalato, non sanato)

- Le quattro tabelle **mutabili** esistenti non hanno `version`: divergenza dalla regola di
  `CLAUDE.md`, allineamento come task a sé, mai dentro una feature di dominio
- `audit_log` usa FK `onDelete:'set null'` dove `CLAUDE.md` prescrive `restrict`
- `createdAt`/`updatedAt` sono nullable su tutte le tabelle esistenti, mentre le nuove
  nascono `.notNull()`
- Nessuna gestione del codice PG `23505` esiste oggi nel repository: la mappatura
  constraint → `409` va costruita in F01 (T3), altrimenti uno slug duplicato risponde `500`
