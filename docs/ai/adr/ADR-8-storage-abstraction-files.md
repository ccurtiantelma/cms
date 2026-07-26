# ADR-8 — Storage abstraction per upload documenti (`FilesModule`)

## Status
[ ] In discussione · [x] Approvato · [ ] Rifiutato · [ ] Superseded da ADR-XXX

## Data approvazione
2026-07-23 — approvato da: ccurti (via chat, incluse le due approvazioni
separate richieste in Conseguenze: modifica `schema.ts` e dipendenza npm
`@aws-sdk/client-s3`).

## RFC di riferimento
Nessuna RFC dedicata. Punto 4 di un'analisi/audit richiesta esplicitamente
dall'umano (stesso audit di ADR-6 = punto 2, ADR-7 = punto 3).

## Contesto

Quasi ogni gestionale che erediterà questo starter-kit avrà una feature "carica
documento" (contratti, ricevute, fatture, verbali, allegati generici). Lo
starter-kit attuale non ha nessuna componente per questo: nessuna tabella
metadata, nessun endpoint di upload/download, nessuna astrazione di storage.
Senza una base comune, ogni progetto verticale reinventerebbe da zero questa
componente — con rischio concreto di implementazioni divergenti (path
traversal se il nome file originale viene usato come path su disco, assenza di
soft-delete/audit standard, filesystem esposto direttamente senza controllo
d'accesso).

C'è inoltre un vincolo tecnico introdotto da ADR-6 (containerizzazione
produzione): se l'app gira su più repliche/container, un driver che scrive solo
su disco locale del container rende i file irraggiungibili da repliche diverse
da quella che li ha salvati (nessun volume condiviso garantito). Serve quindi
un'astrazione che permetta disco locale in sviluppo (zero dipendenze esterne,
massima velocità di onboarding) ma uno storage condiviso/object storage in
produzione, senza che il codice applicativo (service, controller) sappia quale
dei due è in uso.

## Decisione

Nuovo modulo core `app/backend/src/files/`:

```
src/files/
├── files.module.ts
├── files.controller.ts        (POST upload, GET download by guid, DELETE soft-delete)
├── files.service.ts           (metadata, validazione, delega allo storage driver)
├── dto/
│   └── upload-file-response.dto.ts
└── storage/
    ├── storage-driver.interface.ts   (upload/download/delete — contratto comune)
    ├── local-disk.driver.ts          (dev: filesystem locale)
    └── s3-compatible.driver.ts       (prod: AWS S3 / MinIO / qualunque endpoint S3-compatibile)
```

**Interfaccia comune** (`storage-driver.interface.ts`):
```ts
interface StorageDriver {
  upload(key: string, buffer: Buffer, mimeType: string): Promise<void>;
  download(key: string): Promise<NodeJS.ReadableStream>;
  delete(key: string): Promise<void>;
}
```
Il resto del codice (`FilesService`, `FilesController`) dipende solo da
questa interfaccia, mai da un driver concreto — iniettata via token DI
(`STORAGE_DRIVER`) scelto in `files.module.ts` in base a
`AppConstants.storageDriver`.

**Selezione driver** — nuova variabile `STORAGE_DRIVER` (`local` default in
sviluppo, `s3` in produzione), letta esclusivamente via `AppConstants` (mai
`process.env` diretto, CLAUDE.md):
- `local`: `LocalDiskDriver` scrive sotto `STORAGE_LOCAL_PATH` (default
  `./storage`, escluso da git); nessuna dipendenza npm nuova.
- `s3`: `S3CompatibleDriver` usa `@aws-sdk/client-s3` (endpoint configurabile
  via `STORAGE_S3_ENDPOINT` — vuoto per AWS reale, valorizzato per puntare a
  un MinIO self-hosted o altro provider S3-compatibile). Stesso client per
  MinIO e AWS S3 perché entrambi parlano l'API S3: **non serve un driver
  MinIO separato**.

**Tabella `files`** (`app/backend/src/db/schema.ts`, aggiunta proposta —
segue la struttura obbligatoria CLAUDE.md id/guid/isActive/created*/updated*):
```
id               serial PRIMARY KEY
guid             char(16)                 ← usato nelle URL pubbliche (GET /files/:guid)
originalName     varchar(255)             ← solo per display, MAI usato come path fisico
mimeType         varchar(150)
sizeBytes        integer
storageDriver    varchar(20)              ← 'local' | 's3', quale driver ha salvato il file
storageKey       varchar(500) UNIQUE      ← path/key generato (Utils.randomString), mai il nome originale
checksumSha256   varchar(64)              ← nullable, integrità/dedup futuro
entity           varchar(100)             ← nullable, riusa il pattern generico già presente in audit_log
entityId         varchar(100)             ← nullable, id/guid dell'entità di dominio a cui è allegato
isActive         boolean DEFAULT true
createdAt/updatedAt/createdBy/updatedBy   ← standard, FK { onDelete: 'restrict', onUpdate: 'restrict' }
```
`entity`/`entityId` riusano lo stesso pattern non-FK già adottato da
`auditLogEntity` (`entity`/`entityId` varchar, indice composito) invece di
inventare un'associazione polimorfica nuova: un file può restare "orfano"
(nessuna associazione) finché il progetto verticale non lo collega alla
propria entità di dominio — lo starter-kit resta senza logica di dominio,
come da identità del progetto.

**Endpoint previsti** (`@Controller('app/files')`):
- `POST /api/v1/app/files` — multipart upload (`FileInterceptor`, già
  disponibile via `@nestjs/platform-express`/multer incluso, nessuna nuova
  dipendenza per questa parte), validazione dimensione max via
  `AppConstants.storageMaxFileSizeMb` (guardrail infrastrutturale
  anti-abuso/DoS, non una business rule di dominio — whitelist di mime-type
  specifici per singolo tipo di documento resta compito del progetto
  verticale, che conosce quel dominio).
- `GET /api/v1/app/files/:guid` — streaming del contenuto, autenticato
  (nessun accesso diretto al filesystem/bucket dal client), verifica
  `isActive`.
- `DELETE /api/v1/app/files/:guid` — soft delete (`isActive = false`),
  **non cancella subito il blob fisico**: vedi Conseguenze.

## Alternative valutate

| Opzione | Pro | Contro | Motivo scarto |
|---|---|---|---|
| **`StorageDriver` interface + `LocalDiskDriver` (dev) + `S3CompatibleDriver` (prod)** (scelta) | Zero dipendenze esterne in sviluppo, stesso codice applicativo per dev/prod, MinIO e AWS S3 coperti dallo stesso client (stessa API) | Nuova dipendenza npm (`@aws-sdk/client-s3`, richiede approvazione umana esplicita — CLAUDE.md "Ask first", non ancora ottenuta) | — |
| Solo storage su disco locale, anche in produzione | Nessuna dipendenza nuova, implementazione minima | Incompatibile con ADR-6 (containerizzazione multi-replica): file non condivisi tra container, richiederebbe volume condiviso di rete gestito a mano | Scartato: non scala oltre una singola istanza |
| Accoppiare da subito il codice applicativo a un SDK S3 specifico, anche in dev | Un solo path di codice, nessuna astrazione da mantenere | Richiederebbe MinIO sempre attivo anche in sviluppo locale, più attrito di onboarding per un boilerplate pensato per partire in minuti | Scartato: la costituzione privilegia semplicità dev, l'astrazione costa poco e disaccoppia il vendor |
| File come `bytea`/`large object` dentro Postgres | Nessun servizio esterno da gestire, backup unico | Bloat del DB, query/backup più pesanti, nessuno streaming/CDN efficiente per documenti reali (fatture, scansioni) | Scartato per un boilerplate pensato per volumi di documenti reali nei gestionali |
| Download via URL presigned diretto al bucket (client → S3, bypass backend) | Meno banda sul backend | Richiede bucket/CORS pubblici o quasi, più superficie di attacco, logica di autorizzazione duplicata fuori dal backend | Rimandato: per l'MVP lo streaming passa sempre dal backend (unico punto di controllo accessi); presigned URL valutabile in futuro come ottimizzazione, non necessaria ora |

## Conseguenze

- **Positive**: base comune riusabile da ogni progetto verticale per qualunque
  feature di upload documenti, coerente con le convenzioni esistenti (guid
  nelle URL, soft-delete, audit via `createdBy`/`updatedBy`, FK restrict);
  cambio di provider storage (es. da locale a S3, o tra provider S3-compatibili
  diversi) senza toccare `FilesService`/`FilesController`.
- **Negative / attenzione**:
  - Richiede **due approvazioni separate** prima dell'implementazione, non
    coperte dall'approvazione di questo ADR: (1) modifica di
    `app/backend/src/db/schema.ts` (nuova tabella `files` + migrazione
    Drizzle), (2) installazione della nuova dipendenza npm
    `@aws-sdk/client-s3` — entrambe elencate in CLAUDE.md "Ask first".
  - Il soft-delete (`isActive = false`) rimuove il file dalle liste/download
    ma **non cancella il blob fisico automaticamente**: una cancellazione
    fisica immediata legata a un'operazione reversibile (soft-delete) sarebbe
    irreversibile per errore; la pulizia fisica dei blob orfani è rimandata a
    un job schedulato futuro (non implementato ora — valutato over-engineering
    finché non c'è un volume reale di file cancellati da gestire).
  - `sizeBytes integer` limita la dimensione tracciabile a ~2GB per file
    (sufficiente per qualunque documento gestionale tipico); il guardrail
    `STORAGE_MAX_FILE_SIZE_MB` andrà comunque impostato ben al di sotto di
    quel limite.
  - In produzione, l'endpoint MinIO (se il progetto verticale lo sceglie invece
    di un provider S3 gestito) va containerizzato/gestito separatamente — non
    incluso in `docker-compose.prod.yml` da questo ADR: è una scelta di
    deployment del progetto verticale, non dello starter-kit generico.
- **Documentazione**: dopo approvazione e implementazione andranno aggiornati
  `docs/system-architecture.md` (nuovo modulo + variabili d'ambiente),
  `docs/ai/progress-tracker.md`, `.env.example` (`STORAGE_DRIVER`,
  `STORAGE_LOCAL_PATH`, `STORAGE_S3_ENDPOINT`, `STORAGE_S3_BUCKET`,
  `STORAGE_MAX_FILE_SIZE_MB`), collezioni Bruno `bruno/files/*.yml`.

## Conformità

- File: `app/backend/src/files/files.module.ts`, `files.controller.ts`,
  `files.service.ts`, `dto/file-metadata.dto.ts`, `dto/upload-file.dto.ts`,
  `storage/storage-driver.interface.ts`, `storage/local-disk.driver.ts`,
  `storage/s3-compatible.driver.ts`; `app/backend/src/db/schema.ts` (tabella
  `files` + `filesRelations`); `app/backend/src/db/migrations/0002_married_angel.sql`
  (generata con `drizzle-kit generate`, mai `push`); `app/backend/src/common/app-constants.ts`
  (costanti `storage*`); `app/backend/src/app.module.ts` (registrazione
  `FilesModule` + validazione Joi delle nuove env var); `.env.example`;
  `.gitignore` (`storage/`).
- Test: `app/backend/test/unit/files/files.service.spec.ts` (7 test: upload,
  download happy-path + 404, soft-delete owner/Admin/non-autorizzato/404),
  `local-disk.driver.spec.ts` (2 test, filesystem reale su cartella temporanea
  di sistema), `s3-compatible.driver.spec.ts` (3 test, `S3Client` mockato) —
  12/12 verdi.
- Collezioni Bruno: `bruno/files/Upload File.yml`, `Download File.yml`,
  `Delete File.yml` (nuova variabile ambiente `fileGuid` in
  `bruno/environments/local.yml`).
- Documentazione aggiornata: `docs/system-architecture.md` (sezione "Storage
  documenti — FilesModule", tree moduli, variabili d'ambiente, entità DB),
  `docs/ai/progress-tracker.md`.
- Come riverificare: `npm run build:backend && npm run lint:backend && npx jest
  test/unit/files --workspace=app/backend` (o dalla root con `--prefix
  app/backend`). Verifica manuale end-to-end (upload reale con
  `STORAGE_DRIVER=local` contro un DB/Redis avviati) non eseguita in questa
  sessione — ambiente Postgres/Redis dev non disponibile (porte già occupate da
  container di un altro progetto su questa macchina); da fare al primo avvio
  reale dell'app.
