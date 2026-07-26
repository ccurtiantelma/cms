# ADR-12 — Notifiche persistenti con campanella/badge e push realtime (`NotificationsModule`)

## Status
[ ] In discussione · [x] Approvato · [ ] Rifiutato · [ ] Superseded da ADR-XXX

## Data approvazione
2026-07-23 — approvato da: ccurti (via chat, richiesta esplicita di completare
il punto 7 di un'analisi precedente sul gap "feedback solo `notifications.show`
effimero"; approvazione esplicita, in un'unica domanda, sia della modifica a
`schema.ts` sia della nuova dipendenza npm `socket.io-client`, entrambe elencate
in CLAUDE.md "Ask first").

## RFC di riferimento
Nessuna RFC dedicata. Punto 7 di un'analisi/audit richiesta esplicitamente
dall'umano (stesso filone di ADR-8/9/10/11).

## Contesto

Lo starter-kit espone oggi un solo canale di feedback verso l'utente:
`notifications.show(...)` di `@mantine/notifications` (toast effimero, sparisce
dopo pochi secondi e non lascia traccia). Per un gestionale questo è
insufficiente in due modi concreti:

1. Un utente che non è davanti allo schermo nel momento esatto in cui accade
   un evento (es. "documento caricato", "richiesta approvata") perde
   l'informazione per sempre — nessuna cronologia da consultare dopo.
2. Non c'è un building block condiviso: ogni progetto verticale che vuole una
   cronologia notifiche dovrebbe reinventare tabella, endpoint e UI da zero.

Lo starter-kit ha già un pezzo pronto ma inerte: `app/backend/src/realtime/`
(`AppGateway`, Socket.io, namespace `/realtime`, autenticazione JWT + allowlist
Redis, `emitToUser` per room `user:${userId}`) — **completo ma mai importato in
`app.module.ts`** (vedi commento storico in quel file e
`docs/system-architecture.md` §"Realtime — Socket.io (OPZIONALE)"). Il
frontend non ha mai avuto un client Socket.io.

## Decisione

**1. Tabella `notifications`** (`app/backend/src/db/schema.ts`, struttura
CLAUDE.md id/guid/isActive/created*/updated* + campi specifici):
```
id          serial PRIMARY KEY
guid        char(16)                 ← usato nelle URL pubbliche
userId      integer NOT NULL FK → users.id (restrict/restrict) ← destinatario
type        varchar(100)             ← codice libero, definito dal progetto verticale
title       varchar(200)
message     text
link        varchar(500)             ← nullable, percorso frontend opzionale al click
isRead      boolean DEFAULT false
readAt      timestamp with time zone ← nullable
isActive/createdAt/updatedAt/createdBy/updatedBy   ← standard, FK restrict/restrict
```
Indice composito `(user_id, is_read)` per il conteggio non-lette del badge.
**Nessun `Utils.applyScopeFilter`**: a differenza di `audit_log`/`files`, la
visibilità qui è per singolo utente (mailbox personale via `userId`), non
multi-tenant/multi-sede — annotato esplicitamente nello schema per non essere
scambiato per una dimenticanza in review future.

**2. `NotificationsModule`** (`app/backend/src/notifications/`):
```
notifications.module.ts
notifications.controller.ts   (@Controller('app/notifications'), nessun guard di ruolo:
                                la barriera è l'appartenenza userId, non l'RBAC)
notifications.service.ts      (notify(), findAllForUser(), unreadCount(), markRead(), markAllRead())
dto/notification.dto.ts       (NotificationDto, UnreadCountDto, MarkAllReadDto)
```
- `GET /app/notifications` (?p&i&unreadOnly) — lista paginata del chiamante.
- `GET /app/notifications/unread-count` — per il badge.
- `PATCH /app/notifications/:guid/read` — segna letta (filtro `userId` nel
  WHERE, non un controllo separato dopo il fetch: un guid di un altro utente
  torna 404, mai un 403 che ne confermerebbe l'esistenza).
- `PATCH /app/notifications/read-all` — segna tutte lette.
- `NotificationsService.notify(targetUserId, input, authorUserId?)` è
  **esportato**: building block che i moduli di dominio del progetto
  verticale iniettano e chiamano sui propri eventi applicativi. Lo
  starter-kit non contiene trigger di dominio (stessa filosofia di
  `AuditLogService`/`FilesModule`): nessun endpoint pubblico per inviare
  notifiche arbitrarie, per non inventare business rule non richieste.

**3. `RealtimeModule` montato in `app.module.ts`**: prima non importato di
default, ora attivo — `NotificationsService.notify()` chiama
`AppGateway.emitToUser(userId, 'notification.new', dto)` dopo la scrittura in
DB. La persistenza resta la fonte di verità: se il push realtime va perso
(client non connesso, gateway smontato in un fork del progetto) la campanella
si allinea comunque al prossimo `GET /app/notifications*`.

**4. Frontend**: nuova dipendenza `socket.io-client`, hook
`useNotifications` (`NotificationsProvider` + hook, stesso pattern di
`useAuth`) che recupera stato iniziale via REST e si aggiorna in realtime
ascoltando `notification.new` sul namespace `/realtime` (connessione opt-in:
solo se `VITE_SOCKET_URL` è valorizzata). Componente `NotificationBell`
(`ActionIcon` + `Indicator` Mantine per il badge, `Popover` per il dropdown
con le notifiche recenti), montato nella sezione utente della sidebar di
`LayoutProtected` (il layout non ha un header: stessa posizione degli altri
tasti azione — comprimi/logout). Il toast `notifications.show` **resta**: al
`notification.new` viene mostrato un toast immediato *in aggiunta* alla riga
persistita in campanella, non al suo posto — il gap descritto in Contesto era
"solo toast", non "il toast è sbagliato".

## Alternative valutate

| Opzione | Pro | Contro | Motivo scarto |
|---|---|---|---|
| **Tabella `notifications` + `NotificationsModule` + `RealtimeModule` montato** (scelta) | Riusa il gateway già pronto (zero nuovo codice WebSocket), cronologia persistente, building block per il progetto verticale | Due approvazioni umane obbligatorie (schema + dipendenza npm), nuova superficie WebSocket da mantenere | — |
| Solo polling REST (`GET /app/notifications/unread-count` a intervalli), niente Socket.io | Nessuna dipendenza nuova, nessun gateway da montare | Nessun vero realtime (latenza = intervallo di polling), carico HTTP superfluo su un'installazione con molti utenti connessi | Scartata come default, ma è la modalità di *degrado automatico*: se `VITE_SOCKET_URL` non è configurata la campanella resta comunque funzionante via REST, senza codice condizionale duplicato |
| Notifiche solo in-memory (Redis pub/sub), nessuna tabella | Nessuna migrazione DB, scrittura più veloce | Nessuna cronologia: un utente offline al momento dell'evento la perde per sempre — esattamente il limite del toast che questo ADR risolve | Scartata: contraddice l'obiettivo primario (persistenza) |
| Endpoint pubblico per inviare notifiche arbitrarie a qualunque utente (oltre a `notify()` interno) | Comodo per test manuali/demo | Business rule non richiesta (chi può notificare chi?) inventata dallo starter-kit, che non contiene logica di dominio | Scartata per over-engineering: resta un metodo di service da chiamare dal codice, non un endpoint HTTP |

## Conseguenze

- **Positive**: cronologia persistente consultabile in qualunque momento
  (non più solo toast effimero); building block (`notify()`) riusabile da
  ogni modulo di dominio futuro senza reinventare tabella/endpoint/UI;
  push realtime a costo quasi nullo (gateway già scritto e testato in
  precedenza, solo da montare); degrado automatico a polling REST se il
  progetto verticale preferisce non attivare Socket.io (`VITE_SOCKET_URL`
  assente).
- **Negative / attenzione**:
  - `RealtimeModule` è ora **sempre montato di default** (non più opt-in):
    ogni progetto che eredita lo starter-kit ha una porta WebSocket attiva
    anche se non la usa. Costo ritenuto accettabile perché il gateway ha già
    autenticazione JWT + allowlist Redis (nessuna superficie anonima), ma va
    tenuto presente in eventuali audit di sicurezza futuri.
  - Nessuna paginazione oltre le 20 notifiche recenti nel dropdown della
    campanella (l'endpoint `GET /app/notifications` supporta `p`/`i` per una
    futura pagina "Tutte le notifiche", non implementata ora: valutata
    over-engineering per l'MVP, il progetto verticale la aggiunge se il
    volume di notifiche lo giustifica).
  - Il gateway valida la sessione solo alla connessione (JWT + allowlist
    Redis in `handleConnection`): un socket resta aperto anche dopo la
    scadenza naturale dell'access token (15 min) finché non c'è logout o
    disconnessione esplicita — comportamento preesistente di `AppGateway`,
    non introdotto da questo ADR.
- **Documentazione**: aggiornati in questa sessione
  `docs/system-architecture.md` (sezione Realtime da OPZIONALE a montata +
  nuova sezione "Notifiche — NotificationsModule"), `docs/ai/progress-tracker.md`,
  `docs/openapi.yaml`/`app/frontend/src/types/api.types.ts` (rigenerati),
  `.env.example` (root + frontend, `VITE_SOCKET_URL` non più commentata).

## Conformità

- File: `app/backend/src/db/schema.ts` (`notificationEntity` + relations),
  `app/backend/src/db/migrations/0003_striped_tyrannus.sql`; `app/backend/src/notifications/`
  (`notifications.module.ts`, `notifications.controller.ts`,
  `notifications.service.ts`, `dto/notification.dto.ts`);
  `app/backend/src/common/types.ts` (`NotificationsQueryParams`);
  `app/backend/src/app.module.ts` (montaggio `RealtimeModule` +
  `NotificationsModule`); `app/frontend/package.json` (`socket.io-client`);
  `app/frontend/src/types/notifications.types.ts`;
  `app/frontend/src/services/notifications.service.ts`;
  `app/frontend/src/hooks/useNotifications.tsx`;
  `app/frontend/src/components/NotificationBell.tsx` + `.module.css`;
  `app/frontend/src/layouts/LayoutProtected.tsx` (mount provider + campanella);
  `.env.example` (root + `app/frontend/`).
- Test: `app/backend/test/unit/notifications/notifications.service.spec.ts`
  (8 test: notify, findAllForUser, unreadCount, markRead happy/404,
  markAllRead), `app/backend/test/e2e/notifications.e2e-spec.ts` (7 test:
  lista, unread-count, mark-read happy/ownership-404, mark-all-read,
  401 senza JWT) — 15/15 verdi.
- Collezioni Bruno: `bruno/notifications/List Notifications.yml`,
  `Unread Count.yml`, `Mark Read.yml`, `Mark All Read.yml`.
- Come riverificare: `npm run build:backend && npm run lint:backend &&
  npx jest test/unit/notifications test/e2e/notifications.e2e-spec.ts
  --config test/e2e/jest-e2e.json` (e2e) `&& npx jest test/unit/notifications`
  (unit) dalla cartella `app/backend`; `npx tsc --noEmit` in
  `app/frontend`. Verifica manuale end-to-end (bell in browser con
  Postgres/Redis reali) non eseguita in questa sessione — ambiente DB/Redis
  dev non disponibile; da fare al primo avvio reale dell'app.
