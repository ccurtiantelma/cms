# Plan — F02 Registro e validazione dei Blocchi

## Riferimenti

`docs/ai/adr/ADR-21-schema-blocchi-versionamento.md` (**in discussione, non firmata**) ·
`docs/business-rules.md` § Blocchi e albero di contenuto · `docs/ai/adr/ADR-19` (revisioni
immutabili) · `docs/ai/adr/ADR-20` (sanitizzazione) · `docs/ai/plans/PLAN-F01-innesto.md` § B.3
(collocazione del registro, già decisa) · `docs/roadmap.md` § F02

> Prodotto dall'Orchestrator il 2026-08-17 su richiesta esplicita. Nessuna dipendenza proposta,
> nessun codice scritto, nessuna modifica a `schema.ts` (F02 non ne ha bisogno: il contenuto è
> già `jsonb` su `pages`/`page_revisions`).

---

## Stato reale del codice su cui F02 si innesta

| Cosa | Dove | Conseguenza per F02 |
|---|---|---|
| Validazione della sola forma esterna dell'albero | [content-tree.ts](../../../app/backend/src/pages/content-tree.ts) | Resta come **primo** gradino della pipeline (forma dell'envelope). Va esteso con `v` per nodo, profondità/numero di nodi, e nient'altro: il dominio non entra qui |
| Sanitizzazione cieca di ogni stringa | [tree-sanitizer.service.ts](../../../app/backend/src/common/sanitizer/tree-sanitizer.service.ts) | Sostituita **per l'albero** dalla sanitizzazione per `kind`. `draftSeo` continua a usarla (ADR-21 § 4) |
| Allowlist unica di F01 | [sanitizer.config.ts](../../../app/backend/src/common/sanitizer/sanitizer.config.ts) | Diventa la base del profilo `basic`; il profilo `inline` è più stretto. `allowedStyles: {}` non si toglie (ADR-20, correzione T3) |
| Alberi già persistiti | `pages.draftContent`, `page_revisions.content` | Nodi **senza `v`**: la lettura tollerante (`v` assente ⇒ 1) non è un dettaglio, è il caso reale di tutte le righe esistenti |
| Pipeline generata + gate di drift | `openapi:export` / `openapi:types`, job CI `openapi-sync` | Modello da clonare per `blocks:export` / `blocks:types`. Nessuna macchina nuova |
| Nessun componente di blocco nel frontend | — | Vale il vincolo di isolamento di PLAN-F01 § B.3 dal primo file scritto |

---

## Task operativi

**T1 è bloccante e richiede firma umana: nessun task successivo può iniziare senza di essa.**

### T1 — Firma di ADR-21, approvazione dei cinque tipi, SPEC-F02
- **Agente**: orchestrator (su richiesta esplicita) + firma umana
- **Output**: ADR-21 firmata · `docs/ai/specs/SPEC-F02-blocchi.md`
- **Dipendenze**: nessuna
- **Done**: ADR-21 approvata; i cinque schemi (`section`, `heading`, `richText`, `image`,
  `button`) approvati **uno per uno** — `CLAUDE.md` § Ask first classifica ogni nuovo tipo di
  blocco come decisione umana; la spec fissa i valori che l'ADR non fissa (profondità massima,
  numero massimo di nodi, dimensione massima del payload, `maxLength` per prop, elenco dei
  codici d'errore) e il contenuto esatto dei profili `inline`/`basic`

### T2 — Registro dei tipi + interprete di validazione
- **Agente**: backend-developer
- **Output**: `app/backend/src/blocks/` (`block-registry.ts`, `block-definition.types.ts`,
  `prop-spec.types.ts`, `validator/`, `types/<tipo>.block.ts` × 5), `blocks.module.ts`
- **Dipendenze**: T1
- **Done**: un solo interprete valida tutti i tipi; `type` sconosciuto, annidamento non ammesso,
  prop non dichiarata e prop non conforme producono `400` con il **path** del nodo colpevole in
  `details`; `ROOT_ALLOWED` è dichiarato nel registro, non dedotto nel codice; `enabled: false`
  e `minRole` sono rispettati (nessun blocco HTML/embed presente); i cinque tipi nascono a
  `v: 1`; nessuna dipendenza nuova; nessun `any` non commentato; **nessun innesto in `pages`**

### T3 — Sanitizzazione per `kind` e profili nominati
- **Agente**: backend-developer
- **Output**: `app/backend/src/common/sanitizer/` (profili `inline`/`basic`, sanitizzazione
  guidata dal descrittore), `TreeSanitizerService` conservato per `draftSeo`
- **Dipendenze**: T2
- **Done**: `richText` passa dal profilo dichiarato dalla prop; `plainText` è memorizzata
  **verbatim** — `"5 < 10"` resta `"5 < 10"` a database — con caratteri di controllo rimossi e
  `maxLength` verificato sul valore **sanitizzato**; `url` respinge `javascript:` e
  protocol-relative; le prop non-stringa non passano da `sanitize-html`; `allowedStyles: {}` in
  tutti i profili (il code path di `postcss` resta morto, ADR-20); `draftSeo` non cambia
  comportamento

### T4 — Motore di migrazione
- **Agente**: backend-developer
- **Output**: `app/backend/src/blocks/migration/` (catena per tipo, catena d'envelope)
- **Dipendenze**: T2
- **Done**: `v` assente in lettura ⇒ `1`; `v` superiore al corrente ⇒ `400`; la catena applica
  i gradini in ordine ed è composta di funzioni **pure e totali** (nessun accesso a database,
  orologio, rete — verificabile per ispezione della firma); la migrazione non muta l'input;
  l'envelope ha la sua catena, applicata prima di quelle per nodo; un tipo `deprecated` resta
  validabile in lettura; **nessun job batch implementato** e nessuna colonna in previsione

### T5 — Innesto nel modulo `pages`
- **Agente**: backend-developer
- **Output**: `app/backend/src/pages/pages.service.ts` (pipeline), `content-tree.ts` (envelope
  con `v`, profondità, numero di nodi), `pages.module.ts`
- **Dipendenze**: T3, T4
- **Done**: la pipeline gira **in quest'ordine** — forma envelope → migrazione → validazione
  registro → sanitizzazione per `kind` → persistenza — su **ogni** percorso di scrittura
  (`POST`, `PATCH`, snapshot di pubblicazione), senza scorciatoie; un albero non conforme è
  respinto **per intero**; le revisioni si leggono attraverso la catena e **nessun percorso
  scrive su `page_revisions`** dopo l'inserimento; `restore` produce una bozza già alla versione
  corrente; un nodo che fallisce migrazione o validazione in lettura è esposto con il suo path,
  mai scartato in silenzio; `openapi:export` + `openapi:types` eseguiti e committati

### T6 — Contratto generato per il frontend + gate CI
- **Agente**: backend-developer (sorgente e script) — config di repo in root, come consentito
- **Output**: `app/backend/package.json` (`blocks:export`), `package.json` root
  (`blocks:types`), `app/frontend/src/types/blocks.types.ts` (generato),
  `.github/workflows/ci.yml` (job di drift)
- **Dipendenze**: T4
- **Done**: l'artefatto contiene identificativi dei tipi, descrittori delle props, regole di
  annidamento, `ROOT_ALLOWED` e versione corrente per tipo — **non** contiene contratti di
  rendering (ADR-21 § 2, punto fermo sul consumer HTML); il file generato non è scritto a mano e
  lo dichiara in testa; il job CI **fallisce** se il generato è in drift rispetto al registro,
  sullo stesso modello di `openapi-sync`; nessuna dipendenza nuova

### T7 — Copertura di test F02
- **Agente**: test-engineer
- **Output**: `app/backend/test/unit/blocks/*.spec.ts`,
  `app/backend/test/e2e/pages-blocks.e2e-spec.ts`, `bruno/pages/*.yml` aggiornati
- **Dipendenze**: T5 (le unit su registro e migrazioni possono partire da T4)
- **Done**: unit su interprete (ogni `kind`, ogni regola di annidamento, prop non dichiarata),
  su profili di sanitizzazione e su catena di migrazione — con un registro **di test** che porta
  un tipo a `v: 2`, perché a v singola il motore non è verificabile. Integration: albero con
  `type` sconosciuto / annidamento vietato / props invalide respinto **integralmente** (assert
  sulla riga a database, non solo sulla risposta); XSS neutralizzata in `richText`; `"5 < 10"`
  **integro** in `plainText`; alt-text mancante su `image` → `400`; una revisione scritta a
  `v: 1` letta correttamente con registro a `v: 2` **senza che la riga cambi**; un albero senza
  `v` (contenuto pre-F02) ancora leggibile; profondità e numero di nodi oltre il limite → `400`;
  happy path + 1 errore + 1 RBAC per endpoint toccato; suite verde in CI. **Nessuna correzione
  di logica applicativa**: i bug si segnalano

### T8 — Frontend: consumo del contratto e resa in sola lettura dei cinque blocchi
- **Agente**: frontend-developer
- **Output**: `app/frontend/src/components/blocks/` (5 componenti + CSS Modules + Error Boundary
  per blocco), consumo di `src/types/blocks.types.ts`
- **Dipendenze**: T6
- **Done**: **vincolo di isolamento** rispettato — nessun file in `components/blocks/` importa
  da `src/**` fuori dalla cartella, nessun Mantine, nessun hook o store applicativo, solo
  `react`, CSS Modules locali e il tipo generato; ogni blocco in un Error Boundary dedicato (il
  crash di un blocco non porta via la pagina); i tipi provengono **solo** dall'artefatto
  generato, nessuna copia a mano dell'elenco dei tipi; **nessuna UX di editing** (palette, drag
  & drop, pannelli di proprietà sono F04); lint e build verdi

---

## Rischi e over-engineering da non commettere

| Rischio | Mitigazione |
|---|---|
| F02 che diventa F04 (palette, DnD, pannelli proprietà) | T8 è **sola lettura** per definizione; l'editing non è negli output di nessun task |
| Job batch di migrazione costruito senza volumi | Specificato in ADR-21 § 3.3, **non** implementato: nessun task lo produce |
| Set di blocchi che cresce durante l'implementazione | Ogni tipo oltre i cinque richiede firma (`Ask first`), quindi non entra dentro un task |
| Contratto di rendering infilato nel registro "perché serve al frontend" | Vietato da T6: dipende dalla decisione aperta sul consumer HTML |
| Motore di migrazione non verificato perché tutti i tipi sono a `v: 1` | T7 impone un registro di test a `v: 2`: senza, il meccanismo più costoso del progetto nasce non provato |
| Doppia validazione client/server che diverge | La validazione client è solo UX (`CLAUDE.md` § Frontend); il `400` del server resta l'autorità e T8 non la duplica |

## Fuori scope, dichiarato

Cache pubblica e invalidazione (F03, TODO 1.3) · risoluzione dei `mediaRef` e media library
(F09, TODO 1.6) · Sezioni globali (F06) · blocco form (F10) · blocco HTML/embed (nessuna ADR,
business rules § Blocchi regola 7) · diff strutturale fra revisioni (business rules § Revisioni
regola 4: il meccanismo di ADR-21 § 3.4 lo abilita, F02 non lo costruisce) · potatura delle
Revisioni (ADR-19, decisione umana rinviata).
