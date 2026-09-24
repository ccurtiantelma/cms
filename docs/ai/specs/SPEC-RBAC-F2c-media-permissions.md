# Spec — RBAC F2c Enforcement dei permessi `media:*` su `app/files`

> **Stato**: [ ] Bozza in attesa di approvazione · [x] **Approvata** · [ ] Rifiutata
> Redatta il 2026-09-24 sul branch `feature/rbac-f1-permessi` (F2b chiusa al commit `811aa7f`).
>
> **Approvazione**: approvata così com'è, con le assunzioni S39–S49 e le divergenze dal prompt di
> origine elencate in PLAN § "Audit strategico", compresa la divergenza 1 (nessun `media:read`,
> S39). Firma apposta su richiesta esplicita del prompt di implementazione della Fase 2c, che vale
> anche come richiesta esplicita della Documentation Policy per la riga di `docs/ai/INDEX.md`.
>
> Firma: marketing@antelmagroup.net · Data: 2026-09-24 · Firmatario: marketing@antelmagroup.net

## Feature di riferimento

Nessun file in `docs/ai/features/`: stessa scelta di F1, F2a e F2b. Il documento di origine è
`docs/ai/adr/ADR-99-rbac-dinamico-ruoli-e-permessi-granulari.md` § Decisione punti 4, 5 e 9 e
§ 11 (enforcement su `app/files`, previsto nella F2 dell'ADR).

L'etichetta "F2c" viene da SPEC F2b S24: la "F2b" di SPEC F2a S11 (enforcement `media:*`) è stata
rinominata F2c, perché "F2b" è diventata la fase frontend. Nessun numero `F[N]` di roadmap è
assegnato all'RBAC.

Plan collegato: `docs/ai/plans/PLAN-RBAC-F2c-media-permissions.md`.

## ADR applicabili

- `ADR-99-rbac-dinamico-ruoli-e-permessi-granulari.md`: **vincolante**. § 1 (modello additivo,
  nessun permesso negativo), § 3 (un codice esiste solo se c'è un punto di enforcement), § 4
  (catalogo: `media:upload`, `media:delete_any`), § 5 (`@Permissions`, formato `403`), § 6
  (nessun permesso nel JWT), § 9 (`PublicMediaController` senza permessi, niente "file
  riservati") e § Conformità.
- `SPEC-RBAC-F1-schema-seed-cache-guard.md`: registro (righe `media:upload` e
  `media:delete_any`, con i punti di enforcement da migrare), seed dei ruoli di sistema,
  `PermissionsService.hasAll`, `PermissionsGuard`, S2 (utente inattivo → insieme vuoto).
- `SPEC-RBAC-F2a-backend-api.md`: S20 (composizione nel controller per non toccare il costruttore
  di un service coperto da test su `main`) e S21 (modifiche meccaniche ammesse ai test F1).
- `ADR-18-ownership-per-riga.md`: **D1–D5 vigenti**. L'autore elimina i propri file; cambia solo
  la sorgente dell'accesso elevato (da soglia `Admin` a permesso `media:delete_any`).
- `ADR-35-elenco-file-e-protezione-referenziale-media.md`: elenco condiviso senza ownership,
  `409` su file referenziato da una Pagina pubblicata. Invariati.
- `ADR-27-lettura-pubblica-media.md` e `docs/constitution.md` Principio 8: `public/media`
  anonimo, cacheabile, solo `ThrottlerGuard`. Invariato.
- `ADR-8-storage-abstraction-files.md`: il bucket si raggiunge solo tramite `StorageDriver`. Le
  policy MinIO restano fuori scopo (ADR-99 § 9).
- `docs/business-rules.md` § "Permessi editoriali", righe "Gestire Media (upload)" (✅ ×4) ed
  "Eliminare Media di altri" (SuperAdmin/Admin).

## Outcomes tecnici

A fine F2c:

1. `POST app/files` protetto da `@Permissions('media:upload')`.
2. `DELETE app/files/:guid` con l'accesso elevato di `FilesService.softDelete` risolto dal
   permesso `media:delete_any`, letto dal DB tramite `PermissionsService` (S41). L'autore
   continua a eliminare i propri file senza alcun permesso (ADR-18).
3. `media:upload` e `media:delete_any` fuori da `NOT_YET_MIGRATED`. Il test di conformità
   riconosce anche un enforcement nel controller tramite `hasAll` (S43).
4. `PublicMediaController` senza `@Permissions` né `PermissionsGuard`, verificato da un test
   (S46).
5. `files.e2e-spec.ts` (integrazione con mock) che fornisce `PermissionsService` e copre il `403`
   di upload e di delete (S44).
6. Nuova suite su DB e Redis reali `app/backend/test/e2e/files-permissions.e2e-spec.ts`:
   propagazione di `media:delete_any` senza rilogin, retrocessione e disattivazione con effetto
   immediato (S45).
7. `docs/openapi.yaml` e `app/frontend/src/types/api.types.ts` rigenerati, collezione Bruno
   `bruno/files/` riallineata.

## In scope

- `files.controller.ts`: decoratore su `upload`, `PermissionsService` iniettato, calcolo di
  `canDeleteAny` in `delete`, annotazioni Swagger `403`.
- `files.service.ts`: `softDelete` accetta `canDeleteAny` (S41) e aggiorna il messaggio del `403`
  (S42).
- Test: conformità del registro (F1), integrazione `files.e2e-spec.ts`, unit
  `files.service.spec.ts` (solo casi nuovi), nuova e2e su DB reale.
- Contratti: `openapi:export`, `openapi:types`, Bruno.
- Addendum di implementazione in coda a questa SPEC e riga di `docs/ai/INDEX.md`, **alla firma**.

## Out of scope

- **`media:read`**: non introdotto (S39). La motivazione e l'alternativa sono nella divergenza 1
  del PLAN, da confermare alla firma.
- `GET app/files/:guid` (download), `GET app/files/:guid/metadata`, `GET app/files` (lista),
  `PATCH app/files/:guid/focal-point`, `POST app/files/:guid/transform`: restano protetti solo dal
  JWT (S40).
- `PublicMediaController` e `PublicMediaService`: nessuna modifica (ADR-99 § 9).
- Frontend: nessun `<Can>` sui pulsanti Media. Tutti gli utenti attivi hanno `media:upload`, e il
  pulsante Elimina resta visibile a tutti come oggi. L'autorità è il backend (ADR-99 § 10).
- "File riservati", visibilità su `files`, policy o IAM del bucket MinIO (ADR-99 § 9, P4).
- Restringere un utente sotto la sua soglia, per esempio uno `User` senza upload (ADR-99 § 1 e
  Conseguenze (b), ADR-90 § 3).
- Controllo di `users.is_active` in `AuthMiddleware` per le rotte senza permesso (S47).
- Migrazione a `@Permissions` di rotte di altri moduli.

## Vincoli e assunzioni

**Vincoli**:

- Nessuna dipendenza npm nuova, nessuna migrazione DB, nessun codice nuovo nel registro. Il hash
  del registro **non** cambia (i codici e le mappe dei ruoli di sistema restano identici).
- Formato di errore invariato (`AllExceptionsFilter`).
- Nessuna asserzione di test esistente viene modificata (ADR-99 § Conformità). Le uniche
  modifiche ai file di test esistenti sono quelle elencate in S43 e S44.
- Il costruttore di `FilesService` non cambia: `files.service.spec.ts` (su `main`) lo costruisce
  a mano con 4 argomenti.

**Assunzioni** (continuano la numerazione S24–S38 della F2b; ciascuna va approvata):

| # | Assunzione | Motivo |
|---|---|---|
| S39 | **Nessun codice `media:read`.** Lista, download e metadati restano protetti solo dal JWT | Nel modello additivo (ADR-99 § 1) ogni codice del seed `user` è posseduto da ogni utente attivo e nessun ruolo può toglierlo: `media:read` non negherebbe mai l'accesso a un utente attivo. Inoltre non ha una riga in matrice (`business-rules.md`), e aggiungerlo richiederebbe di emendare le regole di business e il test di conformità. Nella matrice della UI sarebbe una casella senza effetto per qualunque ruolo personalizzato. Punto di firma: divergenza 1 del PLAN |
| S40 | `PATCH :guid/focal-point` e `POST :guid/transform` restano senza permesso | Nessun codice del registro li copre, e un codice nuovo (`media:edit`) avrebbe lo stesso limite di S39. Non sono nel perimetro del prompt |
| S41 | **`media:delete_any` si applica tramite composizione nel controller.** `FilesController.delete` calcola `canDeleteAny = (await permissionsService.hasAll(authInfo.userId, ['media:delete_any'])).ok` e lo passa a `softDelete(guid, authInfo, ip, canDeleteAny)`. Il quarto parametro è opzionale, con default `hasElevatedRowAccess(authInfo, AppUserRoles.Admin)` (il comportamento attuale). Il controllo resta nel service, nello stesso punto e nello stesso ordine: 404 → 403 → 409 | Un `@Permissions` sulla rotta impedirebbe all'autore di eliminare i propri file (ADR-18). Iniettare `PermissionsService` in `FilesService` cambierebbe il costruttore usato da `files.service.spec.ts`. È lo schema di SPEC F2a S20. Il default mantiene invariati i test unitari esistenti. In produzione l'unico chiamante (il controller) passa sempre il valore |
| S42 | Messaggio del `403` di `softDelete`: `Solo l'autore del file, un Admin o chi ha il permesso media:delete_any possono eliminarlo.` | Il messaggio attuale non cita i ruoli personalizzati. Il nuovo contiene ancora "Admin", quindi l'asserzione esistente `toContain('Admin')` in `files.e2e-spec.ts` passa senza modifiche |
| S43 | Test di conformità del registro (F1): (a) `codesUsedByControllers` legge i letterali sia di `@Permissions(...)` sia di `hasAll(...)` nei file `*.controller.ts`; (b) `media:upload` e `media:delete_any` escono da `NOT_YET_MIGRATED`. Nessun'altra modifica | (b) è il meccanismo previsto dalla F1 ("la lista può solo accorciarsi"). Senza (a), un enforcement non dichiarativo (S41) risulterebbe "non applicato" e il test fallirebbe. Stesso tipo di modifica meccanica ammessa da SPEC F2a S21 |
| S44 | `files.e2e-spec.ts` (integrazione con `DbService` mockato): si aggiunge ai provider un mock di `PermissionsService` il cui `hasAll` concede di default i codici del seed `user` (`SYSTEM_ROLES.user.permissions`) a ogni `userId`, e si aggiungono test nuovi. **Nessun `it` esistente cambia** | `@Permissions` monta `PermissionsGuard`, che dipende da `PermissionsService`: senza provider il modulo di test non si compila. È un cablaggio, non una modifica delle asserzioni. Con il default "seed `user`" i casi esistenti danno lo stesso esito di oggi (upload 201, autore 204, non autore 403) |
| S45 | **I test non "inseriscono permessi nel JWT"**: il JWT non contiene permessi (ADR-99 § 6). Nella suite con mock si pilota `hasAll`. Il comportamento reale si verifica su DB e Redis in una suite nuova, `files-permissions.e2e-spec.ts`, con lo stesso setup di `roles.e2e-spec.ts` (S22: truncate, flush Redis, `sync()` del seed) e con `STORAGE_DRIVER`, `MediaQueueService` ed `EmailQueueService` sostituiti da mock | `files.e2e-spec.ts` ha DB e Redis mockati e non può verificare seed, cache o assegnazione di ruoli. Una suite separata non cambia il contratto di quella esistente |
| S46 | `PublicMediaController` resta com'è. Un test statico verifica che nessun handler abbia metadati `PERMISSIONS_KEY` e che i guard di classe siano solo `ThrottlerGuard` | ADR-99 § 9 e § Conformità ("`PublicMediaController` senza `@Permissions`"). Un test rende la regola verificabile, invece di affidarla alla revisione |
| S47 | Effetti collaterali dichiarati, non regressioni: (i) un utente disattivato riceve subito `403 media:upload`, anche con un JWT ancora valido (oggi può caricare fino alla scadenza del token); (ii) un Admin retrocesso perde subito `media:delete_any` (oggi lo mantiene fino a 15 minuti). Le altre rotte `app/files` continuano ad accettare il JWT di un utente disattivato fino alla scadenza. Correggerlo in `AuthMiddleware` è fuori scopo | Conseguenza di SPEC F1 S1/S2: i permessi si leggono dal DB e la disattivazione ne invalida la cache (`AdminService.toggleActiveUser`) |
| S48 | Ordine dei controlli su `POST app/files`: `AuthMiddleware` (401) → `PermissionsGuard` (403) → `FileInterceptor`/multer (413) → service (400). Un utente senza `media:upload` riceve `403` prima che il corpo multipart venga letto o scritto sullo storage | In NestJS i guard girano prima degli interceptor |
| S49 | Impersonificazione: `authInfo.userId` è l'utente impersonato. Upload e delete valutano i suoi permessi, come oggi l'ownership valuta il suo `userId` | ADR-99 § 5, coerente con `PermissionsGuard` |

## Schema DB (Drizzle)

### Tabelle nuove

Nessuna.

### Tabelle modificate

Nessuna. Il registro non cambia: nessun upsert nuovo al `sync()`, hash invariato.

## Endpoint API

Prefisso `api/v1`. **Response 401**: `AuthMiddleware`, come ogni rotta `app/*`. Tag e
`@ApiBearerAuth` invariati.

### POST api/v1/app/files (modificato)

- **Guard**: `@Permissions('media:upload')` (nuovo). Seed: tutti e 4 i ruoli di sistema.
- **Request body**: multipart, campo `file` + `UploadFileDto`. Invariato.
- **Response 201**: `FileMetadataDto`. Invariato.
- **Response 400**: invariata (media editoriale non raster, input non valido).
- **Response 403** (nuova): `Permessi insufficienti (richiesto permesso: media:upload).`
  In pratica la riceve solo un utente disattivato o inesistente (S47). Nessuna scrittura né sul DB
  né sullo storage.
- **Response 413**: invariata. Arriva dopo il guard (S48).

### DELETE api/v1/app/files/:guid (modificato)

- **Guard**: nessun `@Permissions` di rotta (S41). Controllo nel service, nell'ordine:
  1. `404` se il file non esiste o è già eliminato;
  2. `403` se il chiamante non è l'autore (`createdBy !== authInfo.userId`) **e** non ha
     `media:delete_any`;
  3. `409` se il file è referenziato da una Pagina pubblicata (ADR-35).
- **Response 204**: invariata.
- **Response 403**: messaggio di S42. `@ApiResponse` aggiornato: "Non sei l'autore del file e non
  hai il permesso `media:delete_any`".
- **Response 404 / 409**: invariate.
- **Cambio di comportamento**: un utente con un ruolo personalizzato che contiene
  `media:delete_any` elimina i file di altri, senza rilogin. Un Admin retrocesso perde subito
  questa possibilità (S47).

### Rotte invariate

`GET app/files` · `GET app/files/:guid` · `GET app/files/:guid/metadata` ·
`PATCH app/files/:guid/focal-point` · `POST app/files/:guid/transform` (S39, S40) ·
`GET public/media/:guid` (S46).

## DTO

Nessun DTO nuovo o modificato. Firma interna modificata:

```typescript
// app/backend/src/files/files.service.ts
/**
 * Soft-delete del file. `canDeleteAny` è l'accesso elevato di ADR-18: il
 * controller lo ricava da `media:delete_any` (ADR-99, SPEC F2c S41). Il default
 * (soglia Admin sul JWT) serve solo ai chiamanti che non lo passano.
 */
async softDelete(
  guid: string,
  authInfo: AuthInfo,
  ip?: string,
  canDeleteAny: boolean = hasElevatedRowAccess(authInfo, AppUserRoles.Admin),
): Promise<void>;
```

```typescript
// app/backend/src/files/files.controller.ts — composizione (S41)
constructor(
  private readonly filesService: FilesService,
  private readonly permissionsService: PermissionsService, // @Global PermissionsModule
) {}

@Delete(':guid')
async delete(@Param('guid') guid: string, @Req() req: Request): Promise<void> {
  const authInfo = req['authInfo'] as AuthInfo;
  const { ok: canDeleteAny } = await this.permissionsService.hasAll(authInfo.userId, [
    'media:delete_any',
  ]);
  await this.filesService.softDelete(guid, authInfo, req.ip, canDeleteAny);
}
```

`FilesModule` non cambia: `PermissionsModule` è `@Global()`.

## Contratti WebSocket (se applicabile)

Nessuno.

## Task breakdown

Il dettaglio (output, dipendenze, criterio di Done, agente) è nel PLAN.

- [ ] T1 — `FilesService.softDelete`: parametro `canDeleteAny`, messaggio S42, unit test nuovi
- [ ] T2 — `FilesController`: `@Permissions('media:upload')`, composizione `media:delete_any`,
      Swagger
- [ ] T3 — Conformità del registro e test statico di `PublicMediaController`
- [ ] T4 — `files.e2e-spec.ts`: mock `PermissionsService` e casi `403`
- [ ] T5 — `files-permissions.e2e-spec.ts` su DB e Redis reali
- [ ] T6 — Contratti: OpenAPI, tipi, Bruno
- [ ] T7 — Verifica globale, addendum, `INDEX.md`

## Criteri di verifica

*Unit — `files.service.spec.ts` (solo casi nuovi; i casi esistenti passano invariati)*

1. `softDelete` di un non autore con `canDeleteAny = true` e ruolo `User` → risolve e scrive
   `isActive: false`.
2. `softDelete` di un non autore con `canDeleteAny = false` e ruolo `Admin` nel JWT →
   `ForbiddenException` con il messaggio di S42, nessuna scrittura. Il parametro esplicito prevale
   sulla soglia.
3. `softDelete` dell'autore con `canDeleteAny = false` → risolve.
4. `softDelete` di un file inesistente con `canDeleteAny = true` → `NotFoundException`, anche se
   il chiamante ha il permesso (l'ordine 404 → 403 non cambia).

*Conformità — `permissions.registry.spec.ts`*

5. `NOT_YET_MIGRATED` non contiene più `media:upload` né `media:delete_any`. Il test "ogni codice
   è applicato oppure in `NOT_YET_MIGRATED`, mai entrambi" passa.
6. Rimuovere la chiamata `hasAll(…, ['media:delete_any'])` da `files.controller.ts` fa fallire il
   test (verifica a mano durante T3, non automatizzata).
7. Il test statico di S46 passa: nessun `PERMISSIONS_KEY` sugli handler di
   `PublicMediaController` e guard di classe uguali a `[ThrottlerGuard]`.
8. `computeRegistryHash()` è invariato rispetto alla F2b.

*Integrazione con mock — `files.e2e-spec.ts`*

9. Tutti gli `it` esistenti passano senza modifiche.
10. `POST app/files` con `hasAll` che nega `media:upload` → `403`, `code: ForbiddenException`,
    messaggio `Permessi insufficienti (richiesto permesso: media:upload).`. Nessuna chiamata a
    `storageDriver.upload` né a `db.insert`.
11. `DELETE` di un non autore con `hasAll` che concede `media:delete_any` → `204`.
12. `DELETE` dell'autore con `hasAll` che nega `media:delete_any` → `204`.
13. `GET app/files`, `GET :guid`, `GET :guid/metadata` con `hasAll` che nega tutto → stesso esito
    di oggi (`200`/`404`). Nessuna chiamata a `hasAll` su queste rotte.

*Integrazione su DB e Redis reali — `files-permissions.e2e-spec.ts`*

14. User attivo `POST app/files` (PDF di pochi byte) → `201`.
15. User disattivato da un Admin (`PATCH app/admin/users/:guid/toggle-active`) → lo stesso token,
    su `POST app/files`, riceve `403 media:upload`. Su `GET app/files` riceve ancora `200` (S47,
    comportamento dichiarato).
16. File di A (riga inserita a DB). User B, non autore, `DELETE` → `403`. Il SuperAdmin crea il
    ruolo `media_cleaner` con `media:delete_any` e lo assegna a B (`PATCH app/admin/users/:guid`
    con `roleGuids`). B, **con lo stesso token**, `DELETE` → `204`, e `audit_log` registra
    `files.delete`.
17. Revoca: tolto `media_cleaner` a B, un secondo file di A → `DELETE` di B → `403`, senza rilogin.
18. Admin (seed) `DELETE` del file di un altro → `204`. Lo stesso Admin retrocesso a `User` via
    `PATCH app/admin/users/:guid` (`role: 30`) → con lo stesso token (JWT ancora `role: 10`)
    `DELETE` di un altro file altrui → `403` (S47).
19. L'autore `User` `DELETE` del proprio file → `204`. Su un file referenziato da una Pagina
    pubblicata → `409` (ADR-35 invariata).
20. `GET public/media/:guid` senza token → stesso esito di `public-media.e2e-spec.ts` (nessun
    `401`/`403`).

*Non regressione e contratti*

21. `npm test --workspace=app/backend` e `npm run test:e2e --workspace=app/backend` verdi, comprese
    `roles.e2e-spec.ts` e `public-media.e2e-spec.ts` invariate.
22. `grep -rn "@Permissions(" app/backend/src` → solo `roles.controller.ts` e
    `files.controller.ts` (`upload`). Nessun `@Permissions` in `src/files/public-media/`.
    `grep -rn "softDelete(" app/backend/src` → un solo chiamante, `files.controller.ts`, che
    passa `canDeleteAny` (S41).
23. `docs/openapi.yaml`: `POST /app/files` con risposta `403`; descrizione del `403` di
    `DELETE /app/files/{guid}` aggiornata. `api.types.ts` rigenerato, e
    `npm run build --workspace=app/frontend` passa.
24. Bruno `bruno/files/Upload File.yml` e `Delete File.yml` accettano il `403` documentato;
    `List Files.yml` non cita più `GuardManager` (descrizione obsoleta: la lista non ha guard).
