# ADR-13 — Gestione sessioni/dispositivi attivi (`GET/DELETE auth/sessions`)

## Status
[ ] In discussione · [x] Approvato · [ ] Rifiutato · [ ] Superseded da ADR-XXX

## Data approvazione
2026-07-23 — approvato da: ccurti (via chat, richiesta esplicita di completare
il punto 8 di un'analisi precedente sul gap "Gestione sessioni/dispositivi
attivi", con indicazione esplicita dell'approccio — leva sull'allowlist Redis
esistente — e richiesta esplicita di aggiornare la documentazione a
completamento; stesso filone di ADR-8/9/10/11/12). Nessuna nuova dipendenza
npm né modifica a `schema.ts` richiesta: decisione a rischio più basso delle
precedenti dello stesso filone.

## RFC di riferimento
Nessuna RFC dedicata. Punto 8 di un'analisi/audit richiesta esplicitamente
dall'umano (stesso filone di ADR-8/9/10/11/12).

## Contesto

Lo starter-kit non offriva alcuna visibilità lato utente sulle proprie sessioni
attive: nessun modo di vedere quali dispositivi hanno accesso all'account, né
di revocare un accesso sospetto senza cambiare la password (che invalida solo
i login *futuri*, non le sessioni già aperte altrove). Per un gestionale con
accesso da più dispositivi/reti (ufficio, mobile, VPN cliente) questo è un gap
di sicurezza percepita non banale.

L'analisi di partenza ipotizzava una leva "a basso costo": l'allowlist Redis
`login:${accessToken}` già esistente (vedi ADR-2). In fase di implementazione
è emerso un limite architetturale non ovvio di quella leva presa alla lettera:

- `login:${accessToken}` ha TTL = durata dell'access token (`JWT_EXPIRATION`,
  default 15min) e **ruota ad ogni refresh** (nuovo `jti`, nuova chiave) — non
  è un identificativo stabile di "dispositivo", solo dell'access token corrente.
- Anche `rtk:${refreshToken}` ruota ad ogni utilizzo (rotation, ADR-2): non è
  disponibile un identificativo che sopravviva a un singolo ciclo di refresh.
- Di conseguenza, elencare le chiavi `login:*`/`rtk:*` esistenti non avrebbe
  prodotto una vera "lista dispositivi", ma un elenco rumoroso di token
  effimeri che cambiano continuamente — e revocare solo `login:${accessToken}`
  (senza toccare `rtk:${refreshToken}`) avrebbe dato una falsa sensazione di
  sicurezza: il dispositivo revocato avrebbe potuto ottenere un nuovo access
  token con una semplice chiamata a `auth/refresh` col proprio cookie `rtk`
  ancora valido.

## Decisione

Introdotto un livello di tracking "sessione/dispositivo" **sopra** le chiavi
Redis effimere esistenti, senza modificarne il funzionamento:

**1. Nuovo namespace Redis** (nessuna modifica a `schema.ts`, nessuna nuova
tabella — coerente con "Redis è l'unica session store" già in
`docs/system-architecture.md`):
- `session:${sessionId}` → `{ userId, ip, userAgent, createdAt, lastUsedAt,
  refreshToken, accessToken }`. `sessionId` (`Utils.randomString(16)`, stesso
  pattern di `guid`) è generato una sola volta al login e **riusato** ad ogni
  refresh (passato esplicitamente a `generateAuthTokens`), restando stabile
  per tutta la vita della sessione (fino a `RTK_EXPIRATION`, default 7gg).
  `createdAt` è preservato tra le rotazioni; `lastUsedAt`/`ip`/`userAgent`/i
  token correnti sono aggiornati ad ogni refresh.
- `user-sessions:${userId}` → set Redis dei `sessionId` attivi per l'utente,
  usato per l'elencazione (`SMEMBERS`), con pulizia lazy delle voci scadute
  (session record assente → `SREM` al primo accesso successivo).
- `login:${accessToken}` esteso con un campo `sessionId` (solo per sessioni
  non di impersonificazione) per risalire alla sessione corrente da un
  access token, senza dover propagare `sessionId` in `AuthInfo`/JWT.

**2. Revoca reale, non cosmetica**: `DELETE auth/sessions/:sessionId` cancella
`session:${sessionId}`, **sia** `rtk:${refreshToken}` **sia**
`login:${accessToken}` correnti della sessione, e rimuove l'id dal set. Il
dispositivo revocato perde l'accesso immediatamente e non può rinnovare il
token (verificato: vedi sezione Conformità).

**3. Logout coerente con la lista**: `AuthService.logout` è stato esteso per
eseguire la stessa pulizia (prima cancellava solo `login:${token}`, lasciando
`rtk:${refreshToken}` valido fino alla scadenza naturale — un refresh token
"orfano" ma tecnicamente ancora utilizzabile). Senza questa estensione, ogni
logout normale avrebbe lasciato una sessione "fantasma" visibile come attiva
in `GET auth/sessions` fino a 7 giorni dopo.

**4. Nessun tracking durante l'impersonificazione**: coerente con la scelta
esistente (ADR-2/business-rules.md) di non generare un refresh token durante
l'impersonificazione — non ha senso di dominio, è già tracciata a parte
nell'audit log (`impersonation.start`/`impersonation.end`).

**5. Endpoint** (`app/backend/src/auth/auth.controller.ts`, protetti dal
normale `AuthMiddleware` globale, nessun guard RBAC aggiuntivo — ogni utente
gestisce solo le proprie sessioni, filtro per `userId` lato service):
- `GET auth/sessions` → `SessionSummary[]` (`sessionId`, `ip`, `userAgent`,
  `createdAt`, `lastUsedAt`, `current`)
- `DELETE auth/sessions/:sessionId` → `404` generico (non distingue "non
  esiste" da "appartiene a un altro utente", anti-IDOR)

**6. Frontend**: nuova tab "Sessioni attive" in `PageProfile.tsx` (Mantine
`Table`), con badge "Questo dispositivo" e pulsante Revoca disabilitato sulla
sessione corrente (self-lockout evitabile solo dal bottone "Logout"
esistente). Etichetta dispositivo (`utils/device.utils.ts`) via regex
best-effort browser/OS dallo User-Agent grezzo — nessuna nuova dipendenza di
UA-parsing: un'etichetta indicativa non giustifica una libreria dedicata.

## Alternative valutate

| Opzione | Pro | Contro | Motivo scarto |
|---|---|---|---|
| Elencare direttamente le chiavi `login:*`/`rtk:*` esistenti (proposta iniziale) | Zero nuove chiavi Redis | Non rappresenta un "dispositivo": ruota ad ogni refresh (~15min), lista rumorosa e instabile; revocare solo `login:` non impedisce un nuovo refresh col `rtk` ancora valido → falsa sicurezza | Non soddisfa il requisito reale ("revocare device") |
| Tabella Postgres `sessions` dedicata | Query/paginazione più ricche, storicizzabile | Nuova tabella + migrazione (richiede approvazione schema, CLAUDE.md "Ask first"), ridondante con "Redis è l'unica session store" già stabilito in ADR-2/system-architecture.md | Redis già copre esattamente questo caso d'uso (dato effimero, TTL nativo) |
| `sessionId` anche nel payload JWT (claim dedicato) | `AuthInfo` conterrebbe già il `sessionId` corrente, meno letture Redis | Invalida tutti i JWT esistenti al deploy (cambio di payload), superficie di modifica più ampia (middleware, `AuthInfo`, ogni punto che consuma il token) per un guadagno marginale (una lettura Redis in più su 2 endpoint nuovi) | Costo/rischio non giustificato dal beneficio |

## Conseguenze

- **Positive**: la pagina Profilo espone finalmente visibilità e controllo
  reale sulle sessioni attive (valore di sicurezza percepita richiesto
  dall'analisi originale); il logout ora invalida davvero il refresh token
  invece di lasciarlo vivo fino a 7gg (fix di un gap preesistente, non solo
  requisito della nuova feature).
- **Negative / limitazioni note**:
  - `End Impersonation` (`AuthService.endImpersonation`) genera sempre una
    sessione nuova per il SuperAdmin invece di riprendere quella con cui aveva
    avviato l'impersonificazione (che resta valida e tracciata a parte, senza
    duplicarsi). Un SuperAdmin che impersona spesso vedrà accumulare voci
    extra nella propria lista sessioni, autorisolventesi in 7gg o revocabili
    manualmente (nessun impatto di sicurezza: sono sessioni proprie legittime,
    solo un'imprecisione cosmetica). Propagare il `sessionId` originale
    attraverso il ciclo impersonate → end-impersonation richiederebbe
    veicolarlo nel claim JWT di impersonificazione — cambio ritenuto fuori
    scope per questa iterazione, da rivalutare se diventa un fastidio concreto.
  - Nessuna paginazione su `GET auth/sessions` (si assume un numero di
    dispositivi per utente ridotto, tipicamente singola cifra) — da
    rivalutare se in futuro emergesse un caso d'uso con molte sessioni
    parallele per utente.
- **Manutenzione**: nessuna nuova dipendenza npm, nessuna migrazione DB da
  mantenere; il namespace Redis aggiuntivo (`session:`, `user-sessions:`) è
  documentato in `docs/system-architecture.md` insieme agli altri.

## Proposta di aggiornamento `docs/business-rules.md` (in attesa di approvazione)

`business-rules.md` è territorio umano (CLAUDE.md, "Ask first" su modifiche a
`docs/`) — non modificato direttamente. Testo proposto, da inserire come nuovo
punto elenco nella sezione "Pagina Profilo Utente" (dopo "Gestione MFA"):

> - Sessioni attive (`GET auth/sessions` / `DELETE auth/sessions/:sessionId`):
>   elenco dei dispositivi con accesso attivo (ultimo accesso, IP, user-agent),
>   con possibilità di revocare singolarmente un dispositivo diverso da quello
>   corrente. La sessione corrente non è auto-revocabile da qui (si usa
>   "Logout"). Nessun tracking durante l'impersonificazione (nessun refresh
>   token generato in quel flusso, già tracciata a parte in audit log).

## Conformità

- `app/backend/src/redis/redis.service.ts`: metodi `sadd`/`smembers`/`srem`/`expire`.
- `app/backend/src/auth/auth.service.ts`: `generateAuthTokens`/`upsertSession`
  (tracking), `getActiveSessions`/`revokeSession`/`destroySession`, `logout` esteso.
- `app/backend/src/auth/auth.controller.ts`: `GET/DELETE auth/sessions`.
- `app/frontend/src/pages/profile/PageProfile.tsx`: tab "Sessioni attive".
- `app/frontend/src/utils/device.utils.ts`: etichetta dispositivo da User-Agent.
- Test: `app/backend/test/unit/auth/auth.service.spec.ts` (`logout`,
  `getActiveSessions`, `revokeSession`) e
  `app/backend/test/e2e/auth.e2e-spec.ts` (`GET/DELETE /auth/sessions`,
  incluso caso IDOR → 404).
- Verifica manuale end-to-end (stack reale Postgres + Redis, log completo
  disponibile su richiesta): login da due "dispositivi" (User-Agent diversi),
  `GET auth/sessions` mostra entrambi con `current` corretto, `DELETE` di uno
  dei due invalida immediatamente sia l'access token (`401 SESSION_EXPIRED`)
  sia il refresh (`401` su `auth/refresh`); un secondo utente che prova a
  revocare una sessione altrui riceve `404`; il logout rimuove la sessione
  dalla lista (nessuna voce fantasma).
- Bruno: `bruno/auth/Get Sessions.yml`, `bruno/auth/Revoke Session.yml`.
- `docs/openapi.yaml` e `app/frontend/src/types/api.types.ts` rigenerati
  (`openapi:export` + `openapi:types`).
