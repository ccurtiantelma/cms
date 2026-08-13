# TODO — CMS

> Elenco operativo ordinato di tutto ciò che serve per portare il CMS dalla base tecnica
> attuale al prodotto completo. È il punto di ingresso per capire **a che punto siamo** e
> **cosa serve decidere prima di procedere**.
>
> Creato il 2026-08-13. Aggiornare a ogni passo completato o decisione presa.

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
| 0.3 | Correzione della tabella porte (era sbagliata in 3 file) | ✅ | Valori reali: 3001 / 5175 / 5435 / 6381 / 8026 |
| 0.4 | Riscrittura `constitution.md` con la nuova identità headless | ✅ | + 3 principi nuovi: Content is Data, Headless by Default, Public Read is a Different Citizen |
| 0.5 | Redazione delle business rules di dominio | ✅ | Sezione prima vuota, ora completa: stati, permessi, slug, revisioni, SEO/GEO, multilingua, media, form, chatbot, cache |
| 0.6 | Riscrittura `glossary.md` con i termini di dominio | ✅ | |
| 0.7 | Riscrittura `system-architecture.md`, `non-functional-requirements.md`, `README.md`, `GUIDA_UTILIZZO.md` | ✅ | |
| 0.8 | Creazione `roadmap.md` (7 pilastri → F01–F12) | ✅ | Con grafo delle dipendenze e fuori scope dichiarato |
| 0.9 | Riscrittura completa di `CLAUDE.md` | ✅ | 670 righe. Ripristinata il 2026-08-13 dopo che una versione condensata (260 righe) aveva perso le definizioni inline dei 4 ruoli e l'intera Testing Policy |
| 0.10 | Conferma di A1: GEO = Generative Engine Optimization | ✅ | Confermata da ccurti il 2026-08-13 |
| 0.11 | Conferma delle assunzioni A2–A6 | 🤝 | **Vedi sezione "Decisioni aperte" — è il prossimo passo** |
| 0.12 | Allineamento dei template in `docs/ai/templates/` alle nuove regole | ✅ | Backend: lock ottimistico su `version` (mancava: il template insegnava la sovrascrittura silenziosa). Frontend: confine Mantine ↔ componenti dei blocchi |

---

## FASE 1 — Decisioni architetturali (bloccano il codice)

Ogni voce richiede RFC → approvazione → ADR, come da Architecture Policy. Nessuna è
ancora stata scritta.

| # | ADR da produrre | Blocca | Stato |
|---|---|---|---|
| 1.1 | Formato e versionamento dello schema dei blocchi | F02, F04 | ⏳ Da fare — la più urgente dopo F01 |
| 1.2 | Strategia di versionamento/revisioni (snapshot vs. diff) | F01 | 🔍 Proposta in SPEC-F01 (assunzione S1: snapshot completo), serve ADR formale |
| 1.3 | Caching e invalidazione del contenuto pubblico | F03 | ⏳ Da fare |
| 1.4 | Modello multilingua | F05 | 🔍 Proposto in business-rules (A3), serve ADR formale |
| 1.5 | Routing e risoluzione degli slug | F03 | 🔍 Regole scritte in business-rules, serve ADR formale |
| 1.6 | Pipeline di trasformazione media e trattamento SVG | F09 | ⏳ Da fare |
| 1.7 | Scelta e confine del provider del chatbot | F11 | 🤝 Richiede una tua decisione su provider, costi e trattamento dati |
| 1.8 | Generazione di sitemap e structured data | F07 | ⏳ Da fare |

---

## FASE 2 — Sviluppo del dominio

Ordine vincolato dalle dipendenze in `docs/roadmap.md`. **Non si salta la fila**: costruire
l'editor o il SEO prima del modello di contenuto significa doverli rifare.

| # | Feature | Pilastro | Stato | Cosa manca |
|---|---|---|---|---|
| 2.1 | **F01 — Gestione Pagine** | fondativa | 🔍 | Feature scritta + spec in bozza. Serve: approvazione spec → approvazione schema DB → plan → codice |
| 2.2 | F02 — Registro e validazione dei Blocchi | 1 | ⏳ | Dipende da 1.1 e da F01 |
| 2.3 | F03 — Superficie pubblica + cache | 2, 7 | ⏳ | Dipende da 1.3, 1.5, F01, F02 |
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

---

## Decisioni aperte — servono da te

Queste sono le uniche cose che mi bloccano davvero. Ognuna è ribaltabile **ora** a costo
zero; dopo tre feature costa migrazioni di dati.

### D1 — Assunzioni A2–A6 (`docs/business-rules.md`)

| # | Domanda | Cosa ho assunto | Perché conta |
|---|---|---|---|
| A2 | Il contenuto è un albero di blocchi JSON validato, o HTML salvato dall'editor? | Blocchi JSON | Decide se il contenuto resta portabile, diffabile e traducibile, o diventa markup opaco |
| A3 | Le traduzioni sono pagine autonome o campi affiancati? | Pagine autonome legate da un gruppo | Decide se una lingua può essere pubblicata mentre un'altra è in bozza |
| A4 | Servono ruoli editoriali dedicati (Editor, Autore, Revisore) o bastano le 4 soglie esistenti? | Bastano le 4 esistenti | Ruoli nuovi = nuovo sistema di permessi da costruire e mantenere |
| A5 | Una installazione = un sito, o più siti nella stessa installazione? | Un sito, più lingue | Il multi-sito va deciso **prima**: cambia ogni query del sistema |
| A6 | Il chatbot risponde solo sui contenuti del sito o è un assistente generalista? | Solo contenuti pubblicati | Decide costi, rischio e complessità dell'intera F11 |

**La più critica è A5**: le altre quattro si correggono, il multi-sito no.

### D2 — Provider del chatbot (voce 1.7)

Serve una tua scelta su: quale provider, che budget mensile, dove finiscono le
conversazioni degli utenti, per quanto tempo si conservano. Senza queste risposte F11 non
è progettabile — e resta comunque l'ultima della fila.

### D3 — Firme mancanti (voci 3.1, 3.2)

ADR-13 e ADR-17 descrivono codice **già in produzione**. Servono solo approvate o
rifiutate. Se rifiutate, il codice va rimosso.

---

## Prossimo passo consigliato

1. Rispondi alle 5 domande di **D1** (bastano cinque righe)
2. Approva o correggi la spec **F01** (`docs/ai/specs/SPEC-F01-gestione-pagine.md`),
   in particolare la proposta di schema DB
3. Da lì genero il plan operativo di F01 e si comincia a scrivere codice

Tutto il resto può aspettare senza bloccare nulla.
