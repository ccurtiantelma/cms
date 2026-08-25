# RFC-F06 — Template e Sezioni globali: cosa costruiamo davvero

## Status
[x] In discussione · [ ] Approvato → genera ADR-[N] · [ ] Rifiutato

## Proposto da
AI Orchestrator · Data: 2026-08-25

---

## Problema

Un task esterno ("Fase 4 dell'Editor WYSIWYG") ha chiesto di implementare, dentro
`app/frontend`:

1. `TemplateLibraryModal.tsx` con due tab — "Sezioni Predefinite" e "I miei Template" —
   apribile da header editor e da un tasto "+" nel Canvas.
2. Un'azione "Salva come Template" nella Floating Toolbar di `EditorBlockWrapper.tsx`
   (`app/frontend/src/pages/pages/editor/EditorBlockWrapper.tsx`) che estrae il
   sotto-albero AST di un Blocco/Sezione selezionato, rigenera gli `id`, lo serializza e
   lo persiste "in uno store locale/backend mock".
3. Un helper `instantiateTemplateTree(astSubtree)` che rigenera nuovi `id`, valida col
   `BlockTreeValidatorService` e lo passa ad `addBlockAction`.
4. Verifica con `tsc --noEmit` + `npm run build`.

Prima di scrivere codice, il controllo documentale preliminare (obbligatorio per
`CLAUDE.md` § Anti-hallucination) ha trovato quanto segue:

**F06 — "Template e Sezioni globali" non è mai stata avviata.** `docs/roadmap.md` la
descrive così (riga 97-103): *"Template come punto di partenza copiato; Sezioni globali
come riferimento condiviso, con invalidazione a cascata della cache delle Pagine che le
usano."* Nessun ADR, RFC, spec o plan esiste per F06 in `docs/ai/`. Il progress-tracker
(`docs/TODO.md` riga 103) la elenca come `⏳`, dipendente solo da F02 (chiusa), ma non la
nomina mai come prossimo passo — il "prossimo passo consigliato" (riga 172-186) indica
solo ADR-26 (WYSIWYG rich text, F04d) e l'anteprima responsive, entrambe cose diverse da
questo task.

**Il glossario definisce due concetti distinti, e il task ne descrive un terzo.**
`docs/glossary.md` riga 20: *"Template — Struttura di partenza riusabile per creare
nuove Pagine. A differenza della Sezione globale, il Template viene copiato alla
creazione e da quel momento la Pagina è indipendente."* È una struttura a livello di
**intera Pagina**, copiata **una volta alla creazione della Pagina**. `docs/glossary.md`
riga 19 e `docs/business-rules.md` § Blocchi regola 8: la Sezione globale è
**referenziata, non copiata** — modificarla si riflette su tutte le Pagine che la usano,
e la modifica **invalida a cascata la cache** di quelle Pagine.

Il task esterno chiede invece: estrarre un **sotto-albero arbitrario** (un Blocco o una
Sezione con figli, non l'intera Pagina) dalla Floating Toolbar dentro l'editor, **copiarlo
con `id` rigenerati** (non referenziarlo), salvarlo in una libreria personale
("I miei Template") riusabile in punti diversi. Questo:
- **non è "Template"** per come lo definisce il glossario — non è a livello di Pagina, e
  non avviene "alla creazione" ma in qualunque momento dall'editor;
- **non è "Sezione globale"** per come la definiscono glossario e business rules — il
  task chiede esplicitamente `id` rigenerati e una copia indipendente, cioè l'opposto del
  riferimento condiviso con invalidazione a cascata che la regola 8 impone.

Chiamare questa cosa "Template" nel codice (come fa `TemplateLibraryModal.tsx` nel task)
significherebbe introdurre un componente il cui nome collide col termine di glossario ma
il cui comportamento è un terzo concetto non documentato — esattamente il tipo di deriva
che `CLAUDE.md` vieta ("inventare... business rules non documentate").

**La persistenza implicherebbe una nuova entità non prevista.** `docs/system-architecture.md`
riga 133-136 elenca le entità di dominio previste (da approvare): `pages`,
`page_revisions`, `redirects`, `menus`, `forms`, `form_submissions`. Non c'è spazio per
"template/sezioni salvate dall'utente". Uno "store locale/backend mock" come richiesto dal
task, se scritto, o resta puro `localStorage` frontend (che allora non è "backend" e va
dichiarato tale), oppure introduce comunque una qualche forma di persistenza server-side
senza passare da schema/migrazione approvati — la scorciatoia esplicitamente vietata da
`CLAUDE.md` § Divieti assoluti ("scorciatoie temporanee senza ADR motivato e approvazione
umana") e § Ask first ("schema DB/migrazioni").

**Un dettaglio implementativo del task è inoltre tecnicamente errato**, verificato contro
il codice reale (`app/frontend/src/hooks/useBlockEditorStore.ts` righe 129, 222-247):
`addBlockAction(parentId, type, index, defaultProps)` inserisce **un singolo nodo** (un
`type` + le sue `props` di default), non un sotto-albero con figli. Passare il risultato
di `instantiateTemplateTree(astSubtree)` — un sotto-albero con `children` — direttamente
ad `addBlockAction` come descritto dal task **non è eseguibile con la firma attuale**:
servirebbe una nuova azione dello store (es. `insertSubtreeAction`) sul modello di
`duplicateNodeAction` (righe 297-325), che già implementa esattamente la meccanica di
"copia sotto-albero con `id` rigenerati + verifica `MAX_NODES` + comando invertibile" —
ma solo per la duplicazione **in-place, lato client, nella stessa sessione di editing**,
mai per un riuso persistito fra Pagine o utenti diversi.

## Soluzione proposta

Non decido al posto dell'umano quale concetto costruire. Presento tre inquadramenti
possibili, con l'impatto architetturale di ciascuno.

### Opzione A — Estendere il significato di "Sezione globale"

Trattare il caso del task come una **Sezione globale** anche quando il sotto-albero è più
piccolo di una sezione condivisa classica (header/footer/CTA), cambiando la sua semantica
da riferimento-live a riferimento-o-copia a scelta dell'utente.

- **Impatto**: richiede riscrivere `docs/business-rules.md` § Blocchi regola 8 (oggi
  categorica: "referenziata, non copiata"). È un documento di governance — l'AI non lo
  tocca di propria iniziativa (`CLAUDE.md` § Documentation Policy), serve decisione umana
  esplicita e circostanziata.
- **Rischio**: una Sezione globale con due semantiche (riferimento *e* copia) è due
  funzionalità nello stesso nome — la fonte di ambiguità che il glossario voleva evitare.

### Opzione B — Nuovo concetto di dominio: "Blocco/Sezione salvata" (snippet personale)

Dichiarare esplicitamente un terzo termine, non ancora in `docs/glossary.md`: una
struttura **copiata** (come il Template) ma a **livello di sotto-albero arbitrario**
(come chiede il task), personale o condivisa secondo RBAC da definire.

- **Impatto**: voce nuova in `docs/glossary.md` e `docs/business-rules.md` (entità di
  contenuto + eventuale riga nella tabella permessi editoriali) — anche qui, scrittura
  umana o su richiesta esplicita, non iniziativa dell'AI. Nuova tabella DB (`Ask first`)
  o riuso di una struttura esistente da valutare in ADR dedicata.
- **Coerenza**: è l'inquadramento più fedele a quanto il task descrive davvero. Non
  contraddice le regole esistenti su Template o Sezione globale — le lascia intatte e
  aggiunge un terzo scaffale.

### Opzione C — Riperimetrare l'MVP di F06, rinviando la libreria personale

Costruire solo la parte di F06 già coperta dal glossario così com'è, in due passi
separabili:

1. **"Sezioni Predefinite"** come catalogo **statico, di sola lettura, integrato nel
   codice/registro blocchi** (nessuna persistenza, nessuna nuova tabella, nessun ADR di
   schema DB) — preset curati dal team, non salvabili/modificabili dall'utente.
2. **"I miei Template"** (libreria personale, salvataggio da editor) **rinviato**: è la
   parte che introduce entità nuova, ownership, RBAC non ancora mappato e la vera
   complessità del task esterno.

- **Impatto**: consegna qualcosa di utile subito, senza toccare schema DB né business
  rules, e isola il rischio (persistenza, ownership) in un secondo giro con la propria
  RFC/ADR quando la voce 1.4 (ADR-19-simile per questo dominio) sarà stata effettivamente
  discussa.
- **Coerenza con CLAUDE.md**: è la mossa esplicitamente richiesta all'Orchestrator quando
  rileva over-engineering ("se una funzione è inutile per l'MVP, segnalala e proponi la
  versione semplificata") — qui il rischio è per giunta nell'editor visivo, l'area che
  `CLAUDE.md` indica come concentrazione principale del rischio insieme al chatbot.

**Raccomandazione tecnica, non decisione**: Opzione C come sequenza (prima la parte
statica, poi eventualmente B per la libreria personale) minimizza il lavoro scartabile e
rispetta la sequenza già impostata dalla roadmap (F06 dipende solo da F02, ma non era mai
stata pianificata come "prossimo passo" — vedi Problema). Le opzioni A e B restano
sul tavolo per la parte "I miei Template", quando/se la si vorrà costruire.

In ogni caso, **nessuna delle tre opzioni permette un "backend mock"**: se la libreria
personale procede (B), la persistenza è reale, con ADR e migrazione approvate; se non
procede ora (C, fase 2 rinviata), non si scrive nessun placeholder che rischi di
diventare un binario di fatto senza mai passare da uno schema approvato.

## Alternative valutate

- **Procedere con un prototipo scartabile fuori da `main`, senza RFC** — scartata
  dall'umano stesso nella richiesta che ha originato questo audit: viola Principle 1
  (Documentation First) e il divieto di scorciatoie senza ADR.
- **Implementare il task esterno alla lettera, chiamandolo "Template" per comodità** —
  scartata: produce una collisione terminologica con un concetto di glossario già
  definito e diverso, esattamente il rischio che l'anti-hallucination di `CLAUDE.md`
  esiste per prevenire. Il nome nel codice deve corrispondere al concetto approvato, non
  viceversa.
- **Backend mock "temporaneo"** — scartata: `CLAUDE.md` vieta esplicitamente scorciatoie
  senza ADR+approvazione, e uno store che persiste dati di dominio (sotto-alberi di
  Blocchi, cioè contenuto) fuori da `schema.ts` è una seconda fonte di verità sul
  contenuto, in conflitto con Principle 2 (Single Source of Truth).

## Impatto

- **Roadmap**: F06 passa da "da avviare, nessun piano" a feature con RFC in discussione.
  Non altera l'ordine delle altre feature (dipende solo da F02, già chiusa).
- **Glossario/Business rules**: opzione B (o A) richiede una modifica di governance —
  serve turno umano dedicato prima di qualunque spec.
- **Schema DB**: solo se si procede oltre l'Opzione C fase 1 — nuova tabella o estensione
  di una esistente, da sottoporre separatamente (`CLAUDE.md` § Ask first).
- **Frontend**: `EditorBlockWrapper.tsx` guadagna un'azione nuova in Floating Toolbar
  solo quando il modello dati a monte è deciso — altrimenti si costruisce un'azione che
  scrive verso un contratto instabile.
- **Store editor**: `useBlockEditorStore.ts` necessita di una nuova azione
  (`insertSubtreeAction` o simile) distinta da `addBlockAction`, sul modello già
  esistente di `duplicateNodeAction` — questo è vero in ogni opzione che preveda
  inserimento di un sotto-albero, incluso il solo catalogo statico dell'Opzione C fase 1.

## Rischi

- **Over-engineering concentrato nell'editor visivo** (rischio esplicitamente segnalato
  da `CLAUDE.md`): un modale a due tab, azione di salvataggio, helper di
  istanziazione e persistenza sono un sotto-sistema intero per una feature mai
  sequenziata come prossimo passo. Mitigazione: Opzione C.
- **Collisione terminologica silenziosa**: se si procede senza chiarire il concetto,
  "Template" nel codice smette di significare quello che dice il glossario, e ogni
  lettura futura della codebase (umana o AI) parte da un'assunzione sbagliata.
  Mitigazione: nominare il concetto correttamente prima di scrivere il primo file.
  Persistenza fantasma: un "backend mock" che entra in produzione perché nessuno lo
  rimuove prima del prossimo deploy — è la definizione operativa di una scorciatoia che
  diventa permanente. Mitigazione: nessuna persistenza fuori da `schema.ts` approvato,
  mai.
- **RBAC non mappato**: se "I miei Template" è per-utente, la tabella permessi
  editoriali di `docs/business-rules.md` (che oggi vincola "Gestire Menu, Template,
  Sezioni globali" a Manager+) non copre un caso in cui uno User (autore) salva/riusa
  proprie sezioni personali. Serve decisione esplicita, non un'estensione implicita del
  significato di quella riga.

---

## Decisione umana

**Esito**: [ ] Approvato · [ ] Rifiutato · [ ] Modificato

**Note**: ___________

**Approvato da**: ___________ · **Data**: ___________

**Azione successiva**: [ ] Genera ADR-[N] · [ ] Archivio

---

## Appendice — Bozza di piano operativo (non eseguibile, non è un PLAN-F06)

Questa sezione è una bozza descrittiva, richiesta come nota finale insieme alla RFC.
**Non sostituisce** un `docs/ai/plans/PLAN-F06-*.md`, che l'Orchestrator scrive solo su
richiesta esplicita e solo dopo firma della RFC (e delle ADR che ne conseguono). I task
sotto assumono che l'umano scelga una rotta tra A/B/C sopra; sono riportati nella forma
più conservativa (Opzione C, fase 1) perché è l'unica che non richiede prima una modifica
di glossario/business-rules.

### T0 — Sbloccare la decisione concettuale (precondizione bloccante)
- Output atteso: nessun file — decisione umana su Opzione A/B/C (o una quarta non
  elencata) registrata nella sezione "Decisione umana" di questa RFC.
- Dipendenze: nessuna.
- Criterio di Done: RFC firmata con esito e nome del concetto scelto.
- Agente: umano (non delegabile).

### T1 — ADR sul modello di persistenza (solo se si procede oltre C/fase 1)
- Output atteso: `docs/ai/adr/ADR-XX-<nome-concetto>-persistenza.md`.
- Dipendenze: T0.
- Criterio di Done: ADR approvata — nuova tabella o riuso esplicito di una esistente,
  semantica copia-vs-riferimento dichiarata, coerenza con la catena di migrazione `v`
  per nodo di ADR-21 esplicitata (rigenerazione `id` non tocca `v`: uno snippet salvato
  con schema vecchio va migrato alla lettura come qualunque altro nodo).
- Agente: nessuno — l'Orchestrator genera la bozza solo su richiesta esplicita
  successiva, l'ADR non si auto-approva.

### T2 — Spec di dominio F06
- Output atteso: `docs/ai/specs/SPEC-F06-template-sezioni.md`.
- Dipendenze: T0 (T1 se applicabile).
- Criterio di Done: spec che fissa il catalogo dei preset (fonte dei dati, statico o
  DB), il contratto della nuova azione di store (`insertSubtreeAction` o nome deciso),
  RBAC di "I miei Template" se in scope.
- Agente: nessuno in questa fase — su richiesta esplicita successiva.

### T3 — Catalogo preset "Sezioni Predefinite" (backend, solo se statico da registro)
- Output atteso: estensione di `app/backend/blocks-registry.json` o nuovo file dedicato
  sotto `app/backend/src/blocks/` con i sotto-alberi preset, più script di export verso
  il frontend sul modello `blocks:export`/`blocks:types`.
- Dipendenze: T2.
- Criterio di Done: preset validi contro `BlockTreeValidatorService` (test unit),
  nessuna nuova tabella.
- Agente: backend-developer.

### T4 — `insertSubtreeAction` nello store editor
- Output atteso: `app/frontend/src/hooks/useBlockEditorStore.ts` (nuova azione, comando
  invertibile sul modello di `duplicateNodeAction`), tipi correlati.
- Dipendenze: T2.
- Criterio di Done: unit test — inserimento con `id` rigenerati, rifiuto oltre
  `MAX_NODES`, undo/redo coerente.
- Agente: frontend-developer.

### T5 — `TemplateLibraryModal` (nome definitivo da T0), solo tab preset statico
- Output atteso: nuovo componente sotto `app/frontend/src/pages/pages/editor/`, apertura
  da header editor e da "+" nel Canvas.
- Dipendenze: T3, T4.
- Criterio di Done: selezione preset → `insertSubtreeAction` → validazione client prima
  dell'inserimento (riuso `BlockTreeValidatorService` lato contratto generato, non
  reimplementato nel frontend).
- Agente: frontend-developer.

### T6 — Copertura di test
- Output atteso: unit test store/validator, e2e Playwright apertura modale + inserimento.
- Dipendenze: T4, T5.
- Criterio di Done: suite verde, nessun test placeholder.
- Agente: test-engineer.

### T7 — Verifica di build
- Output atteso: nessun file — solo verifica.
- Dipendenze: T5, T6.
- Criterio di Done: `tsc --noEmit` e `npm run build` (backend e frontend) puliti.
- Agente: frontend-developer (o chi ha eseguito l'ultimo task di codice).

**Nota**: l'azione "Salva come Template" nella Floating Toolbar e "I miei Template"
(persistenza, ownership) **non sono in questa bozza**: dipendono dall'esito di T0/T1 e
vanno pianificati come round successivo, con la propria RFC se l'Opzione scelta non è C.
