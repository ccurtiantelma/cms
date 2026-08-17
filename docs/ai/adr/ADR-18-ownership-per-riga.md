# ADR-18 — Ownership per riga dei permessi editoriali

## Status
[ ] In discussione · [x] **Approvata** · [ ] Rifiutato · [ ] Superseded da ADR-XXX

> Generata dall'Orchestrator il 2026-08-17 su richiesta esplicita dell'umano, a valle
> della conferma dell'assunzione **A4 con correzione** (`docs/business-rules.md`).
> `CLAUDE.md` dichiara questa decisione bloccante per F01: la firma la sblocca.

## Data approvazione
2026-08-17 — approvata dall'umano, **incluse P1, P2 e P3 così come proposte**.

## RFC di riferimento
Nessuna. La decisione nasce direttamente dalla conferma di A4 del 2026-08-17 e dal
pattern già in produzione citato in Contesto.

---

## Contesto

Il CMS riusa le quattro soglie di ruolo esistenti — nessun ruolo editoriale nuovo
(A4, confermata il 2026-08-17). La matrice dei permessi editoriali
(`docs/business-rules.md` § Permessi editoriali) è però esprimibile come soglia in tutte
le righe **tranne una**:

| Azione | SuperAdmin (5) | Admin (10) | Manager (20) | User (30) |
|---|---|---|---|---|
| Modificare una Pagina **propria (bozza)** | ✅ | ✅ | ✅ | ✅ |
| Modificare una Pagina **di altri** | ✅ | ✅ | ✅ | ❌ |

Un `User` (30) può scrivere su *alcune* righe e non su altre. La distinzione non dipende
dal ruolo del chiamante ma dal **contenuto della riga** (`createdBy`, `status`).

I guard esistenti non possono esprimerlo, e non per una svista: `GuardSuperAdmin`,
`GuardAdmin` e `GuardManager` sono tre istanze della stessa factory
`requireRole(minRole)` (`app/backend/src/auth/guard.ts`), che legge `req['authInfo']`,
confronta `authInfo.role > minRole` e lancia `ForbiddenException`. Non tocca i `params`,
non usa `Reflector`, non ha accesso al database. Un `CanActivate` gira **prima**
dell'handler: per sapere se la riga è "propria" servirebbe una `SELECT` eseguita dal
guard e rifatta subito dopo dal service — doppia lettura e seconda fonte di verità.

`Utils.applyScopeFilter` non risolve il problema: filtra per `scopeId` (segmentazione
multi-tenant), non per autore, e con A5 confermata mono-sito il dominio CMS non lo usa.

**Il meccanismo però non va inventato: esiste già in produzione.**
`FilesService.softDelete` (`app/backend/src/files/files.service.ts`, riga 109) carica la
riga e applica:

```ts
if (authInfo.role > AppUserRoles.Admin && row.createdBy !== authInfo.userId) {
  throw new ForbiddenException("Solo l'autore del file o un Admin possono eliminarlo.");
}
```

Questa ADR promuove quella forma inline — oggi scritta a mano in un solo punto e non
riusabile — a pattern esplicito e condiviso del progetto.

---

## Decisione

### D1 — Il controllo di ownership vive nel service, mai nel guard

I guard restano **soltanto** a soglia di ruolo e non vengono modificati. L'ownership è un
controllo di dominio che richiede la riga: appartiene al service, dopo il caricamento
della riga e prima di qualsiasi scrittura.

Nella catena di un endpoint l'ordine è: `AuthMiddleware` (autenticazione) →
`@UseGuards(GuardX)` (soglia minima) → service (esistenza della riga → ownership →
regola di stato → scrittura).

### D2 — La proprietà è `createdBy`, ed è immutabile

`createdBy` è l'**unica** nozione di proprietà. Non esiste un secondo campo "autore
corrente", non esiste trasferimento di proprietà e **nessun endpoint di F01 modifica
`createdBy`** dopo l'inserimento. Un'eventuale riassegnazione dell'autore è una feature
nuova, con la propria spec e la propria ADR.

`updatedBy` registra chi ha scritto per ultimo e non conferisce alcun diritto.

### D3 — Soglia di elevazione: `Manager` per il contenuto, `Admin` per la cancellazione

Un chiamante è **elevato** (ignora l'ownership) se `authInfo.role <= soglia`:

| Operazione su `pages` | Soglia elevata | Comportamento del non elevato (`User`) |
|---|---|---|
| Lettura elenco / dettaglio | `Manager` (20) | Vede **solo le proprie righe** |
| `PATCH` bozza | `Manager` (20) | Solo righe proprie **e** in stato `draft` |
| `POST :guid/status` → `review` | — (consentito a tutti) | Solo su righe proprie in `draft` |
| `POST :guid/status` → altri stati | `Manager` (20) | `403` sempre |
| `DELETE` (soft delete) | `Admin` (10) | `403` sempre |

Le soglie non sono scelte qui: sono la lettura diretta della matrice in
`docs/business-rules.md` § Permessi editoriali. Questa ADR fissa **come** si applicano,
non **quali** sono.

### D4 — Lettura e scrittura sono due domande distinte

- **Visibilità**: un `User` vede tutte le proprie righe, in **qualunque** stato. Una
  pagina che ha scritto e che un Manager ha poi pubblicato resta nel suo elenco.
- **Scrittura**: un `User` scrive solo sulle proprie righe **in stato `draft`**. Appena la
  riga passa a `review`, `scheduled`, `published` o `archived`, la scrittura è `403`
  anche se la riga è sua.

Il vincolo di scrittura discende letteralmente dalla matrice: la voce autorizzata è
"Modificare una Pagina propria **(bozza)**", non "propria". Il vincolo di visibilità è la
scelta meno sorprendente: nascondere all'autore la propria pagina appena viene pubblicata
non è richiesto da nessuna regola e la farebbe sparire dal suo elenco senza spiegazione.

### D5 — Helper condiviso

Vive in `app/backend/src/common/ownership.ts` (utility core → `common/`, come da
Constitution § Convenzioni backend). Espone tre funzioni pure, senza accesso al database:

```ts
/**
 * Vero se il chiamante supera la soglia di elevazione e quindi opera
 * su qualunque riga, indipendentemente da chi l'ha creata.
 */
export function hasElevatedRowAccess(authInfo: AuthInfo, elevatedThreshold: AppUserRoles): boolean;

/**
 * Lancia ForbiddenException se il chiamante non è elevato e non è l'autore della riga.
 * Da chiamare nel service dopo il caricamento della riga e prima di ogni scrittura.
 */
export function assertRowOwnership(
  authInfo: AuthInfo,
  row: { createdBy: number },
  elevatedThreshold: AppUserRoles,
  message: string,
): void;

/**
 * Condizione Drizzle da mettere in AND nel WHERE di un elenco paginato.
 * Restituisce `undefined` se il chiamante è elevato (nessun filtro da applicare).
 */
export function rowOwnershipFilter(
  authInfo: AuthInfo,
  ownerColumn: PgColumn,
  elevatedThreshold: AppUserRoles,
): SQL | undefined;
```

Vincoli sull'helper:

- **Generico sull'ownership, muto sugli stati.** La regola "solo in `draft`" è specifica
  di `pages` e vive nella macchina a stati del suo service, non qui. Un helper che
  conoscesse gli stati delle Pagine sarebbe dominio travestito da utility.
- **Nessuna query.** Riceve la riga già caricata: chi legge il database è il service.
- Nessun `any`; `PgColumn`/`SQL` sono i tipi esportati da `drizzle-orm`.
- `FilesService.softDelete` **non viene rifattorizzato** in questa sede: è codice
  funzionante fuori dallo scope di F01. Chi lo toccherà per altri motivi userà l'helper.

### D6 — Il filtro di lista non è un'autorizzazione

`GET /api/v1/app/pages` per un `User` deve restituire **solo le proprie righe**. Nessun
guard può farlo: non è una decisione booleana sulla richiesta, è un **predicato nella
`WHERE`**. Restituire l'elenco completo e filtrarlo dopo la paginazione produrrebbe
pagine di lunghezza variabile e un conteggio totale sbagliato: il filtro entra nella
query, prima di `LIMIT`/`OFFSET` e prima del `COUNT`.

Forma attesa nel service:

```ts
const conditions = [eq(pageEntity.isActive, true), /* filtri di ricerca */];
const ownership = rowOwnershipFilter(authInfo, pageEntity.createdBy, AppUserRoles.Manager);
if (ownership) conditions.push(ownership);
```

Lo stesso predicato deve essere applicato alla query dei dati **e** a quella del totale.

### D7 — `403` sulla superficie amministrativa, `404` su quella pubblica

Confermato dall'umano il 2026-08-17. Non è una contraddizione con la regola "404, mai
403" delle business rules: le due regole valgono su superfici diverse, con avversari
diversi.

| Superficie | Caso | Risposta |
|---|---|---|
| `api/v1/app/*` | guid inesistente **o** riga soft-deleted | `404` |
| `api/v1/app/*` | riga esistente e attiva, soglia di ruolo insufficiente | `403` |
| `api/v1/app/*` | riga esistente e attiva, chiamante non elevato e non autore | **`403`** |
| `api/v1/public/*` | qualunque risorsa non `published` | `404` **sempre** |

**Perché `403` in area amministrativa.** Il `404` pubblico serve a non rivelare a un
**anonimo** l'esistenza di contenuto non pubblicato. In area amministrativa il chiamante
è già autenticato e dentro il perimetro editoriale: l'esistenza di una pagina altrui non
è un segreto da proteggere, e mascherarla da `404` renderebbe indistinguibili due
situazioni che l'utente deve poter distinguere — "questa pagina non esiste" e "questa
pagina non è tua". Il `403` è la risposta corretta e più diagnostica, ed è quella che
l'interceptor Axios già traduce in "Permessi insufficienti".

**Divergenza dichiarata, non sanata**: il modulo `notifications` risponde `404` sul guid
di un altro utente (`docs/business-rules.md` § Notifiche). Resta com'è: una mailbox
personale non è una superficie editoriale condivisa e l'enumerazione delle notifiche
altrui non ha alcun uso legittimo. La regola di questa ADR vale per il **contenuto
editoriale** (`pages` e le entità di dominio che seguiranno), non per il self-service.

### D8 — Caso di riferimento: "User vede solo le proprie bozze" nell'elenco paginato

Comportamento atteso di `GET /api/v1/app/pages?p=1&i=20`, dato un database con 40 pagine
di cui 7 create da `mario` (`User`, id 42) — 5 in `draft`, 1 in `review`, 1 `published`:

| Chiamante | Righe visibili | Totale in `Pagination<T>` |
|---|---|---|
| `SuperAdmin` / `Admin` / `Manager` | 40 | 40 |
| `mario` (`User`, id 42) | 7 (le proprie, tutti gli stati — D4) | **7**, non 40 |
| `User` diverso, senza pagine proprie | 0 | 0 |

Su queste 7 righe `mario` può eseguire `PATCH` solo sulle 5 in `draft`; sulle altre due
riceve `403`. Su una qualunque delle 33 righe altrui riceve `403` sia in lettura diretta
per guid sia in scrittura. Nessuna riga altrui compare mai nell'elenco, nemmeno il
conteggio.

---

## Alternative valutate

| Opzione | Pro | Contro | Motivo scarto |
|---|---|---|---|
| Guard di ownership con `Reflector` + query | Autorizzazione tutta in un posto, decorativa | Il guard deve leggere il DB; il service rilegge la stessa riga → doppia query e due fonti di verità. Non risolve comunque il filtro di lista (D6) | Scartata: sposta il problema senza risolverlo e ne aggiunge uno |
| Nuovi ruoli editoriali (Editor/Autore/Revisore) | Ownership esprimibile come soglia | Contraddice A4 confermata; nuovo sistema di permessi da costruire e mantenere; non elimina comunque il caso "propria bozza" | Scartata da A4 (2026-08-17) |
| `Utils.applyScopeFilter` riusato con `scopeId = userId` | Nessun codice nuovo | Piega una funzione multi-tenant a significare "autore"; con A5 mono-sito `scopeId` è vuoto; rompe il significato del campo per un futuro multi-sito | Scartata: distrugge l'unico punto di innesto previsto per A5 |
| Check inline ripetuto in ogni service (stato attuale in `files`) | Zero astrazione | La regola viene riscritta a mano a ogni endpoint: diverge in silenzio alla prima svista | Scartata: è il problema che questa ADR chiude |

---

## Conseguenze

**Positive**

- Il pattern è uno solo, in un file solo, riusabile da ogni modulo di dominio futuro
  (`forms`, `menus`, `redirects`).
- I guard restano semplici e senza dipendenze dal database.
- Il filtro di lista è nella query: paginazione e totale sono corretti per costruzione.
- La superficie pubblica resta governata dalla propria regola (`404` sempre), senza
  contaminazione dalle regole amministrative.

**Negative / costi accettati**

- Il controllo è **applicativo**: nulla a livello di database impedisce a un service
  scritto male di saltarlo. La difesa è il test, non il constraint. Ogni endpoint che
  tocca contenuto editoriale deve avere il proprio test `403`.
- Ogni service di dominio deve ricordarsi di chiamare l'helper: è una convenzione, non
  un'imposizione del compilatore.
- `FilesService` resta temporaneamente con la versione inline della stessa regola: due
  scritture della stessa idea finché quel file non viene toccato per altri motivi.

---

## Conformità

Il codice rispetta questa ADR se:

1. `app/backend/src/common/ownership.ts` esiste ed espone le tre funzioni di D5, senza
   accessi al database e senza `any` non commentato.
2. Nessun guard è stato modificato: `app/backend/src/auth/guard.ts` contiene ancora la
   sola factory a soglia.
3. Ogni percorso di scrittura di `PagesService` chiama `assertRowOwnership` **dopo** il
   caricamento della riga e **prima** dell'`UPDATE`.
4. `GET /app/pages` applica `rowOwnershipFilter` alla query dei dati **e** a quella del
   conteggio.
5. `createdBy` non compare in nessun DTO di update né in nessun `.set({...})` dopo
   l'inserimento.
6. Test di integrazione obbligatori:
   - `User` su bozza altrui per guid → `403`;
   - `User` su `PATCH` di bozza altrui → `403`;
   - `User` su `PATCH` di **propria** pagina in stato `review`/`published` → `403`;
   - `User` su guid inesistente o soft-deleted → `404` (mai `403`);
   - elenco paginato: il **totale** restituito a un `User` conta solo le proprie righe
     (scenario D8, con almeno una pagina altrui presente nel database);
   - `Manager` sulle stesse rotte → `200`.

---

## Punti che richiedevano la firma umana — ✅ tutti confermati il 2026-08-17

Tre decisioni di questa ADR non derivano da una regola già scritta: erano proposte
dell'Orchestrator. **P1, P2 e P3 sono state approvate senza modifiche**: la colonna "Se la
risposta è diversa" resta a titolo storico e non descrive il comportamento da implementare.

| # | Punto | Proposta | Se la risposta è diversa |
|---|---|---|---|
| P1 | Visibilità delle proprie pagine non più in `draft` (D4) | L'autore le **vede** in elenco, ma non le scrive | Se devono sparire dall'elenco, il predicato di D6 diventa `createdBy = me AND status = 'draft'` e il totale cambia |
| P2 | Trasferimento di proprietà (D2) | Non esiste: `createdBy` è immutabile | Se serve, è una feature nuova con endpoint, audit log e ADR propri |
| P3 | Soglia di visibilità dell'elenco fissata a `Manager` (D3) | Un `Manager` vede tutte le pagine | Se il `Manager` dovesse vedere solo un sottoinsieme, serve un criterio di segmentazione che oggi non esiste (A5 è mono-sito) |

Le altre decisioni (D1, D5, D6, D7, D8) sono lettura diretta del codice esistente, delle
business rules approvate o della decisione umana del 2026-08-17.
