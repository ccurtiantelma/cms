# ADR-40 — Sezioni Globali e slot di layout (F06)

## Status
[ ] In discussione · [x] **Approvata** · [ ] Rifiutata · [ ] Superseded da ADR-XXX

## Data approvazione
2026-08-27 — approvata da: ccurti

---

## Decisione

**Opzione A**: Header e Footer sono Sezioni Globali (F06) — entità autonome, non
Pagine, non un campo di `app_settings` — con un albero di blocchi (jsonb, stesso
envelope e stesso registro tipi di ADR-21) e uno `layoutSlot` (`none | header |
footer`) che ne dichiara l'innesto nel layout pubblico. Una sola Sezione può
occupare `header` e una sola `footer` fra le righe attive (vincolo di unicità
parziale sulla colonna, non applicativo). `none` è lo stato di una Sezione
Globale non ancora assegnata a uno slot — può coesisterne più di una.

Tabella `global_sections`, entità mutabile: struttura base CLAUDE.md §
Database (`id serial`/`guid`/`version`/`isActive`/`createdAt`+`updatedAt`/
`createdBy`+`updatedBy`) più `title`, `slug` (identificatore admin, unicità
sulle righe attive), `layoutSlot`, `content` (jsonb).

Endpoint pubblico anonimo `GET public/global-sections/active` (stesso
prefisso/convenzioni di ADR-24, escluso da `AuthMiddleware` come ogni
`public/*`): restituisce le Sezioni attualmente assegnate a `header` e
`footer`, contenuto già migrato/validato/sanitizzato in scrittura — nessuna
rielaborazione in lettura. `404` non si applica: risposta sempre `200`, con
slot assenti se nessuna Sezione è stata assegnata.

Cache: una sola chiave Redis (`public:{reg}:global-sections:active`, stesso
token di registro di ADR-23 § 2), nessuna TTL, `DEL` post-commit su ogni
scrittura amministrativa che tocca `layoutSlot`, `content` o `isActive` di una
riga — stesso schema di fallimento di ADR-23 § 6 (Redis irraggiungibile → log
e prosegui; `DEL` fallito → job BullMQ di retry via
`CacheInvalidationQueueService`, riuso dello stesso modulo, nessuna coda
nuova).

## Alternative valutate

| Opzione | Pro | Contro | Motivo scarto |
|---|---|---|---|
| Header/Footer come coppia di chiavi fisse su `app_settings` | Zero tabelle nuove | Contenuto (albero blocchi) mischiato a configurazione scalare; nessuna estensione futura a sezioni multiple (sidebar, sezioni promozionali) senza rompere il contratto | Il contenuto non è una preferenza di installazione, è un albero di blocchi con lo stesso ciclo di vita delle Pagine |
| Header/Footer come Pagine con flag `isGlobalSection` | Riusa a costo zero CRUD/validazione/RBAC delle Pagine | Introduce uno stato/slug pubblico fittizio in un'entità la cui regola 1 del modello di contenuto è "nessun tipo privilegiato"; porterebbe con sé bozza/pubblicazione/revisioni che F06 non richiede | Piegherebbe il modello Pagina a un caso che non gli appartiene |
| Nessuna cache, lettura da database a ogni richiesta SSR | Zero infrastruttura aggiuntiva | Header/footer sono inclusi in **ogni** pagina pubblica: stesso carico ripetuto che ADR-23 ha già escluso per il contenuto di Pagina | Contraddice l'assunzione di cache pubblica sempre attiva su cui è costruito ADR-22/23 |

## Conseguenze

Una nuova tabella mutabile in `schema.ts`, un nuovo modulo backend
(`global-sections/`) con superficie doppia Admin/Pubblica (stessa
separazione di controller di `PagesModule`), un solo nuovo `layoutSlot` come
concetto di dominio — non un nuovo tipo di blocco, non un nuovo `kind`, non
tocca il registro di ADR-21. Il contenuto delle Sezioni Globali riusa
integralmente pipeline di validazione/sanitizzazione di ADR-21: nessuna
duplicazione di logica di dominio sui blocchi. La cache pubblica cresce di
una sola chiave, non di una per Sezione: gli slot pubblici consumati da SSR
sono sempre e solo due (`header`, `footer`), indipendentemente da quante
Sezioni Globali esistano in stato `none`.

## Conformità

`app/backend/src/db/schema.ts` → `global_sections` con l'indice parziale di
unicità su `layoutSlot` (`where layout_slot != 'none' and is_active`);
`app/backend/src/global-sections/` → DTO con class-validator, controller
Admin (`Manager`+) e controller Pubblico senza guard, entrambi nel
`GlobalSectionsModule`; cache/purge tramite `CacheInvalidationQueueModule`
esistente (nessuna coda nuova). Bruno collection e test Supertest per
entrambe le superfici.
