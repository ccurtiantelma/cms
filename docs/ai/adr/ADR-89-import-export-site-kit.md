# ADR-89 — Import/Export Site Kit: formato pacchetto, pipeline asincrona, risoluzione dei conflitti

## Status
[x] **In discussione** · [ ] Approvato · [ ] Rifiutato · [ ] Superseded da ADR-XXX

## Data approvazione
_In attesa di firma umana — vedi "Decisione umana" in fondo a questo documento._

## RFC di riferimento
Nessuna RFC dedicata: round **R8 — Piattaforma** di `docs/PLAN-parita-elementor-pro.md` § R8, prima
riga ("Kit import/export"). Riferimento sostanziale: `docs/ELEMENTOR_PRO_GAP_ANALYSIS_v2.md` § 3
("Import/Export kit (JSON del sito) | ✗ | export `pages+templates+tokens+media manifest`").

## Numerazione
Vedi `ADR-88-theme-builder-e-condizioni-visualizzazione.md` § "Numerazione": round R8, primo numero
libero dopo R7 (ADR-88).

## ADR di riferimento (non superate, non modificate)
- `ADR-56-template-library-import-export-json.md` — precedente diretto per il principio "l'euristica
  anticipa, il validatore server-side resta l'autorità" e per "rigetto per intero, mai inserimento
  parziale". Questa ADR **non estende** il meccanismo di ADR-56 (client-side, sotto-alberi singoli,
  nessun endpoint): introduce una pipeline **server-side** distinta per un volume di dati ordini di
  grandezza superiore (l'intero sito), con proprio formato e propria coda.
- `ADR-34-subtree-insertion-engine-preset-statici.md` § 2 — punto unico di rigenerazione `id`
  ricorsiva; questa ADR lo **estende** a un contesto batch (§ 4) senza introdurre una terza
  implementazione indipendente.
- `ADR-77-global-kit-schema.md` / `docs/ai/specs/SPEC-GLOBAL-KIT.md` — `global_kit` è il "token
  globali" del formato pacchetto (§ 1); questa ADR non ne ridichiara lo schema.
- `ADR-79-modello-collezioni-content-types.md`, `ADR-83-tabella-templates-e-api-libreria.md`,
  `ADR-88-theme-builder-e-condizioni-visualizzazione.md` — le quattro entità di contenuto che il kit
  esporta (`pages`, `templates`, `collections`+`collection_items`, `theme_templates`) restano
  invariate nel proprio schema; questa ADR ne definisce solo la serializzazione portabile.
- `ADR-8-storage-abstraction-files.md` / `ADR-35-elenco-file-e-protezione-referenziale-media.md` —
  l'astrazione di storage e la protezione referenziale dei media restano il meccanismo con cui il
  manifest media (§ 1.5) viene ri-materializzato in scrittura (§ 4 punto 3).
- `ADR-53-air-gapped-ssg-zero-db.md` — un import completato con successo accoda
  `enqueueFullSiteExport` come ogni altra modifica di contenuto di massa, stesso meccanismo, nessuna
  scorciatoia che scriva direttamente sul volume pubblico.
- `ADR-78-sanitizzazione-css-e-sandbox-html.md` / `ADR-77` § "Decisione" punto 6 — `customCode` resta
  una superficie Admin+-gated con un solo controllo (l'umano che lo scrive): questa ADR la esclude
  deliberatamente dal formato portabile (§ 2 punto 5).

---

## Contesto

`docs/ELEMENTOR_PRO_GAP_ANALYSIS_v2.md` § 3 chiede un formato di scambio che copra l'intero sito:
Pagine, Template di libreria, Collezioni, token globali (Global Kit) e un manifest dei media
referenziati. A differenza dell'import/export JSON già approvato da `ADR-56` — un meccanismo
client-side pensato per un **singolo sotto-albero** copiato a mano fra due punti dello stesso editor
— un Site Kit copre potenzialmente migliaia di righe e centinaia di file binari: non è più un
problema di euristica di validazione client, è un problema di **pipeline asincrona server-side** con
gestione di conflitti fra installazioni diverse (due Collezioni con lo stesso slug, un Global Kit già
configurato sull'istanza di destinazione, media duplicati per contenuto).

Il vincolo architetturale che ADR-56 non aveva dovuto affrontare: un Site Kit può contenere
riferimenti incrociati fra le proprie entità (`mediaRef` dentro `pages`/`collections`,
`colorRef`/`fontRef` dentro qualunque albero verso id del Global Kit importato, `loop.item.<key>`
dentro un Loop verso una Collezione importata nello stesso pacchetto) — l'importazione deve
rigenerare gli identificatori (stesso principio "nessun id sopravvive", `ADR-34`) e **rimappare** ogni
riferimento incrociato in un ordine di dipendenza corretto, non semplicemente validare ogni entità in
isolamento.

---

## Decisione

### 1. Formato del pacchetto — archivio, non un unico JSON

Un Site Kit è un archivio ZIP (`.eaidoskit`, estensione distintiva ma MIME `application/zip`
standard — nessun formato binario proprietario), non un singolo file JSON: i media (potenzialmente
centinaia di MB) non sono economicamente rappresentabili come base64 dentro un blob JSON, e separare
metadati (piccoli, leggibili) da binari (grandi, opachi) permette di validare/mostrare un riepilogo
del pacchetto prima di scaricare/processare i file pesanti.

```
site-kit.eaidoskit
├── manifest.json          — § 1.1
├── global-kit.json         — § 1.2
├── collections.json        — § 1.3
├── templates.json          — § 1.4
├── theme-templates.json    — § 1.4
├── pages.json              — § 1.4
└── media/
    ├── manifest.json        — § 1.5
    └── <hash-sha256>.<ext>  — un file per ogni media referenziato, nominato per hash di contenuto
```

#### 1.1 `manifest.json`

```ts
interface SiteKitManifest {
  formatVersion: 1;              // elenco chiuso a un solo valore oggi, stesso principio di
                                  // `ClipboardEnvelope.v` (SPEC-CLIPBOARD.md § 1.2): un formato
                                  // diverso da quelli noti è respinto per intero, mai un tentativo
                                  // di migrazione del pacchetto stesso
  exportedAt: string;             // ISO-8601, solo diagnostico
  exportedByEmail: string;        // solo diagnostico, mai usato per decidere permessi in importazione
  cmsVersionHint: string;         // stringa libera, solo diagnostico (nessuna compatibilità verificata su questo campo)
  counts: { pages: number; collections: number; collectionItems: number; templates: number;
            themeTemplates: number; mediaFiles: number };
}
```

`counts` permette al wizard di importazione (§ 5) di mostrare un riepilogo ("Questo kit contiene 42
pagine, 3 collezioni, 210 elementi, 15 template, 4 theme template, 87 media") **prima** di avviare la
pipeline pesante — un controllo di forma economico che non deve attendere l'elaborazione completa per
dare un primo riscontro, stesso principio già scelto da `docs/ai/specs/SPEC-CLIPBOARD.md` § 4
("controlli a costo crescente, falliscono presto quando possibile").

#### 1.2 `global-kit.json`

Serializzazione integrale di `GlobalKitValue` (`docs/ai/specs/SPEC-GLOBAL-KIT.md` § 1), **con
un'esclusione deliberata**: il campo `customCode` non è mai incluso nell'export, indipendentemente
da chi esporta o importa. Motivo di sicurezza: un Site Kit è pensato per circolare fra installazioni
gestite dallo stesso operatore o distribuito come "starter kit" di terze parti — importare
`customCode` altrui inietterebbe snippet HTML/`<script>` arbitrari (`ADR-77` § "Decisione" punto 6:
"nessuna sanitizzazione HTML... resta Admin+ come unico controllo") attraverso un canale che **non**
richiede la stessa consapevolezza esplicita di un Admin che scrive quello stesso codice a mano
nell'inspector. `customFonts`/`customIcons` **sono** inclusi (i file referenziati vivono nel manifest
media, § 1.5): non hanno la stessa superficie di rischio, sono asset statici (font/SVG) già
sanitizzati alla propria origine (`ADR-78` § 10, `DOMPurify` "svg-strict" per le icone custom).

#### 1.3 `collections.json`

```ts
interface SiteKitCollections {
  collections: Array<Pick<CollectionRow, 'slug' | 'name' | 'schema'>>;
  items: Array<{ collectionSlug: string; slug: string; locale: string; status: string; data: unknown }>;
}
```

Riferimento per **slug**, non per `id`/`guid` (§ 4 punto 1: lo slug è la chiave di conflitto in
importazione, coerente con `ADR-79` § "Decisione" punto 1 dove lo slug è già "identificatore
tecnico"). Nessuna Revisione (le Collezioni non le hanno, `ADR-79` § "Decisione" punto 2, invariato
in questo contesto).

#### 1.4 `templates.json` / `theme-templates.json` / `pages.json`

Ciascuno un array di righe **spogliate di `id`/`guid`** (stesso principio "unico metadato di istanza
locale", `ADR-56` § "Decisione" punto 2, esteso qui a interi record invece che a singoli nodi
dell'albero): `templates.json` porta `name/category/kind/tree`; `theme-templates.json` porta
`name/kind/priority/locale/contentTree/conditions`; `pages.json` porta `slug/parentSlug (invece di
parentId numerico)/locale/status/template/seo/customFields/coverImageMediaHash (invece di
coverImageMediaId, risolto contro il manifest media)/draftContent`. Ogni albero (`tree`/`contentTree`/
`draftContent`) mantiene i propri nodi con `id` originali **non** rigenerati a questo stadio — la
rigenerazione avviene **una sola volta**, in scrittura durante l'importazione (§ 4 punto 2), mai
durante l'esportazione (che deve restare un'operazione di sola lettura, ripetibile senza effetti
collaterali sul sito di origine).

#### 1.5 `media/manifest.json`

```ts
interface MediaManifestEntry {
  hash: string;      // sha256 esadecimale del contenuto binario, nome del file dentro media/
  originalName: string;
  mimeType: string;
  sizeBytes: number;
}
```

Nessun `guid` di origine in questo manifest: il file è identificato **solo per contenuto** (hash),
mai per l'id che aveva sull'installazione di origine — un id di file non ha alcun significato fuori
da quella installazione, a differenza dello slug di una Pagina/Collezione che è un identificatore di
dominio scelto dall'autore. Ogni `mediaRef` dentro `pages.json`/`collections.json`/ecc. referenzia un
media **per hash**, non per guid (stesso principio, coerenza interna del formato).

### 2. Export — sola lettura, Manager+

`POST api/v1/app/site-kit/export` — **Guard**: `GuardManager` (Manager+, stessa soglia di "Gestire
Menu, Template, Sezioni globali", coerente con l'asimmetria già stabilita altrove in questo progetto
fra leggere/esportare — meno rischioso — e importare — più rischioso, § 3). Avvia un job BullMQ
(`site-kit-export`, coda dedicata, stesso riuso dell'infrastruttura di `ADR-11`) che:

1. Legge per intero (in sola lettura, nessuna scrittura) `pages` (bozze correnti, non le Revisioni:
   un kit trasporta lo stato editoriale attuale, non la storia — coerente con l'assenza di Revisioni
   per le Collezioni, `ADR-79` § "Decisione" punto 2, applicata qui per simmetria anche alle Pagine
   nel contesto di un kit), `collections`+`collection_items`, `templates`, `theme_templates`,
   `app_settings.global_kit`.
2. Raccoglie l'insieme dei `mediaRef` effettivamente referenziati (non l'intera libreria media del
   sito — un kit non è un backup, esporta solo ciò che il contenuto selezionato usa davvero, stesso
   principio di minimalità già scelto per il manifest media di `ADR-35`), calcola l'hash SHA-256 di
   ciascun file, li copia in `media/` dell'archivio.
3. Scrive `manifest.json` con i conteggi finali, produce l'archivio ZIP, lo rende disponibile per il
   download (stesso pattern "job asincrono + notifica di completamento" già in uso per
   `ADR-10-export-liste-report.md`, nessuna reinvenzione del meccanismo di export generico esistente).

Nessuna scrittura sul database durante l'export: un export fallito a metà (job interrotto) non lascia
alcuno stato parziale, per costruzione (sola lettura).

### 3. Import — pipeline asincrona, **SuperAdmin only**

`POST api/v1/app/site-kit/import` — **Guard**: `GuardSuperAdmin` (match esatto, non `<=`, stesso
principio già in uso per le "Funzioni di sistema" di `business-rules.md` § "Funzioni di sistema (solo
SuperAdmin)": seed/reset demo). Motivazione della soglia più alta di ogni altra introdotta da questo
intero piano di parità Elementor: l'importazione è l'unica operazione di questo progetto che può
**creare in blocco** un volume arbitrario di Pagine/Collezioni/Template/media a partire da un file
fornito dall'operatore, potenzialmente proveniente da una terza parte (un "kit" scaricato) — anche con
`customCode` escluso (§ 1.2) e ogni entità rivalidata (§ 4 punto 4), il solo volume e l'origine
potenzialmente non fidata giustificano la stessa cautela già riservata alle funzioni distruttive/di
sistema, non la soglia Manager+ dell'export (che è invece a rischio minimo, sola lettura). L'export
resta Manager+ proprio per marcare questa asimmetria: leggere/pacchettizzare il proprio sito è
un'azione editoriale ordinaria, farvi entrare un pacchetto esterno non lo è.

Avvia un job BullMQ (`site-kit-import`, coda dedicata) — mai una richiesta HTTP sincrona: un
pacchetto con centinaia di media supererebbe qualunque timeout ragionevole, stesso principio già
scelto per `enqueueFullSiteExport` (`ADR-45`/`ADR-53`, un'operazione di massa non è mai sincrona in
questo progetto). Progresso e report finale via il meccanismo di notifiche già esistente (`ADR-12`),
nessuna coda nuova per la notifica stessa.

### 4. Algoritmo di importazione — ordine di dipendenza, rigenerazione unica, remap dei riferimenti

1. **Validazione di forma del pacchetto** (economica, prima di ogni scrittura): `manifest.json`
   presente e `formatVersion` noto (§ 1.1 — un formato futuro sconosciuto è respinto per intero, mai
   un tentativo di leggerlo parzialmente), dimensione totale dell'archivio entro un limite
   configurabile (default 500 MB — un pacchetto oltre soglia è respinto prima di essere aperto, per
   limitare il caso peggiore di durata/risorse del job), ogni file dichiarato in `media/manifest.json`
   presente nell'archivio con l'hash dichiarato verificato (un hash che non corrisponde al contenuto
   reale del file è un pacchetto corrotto o manomesso, respinto per intero — stesso principio "rigetto
   per intero, mai parziale" di `ADR-56`).
2. **Media, per primi**: per ogni entry di `media/manifest.json`, calcola l'hash del file già presente
   in `FilesModule` (se un file con lo stesso hash SHA-256 esiste già sull'installazione di
   destinazione, **riusalo** — nessun duplicato di storage, stesso principio di deduplicazione già
   implicito nella protezione referenziale di `ADR-35`); altrimenti carica il file come nuovo,
   ottenendo un nuovo guid. Costruisce una mappa `hash → guid-destinazione`, usata al punto 5.
3. **Global Kit**: mai applicato automaticamente. L'import propone sempre una scelta esplicita
   all'operatore (§ 5, wizard) fra `skip` (il Global Kit di destinazione resta invariato, i
   `colorRef`/`fontRef` del contenuto importato che puntano a id del kit importato risolvono al
   fallback `primary`/warning esattamente come un id cancellato, `ADR-77` § "Conformità" — comportamento
   già previsto, non un caso nuovo) o `replace` (il Global Kit di destinazione è sostituito per
   intero da quello del pacchetto, con lo stesso lock ottimistico su `version` già in uso per
   `PUT app/settings/global-kit`) — **mai** un merge automatico campo-per-campo: un Global Kit è un
   singleton coerente al proprio interno (`ADR-77` § "Decisione" punto 1), un merge parziale
   produrrebbe combinazioni di colori/tipografia mai validate insieme dall'autore originale del kit
   importato né da quello di destinazione.
4. **Collezioni** (schema + item), poi **Template**, poi **Theme Template**, poi **Pagine** — ordine
   di dipendenza: le Collezioni devono esistere prima che un `loop`/`dynamic` dentro un Template/Theme
   Template/Pagina possa referenziarle; le Pagine sono ultime perché nessun'altra entità dipende da
   loro (i Template sono copiati all'inserimento, non referenziati da una Pagina come entità viva,
   `ADR-83` § "Decisione" punto 2). Per ciascun gruppo:
   - **Conflitto per chiave naturale** (slug per Collezioni/Pagine, `(kind, category, name)` come
     euristica di solo avviso per Template/Theme Template — non una chiave di unicità reale, quei
     record non hanno un identificatore di dominio stabile oltre al proprio guid rigenerato):
     l'operatore sceglie, per gruppo di entità, una fra tre strategie (§ 5): **`skip-existing`**
     (default: un conflitto non tocca la riga esistente, la riga del pacchetto non viene importata),
     **`overwrite`** (la riga esistente è sostituita, richiede conferma esplicita nel wizard),
     **`duplicate`** (la riga del pacchetto è creata comunque, con lo slug reso univoco aggiungendo un
     suffisso `-import-2`/`-import-3`… — mai una collisione di slug silenziosa).
   - **Rigenerazione degli id — punto unico, esteso da `ADR-34`**: ogni riga importata (Collezione,
     item, Template, Theme Template, Pagina) riceve un nuovo `guid` generato dal backend, mai quello
     del pacchetto; ogni nodo di ogni albero (`tree`/`contentTree`/`draftContent`) riceve un nuovo
     `id` tramite la **stessa** funzione di rigenerazione ricorsiva già usata da
     `duplicateSubtree`/`insertSubtreeAction`/dalla verifica clipboard (`ADR-34` § 2,
     `docs/ai/specs/SPEC-CLIPBOARD.md` § 3.4) — invocata qui in un ciclo batch su N alberi invece che
     su un singolo sotto-albero, stessa funzione, nessuna quarta implementazione.
   - **Remap dei riferimenti incrociati**: una funzione nuova, `remapGuidReferences(tree, guidMap)`,
     cammina ogni albero con lo stesso visitatore ricorsivo già usato da `BlockTreeValidatorService`
     per attraversare `props`/`children` (nessun secondo attraversatore ad hoc) e sostituisce, per
     ogni prop il cui `kind` porta un riferimento esterno (`mediaRef` → `guidMap` del punto 2,
     `colorRef`/`fontRef` con `{ref: <id>}` → nuovo id del Global Kit se `replace` al punto 3 è stato
     scelto, `pageRef`/`link.href` verso un'altra Pagina del pacchetto → nuovo guid di quella Pagina se
     importata nello stesso job, `query.source: \`collection:${slug}\`` → invariato, per slug non per
     id), un riferimento verso un'entità **non presente** nello stesso pacchetto (es. un `pageRef`
     verso una Pagina del sito di origine non inclusa nell'export) resta con il proprio valore
     originale e produce un warning nel report finale ("riferimento non risolvibile, verificare
     manualmente") — mai una cancellazione silenziosa del riferimento.
5. **Validazione server-side autoritativa, invariata**: ogni albero, dopo remap, attraversa la stessa
   `BlockTreeValidatorService`/DTO applicativo già usato per una scrittura ordinaria — un'entità che
   non supera questo controllo (es. un tipo di blocco non più nel registro dell'installazione di
   destinazione, uno schema di Collezione con un `type` di campo non riconosciuto) è **saltata**
   individualmente con un warning nel report, non fa fallire l'intero import (stesso principio
   "rigetto per riga, mai per l'intero pacchetto quando la riga è indipendente dalle altre" — a
   differenza del pacchetto stesso, che al punto 1 è respinto per intero se **strutturalmente**
   illeggibile).
6. **Report finale**: `{ created, skipped, overwritten, duplicated }` per gruppo di entità, più
   l'elenco di ogni warning prodotto ai punti 3-5 — consegnato via notifica (`ADR-12`), consultabile
   nella cronologia import (§ 6).
7. **Chiusura**: un import che ha creato/modificato almeno una riga accoda `enqueueFullSiteExport`
   (`ADR-45`/`ADR-53`) al termine — stesso meccanismo di ogni altra modifica di massa, nessuna
   scorciatoia diretta sul volume pubblico.

### 5. Wizard di importazione

Superficie frontend, non vincolata in dettaglio di componenti da questa ADR oltre al flusso: (1)
upload del file, (2) lettura di `manifest.json` e mostra del riepilogo (§ 1.1 `counts`) **prima** di
avviare il job pesante, (3) scelta della strategia di conflitto per ciascun gruppo di entità (§ 4
punto 4) e della strategia Global Kit (§ 4 punto 3), (4) conferma esplicita e avvio del job, (5)
avanzamento/risultato tramite lo stesso pattern di notifica già in uso per altri job lunghi del
progetto.

### 6. Cronologia import — nessuna nuova tabella

Il report di ogni import (§ 4 punto 6) è persistito in `audit_log` (tabella esistente, `ADR-` di
riferimento nel modulo Auth/Security — stesso principio già in uso per ogni azione sensibile
tracciata: pubblicazione, soft delete, impersonificazione), come singola riga con `action:
'site-kit-import'` e `details` contenente il report JSON — nessuna tabella dedicata per una
cronologia che l'infrastruttura di audit esistente copre già.

---

## Alternative valutate

| Opzione | Pro | Contro | Motivo scarto |
|---|---|---|---|
| Un unico file JSON con media in base64 invece di un archivio ZIP | Un solo file da maneggiare | Base64 gonfia il peso dei binari del ~33%; nessuna possibilità di leggere `manifest.json` senza scaricare/parsare l'intero payload pesante | Costo di banda e di UX (nessun riepilogo rapido) senza beneficio |
| Merge automatico del Global Kit importato con quello di destinazione (per singolo campo) | Nessuna scelta richiesta all'operatore | Produce combinazioni di colori/tipografia mai validate insieme da nessun autore, un risultato visivamente imprevedibile | Un Global Kit è un singleton coerente per costruzione (`ADR-77`), un merge parziale lo rompe |
| Import sincrono (richiesta HTTP che attende il completamento) | Nessuna infrastruttura di coda/notifica da coinvolgere | Timeout inevitabile su pacchetti con centinaia di media; blocca il thread di gestione per la durata dell'intero job | Contraddice il principio già stabilito per ogni operazione di massa di questo progetto (`enqueueFullSiteExport`) |
| Soglia Manager+ anche per l'importazione, simmetrica all'esportazione | Coerenza di soglia fra le due operazioni | Sottostima il rischio reale: l'importazione crea contenuto in blocco da una fonte potenzialmente esterna, l'esportazione è sola lettura del proprio sito — le due operazioni non sono equivalenti in rischio | Asimmetria di rischio reale, non un'incoerenza da correggere |
| `customCode` incluso nel formato portabile, con un avviso a schermo in importazione | Portabilità "completa" del sito | Un avviso a schermo non impedisce un'importazione distratta di script arbitrari; la soglia Admin+ di scrittura diretta (`ADR-77`) verrebbe aggirata da un canale di importazione con soglia diversa | Un avviso non sostituisce un controllo strutturale; l'esclusione è più sicura di un avviso |
| Riferimenti fra entità per id/guid del pacchetto invece che per slug/hash | Nessuna necessità di risolvere per chiave naturale | Un id/guid non ha significato fuori dall'installazione di origine (verrà comunque rigenerato all'importazione, § 4 punto 4) — usarlo come chiave di conflitto confonderebbe "stesso record" con "stesso id per caso", specialmente fra due export dello stesso sito in momenti diversi | Lo slug/l'hash sono le uniche chiavi che sopravvivono con significato attraverso una rigenerazione di id |

---

## Conseguenze

- `SiteKitModule` nuovo in `app/backend/src/`, due code BullMQ (`site-kit-export`,
  `site-kit-import`), riuso dell'infrastruttura di job/notifica esistente (`ADR-11`/`ADR-12`).
- Nessuna modifica allo schema delle entità esportate (`pages`, `collections`, `collection_items`,
  `templates`, `theme_templates`, `app_settings.global_kit`, `files`): il formato del pacchetto è una
  **proiezione** di quelle tabelle, non un nuovo schema di persistenza.
- Una funzione nuova, `remapGuidReferences`, aggiunta al modulo blocchi, riusata da qualunque futuro
  consumer che debba rimappare riferimenti incrociati in un batch di alberi (nessun altro consumer
  oggi).
- `audit_log` guadagna un nuovo valore di `action` (`site-kit-import`), nessuna modifica di schema
  (colonna `details` già `jsonb`).
- Limite di dimensione pacchetto (500 MB) configurabile via `app_settings`, stesso pattern singleton
  già in uso altrove — dettaglio di implementazione, non vincolato a un valore immutabile da questa
  ADR.
- `npm run openapi:export && npm run openapi:types` richiesto per i due endpoint nuovi
  (`CLAUDE.md` § Comandi).

## Conformità

- Test: un pacchetto con `formatVersion` sconosciuto è respinto per intero, prima di ogni lettura di
  contenuto.
- Test: un file `media/` il cui hash reale non corrisponde a quello dichiarato nel manifest fa
  fallire la validazione dell'intero pacchetto (§ 4 punto 1), non solo di quel file.
- Test di deduplicazione media: importare due volte lo stesso pacchetto non duplica alcun file in
  `FilesModule` (stesso hash → stesso guid riusato al secondo import).
- Test di conflitto: una Collezione con slug già esistente sull'installazione di destinazione,
  importata con strategia `skip-existing`, non altera la riga esistente; con `overwrite`, la
  sostituisce; con `duplicate`, crea una seconda riga con slug suffissato.
- Test di remap: un `mediaRef` dentro una Pagina importata punta, dopo l'import, al guid di
  destinazione del file corrispondente (non al guid originale del pacchetto, mai presente
  sull'installazione di destinazione).
- Test di riferimento non risolvibile: un `pageRef` verso una Pagina non inclusa nel pacchetto
  sopravvive invariato con un warning nel report, mai una cancellazione silenziosa del campo.
- Test RBAC: un `Manager` riceve `403` su `POST site-kit/import`, `200` su `POST site-kit/export`; un
  `SuperAdmin` riceve `200` su entrambi.
- Test `customCode`: un `global-kit.json` esportato non contiene mai la chiave `customCode`,
  verificato ispezionando l'archivio prodotto da un sito con `customCode` configurato.
- Test di chiusura: un import che ha creato almeno una riga accoda esattamente un
  `enqueueFullSiteExport`; un import interamente `skip-existing` (nessuna riga creata/modificata) non
  ne accoda alcuno.

---

## Decisione umana

**Esito**: [ ] Approvato così com'è · [ ] Approvato con modifiche (vedi note) · [ ] Rifiutato ·
[ ] Rinviato

**Approvato da**: _______________ · **Data**: _______________

**Note**:
