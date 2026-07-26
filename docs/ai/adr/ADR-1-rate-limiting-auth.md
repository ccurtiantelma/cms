# ADR-1 — Rate limiting su /auth/* con @nestjs/throttler

## Status
[x] Approvato

## Data approvazione
2026-07-17 — approvato da: marketing@antelmagroup.net

## RFC di riferimento
Nessuna RFC dedicata — decisione derivata direttamente da `constitution.md`
("Rate limiting sugli endpoint /auth/*"), ereditata da `cima-infortunistica/ADR-1` e
adattata per lo starter-kit.

## Contesto
La Constitution impone rate limiting su `/auth/*`. Senza protezione dedicata, login,
mfa-verify e reset-password sarebbero esposti a tentativi illimitati (brute-force,
enumerazione utenti).

## Decisione
- Dipendenza `@nestjs/throttler` (v6).
- `ThrottlerModule.forRoot()` registrato in `app.module.ts` con un throttler di
  default chiamato `auth` (20 richieste / 60s), usato come limite di base per
  tutte le rotte del modulo Auth.
- `ThrottlerGuard` applicato **solo** a livello di `AuthController` (non come
  guard globale): la regola della Constitution riguarda esplicitamente `/auth/*`,
  non l'intera API, quindi non si introduce rate limiting su moduli non richiesti.
- Limite specifico più severo (5 richieste / 60s) via decoratore `@Throttle`
  sulle rotte pubbliche esposte a brute-force/enumerazione: `login`, `mfa-verify`,
  `activate`, `forgot-password`, `reset-password`.
- Storage: in-memory (default della libreria). Adeguato al deploy attuale
  (singola istanza backend); se in futuro si passa a più istanze dietro load
  balancer, lo storage andrà spostato su Redis (`ioredis` già presente come
  dipendenza) — richiederà un nuovo ADR di amendment, non un'estensione silente.

## Alternative valutate
| Opzione | Pro | Contro | Motivo scarto |
|---|---|---|---|
| `@nestjs/throttler` (scelta) | Libreria ufficiale NestJS, integrazione nativa con guard/decoratori, manutenuta | Nuova dipendenza npm | Nessuno significativo: standard de-facto nell'ecosistema NestJS |
| Guard custom su `ioredis` | Zero nuove dipendenze | Da scrivere e mantenere da zero (TTL, sliding window, header standard `Retry-After`) | Reinventa una ruota già risolta in modo robusto da una libreria ufficiale |
| Rate limiting a livello reverse proxy (nginx/Cloudflare) | Nessun impatto sul codice applicativo | Non documentabile/testabile nel repo; dipende da infra esterna non versionata qui | Constitution richiede comportamento verificabile lato applicazione (vedi sezione Conformità) |

## Conseguenze
- Positive: login/MFA/reset password protetti da tentativi automatizzati ripetuti;
  risposta `429` uniforme gestita dal filtro globale `AllExceptionsFilter`.
- Negative: con storage in-memory, il contatore si azzera a ogni riavvio del
  processo e non è condiviso tra istanze multiple — accettabile oggi, da
  rivedere se si scala orizzontalmente il backend.
- Manutenzione: i limiti (5/60s, 20/60s) sono valori hardcoded nei decoratori,
  non configurabili via env — scelta intenzionale per evitare di esporre una
  superficie di configurazione non richiesta (vedi "Convenzioni generali").

## Conformità
- `app/backend/src/app.module.ts`: `ThrottlerModule.forRoot(...)` con throttler `auth`.
- `app/backend/src/auth/auth.controller.ts`: `@UseGuards(ThrottlerGuard)` a livello
  di classe + `@Throttle({ auth: { limit: 5, ttl: 60_000 } })` sulle rotte sensibili
  (`login`, `mfa-verify`, `activate`, `forgot-password`, `reset-password`).
- Test: `app/backend/test/auth-throttle.spec.ts` verifica il `429` su `auth/login`
  oltre il limite configurato.
