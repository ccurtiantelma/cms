# ADR-14 — Hardening cookie `rtk`: `SameSite`/`Secure` espliciti, nessun token CSRF dedicato

## Status
[x] Approvato

## Data approvazione
2026-07-23 — approvato da: marketing@antelmagroup.net

## RFC di riferimento
Nessuna RFC dedicata — gap individuato durante un audit di sicurezza sul flusso di
autenticazione, non durante lo sviluppo di una feature nuova.

## Contesto

Durante un audit di sicurezza sul flusso di autenticazione è emerso che il cookie
`rtk` (refresh token opaco, vedi `system-architecture.md` → Autenticazione e
`ADR-2-security-baseline.md`) viene impostato in
`app/backend/src/auth/auth.controller.ts` (`attachRefreshCookie`) con:

```ts
res.cookie('rtk', authResponse.refreshToken, {
  httpOnly: true,
  signed: true,
  maxAge: AppConstants.rtkExpiration * 1000,
  domain: AppConstants.cookieDomain,
  path: '/',
});
```

Non sono impostati né `secure` né `sameSite`. Non esiste inoltre alcun meccanismo
di token CSRF (né `csurf`, né double-submit cookie, né header custom richiesto) in
nessun punto del backend o del frontend — verificato via grep su tutto
`app/backend/src` e `app/frontend/src` (nessun riscontro per `csrf`/`csurf`/
`sameSite`/`X-Requested-With`).

`ADR-2-security-baseline.md` non copre questo punto: tratta hashing password, `jti`,
redazione/dedup/rate-limit log, `forbidNonWhitelisted`, mailer/queue — non la
configurazione del cookie di sessione. Il gap non era quindi documentato altrove,
né come decisione presa né come rischio accettato.

Fattori che riducono (ma non eliminano) il rischio reale allo stato attuale:
- CORS già ristretto in `main.ts` (`app.enableCors({ origin: AppConstants.frontendUrl,
  credentials: true })`) — non è un wildcard `*`, quindi un sito terzo non può leggere
  la risposta di `auth/refresh` anche riuscendo a farla eseguire.
- Il flusso di refresh lato frontend è un `POST` via Axios interceptor, mai una
  navigazione GET — le richieste sensibili non sono mai innescabili da un semplice
  link o `<img>`.
- I browser moderni (Chrome/Edge/Firefox recenti) applicano `SameSite=Lax` come
  default quando l'attributo è assente, quindi una parte di protezione esiste già
  "per conto" del browser — ma non è esplicita, non è documentata, e non è garantita
  su tutti i client (browser meno recenti, webview, versioni pinnate).

## Decisione

Impostare esplicitamente su `res.cookie('rtk', ...)`:
- `secure: AppConstants.isProduction` — il cookie viaggia solo su HTTPS in
  produzione; resta inviabile su `http://localhost` in sviluppo (dove non c'è TLS),
  coerente con l'ambiente dev descritto in `GUIDA_UTILIZZO.md`.
- `sameSite: 'lax'` — blocca l'invio del cookie su richieste cross-site generate da
  `POST`/`fetch`/`form`/`iframe` di terzi (il vettore CSRF rilevante qui), senza
  rompere eventuali navigazioni dirette dell'utente verso l'app (link da email, ecc.),
  che con `strict` verrebbero penalizzate senza un beneficio aggiuntivo reale nel
  nostro flusso (le chiamate sensibili sono sempre `POST` via XHR, mai `GET` di
  navigazione).

Nessun token CSRF dedicato (né header custom, né double-submit cookie): la
combinazione `httpOnly` + `sameSite=Lax` esplicito + CORS a origine singola con
`credentials: true` + endpoint sensibili esposti solo su verbi `POST` è considerata
difesa sufficiente per lo starter-kit generico, evitando una dipendenza aggiuntiva
non necessaria.

Questa decisione riguarda solo il cookie di sicurezza `rtk`. Le preferenze cliente
non sensibili (`color_scheme`, `auth_user` in cache) restano in `localStorage`
lato frontend, fuori scope.

## Alternative valutate

| Opzione | Pro | Contro | Motivo scarto |
|---|---|---|---|
| **`sameSite: 'lax'` + `secure` condizionale** (scelta) | Copre il vettore CSRF reale (POST cross-site); nessuna nuova dipendenza; nessun impatto sul flusso Axios esistente | Non protegge da CSRF via sotto-domini con lo stesso `COOKIE_DOMAIN` (mitigato da RBAC/audit, non da questo ADR) | — |
| `sameSite: 'strict'` | Difesa massima | Il cookie non verrebbe inviato sulla prima richiesta dopo una navigazione diretta cross-site (es. link da email) fino alla successiva richiesta same-site — frizione UX senza beneficio, dato che le chiamate sensibili sono sempre `POST` via XHR | Costo UX non giustificato dal guadagno di sicurezza marginale |
| Token CSRF dedicato (`csurf`/double-submit cookie) | Difesa in profondità indipendente dal browser | `csurf` è deprecato/non mantenuto; double-submit richiede un endpoint e uno stato aggiuntivi; ridondante data la combinazione CORS single-origin + `sameSite` + POST-only | Complessità e dipendenza non giustificate per un boilerplate generico |
| Nessuna azione (contare sul default browser `Lax` implicito) | Zero lavoro | Comportamento non documentato, non garantito su browser/webview meno recenti, nessuna traccia della decisione presa in caso di audit futuro | Gap rilevato in audit di sicurezza: va chiuso esplicitamente, non lasciato implicito |

## Conseguenze

- **Positive**: comportamento del cookie `rtk` esplicito e verificabile in codice
  invece di dipendere da default impliciti del browser; nessuna nuova dipendenza;
  nessun impatto sul flusso di login/refresh/logout esistente (tutte chiamate
  same-origin via Axios).
- **Negative / attenzione**: `secure: true` in produzione richiede che il backend sia
  effettivamente servito/raggiunto solo via HTTPS (vero già oggi, ma da tenere a
  mente in eventuali configurazioni di reverse proxy/load balancer future — se TLS
  termina a un livello che non marca la richiesta come sicura, il cookie non verrebbe
  impostato). `sameSite: 'lax'` non protegge da attacchi CSRF originati da
  sotto-domini che condividono lo stesso `COOKIE_DOMAIN`: resta un rischio accettato,
  fuori scope per questo ADR (dipende dalla policy di isolamento dei sotto-domini di
  ogni progetto verticale).

## Conformità

- `app/backend/src/auth/auth.controller.ts` — `attachRefreshCookie`: `res.cookie('rtk',
  ...)` deve includere `secure: AppConstants.isProduction` e `sameSite: 'lax'`.
- `app/backend/src/auth/auth.controller.ts` — `logout`: `res.clearCookie('rtk', ...)`
  deve specificare le stesse opzioni (`sameSite`/`secure`) usate in scrittura, per
  compatibilità con i browser che le richiedono per l'invalidazione corretta.
- `app/backend/test/e2e/auth.e2e-spec.ts` — `POST /auth/login` verifica
  `SameSite=Lax`/`HttpOnly` presenti e `Secure` assente sull'header `Set-Cookie`
  (coerente con `NODE_ENV=test`); `POST /auth/logout` verifica `SameSite=Lax` anche
  sull'header di cancellazione del cookie.
- Nessun impatto su `app/frontend/` (il cookie è gestito esclusivamente lato browser,
  mai letto/scritto da codice frontend).

**Nota**: implementato in `app/backend/src/auth/auth.controller.ts`
(`attachRefreshCookie` e `logout`) — `secure: AppConstants.isProduction` e
`sameSite: 'lax'` applicati sia all'impostazione sia alla cancellazione del
cookie `rtk`, con copertura e2e dedicata.
