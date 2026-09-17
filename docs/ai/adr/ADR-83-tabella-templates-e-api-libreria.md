# ADR-83 — Libreria Template server: tabella `templates` e API `app/templates`

## Status
[x] **In discussione** · [ ] Approvato · [ ] Rifiutato · [ ] Superseded da ADR-XXX

## Data approvazione
_In attesa di firma umana — vedi "Decisione umana" in fondo a questo documento._

## RFC di riferimento
Nessuna RFC dedicata nuova: round **R3 — UX del builder** di `docs/PLAN-parita-elementor-pro.md`
§ T5. Questa ADR chiude anche il **T1** lasciato esplicitamente aperto da
`docs/ai/rfc/RFC-F06-template-sezioni.md` § Appendice ("T1 — ADR sul modello di persistenza, solo
se si procede oltre C/fase 1"): quella RFC (approvata il 2026-09-13) aveva scelto l'Opzione C fase 1
(catalogo statico, `ADR-34`/`ADR-56`) e dichiarato esplicitamente *"la libreria personale persistita
«I miei Template» resta non costruita e richiede una RFC propria"* con una precondizione bloccante
(T0, "decisione umana su Opzione A/B/C... Agente: umano, non delegabile"). La precondizione T0 è
risolta da questa stessa commissione: il committente ha richiesto esplicitamente, per la Fase 2
(R3) dell'Evoluzione UX, la libreria Template server descritta da `PLAN-parita-elementor-pro.md`
§ R3 T5 — la decisione concettuale che T0 richiedeva è quindi presa qui, per iscritto, in questa
ADR, non un'iniziativa AI non richiesta.

## Numerazione
Vedi `ADR-74-isole-js-pubbliche.md` § "Numerazione" e `ADR-81`/`ADR-82` § "Numerazione": la
cascata di rinumerazione (+1 per la collisione con `ADR-73-rimozione-maniglie-resize-widget-foglia.md`)
porta R0 a 74–80, R1 a 81, R2 a 82. Questa ADR occupa quindi il primo numero libero per R3: **83**.

## ADR/RFC di riferimento (non superate, non modificate)
- `RFC-F06-template-sezioni.md` — resta l'unico luogo che documenta la scelta "fase 1" (catalogo
  statico, nessuna persistenza) per i preset di Sezione; questa ADR **non la riscrive**, ne
  costruisce sopra la fase successiva già prevista dalla sua stessa Appendice.
- `ADR-34-subtree-insertion-engine-preset-statici.md` — `insertSubtreeAction`/`duplicateSubtree`
  restano il punto unico di rigenerazione `id` (§ 2 di quella ADR); l'inserimento di un Template
  dalla libreria server riusa la stessa azione, non ne introduce una terza (dopo preset statici e
  clipboard, `docs/ai/specs/SPEC-CLIPBOARD.md`).
- `ADR-56-template-library-import-export-json.md` — l'import/export JSON client-side dei
  sotto-alberi resta un meccanismo indipendente e invariato (nessuna tabella, euristica client);
  questa ADR introduce un **secondo** meccanismo, persistito e condiviso fra sessioni, che non lo
  sostituisce.
- `ADR-21-schema-blocchi-versionamento.md` § 3 — un Template salvato con uno schema di blocco meno
  recente migra alla lettura come qualunque altro nodo (criterio esplicito di RFC-F06 § Appendice
  T1: "rigenerazione `id` non tocca `v`: uno snippet salvato con schema vecchio va migrato alla
  lettura come qualunque altro nodo").
- `ADR-64-template-di-tema-site-templates.md` — entità distinta, non toccata da questa ADR (§
  "Contesto" sotto ne chiarisce il confine).
- `ADR-40-sezioni-globali-e-layout.md` — entità distinta: una Sezione globale è **riferimento**, un
  Template è sempre **copia** (§ "Decisione" punto 2).

## Assunzione di dominio coinvolta
Nessuna modifica a `docs/business-rules.md`. Questa ADR **estende** l'ambito operativo della riga
già esistente `docs/glossary.md` riga 20/`docs/business-rules.md` riga 58 ("Template — Struttura di
partenza riusabile per creare nuove Pagine... viene copiato alla creazione") da "solo Pagina intera"
a "Pagina intera **o** sotto-albero (Sezione/Container/Popup/elemento di Loop)", mantenendo intatta
la semantica di fondo ("copia, non riferimento") che già la distingue dalla Sezione globale — vedi
§ "Chiarimento terminologico" sotto. La riga di permessi editoriali già esistente ("Gestire Menu,
Template, Sezioni globali" — ✅ SuperAdmin/Admin/Manager, ❌ User, `business-rules.md` riga 125) si
applica identica: nessuna nuova riga RBAC da introdurre.

---

## Contesto

`docs/ELEMENTOR_PRO_GAP_ANALYSIS_v2.md` § 2 elenca come gap P1: *"Salva come template dal menu
contestuale + libreria template utente (cloud) | preset locali + JSON statici | ◐ template come
entità server (`templates` table) con categorie, anteprima, import/export JSON."* Il catalogo
statico di `ADR-34`/`ADR-56` (bundlato nel frontend, non modificabile senza un deploy) copre solo la
metà "preset di prodotto" del requisito Elementor "My Templates": manca la metà "libreria personale
dell'utente", che per natura richiede persistenza server-side condivisa fra sessioni/dispositivi
dello stesso account — un `localStorage` non la soddisfa (non condivisibile, esplicitamente escluso
da `ADR-34` § "Alternative scartate").

### Chiarimento terminologico (risoluzione di RFC-F06 § Rischi, "Collisione terminologica")
`RFC-F06-template-sezioni.md` § Rischi aveva segnalato esplicitamente il pericolo di introdurre un
concetto "libreria personale" chiamandolo genericamente "Template" senza riconciliarlo con la
definizione di glossario (whole-page, copiata una sola volta alla creazione della Pagina). Questa
ADR risolve la collisione **non introducendo un nome nuovo**, ma **estendendo la stessa riga di
glossario con un discriminante `kind`**:

| Entità | `kind`/tipo | Copia o riferimento | Risolta quando |
|---|---|---|---|
| **Template (glossario, invariato)** | `kind: 'page'` in questa tabella | Copia, una tantum alla creazione | Alla creazione della Pagina |
| **Template di sezione/container/popup/loop-item (nuovo, questa ADR)** | `kind: 'section'\|'container'\|'popup'\|'loop-item'` in questa tabella | Copia, ogni volta che l'utente lo inserisce | All'inserimento nell'editor |
| **Sezione globale** (`ADR-40`, non toccata) | tabella `global_sections`, entità a sé | **Riferimento**, mai copia | A ogni render/export |
| **Template di tema** (`ADR-64`, non toccata) | tabella `site_templates`, entità a sé | Non applicabile (risolto per rotta, non inserito in un albero) | A ogni risoluzione di rotta in export |

Ogni riga di `templates` è quindi sempre e solo una variante del concetto di glossario già esistente
("copiato alla creazione... da quel momento la Pagina/il sotto-albero è indipendente"), mai un
concetto nuovo: la tabella distingue il caso "pagina intera" (già coperto dal glossario) dal caso
"sotto-albero" (l'estensione di questa ADR) con lo stesso campo `kind`, non con due tabelle separate
— un solo modello di persistenza, coerente con il criterio di RFC-F06 § Appendice T1 ("nuova tabella
o riuso esplicito di una esistente... semantica copia-vs-riferimento dichiarata").

`site_templates` (`ADR-64`) resta un'entità del tutto diversa per **meccanismo di consumo**: un
Template di tema è **risolto automaticamente** dal `TemplateResolverService` in base alla rotta e a
`displayConditions`, mai scelto e inserito a mano da un autore in un punto preciso dell'albero. Un
Template di questa ADR è invece **scelto e inserito esplicitamente** dall'autore, mai risolto
automaticamente. Nessun doppio binario: le due tabelle non si sovrappongono in alcun caso d'uso.

---

## Decisione

1. **Una tabella nuova, `templates`**, stessa "Struttura obbligatoria ogni tabella" della
   constitution (`id serial`, `guid char(16)`, soft delete `isActive`, `version` per lock
   ottimistico, `createdAt`/`updatedAt`, `createdBy`/`updatedBy` FK `restrict/restrict` verso
   `users`), stesso pattern strutturale di `site_templates`/`global_sections` (tabelle mutabili con
   audit completo, non append-only come `page_revisions`):

   ```typescript
   // schema.ts
   export const templateEntity = pgTable(
     'templates',
     {
       id: serial().notNull().primaryKey(),
       guid: char('guid', { length: 16 })
         .notNull()
         .$defaultFn(() => Utils.randomString(16)),

       name: varchar('name', { length: 255 }).notNull(),
       /** Elenco chiuso, indipendente da `SectionPreset.category` di ADR-56 (catalogo statico) — vedi § "Decisione" punto 2. */
       category: varchar('category', { length: 20 }).notNull(),
       /** Elenco chiuso: cosa rappresenta il sotto-albero salvato. */
       kind: varchar('kind', { length: 20 }).notNull(),

       /**
        * Stesso envelope jsonb `{ version, blocks }` di ADR-21, validato dalla stessa
        * `BlockTreeValidatorService` già usata da `pages.draftContent`/`global_sections.content`/
        * `site_templates.contentTree` — nessun secondo validatore per questa tabella (SPEC-propkind-v2.md
        * § 1 principio "un unico interprete"). Per `kind !== 'page'`, `blocks.length === 1` (un solo nodo
        * radice, il sotto-albero salvato) — vincolo di servizio (§ "Decisione" punto 3), non del validatore.
        */
       tree: jsonb('tree').notNull(),

       /** Nullable: caricata a mano al salvataggio, nessuna generazione automatica (§ "Decisione" punto 5). */
       thumbnailMediaId: integer('thumbnail_media_id').references(() => fileEntity.id, {
         onDelete: 'restrict',
         onUpdate: 'restrict',
       }),

       /** Lock ottimistico: incrementato a ogni UPDATE, confrontato nella WHERE. */
       version: integer('version').notNull().default(1),

       isActive: boolean('is_active').notNull().default(true),
       createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
       updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
       createdBy: integer('created_by')
         .notNull()
         .references(() => userEntity.id, { onDelete: 'restrict', onUpdate: 'restrict' }),
       updatedBy: integer('updated_by')
         .notNull()
         .references(() => userEntity.id, { onDelete: 'restrict', onUpdate: 'restrict' }),
     },
     (t) => [
       uniqueIndex('templates_guid_idx').on(t.guid),
       index('templates_kind_category_idx').on(t.kind, t.category),
       /** Predicato della tab "Miei template" (§ "Decisione" punto 4) — attribuzione, non controllo di accesso. */
       index('templates_created_by_idx').on(t.createdBy),
       index('templates_name_idx').on(t.name),
     ],
   );
   ```

   `kind`: elenco chiuso `'page' | 'section' | 'container' | 'popup' | 'loop-item'`
   (`PLAN-parita-elementor-pro.md` § R3 T5, verbatim). `popup`/`loop-item` sono valori ammessi
   nell'enum **da subito** ma senza alcun consumer (nessuna UI produce oggi un sotto-albero di
   quel `kind`, il Popup Builder è R6 e il Loop Builder è R7): stesso principio già impiegato da
   `ADR-82` § "Decisione" punto 1 per `link`/`animation`/`motion` su `container`
   ("uno schema che accetta il valore prima che il renderer lo onori non è una contraddizione, è la
   stessa sequenza già attraversata..."), applicato qui a un valore di colonna invece che a una
   prop di blocco.

   `category`: elenco chiuso a 10 valori — `'hero' | 'header' | 'footer' | 'feature' | 'cta' |
   'form' | 'gallery' | 'pricing' | 'testimonial' | 'other'` più `'full-page'` (ammesso solo con
   `kind: 'page'`, non verificato a livello di validatore incrociato — stesso principio
   "presentazione, non validazione cross-campo" già adottato da `SPEC-PROPKIND-V2-DETAILS.md` § 7
   punto 3 per `gradient.position`). **Enum indipendente e distinto** da `SectionPreset.category` di
   `ADR-56` (`hero | feature-grid | cta | altro`, catalogo statico bundlato nel frontend): le due
   tassonomie vivono in due tipi TypeScript separati, senza alcuna condivisione — questa è
   esattamente la ADR che `ADR-56` § "Conseguenza" aveva anticipato come necessaria per un "sesto
   valore di `category`, e in particolare 'Pagina intera'": qui non si estende l'enum di `ADR-56`,
   se ne dichiara uno nuovo per una tabella nuova, evitando la collisione che quella nota metteva
   in guardia.

2. **Il Template è sempre una copia, mai un riferimento** (§ "Contesto" tabella sopra): inserirlo in
   una Pagina non crea alcun legame persistente fra la Pagina e la riga `templates` di origine.
   Modificare o cancellare un Template dopo che è stato inserito **non altera** i nodi già inseriti
   nelle Pagine esistenti — comportamento opposto e deliberatamente distinto da quello delle Sezioni
   globali (`ADR-40`, `business-rules.md` § Blocchi regola 8: "referenziata... la modifica invalida
   la cache di tutte le Pagine che la usano").

3. **`blocks.length === 1` per ogni `kind` diverso da `'page'`** è un vincolo di
   `TemplateService`, non del validatore d'albero generico: la stessa `BlockTreeValidatorService`
   valida il contenuto di `blocks` indipendentemente dalla propria cardinalità (nessuna logica di
   `kind` di Template nel validatore dei blocchi — separazione di responsabilità già stabilita da
   ogni altra tabella che riusa quel validatore, `ADR-40`/`ADR-64`); il servizio applicativo di
   `POST app/templates` rifiuta con `400` un `kind !== 'page'` il cui `tree.blocks` non abbia
   esattamente un elemento, **prima** di invocare il validatore d'albero.

4. **Nessuna scoping per proprietario**: qualunque Manager+ vede, usa e cancella qualunque
   Template della libreria, non solo i propri — stessa semantica già in vigore per Menu/Sezioni
   globali/Template di tema (nessuna di quelle entità ha un filtro di ownership). Questo risolve
   direttamente il rischio "RBAC non mappato" segnalato da `RFC-F06-template-sezioni.md` § Rischi:
   non serve una regola nuova perché il Template ricade sotto la riga di permessi editoriali già
   approvata ("Gestire Menu, Template, Sezioni globali", Manager+). La tab UI "Miei template"
   (`PLAN-parita-elementor-pro.md` § R3 T5: *"schede 'Miei template / Blocchi / Pagine'"*) è un
   **filtro di attribuzione** (`WHERE created_by = <utente corrente>`), non un controllo di accesso:
   un Manager può sempre passare alla vista non filtrata. Le tab "Blocchi"/"Pagine" filtrano per
   `kind` (`kind != 'page'` / `kind = 'page'`), non per proprietario.

5. **`thumbnailMediaId` è un upload manuale opzionale**, mai una generazione automatica
   (screenshot headless): riusa `FilesModule`/`mediaRef` già esistente, nessuna nuova pipeline di
   rendering server-side. Un Template senza thumbnail mostra un'icona segnaposto generica per
   `kind` nella libreria — nessuna riga obbligatoria, nessun placeholder testuale vietato da
   `CLAUDE.md` (l'icona generica è UI, non un dato mancante annotato come "TODO").

6. **Migrazione alla lettura, invariata da ADR-21**: un Template il cui `tree` contiene nodi con
   `v` inferiore alla versione corrente del proprio `type` migra automaticamente ogni volta che è
   letto per anteprima o inserimento — stessa funzione di migrazione già scritta per Pagine/Sezioni
   globali/Template di tema, nessuna funzione dedicata a questa tabella. Il criterio esplicito di
   `RFC-F06-template-sezioni.md` § Appendice T1 è così soddisfatto: "rigenerazione `id` non tocca
   `v`: uno snippet salvato con schema vecchio va migrato alla lettura come qualunque altro nodo."

7. **Inserimento: stesso punto unico di rigenerazione `id` di `ADR-34`**. `GET app/templates/:guid`
   restituisce il `tree` (già migrato alla lettura); il frontend passa `tree.blocks[0]` (o l'intero
   array per `kind: 'page'`) a `insertSubtreeAction`, esattamente come già fa per i preset statici
   di `ADR-34` e per l'import JSON di `ADR-56` — nessuna quarta implementazione di rigenerazione
   `id` nel codebase (la terza, dopo preset statici e clipboard di `SPEC-CLIPBOARD.md`, è già
   coperta da quella stessa funzione).

---

## Endpoint API

### `GET api/v1/app/templates`
- **Guard**: JWT, qualunque ruolo con accesso all'editor a blocchi (lettura per il riuso, non
  gestione — vedi § "Decisione" punto 4: User che edita una propria bozza può comunque inserire un
  Template esistente, non può crearne/cancellarne).
- **Query**: `kind?`, `category?`, `search?` (sottostringa case-insensitive su `name`), `mine?:
  boolean` (filtro tab "Miei template", § "Decisione" punto 4), `page`/`pageSize` (stessa
  paginazione di `GET app/pages`).
- **Response 200**: `{ items: TemplateListItemDto[], total: number }` — `TemplateListItemDto` non
  include `tree` (payload potenzialmente grande, stesso principio "lista leggera, dettaglio
  pesante" di `GET app/pages` vs `GET app/pages/:guid`): `{ guid, name, category, kind,
  thumbnailUrl: string | null, createdBy: { guid, name }, createdAt, updatedAt }`.

### `GET api/v1/app/templates/:guid`
- **Guard**: come sopra.
- **Response 200**: `TemplateDetailDto` — tutti i campi di sopra più `tree` (envelope migrato alla
  lettura, § "Decisione" punto 6).
- **Response 404**: guid inesistente o riga con `isActive: false`.

### `POST api/v1/app/templates`
- **Guard**: `GuardManager` (Manager+, § "Decisione" punto 4).
- **Request body**: `CreateTemplateDto`.
- **Response 201**: `{ guid, name, category, kind, version }`.
- **Response 400**: `tree` non valido secondo `BlockTreeValidatorService` (stesso formato di errore
  di `PATCH app/pages/:guid`, `path` incluso), oppure `kind !== 'page'` con `tree.blocks.length !==
  1` (§ "Decisione" punto 3).
- **Response 401/403**: non autenticato / ruolo insufficiente.

### `DELETE api/v1/app/templates/:guid`
- **Guard**: `GuardManager`.
- **Comportamento**: soft delete (`isActive = false`), mai `DELETE` fisico — coerente con
  `docs/constitution.md` § "Soft delete: `isActive = false` — MAI `DELETE` fisico su entità
  anagrafiche o di contenuto". Un Template già inserito in Pagine esistenti non è impattato (§
  "Decisione" punto 2, copia non riferimento): la cancellazione rimuove solo la riga dalla
  libreria, mai un contenuto già copiato altrove.
- **Response 204**: cancellazione riuscita.
- **Response 404**: guid inesistente o già `isActive: false`.

Fuori scope di questa ADR (non richiesto, nessun endpoint aggiunto): `PATCH
api/v1/app/templates/:guid` per rinominare/ricategorizzare un Template esistente dopo il
salvataggio — oggi `category`/`name` si fissano solo al `POST`; un'estensione futura è additiva e
non richiede di riaprire questa decisione.

## DTO

```typescript
export class CreateTemplateDto {
  @ApiProperty({ example: 'Hero — Consulenza aziendale' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @ApiProperty({ enum: TEMPLATE_CATEGORIES, example: 'hero' })
  @IsIn(TEMPLATE_CATEGORIES)
  category: TemplateCategory;

  @ApiProperty({ enum: TEMPLATE_KINDS, example: 'section' })
  @IsIn(TEMPLATE_KINDS)
  kind: TemplateKind;

  @ApiProperty({ description: 'Envelope { version, blocks } — stesso formato di pages.draftContent' })
  @IsObject()
  @IsNotEmpty()
  tree: ContentTreeEnvelopeDto;

  @ApiPropertyOptional({ description: 'guid 16 hex di un File già caricato' })
  @IsOptional()
  @Matches(/^[0-9a-f]{16}$/)
  thumbnailMediaGuid?: string;
}
```

## Task breakdown
- [ ] T1 — Schema DB: aggiungere `templateEntity` in `schema.ts` + migrazione Drizzle.
- [ ] T2 — Backend: `TemplatesModule` (controller, service, DTO), riuso di `BlockTreeValidatorService`
      per `tree`, vincolo di cardinalità per `kind !== 'page'` a livello di servizio.
- [ ] T3 — Frontend: `TemplateLibraryModal.tsx` estesa con le tab "Miei template / Blocchi /
      Pagine" (`PLAN` § R3 T5), azione "Salva come template" nella Floating Toolbar e nella
      handle bar, chiamata a `insertSubtreeAction` in inserimento (riuso, nessuna azione nuova di
      store).
- [ ] T4 — Test: Jest (validazione DTO, cardinalità per `kind`), Supertest (RBAC su tutte le
      rotte, soft delete, 404 su guid inesistente), Bruno (contratto dei 4 endpoint).
- [ ] T5 — `npm run openapi:export && npm run openapi:types` (endpoint nuovi, per `CLAUDE.md`
      § Comandi).

---

## Alternative valutate

| Opzione | Pro | Contro | Motivo scarto |
|---|---|---|---|
| Restare all'Opzione C fase 1 (solo catalogo statico, nessuna persistenza) | Zero rischio, zero tabella nuova | Non copre affatto il requisito P1 "libreria template utente (cloud)" del gap analysis — un catalogo statico non è modificabile dagli utenti, non condivisibile fra sessioni | Non soddisfa l'obiettivo esplicitamente commissionato per la Fase 2 |
| Riusare `site_templates` (ADR-64) aggiungendo `kind: 'section'\|'container'` al suo enum | Nessuna tabella nuova | Confonde due meccanismi di consumo incompatibili (risoluzione automatica per rotta vs inserimento esplicito): il `TemplateResolverService` dovrebbe escludere i nuovi `kind` da ogni risoluzione, un'eccezione strutturale permanente in un servizio pensato per l'altro caso | Violazione di separazione delle responsabilità, rischio di regressione sul resolver esistente |
| Persistenza in `localStorage`/IndexedDB lato client | Nessun endpoint, nessuna tabella | Non condivisibile fra dispositivi/sessioni dello stesso account — esplicitamente scartata da `ADR-34` § "Alternative scartate" per lo stesso motivo | Non soddisfa "libreria... cloud" del gap analysis |
| `category` come stringa libera (nessun enum) | Nessuna manutenzione dell'elenco | Contraddice il principio "whitelist-first, elenco chiuso, mai libero" già applicato a ogni altro campo discriminante del progetto (`SiteTemplateType`, `SectionPreset.category`, network allowlist di `ADR-80`) | Incoerenza con le convenzioni esistenti, nessun beneficio compensativo |
| Ownership per riga (solo il creatore vede/modifica il proprio Template) | Isolamento più stretto | `RFC-F06` § Rischi segnala il rischio ma non lo impone; la riga di permessi editoriali esistente ("Gestire Menu, Template...") non distingue per proprietario per nessun'altra entità simile (Menu, Sezioni globali, Template di tema) — introdurrebbe un'eccezione isolata senza un requisito che la chieda | Incoerenza con il modello RBAC esistente, complessità non richiesta |
| Generazione automatica di thumbnail (screenshot headless a ogni salvataggio) | UX più ricca, nessun upload manuale richiesto | Nuova dipendenza (motore di rendering headless), nuova pipeline asincrona, nessun requisito del gap analysis la chiede esplicitamente oltre "anteprima" (soddisfatta da un'icona/thumbnail caricata a mano) | Over-engineering rispetto al requisito, introduce una dipendenza non giustificata da questa ADR |

---

## Conseguenze

- Una tabella nuova (`templates`), nessuna modifica a tabelle esistenti.
- `TemplatesModule` nuovo in `app/backend/src/`, dipendenza di sola lettura su
  `BlockTreeValidatorService` (`blocks/validator/`) e su `FilesModule` (risoluzione
  `thumbnailMediaGuid` → `thumbnailMediaId`).
- **Zero impatto sull'export statico e sulla cache pubblica** (`ADR-53`/`ADR-23`): un Template non è
  mai raggiungibile dal pubblico, non genera alcuna pagina, non invalida alcuna cache — l'unico
  effetto pubblicabile è quello, indiretto e già esistente, della Pagina in cui il suo contenuto
  viene copiato e poi pubblicata normalmente.
- `TemplateLibraryModal.tsx` (esistente, `ADR-34` § 5) guadagna due tab in più oltre "Sezioni
  Predefinite" (che resta invariata, fonte statica) — nessuna sostituzione del meccanismo esistente,
  solo un'aggiunta.
- Chiude la precondizione T0/T1 di `RFC-F06-template-sezioni.md` § Appendice: un aggiornamento di
  quella RFC (nota, non una nuova firma) può registrare il collegamento a questa ADR come propria
  "azione successiva", su richiesta umana.

## Conformità

- `POST` con `tree` non valido (tipo sconosciuto, annidamento non ammesso, prop fuori schema) è
  respinto `400` con lo stesso formato di errore del validatore di `pages.draftContent`, `path`
  incluso — nessun secondo formato di errore per questa tabella.
- `POST` con `kind` diverso da `'page'` e `tree.blocks.length !== 1` è respinto `400` **prima**
  dell'invocazione del validatore d'albero (verificato con un test che conta le chiamate al
  validatore).
- `DELETE` su un Template già inserito in una Pagina pubblicata non altera in alcun modo il
  contenuto di quella Pagina — verificato salvando una Pagina con un sotto-albero copiato da un
  Template, cancellando il Template, e ri-leggendo la Pagina invariata.
- Un `User` (ruolo 30) riceve `403` su `POST`/`DELETE`, `200` su `GET` — verificato con un test RBAC
  per ciascuna rotta.
- Un Template con `v` di un tipo di blocco precedente, letto via `GET :guid`, restituisce `tree`
  già migrato alla versione corrente — stesso test di non-regressione già richiesto da `ADR-81`/
  `ADR-82`, applicato qui alla lettura di questa tabella.
- `GET` con `mine=true` restituisce solo le righe con `createdBy` uguale all'utente autenticato;
  senza il parametro, restituisce tutte le righe attive indipendentemente dal proprietario.

---

## Decisione umana

**Esito**: [ ] Approvato così com'è · [ ] Approvato con modifiche (vedi note) · [ ] Rifiutato ·
[ ] Rinviato

**Approvato da**: _______________ · **Data**: _______________

**Note**:
