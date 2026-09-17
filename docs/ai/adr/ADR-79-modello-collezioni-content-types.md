# ADR-79 — Collezioni (Content Types): entità nuova a fondamento di Dynamic Tags e Loop Builder

## Status
[x] **In discussione** · [ ] Approvato · [ ] Rifiutato · [ ] Superseded da ADR-XXX

## Data approvazione
_In attesa di firma umana — vedi "Decisione umana" in fondo a questo documento._

## RFC di riferimento
Nessuna RFC dedicata (round R0, vedi ADR-74 § "RFC di riferimento"). Riferimento sostanziale:
`docs/PLAN-parita-elementor-pro.md` § R7 T1, `docs/SPEC-propkind-v2.md` § 3.17/§ 3.18,
`docs/ELEMENTOR_PRO_GAP_ANALYSIS_v2.md` § 4 punto 4.

## Numerazione
Vedi ADR-74 § "Numerazione": questo round occupa ADR-74–ADR-80.

## Assunzione di business-rules coinvolta
Questa ADR **non modifica** l'assunzione A5 di `docs/business-rules.md` (mono-sito, nessuna
colonna `siteId`): le Collezioni restano un'entità mono-sito come le Pagine. Modifica invece
l'affermazione implicita di `docs/constitution.md` § "Il modello di contenuto" regola 1 ("Non
esiste un tipo 'post' privilegiato: qualsiasi tipologia di contenuto è una Pagina") solo per il
caso dichiarato fuori da quella regola: contenuto **strutturato e ripetuto** (prodotti di un
catalogo, membri di un team, voci di FAQ) che Elementor Pro modella come Custom Post Type e loop —
non un contenuto pubblicabile con URL propria come le Pagine.

---

## Contesto

`ELEMENTOR_PRO_GAP_ANALYSIS_v2.md` § 3 individua Dynamic Tags e Loop Builder come le due
funzionalità Pro con il gap architetturale più profondo: entrambe richiedono una sorgente di dati
**ripetuta e strutturata** (una "collezione" di elementi con lo stesso schema) che oggi non esiste
nel dominio — l'unica entità di contenuto è la Pagina, singolare per definizione (Principle 6/7
della constitution, "la pagina è l'entità centrale"). Introdurre "tag hard-coded solo su Pagine"
(alternativa esplicitamente scartata nel piano) risolverebbe Dynamic Tags in modo estremamente
limitato (nessun campo custom, nessuna ripetizione) e non risolverebbe affatto il Loop Builder, che
per natura itera su N elementi con lo stesso template.

Il vincolo costituzionale da rispettare è il Principle 6 ("Content is Data"): un'istanza di
collezione deve essere **dato strutturato validato**, non un secondo formato di contenuto opaco. Il
vincolo da ADR-53 (SSG puro) è altrettanto stringente: gli elementi di una collezione, se usati in
un Loop pubblicato, devono essere risolti **a export-time**, mai a runtime — non esiste un database
raggiungibile dal pubblico che possa rispondere a una query di collezione al volo.

---

## Decisione

1. **Due tabelle nuove**, `collections` e `collection_items`, stesso pattern strutturale di
   `pages`/`page_revisions` (`id serial`, `guid char(16)`, soft delete `isActive`, `version` per
   lock ottimistico, `createdBy`/`updatedBy` — la "Struttura obbligatoria ogni tabella" della
   constitution si applica identica):
   - `collections`: `guid`, `name`, `slug` (identificatore tecnico, usato in `query.source:
     'collection:<slug>'` di `SPEC-propkind-v2.md` § 3.18 — **tecnico**, non un secondo namespace
     di URL pubbliche: le Collezioni non hanno una propria route pubblica, vedi punto 6), `schema`
     (`jsonb`, elenco di campi con `{ key, label, type, required, options? }`, `type` da un elenco
     chiuso: `text|richText|number|boolean|date|media|ref|select` — stesso principio "elenco chiuso,
     mai libero" di ogni `kind` esistente), `isActive`.
   - `collection_items`: `guid`, `collectionId` (FK `restrict/restrict`, come ogni FK del progetto),
     `data` (`jsonb`, validato contro `collections.schema` dallo stesso motore di validazione a
     descrittori del registro blocchi — un secondo interprete per un secondo schema, non un
     interprete generico condiviso: i vincoli di forma sono sufficientemente diversi, vedi
     alternative), `status` (`draft|published|archived`, stesso vocabolario delle Pagine per
     coerenza cognitiva, **non condiviso a livello di codice**: un item di collezione non passa per
     `PagesService`), `slug` (identificatore dell'item dentro la propria collezione, non globale),
     `locale` (una riga per lingua, stesso principio "traduzioni come righe autonome" di A3 — **non**
     un gruppo di traduzione condiviso con le Pagine, ogni collezione gestisce le proprie righe per
     locale indipendentemente), `version`.

2. **Le Collezioni non hanno Revisioni immutabili come le Pagine.** Le Pagine (Principle 6/business
   rule "Ogni pubblicazione produce una Revisione immutabile") sono editoriali e a bassa cadenza di
   scrittura; le Collezioni sono pensate per dati semi-strutturati a cadenza potenzialmente alta
   (import CSV, centinaia di righe, `PLAN-parita-elementor-pro.md` § R7 T1: "import CSV"). Duplicare
   `page_revisions` per `collection_items` moltiplicherebbe lo storage per un caso d'uso che
   Elementor Pro stesso non tratta con versionamento pieno (i CPT WordPress non hanno revisioni
   immutabili per riga in tutti i casi d'uso). Questa ADR **non introduce** `collection_item_
   revisions`: se un round futuro lo richiede per un caso concreto (es. audit di catalogo prodotti),
   sarà una firma a sé — non anticipata qui per evitare lo scaffolding non richiesto che la
   constitution vieta esplicitamente (business-rules.md § "Conseguenza di A5").

3. **Risoluzione a export-time, mai a runtime pubblico** (coerenza stretta con ADR-53): un blocco
   `loop` (`SPEC-propkind-v2.md` § 3.18, `kind: 'query'`) referenzia `collection:<slug>` con filtri,
   ordinamento e paginazione; il worker `static-export`, quando compila una Pagina che contiene un
   nodo `loop`, esegue la query contro `collection_items` **nel piano di gestione** (dove PostgreSQL
   è raggiungibile) e materializza il risultato come markup statico — pagine multiple
   (`?page=N`) per la paginazione "numbers", tutte pre-generate, mai calcolate al volo. La
   paginazione `loadMore`/`infinite` (isola JS, ADR-74) legge da un indice JSON statico
   pre-generato allo stesso momento, mai da una query dal vivo.

4. **`dynamic` (wrapper, `SPEC-propkind-v2.md` § 3.17) risolve `loop.item.<key>` solo dentro
   l'ambito di un blocco `loop`**, con contesto `{page, site, item, loop}` passato dal worker di
   export durante l'iterazione — lo stesso principio di scoping già usato da `insideGlobalSection`
   nel validator attuale (un contesto opzionale passato a valle, non uno stato globale mutabile):
   un `loop.item.<key>` incontrato **fuori** da un blocco `loop` è un errore di risoluzione (fallback
   obbligatorio applicato, warning di build), mai una eccezione che blocca l'intero export.

5. **`page.field.<key>` (Dynamic Tags su Pagina) richiede campi custom per Pagina**, un concetto
   distinto dalle Collezioni: questa ADR **non li introduce**. `page_fields` (menzionato come ipotesi
   nel gap analysis riga 92) resta fuori scopo — le Collezioni risolvono il caso "N elementi con lo
   stesso schema", non "campi extra su una singola Pagina". Se un round futuro estende `pageEntity`
   con un campo `customFields: jsonb`, sarà una ADR a sé stante (nessuna colonna aggiunta oggi:
   principio "niente scaffolding anticipato", stesso di ADR-77 § "Alternative" per i breakpoint non
   consumati).

6. **Le Collezioni non generano URL pubbliche proprie in questo round.** Un `collection_item`
   published è visibile solo **attraverso** un Loop in una Pagina esistente o, se un round futuro lo
   richiede, tramite un Theme Template `archive`/`single` (ADR di R7 non ancora scritta, dipendente
   da questa). Introdurre routing pubblico per le Collezioni ora anticiperebbe una decisione (schema
   URL, slug uniqueness, sitemap) che il PLAN colloca esplicitamente in R7 T5 ("Pagine speciali:
   archivio collezione") come task successivo, non fondativo.

7. **CRUD amministrativo delle Collezioni è Manager+** (stessa soglia RBAC delle Pagine, coerente
   con il ruolo editoriale già mappato in `business-rules.md` A4): un Manager crea/modifica righe,
   solo Admin+ definisce lo `schema` di una Collezione (cambiare lo schema è un'operazione
   strutturale con impatto su ogni riga esistente, stessa cautela di un `v` bump di tipo di blocco —
   ADR-21 — applicata qui allo schema di collezione).

---

## Alternative valutate

| Opzione | Pro | Contro | Motivo scarto |
|---|---|---|---|
| Tag/campi dinamici hard-coded solo su Pagine, nessuna Collezione | Nessuna tabella nuova | Non risolve il Loop Builder (nessuna sorgente ripetuta); Dynamic Tags limitati a pochi campi fissi | Non copre la metà dei requisiti P2 del gap analysis |
| Riusare `pages` per gli item di collezione (un "tipo" di Pagina) | Nessuna tabella nuova, riuso di `PagesService` | Contraddice direttamente Principle 6/7 ("non esiste un tipo post privilegiato... ogni Pagina ha URL/SEO/revisioni propri") — un item di catalogo con centinaia di righe non deve produrre centinaia di Pagine con Revisioni immutabili e SEO pieno | Violazione diretta di un principio costituzionale, costo di storage e complessità sproporzionato |
| Schema di Collezione libero (JSON Schema arbitrario, non un elenco chiuso di `type`) | Massima flessibilità | Riapre esattamente il problema che il registro dei blocchi ha già risolto scegliendo `kind` chiusi: un validator generico per JSON Schema arbitrario è una superficie enorme e non allineata al resto del progetto | Incoerenza architetturale, superficie di validazione ingestibile |
| Revisioni immutabili anche per `collection_items`, fin da subito | Simmetria con le Pagine | Nessun caso d'uso del gap analysis lo richiede oggi; moltiplica lo storage per import di massa | Over-engineering rispetto al requisito attuale |
| URL pubbliche per le Collezioni fin da subito | Copertura "completa" anticipata | Anticipa una decisione (routing, sitemap, conflitti di slug con le Pagine) che il piano colloca deliberatamente dopo (R7 T5), a valle di Dynamic Tags/Loop che sono i consumer reali di R0 | Sequenza del piano non negoziabile (R0 → ... → R7) |

---

## Conseguenze

- Due tabelle nuove: `collections`, `collection_items`, con FK `restrict/restrict` fra loro e verso
  `users` per `createdBy`/`updatedBy`, indici su `(collectionId, slug, locale)` per l'unicità della
  riga (stesso principio dei due indici parziali di `pages` per lo slug, adattato: qui non c'è
  gerarchia `parentId`, la chiave è più semplice).
- Un secondo motore di validazione (`CollectionItemValidatorService` o analogo), guidato da
  `collections.schema` invece che dal registro dei tipi di blocco — non condiviso col validator dei
  blocchi (`BlockTreeValidatorService`), perché valida un oggetto piatto per riga, non un albero
  ricorsivo con annidamento e figli.
- Il worker `static-export` guadagna una dipendenza di lettura sulle Collezioni quando una Pagina
  contiene un blocco `loop`; l'NFR "build + sync entro 5 secondi" di ADR-53 va rivalutato per
  Pagine con Loop su collezioni grandi (paginazione statica multi-file, non un singolo file più
  pesante).
- UI Admin nuova (fuori scopo di questa ADR, task di R7): lista Collezioni, form generato dallo
  schema, import CSV con mappatura colonne → campi.
- Import CSV richiede una pipeline di validazione riga-per-riga con lo stesso principio "mai 500,
  sempre un `MigrationResult`/report" già in uso per le migrazioni di blocco (ADR-21).

## Conformità

- Nessun `collection_item` è raggiungibile da un endpoint pubblico se non attraverso un Loop
  materializzato in una Pagina pubblicata — verificato assicurando che non esista alcuna rotta
  `public/collections/*` in questo round.
- `data` di un `collection_item` non valida contro lo `schema` corrente della propria Collezione
  produce lo stesso trattamento di un albero blocchi non valido: `400` con path del campo
  colpevole, mai persistenza parziale.
- Un `loop.item.<key>` risolto fuori dal contesto di un blocco `loop` produce un warning di build,
  mai un'eccezione che interrompe l'intero export della Pagina.
- Cambiare `collections.schema` non cancella `data` esistente sulle righe: i campi rimossi dallo
  schema restano nel `jsonb` (ignorati dal render, non dal validator, che verifica solo i campi
  dichiarati correnti) — stesso principio difensivo delle migrazioni di ADR-21.
- CRUD Collezioni sotto RBAC: un `User` (ruolo 30) non può creare/modificare una Collezione né i
  suoi item; solo Admin+ può modificarne lo `schema`.

---

## Decisione umana

**Esito**: [ ] Approvato così com'è · [ ] Approvato con modifiche (vedi note) · [ ] Rifiutato ·
[ ] Rinviato

**Approvato da**: _______________ · **Data**: _______________

**Note**:
