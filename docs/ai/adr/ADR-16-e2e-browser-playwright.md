# ADR-16 — E2E browser (Playwright): login → MFA → azione autenticata → logout

## Status
[ ] In discussione · [x] Approvato · [ ] Rifiutato · [ ] Superseded da ADR-XXX

## Data approvazione
2026-07-26 — approvato da: ccurti (via chat, "procedi" su un elenco di 5 azioni
proposte in chiusura della gap analysis del 2026-07-23/26 — punto 12
dell'analisi originale, "E2E browser testing (Playwright)", mai implementato
prima; approvazione include esplicitamente l'installazione delle nuove
dipendenze npm `@playwright/test` e `otplib` a livello di root).

## RFC di riferimento
Nessuna RFC dedicata. Punto 12 della gap analysis originale (unico, tra i 12,
mai implementato prima di questo audit di chiusura — vedi
`docs/ai/progress-tracker.md`).

## Contesto

Fino ad oggi la copertura di test copriva Jest (unit, entrambi i workspace),
Supertest (integrazione backend con `AuthMiddleware` reale o mockato) e
collezioni Bruno (contract test manuali), ma nessun test attraversava
davvero un browser reale. I flussi di autenticazione (login, MFA TOTP,
sessione, logout) sono il cuore dello starter-kit ("Contiene già:
autenticazione JWT... MFA TOTP...", CLAUDE.md → Identità del progetto) e
l'unico punto dove un refactoring di `PageLogin.tsx`, `useAuth.tsx` o
`AuthMiddleware` potrebbe rompere l'esperienza utente senza che nessun test
esistente se ne accorga (i test Supertest mockano `AuthMiddleware` o lo
istanziano direttamente, mai passando dalla UI reale).

## Decisione

Aggiungere una suite Playwright (`@playwright/test`) a livello di **repository
root** (`e2e/`), non dentro `app/backend/` né `app/frontend/`: il test
attraversa entrambi (browser sul frontend, chiamate HTTP reali sul backend) e
non è "codice applicativo" di dominio (business logic, componenti, DTO) — è
tooling di test, come già ammesso in root per `package.json`/
`docker-compose.yml`/`.github/workflows/` (CLAUDE.md → Never do).

Un solo scenario, end-to-end: login con credenziali → step MFA (verifica
TOTP) → un'azione autenticata reale (pagina Profilo) → logout. Setup e
teardown della MFA sull'utente demo SUPERADMIN passano dalle **API REST
dirette** (via `APIRequestContext` di Playwright), non dal browser:

- Evita la fragilità del componente Mantine `PinInput` (usato per
  attivare/disattivare la MFA in `PageProfile.tsx`) in una parte del flusso
  che non è oggetto del test (il *setup*, non il *login*).
- Lo step MFA **durante il login** resta invece testato via browser reale:
  `PageLogin.tsx` usa lì un semplice `TextInput` ("Codice TOTP"), non un
  `PinInput` — quello è il comportamento sotto test.
- Il teardown (`mfa-disable` via API a fine test) riporta l'utente demo
  SUPERADMIN allo stato originale (MFA disattivata), per non alterare
  permanentemente l'ambiente dev condiviso con altri usi manuali.

I codici TOTP (setup, login, teardown) sono generati con `otplib`
(`authenticator.generate(secret)`), la stessa libreria già usata
server-side (`AuthService`, vedi `otplib` in `app/backend/package.json`) —
nessuna libreria TOTP nuova o divergente.

Nessun `webServer` nella config Playwright (`e2e/playwright.config.ts`): a
differenza del setup tipico Playwright, il backend richiede Postgres/Redis
reali (Docker), fuori dal ciclo di vita che Playwright può gestire da solo.
Precondizione esplicita: backend + frontend già avviati (`docker compose up
-d postgres redis mailhog` + `npm run dev`, o l'equivalente in CI).

Il tour guidato (`AppTour.tsx`, driver.js) parte automaticamente al primo
accesso e il suo overlay intercetta i click: il test lo marca "già visto"
(`localStorage.tour_completed = 'true'`, via `page.addInitScript`) prima di
qualunque navigazione — non è oggetto di questo scenario.

## Alternative valutate

| Opzione | Pro | Contro | Motivo scarto |
|---|---|---|---|
| **Playwright in `e2e/` a livello root** (scelta) | Un solo posto per un test cross-stack; non si presta a essere confuso con codice applicativo di un singolo workspace | Non segue lo schema "ogni test vive nel suo workspace" degli altri test | Il test NON appartiene a un solo workspace: è l'unico caso genuinamente cross-cutting |
| Playwright dentro `app/frontend/e2e/` | Colocato con la UI che guida | Il backend (Postgres/Redis/API reali) non è "frontend" — l'accoppiamento è fuorviante, e il Frontend Developer (CLAUDE.md) non dovrebbe possedere chiamate dirette alle API di test/MFA | Frammenterebbe la responsabilità tra ruoli senza un beneficio reale |
| Cypress al posto di Playwright | Ecosistema maturo, simile diffusione | Nessun vantaggio specifico per questo starter-kit; Playwright ha supporto nativo multi-browser e `APIRequestContext` integrato (usato qui per setup/teardown MFA) | Nessun motivo per preferirlo a Playwright |
| Setup/teardown MFA via UI (click reali su `PinInput`) invece che via API | Copertura "più end-to-end" anche del flusso di attivazione MFA | `PinInput` di Mantine v7 non ha un selettore stabile documentato (nessuna convenzione `data-testid` nel progetto); renderebbe il test fragile su una parte (attivazione MFA da Profilo) che non è l'oggetto dichiarato dello scenario | Il setup via API è più stabile e più veloce; l'attivazione/disattivazione MFA da UI resta un gap noto, non coperto qui |
| Abilitare MFA su un utente dedicato creato ad-hoc invece che sul SUPERADMIN demo | Nessun rischio di lasciare lo stato dell'account condiviso alterato in caso di crash del teardown | Richiederebbe il flusso di creazione+attivazione utente (invito via email, mockata nei test Jest ma non qui) solo per ottenere un utente con password nota | Complessità aggiuntiva non giustificata; il teardown esplicito (`test.afterAll`) riporta comunque lo stato a MFA disattivata |

## Conseguenze

- **Positive**: prima copertura reale del flusso di autenticazione end-to-end
  in un browser vero; regressioni su `PageLogin.tsx`/`useAuth.tsx`/
  `AuthMiddleware`/tour guidato che rompono l'esperienza utente (non solo il
  contratto HTTP) vengono ora intercettate.
- **Negative / attenzione**:
  - Il rate limiting `@Throttle` su `/auth/*` (`ThrottlerGuard`, vedi
    `AuthController`) si applica anche a questa suite: eseguirla ripetutamente
    in rapida successione (es. debug manuale via `curl` sulle stesse rotte in
    parallelo) può esaurire la quota (5 richieste/60s su `auth/login` e
    `auth/mfa-verify`) e far fallire il test con `429` anziché con l'esito
    reale — comportamento verificato empiricamente durante lo sviluppo di
    questo ADR. Non è un difetto della suite: è la stessa soglia già in
    produzione, verificata così per la prima volta sotto carico reale.
  - Se il teardown (`test.afterAll`) non arriva a eseguire `mfa-disable` (es.
    crash del processo Playwright), l'utente demo SUPERADMIN resta con la MFA
    abilitata — recuperabile manualmente con `POST /auth/mfa-disable` o
    `PATCH .../reset-mfa` (endpoint Admin già esistente).
  - Richiede Chromium installato localmente (`npx playwright install
    chromium`) — non incluso nell'installazione npm standard.
  - Non è ancora integrato nella pipeline CI (`ADR-5`): richiederebbe un job
    aggiuntivo con Postgres/Redis/backend/frontend avviati insieme, lasciato
    come follow-up per non appesantire questo ADR.

## Conformità

- File: `e2e/playwright.config.ts`, `e2e/tests/auth-flow.spec.ts`,
  `e2e/tests/helpers/backend-env.ts`; `package.json` (root) — script
  `test:e2e:browser`, devDependencies `@playwright/test` e `otplib`.
- Come eseguire: backend + frontend + Docker (postgres/redis) già avviati,
  poi `npm run test:e2e:browser` dalla root (richiede `npx playwright
  install chromium` una tantum).
- Verificato manualmente in questa sessione: run completo verde con
  `SUPERADMIN_EMAIL`/`SUPERADMIN_PASSWORD` reali da `app/backend/.env`,
  incluso il ripristino post-test dello stato MFA originale (disattivata).
