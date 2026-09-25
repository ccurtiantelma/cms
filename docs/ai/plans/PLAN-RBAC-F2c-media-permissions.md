# Plan — RBAC F2c Enforcement dei permessi `media:*` su `app/files`

> **Stato**: [ ] Bozza in attesa di approvazione · [x] **Approvato** · [ ] Rifiutato
> Redatto il 2026-09-24. Prerequisiti di firma:
> - [x] `ADR-99-rbac-dinamico-ruoli-e-permessi-granulari.md`, approvata con modifiche il
>   2026-09-24 (marketing@antelmagroup.net)
> - [x] F1, F2a e F2b approvate e implementate su `feature/rbac-f1-permessi` (ultimo commit
>   `811aa7f`)
> - [x] `SPEC-RBAC-F2c-media-permissions.md` approvata, assunzioni S39–S49 incluse
>   (2026-09-24, marketing@antelmagroup.net)
> - [x] Questo PLAN approvato, divergenze 1–8 dell'audit incluse (la 1, nessun `media:read`, è
>   confermata). Branch scelto: si resta su `feature/rbac-f1-permessi` (worktree
>   `.claude/worktrees/rbac-f1`)
>
> Firma PLAN: marketing@antelmagroup.net · Data: 2026-09-24 · Firmatario: marketing@antelmagroup.net

## Spec di riferimento

`docs/ai/specs/SPEC-RBAC-F2c-media-permissions.md`

---

## Audit strategico

### Falle logiche / Contraddizioni rilevate

Le divergenze 1–5 riguardano il prompt di task contro ADR-99 e le SPEC F1/F2a approvate. Per la
gerarchia di `CLAUDE.md` (ADR → spec) la SPEC segue l'ADR. Vanno confermate alla firma.

1. **`media:read` su lista e dettaglio. Punto di firma.**
   - Dove: prompt, punto 2 ("elenco e dettaglio file con `media:read`"); ADR-99 § 4 (il catalogo
     Media contiene solo `media:upload` e `media:delete_any`); `business-rules.md` § "Permessi
     editoriali" (nessuna riga "Consultare Media").
   - Problema: il modello è additivo (ADR-99 § 1). Il seed darebbe `media:read` a tutti e 4 i ruoli
     di sistema, perché oggi ogni ruolo autenticato legge la libreria (ADR-35) e l'editor ne ha
     bisogno per scegliere le immagini. Ogni utente attivo lo possiederebbe quindi dal proprio
     livello base, e nessun ruolo personalizzato potrebbe toglierlo. Il permesso non negherebbe mai
     l'accesso a un utente attivo. Nella matrice della pagina `/roles` sarebbe una casella senza
     effetto: lo stesso difetto per cui ADR-99 scarta i "permessi creabili da UI" ("inerte e
     ingannevole").
   - Impatto se si accoglie il prompt: codice nuovo nel registro (cambia l'hash, tutte le cache
     permessi si invalidano), riga nuova in `business-rules.md` (serve una richiesta esplicita,
     secondo la Documentation Policy), mappatura nel test di conformità, `@Permissions('media:read')`
     su `GET app/files`, `GET :guid` e `GET :guid/metadata`. Unico effetto reale: un utente
     disattivato non legge più la libreria con un JWT ancora valido. È lo stesso difetto di S47,
     che va corretto una volta sola in `AuthMiddleware` e non rotta per rotta.
   - Scelta della SPEC: **nessun `media:read`** (S39). Se alla firma si preferisce introdurlo,
     il delta sopra entra come T1-bis e la riga di `business-rules.md` va autorizzata
     esplicitamente.
2. **`media:delete` come permesso di rotta per l'eliminazione.**
   - Dove: prompt, punto 2; ADR-99 § 4; SPEC F1 § Registro (riga `media:delete_any`, enforcement
     `softDelete`); ADR-18 D1–D5.
   - Problema: la matrice distingue "eliminare i propri Media" (tutti, per ownership) da
     "eliminare Media di altri" (Admin+). Un `@Permissions('media:delete')` sulla rotta:
     (a) se seedato a `user`, sarebbe posseduto da tutti e non negherebbe nulla (vedi la
     divergenza 1); (b) se seedato ad Admin+, impedirebbe all'autore di eliminare i propri file,
     violando ADR-18 e la matrice.
   - Scelta: nessun codice nuovo. `media:delete_any` sostituisce la soglia Admin come accesso
     elevato dentro `softDelete`, con composizione nel controller (S41).
3. **"`media:upload` (o `media:write`)".**
   - Dove: prompt, punto 2; ADR-99 § 4; registro F1.
   - Scelta: `media:upload`, già nel registro e nel seed. Nessun `media:write`.
4. **"Inserire token JWT con permessi adeguati".**
   - Dove: prompt, punto 2 (test); ADR-99 § 6 ("Il JWT non cambia: nessun permesso nel token").
   - Problema: i permessi si leggono dal DB, via cache Redis. Un JWT non li trasporta, e
     `files.e2e-spec.ts` ha DB e Redis mockati.
   - Scelta: nella suite con mock si pilota un mock di `PermissionsService.hasAll` (S44). Il
     comportamento reale (seed, assegnazione, revoca, retrocessione) si verifica in una suite
     nuova su DB reale (S45).
5. **"Verificare che le chiamate prive dei permessi `media:*` restituiscano 403".**
   - Problema: per la divergenza 1, un utente **attivo** privo di `media:upload` non esiste. Su
     DB reale gli unici soggetti che ricevono `403` sono l'utente disattivato (upload) e il non
     autore senza `media:delete_any` (delete). Questa fase **non** crea la possibilità di togliere
     l'upload a uno `User`: è una restrizione, fuori dal modello additivo (ADR-99 Conseguenze (b),
     ADR-90 § 3).
   - Impatto: i test coprono esattamente questi soggetti (SPEC criteri 10 e 14–18). Il `403` "puro"
     su upload si verifica con il mock (criterio 10).
6. **Il controller ha 7 rotte, il prompt ne cita 4.**
   - Dove: `files.controller.ts` (download, `focal-point` e `transform` oltre a lista, metadati,
     upload e delete).
   - Scelta: download e metadati seguono la lista (S39). `focal-point` e `transform` restano solo
     con il JWT (S40). Dichiarato per evitare che l'assenza sembri una svista.
7. **`INDEX.md` nel prompt contro "genera esclusivamente SPEC e PLAN".**
   - Dove: prompt, punto 3 contro § "Requisiti di output".
   - Scelta: stesso schema della F2b (commit `b565a60`). La riga si aggiorna **alla firma**, con
     il testo proposto in T7. Oggi si consegnano solo SPEC e PLAN.
8. **"Nessun test esistente modificato" (ADR-99 § Conformità) contro `files.e2e-spec.ts` da
   aggiornare.**
   - Problema: `@Permissions` monta `PermissionsGuard`. Senza un provider `PermissionsService` il
     `TestingModule` di `files.e2e-spec.ts` non si compila.
   - Scelta: la modifica si limita al provider mock e a `it` nuovi (S44). Con il default "seed
     `user`", tutti gli `it` esistenti danno lo stesso esito. Il messaggio di S42 contiene ancora
     "Admin", quindi l'asserzione `toContain('Admin')` resta vera. `files.service.spec.ts` non
     cambia grazie al default di `canDeleteAny` (S41).

### Punti di attenzione (non contraddizioni)

- **Test di conformità della F1** (S43): oggi riconosce solo `@Permissions(` nei
  `*.controller.ts`. L'estensione ai letterali di `hasAll(` nei controller è una modifica
  meccanica, come SPEC F2a S21. Non si estende la scansione ai `*.service.ts`: in F2c
  l'enforcement non dichiarativo vive nel controller, e allargare la scansione renderebbe il test
  meno preciso.
- **Doppia sorgente di `canDeleteAny`** (S41): il default del parametro conserva la soglia sul
  JWT per chi non passa il valore. Oggi l'unico chiamante è il controller. Il rischio è un
  chiamante futuro che dimentica il parametro: otterrebbe il comportamento pre-F2c, che non
  concede nulla in più del seed. Mitigazione: JSDoc esplicito e criterio 22 (`softDelete` ha un
  solo chiamante).
- **Una lettura di permessi in più per `DELETE`**: il controller interroga `hasAll` prima di
  sapere se il chiamante è l'autore. È un `GET` Redis in caso di hit, trascurabile. Se Redis o il
  DB falliscono, la risposta è `500` anche per un guid inesistente (fail-closed, ADR-99 § 6).
- **`403` prima di leggere il corpo multipart** (S48): con supertest, una risposta anticipata su
  un upload grande può dare `EPIPE`/`ECONNRESET`. I test usano file di pochi byte.

### Rischi architetturali / Over-engineering

- **Evitato**: codici nuovi (`media:read`, `media:delete`, `media:edit`) che nel modello additivo
  non negano mai nulla (divergenze 1–2, S40).
- **Evitato**: iniettare `PermissionsService` in `FilesService`. Cambierebbe il costruttore usato
  da `files.service.spec.ts` e da `files.e2e-spec.ts`, e richiederebbe di modificare test di
  ownership esistenti.
- **Evitato**: un decoratore o un guard dedicato a "ownership o permesso". Esiste un solo caso,
  e ADR-18 vuole l'ownership nel service.
- **Evitato**: una modifica ad `AuthMiddleware` per `is_active`. È il rimedio corretto a S47, ma
  tocca tutte le rotte `app/*` e merita un task proprio.

---

## Task operativi (max 8, ordinati per dipendenze)

### T1 — `FilesService.softDelete` con `canDeleteAny`

- **Output atteso**: `app/backend/src/files/files.service.ts`. Quarto parametro `canDeleteAny`
  con default `hasElevatedRowAccess(authInfo, AppUserRoles.Admin)` (import da
  `common/ownership.ts`), condizione `!canDeleteAny && row.createdBy !== authInfo.userId`,
  messaggio di S42, JSDoc. `app/backend/test/unit/files/files.service.spec.ts`: solo i 4 `it`
  nuovi (criteri 1–4).
- **Dipendenze**: nessuna.
- **Criterio di Done**: criteri 1–4 verdi; gli `it` esistenti di `softDelete` passano senza
  modifiche.
- **Agente**: backend-developer.

### T2 — `FilesController`: upload e delete

- **Output atteso**: `app/backend/src/files/files.controller.ts`. `@Permissions('media:upload')`
  su `upload` (import da `../permissions/permissions.decorator`); `PermissionsService` nel
  costruttore; `delete` calcola `canDeleteAny` con `hasAll` e lo passa (codice in SPEC § DTO);
  `@ApiResponse({ status: 403 })` su `upload` e descrizione aggiornata su `delete`; JSDoc di
  classe che cita F2c. Nessuna modifica a `files.module.ts` né a `public-media/`.
- **Dipendenze**: T1.
- **Criterio di Done**: `npm run build --workspace=app/backend` passa; criterio 22.
- **Agente**: backend-developer.

### T3 — Conformità del registro e `PublicMediaController`

- **Output atteso**: `app/backend/test/unit/permissions/permissions.registry.spec.ts`. S43 (a)
  (letterali di `hasAll(` nei controller) e (b) (tolti `media:upload` e `media:delete_any` da
  `NOT_YET_MIGRATED`). Test statico di S46, nello stesso file o in
  `test/unit/files/public-media/public-media.controller.permissions.spec.ts`: `Reflector` o
  `Reflect.getMetadata` su `PERMISSIONS_KEY` per ogni handler e su `__guards__` della classe.
- **Dipendenze**: T2.
- **Criterio di Done**: criteri 5–8. Criterio 6 verificato a mano (rimuovere e ripristinare la
  riga) e annotato nel messaggio di commit.
- **Agente**: test-engineer.

### T4 — `files.e2e-spec.ts` con mock di `PermissionsService`

- **Output atteso**: `app/backend/test/e2e/files.e2e-spec.ts`. Provider
  `{ provide: PermissionsService, useValue: permissionsMock }`, con `hasAll` che per default
  concede `SYSTEM_ROLES.user.permissions` e che ogni test può sovrascrivere. `it` nuovi per i
  criteri 10–13. Nessun `it` esistente modificato (S44).
- **Dipendenze**: T2.
- **Criterio di Done**: criteri 9–13. `git diff` sul file mostra solo aggiunte (import, provider,
  mock, `it` nuovi).
- **Agente**: test-engineer.

### T5 — `files-permissions.e2e-spec.ts` su DB e Redis reali

- **Output atteso**: `app/backend/test/e2e/files-permissions.e2e-spec.ts`. Bootstrap come
  `roles.e2e-spec.ts` (`AppModule`, `ValidationPipe`, `AllExceptionsFilter`, `cookieParser`),
  con `overrideProvider(STORAGE_DRIVER)`, `MediaQueueService` ed `EmailQueueService` mockati.
  `beforeEach` di S22. Helper `createUser` (utente a DB, JWT firmato, `login:` su Redis) e
  `insertFile(createdBy)` (riga `files` diretta, nessun blob). Casi 14–20.
- **Dipendenze**: T2.
- **Criterio di Done**: criteri 14–20 verdi con `npm run test:e2e --workspace=app/backend`;
  nessun blob scritto su disco durante la suite.
- **Agente**: test-engineer.

### T6 — Contratti: OpenAPI, tipi, Bruno

- **Output atteso**: `npm run openapi:export && npm run openapi:types` → `docs/openapi.yaml`,
  `app/frontend/src/types/api.types.ts`. Bruno: `bruno/files/Upload File.yml` (test "201 o 403
  (media:upload mancante: utente disattivato)"), `Delete File.yml` ("204, 403 (non autore senza
  media:delete_any) o 404"), `List Files.yml` (via la descrizione obsoleta su `GuardManager`,
  che il codice non applica).
- **Dipendenze**: T2.
- **Criterio di Done**: criteri 23–24; `npm run build --workspace=app/frontend` passa.
- **Agente**: backend-developer.

### T7 — Verifica globale, addendum e `INDEX.md`

- **Output atteso**:
  - Esecuzione completa: `npm run lint`, `npm test`, `npm run test:e2e`, build di backend e
    frontend (criterio 21).
  - Addendum di implementazione in coda alla SPEC F2c (deviazioni emerse, come nelle F2a/F2b).
  - `docs/ai/INDEX.md`, riga "Auth, Ruoli & Permessi": aggiunta di
    `docs/ai/specs/SPEC-RBAC-F2c-media-permissions.md` ·
    `docs/ai/plans/PLAN-RBAC-F2c-media-permissions.md` dopo i documenti F2b. Nota di allineamento
    da accodare a quella sulle fasi RBAC:
    > **F2c (enforcement `media:*`)**: `SPEC-RBAC-F2c-media-permissions.md` e
    > `PLAN-RBAC-F2c-media-permissions.md` (approvati il <data>, <firmatario>). `media:upload`
    > protegge `POST app/files`; `media:delete_any` sostituisce la soglia Admin come accesso
    > elevato di `softDelete` (ADR-18 invariata per l'autore). Nessun `media:read` (SPEC S39).
    > `PublicMediaController` resta anonimo (ADR-99 § 9, Principio 8), verificato da test.
    > `NOT_YET_MIGRATED` non contiene più codici `media:*`.
- **Dipendenze**: T1–T6.
- **Criterio di Done**: tutti i criteri 1–24; `NOT_YET_MIGRATED` accorciato di esattamente due
  codici; nessun file toccato in `app/frontend/src` salvo `api.types.ts` generato.
- **Agente**: test-engineer (verifica) + orchestrator (documenti).

---

## Matrice dei rischi

| Rischio | Probabilità | Impatto | Mitigazione |
|---|---|---|---|
| L'autore non riesce più a eliminare i propri file (gate di rotta sbagliato) | Bassa con S41 | Alto | Nessun `@Permissions` su `DELETE`; criteri 3, 12, 19 |
| Un Admin perde `media:delete_any` senza che il seed sia cambiato | Bassa | Medio | Seed invariato, hash invariato (criterio 8); criterio 18 prima parte |
| Regressione silenziosa su `public/media` | Bassa | Alto | Nessun file toccato in `public-media/`; test statico S46; criterio 20 |
| `files.e2e-spec.ts` modificato oltre il cablaggio | Media | Medio | S44; criterio Done di T4 (`git diff` di sole aggiunte) |
| Chiamante futuro di `softDelete` senza `canDeleteAny` | Bassa | Basso | Default = comportamento pre-F2c; JSDoc; criterio 22 |
| Il test di conformità esteso accetta un `hasAll` fuori contesto | Bassa | Basso | Scansione limitata ai `*.controller.ts`; verifica manuale del criterio 6 |
| Upload con `403` anticipato che rende instabili i test | Media | Basso | File di pochi byte (S48) |
| Il firmatario si aspettava `media:read` o `media:delete` | Media | Medio | Divergenze 1–2 come punto di firma, con il delta già descritto |

---

## Definition of Done — Checklist globale

### Implementazione

- [x] T1–T7 implementati, un commit per task
- [x] Nessun `any` TypeScript senza commento
- [x] Nessun `console.log` rimasto
- [x] JSDoc su `softDelete` (nuovo parametro) e sul costruttore di `FilesController`
- [x] `@Permissions` solo su `RolesController` e `FilesController.upload`; nessuna modifica in
      `src/files/public-media/`

### Test

- [x] Unit test nuovi verdi (`files.service.spec.ts`, conformità del registro, test statico
      `PublicMediaController`)
- [x] `files.e2e-spec.ts`: esistenti invariati e verdi, nuovi verdi
- [x] `files-permissions.e2e-spec.ts` verde su DB e Redis reali
- [x] Nessun test placeholder

### Build e qualità

- [x] `npm run build --workspace=app/backend` superata
- [x] `npm run build --workspace=app/frontend` superata (tipi rigenerati)
- [ ] Lint superato (file toccati puliti; 1 errore Prettier preesistente in
      `value-to-declarations.ts`, vedi SPEC § Addendum)
- [ ] Code review completata

### Contratti e documentazione

- [x] `npm run openapi:export` e `npm run openapi:types` eseguiti
- [x] Bruno `bruno/files/` riallineato
- [x] Addendum di implementazione in coda alla SPEC
- [x] `docs/ai/INDEX.md` aggiornato alla firma (testo in T7)
- [ ] `docs/ai/progress-tracker.md`: solo su richiesta esplicita a fine feature, come in F2a/F2b

### Commit

- [x] Conventional Commits, scope `rbac` (es. `feat(rbac): T2 — media:upload e media:delete_any su app/files`)
- [x] Branch `feature/rbac-f1-permessi` aggiornato
