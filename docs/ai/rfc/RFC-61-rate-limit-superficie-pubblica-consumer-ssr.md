# RFC-61 — Rate limit della superficie pubblica con consumer SSR a IP unico

## Status
[ ] In discussione · [ ] Approvato → genera ADR-61 · [ ] Rifiutato

> **Numerazione**: il primo numero libero della serie RFC sarebbe 60, ma la serie ADR ha già
> `ADR-60-form-builder-defaultvalue-messaggi-custom.md` (approvata) e il template lega
> `RFC-[N] → ADR-[N]`. Come in ADR-53 § Numerazione, la decisione prende il primo numero
> libero **su entrambe le serie**: 61.

## Proposto da
AI Orchestrator · Data: 2026-09-11

> Redatta su richiesta esplicita dell'umano (2026-09-11): deroga puntuale al divieto di
> scrittura in `docs/` (`CLAUDE.md` § Documentation Policy) valida per questo solo file e
> esaurita col task. Nessun codice applicativo scritto o modificato.

---

## Problema

### Fatti verificati nel codice

1. **`app/backend/src/app.module.ts:106-116`** — `ThrottlerModule.forRoot` dichiara due
   throttler nominati: `auth` (20/60s) e `public` (300/60s). Il commento alle righe 109-113
   dichiara esso stesso che 300/60s è «un default ragionevole … non un valore derivato da un
   documento approvato», in attesa di `SPEC-F03-superficie-pubblica.md`.
2. **La spec attesa è arrivata e non ha chiuso la questione.**
   `docs/ai/specs/SPEC-F03-superficie-pubblica.md` è stata riscritta il 2026-09-04 su ADR-53 e
   **non contiene alcun valore di rate limit** (verificato per grep su `rate`, `throttl`,
   `limit`, `300`). Il rimando nel commento è quindi oggi *stale*: il valore resta senza base
   documentale e senza un documento in arrivo che gliela dia.
3. **Nessuno storage condiviso per il throttler.** `forRoot` non riceve `storage`: i contatori
   vivono in memoria di processo. Con N repliche del backend il limite effettivo è N × 300 e
   non deterministico (dipende dal bilanciamento). Il numero configurato non è il numero
   applicato.
4. **Il tracker è l'IP di socket.** `ThrottlerGuard.getTracker` restituisce `req.ip`
   (`node_modules/@nestjs/throttler/dist/throttler.guard.js:141-143`). In
   `app/backend/src/main.ts` **non esiste** alcun `app.set('trust proxy', …)` — verificato per
   grep su `trust proxy` / `trustProxy` su tutto `app/backend/src`. Senza `trust proxy`,
   Express ignora `X-Forwarded-For` e `req.ip` è l'indirizzo del peer TCP.
5. **Il client SSR non inoltra l'IP del visitatore.**
   `app/public-site/src/public-api-client.ts` chiama `fetch` senza alcun header di
   propagazione dell'origine. Il backend vede un unico peer: il processo `public-site`.
6. **Il client SSR non ha cache propria.** Nessuna struttura di memoizzazione nel file: ogni
   visita raggiunge il backend.

### Correzione alla premessa: il secchio non è uno solo

La premessa del task descrive «un secchio condiviso» per l'intera superficie pubblica. Il
codice dice altro, ed è un dettaglio che cambia i numeri.
`ThrottlerGuard.generateKey` (stesso file, righe 148-151) costruisce la chiave come
`sha256("<Classe>-<Handler>-<nomeThrottler>-<tracker>")`: **il secchio è per singolo route
handler**, non per superficie. Ogni handler annotato `@Throttle({ public: { limit: 300 } })`
ha i propri 300/60s.

Questo **non attenua** il problema: lo sposta sull'handler con il fattore di amplificazione più
alto, e lo rende più difficile da diagnosticare, perché i diversi endpoint pubblici si
esauriscono in momenti diversi.

### Il fattore di amplificazione

`app/public-site/src/entry-server.tsx:55-79` (`buildLayoutContext`) mostra che **una singola
visita** costa al backend:

| Chiamata | Handler | Origine |
|---|---|---|
| `GET public/pages?path=` | `PublicPagesController.getPage` | `server.ts` |
| `GET public/settings/theme` | `PublicPagesController` (tema) | `buildLayoutContext` |
| `GET public/global-sections/active` | `PublicGlobalSectionsController.getActive` | `buildLayoutContext` |
| `GET public/pages/by-guid/:guid` × **G** | `PublicPagesController.getByGuid` | `resolvePageGuidsToPaths` |

dove **G** = numero di `pageGuid` distinti referenziati dai blocchi `navMenuItem` della Pagina
**più** quelli di header e footer (ADR-52). Costo totale: **3 + G richieste per pageview**.

Con un singolo IP collassato e una sola istanza di backend, i tetti reali per l'**intero sito**
sono quindi:

| Handler | Tetto in pageview/minuto |
|---|---|
| `getPage`, tema, `global-sections` | 300 |
| `getByGuid` | **300 / G** |

Un menu di navigazione ordinario — 6 voci in header, 8 in footer — dà G = 14 e un tetto di
**~21 pageview al minuto per tutto il sito pubblico**: circa 0,35 richieste al secondo. Non è
un limite di abuso, è un tetto di traffico legittimo sotto il valore atteso da qualunque sito
aziendale in orario lavorativo.

### La degradazione è silenziosa, ed è la parte peggiore

I client di `public-api-client.ts` sono «tolleranti ai guasti per costruzione»: nessuno
distingue un `429` da un `404` o da un errore di rete. Superato il tetto, il sito **non
risponde 429**. Risponde `200` con pagine progressivamente mutilate:

- `fetchPagePathByGuid` → `null` → **voci di menu senza `href`** (navigazione rotta, `200 OK`);
- `fetchThemeConfig` → `null` → pagina **senza tema**;
- `fetchActiveGlobalSections` → `NO_GLOBAL_SECTIONS` → pagina **senza header e footer**;
- `resolvePublicPage` → `kind: 'error'` → `server.ts` risponde **`500`**.

Un monitoraggio che guarda gli status code del sito pubblico vede `200` mentre la navigazione
è già rotta per tutti. La tolleranza ai guasti, corretta per l'indisponibilità del backend, qui
maschera un rifiuto deliberato del backend stesso.

### La conseguenza di sicurezza

L'amplificazione 3 + G è a favore dell'attaccante. Un singolo client che emette **~21
richieste al minuto** verso `public-site:55000` — sotto qualunque soglia di allarme, dal
browser, senza strumenti — esaurisce il secchio `getByGuid` condiviso e degrada la navigazione
**per ogni altro visitatore**. Il costo dell'attacco è 1/G del costo del danno.

Questo è esattamente ciò che `CLAUDE.md` § Security intende impedire pretendendo per il
pubblico un «rate limit proprio»: il controllo oggi esiste, è configurato, è applicato, e non
protegge nulla — perché misura un server invece di un visitatore.

### Un secondo difetto, stessa radice

`docker-compose.prod.yml` dichiara TLS/dominio/reverse proxy «intenzionalmente fuori scope: da
mettere davanti nell'ambiente di hosting». Il giorno in cui quel proxy esiste, **senza
`trust proxy` anche gli endpoint raggiunti direttamente dal browser collassano su un IP unico**:

- `public-forms.controller.ts:53` — `@Throttle({ public: { limit: 10, ttl: 60_000 } })`,
  l'anti-spam per IP degli Invii (RFC-46 D6.3), diventa **10 invii al minuto per tutto il
  sito**;
- `public-media/public-media.controller.ts:32` — 300/60s diventa il tetto media dell'intero
  sito.

Non è il problema posto dal task, ma è la stessa causa e va registrato qui perché la soluzione
scelta non lo peggiori.

### Il vincolo temporale che decide la scelta

**ADR-53 è approvata** (2026-09-04) e supera ADR-22/23/24: il traffico pubblico anonimo deve
servire **file statici su storage edge**, e `app/public-site` è ridotto a «motore di sola
anteprima». `PLAN-F03` § Audit strategico riga 46 dichiara già, nero su bianco, che il renderer
continua a chiamare `api/v1/public/*` a runtime e che «l'air-gap è oggi solo una proprietà
auspicata … non sanabile da codice applicativo — è configurazione di rete (T6)».

Il percorso che questa RFC deve proteggere è quindi **dichiaratamente transitorio**. Ogni
soluzione va pesata anche sul costo che lascia a terra quando F03/T5-T6 lo dismettono.

---

## Obiettivi

1. Il tetto di traffico del sito pubblico non deve essere fissato da un numero senza base
   documentale.
2. Un singolo visitatore non deve poter degradare il sito per gli altri.
3. Un rifiuto per rate limit non deve mai presentarsi come una pagina `200` mutilata.
4. Nessuna infrastruttura durevole costruita su un percorso che ADR-53 ha già dichiarato
   transitorio.
5. Nessuna regressione del significato del limite per gli endpoint che il **browser** raggiunge
   davvero (Form, media).

---

## Soluzione proposta

### D1 — Il limite per visitatore si misura dove il visitatore si connette: sul server SSR

`app/public-site/src/server.ts` è l'unico processo di questo sistema che vede l'IP reale del
visitatore pubblico. Il rate limit «proprio» preteso da `CLAUDE.md` § Security va lì: un
contatore per IP sul server SSR, applicato prima di `handleRequest`, che risponde `429` con
`Retry-After` e un documento di errore servito da `renderErrorDocument` (già esistente).

Il perimetro è ammesso: `app/public-site` può usare `node:http` e la logica di richiesta
(ADR-22 § 5, emendamento firmato il 2026-08-17); non introduce database, ORM, code,
autenticazione né sessioni. Il contatore è in memoria di processo, come già lo è quello del
backend, e non aspira a essere distribuito.

Conseguenza diretta: l'amplificazione 3 + G smette di essere a favore dell'attaccante, perché
il limite è applicato **prima** che la singola visita si moltiplichi in 3 + G chiamate.

### D2 — Il backend smette di trattare il consumer SSR come un visitatore anonimo

Il client SSR non è pubblico anonimo: è **un singolo consumer server-to-server noto**.
Riconoscerlo per quello che è, con un segreto condiviso — pattern già in uso nel progetto:
`ANALYTICS_INGEST_SECRET` / header `X-Analytics-Secret`, `public-api-client.ts:20-28` e
`PublicSiteConfig.analyticsIngestSecret` — e assegnargli un **throttler nominato distinto**
(`ssr`) con un limite dimensionato sulla **capacità** del backend, non sull'abuso.

Il throttler `public` resta invariato e con significato pieno **dove serve davvero**: le rotte
che il browser raggiunge direttamente (`public/forms`, `public/media`).

Serve un tracker/guard dedicato che distingua la richiesta firmata da quella anonima. Il
progetto non ne ha uno: la lacuna è già dichiarata, non nuova, in
`public-forms.controller.ts:28-34` per il caso `(ip, formKey)`. Questa RFC propone di
introdurlo una volta e di renderlo riusabile per entrambi i casi.

### D3 — Il consumer SSR deve distinguere `429` da «contenuto assente»

Requisito vincolante di qualunque esito di questa RFC, indipendente da D1/D2: le funzioni di
`public-api-client.ts` devono distinguere un `429` dal `404`/errore di rete. Un `429` su
`fetchThemeConfig`, `fetchActiveGlobalSections` o `fetchPagePathByGuid` **non** deve produrre
una pagina degradata servita `200`: deve propagare un esito esplicito che `server.ts` traduce
in `503` (o `429`) con `Retry-After`.

La tolleranza ai guasti resta corretta per il backend *irraggiungibile*. Non è corretta per il
backend che *rifiuta deliberatamente*: quella non è assenza di contenuto, è saturazione, e
mascherarla impedisce di accorgersene.

### D4 — I numeri si dichiarano, non si ereditano

`300/60s` va sostituito da tre valori **firmati e motivati in questa sede**, ciascuno con la
propria unità di misura:

| Limite | Dove | Unità | Proposta di base |
|---|---|---|---|
| Per visitatore | `public-site` (D1) | pageview / IP / min | Deve stare sopra il picco di navigazione umana legittima (lettura di più pagine in sequenza) e sotto il costo di scraping |
| Capacità consumer SSR | backend, throttler `ssr` (D2) | richieste / min | 3 + G volte il tetto di pageview che l'installazione dichiara di voler sostenere |
| Pubblico diretto | backend, throttler `public` | richieste / IP / min | Invariato per Form (10/60s, RFC-46 D6.3); da riconfermare per media |

**Assunzione dichiarata (A-RFC61-1)**: non esiste in `docs/` un profilo di traffico atteso per
il sito pubblico (`non-functional-requirements.md` § Performance pubblica descrive ancora un
profilo «cache calda/fredda» che ADR-53 ha reso obsoleto — incongruenza già segnalata e **non
risolta** in `PLAN-F03` § Definition of Done). I valori numerici **non sono derivabili da
documento approvato** e non vengono inventati qui: vanno fissati dall'umano in sede di firma.
Questa RFC ne fissa il *metodo* e le *unità*, non i numeri.

**Prerequisito, non parte della soluzione**: finché non esiste storage condiviso per il
throttler (fatto 3), ogni valore configurato vale per replica. Con più repliche, il limite
dichiarato non è il limite applicato. Da chiudere prima che il backend scali oltre l'istanza
singola.

---

## Alternative valutate

### Alt. A — Inoltro dell'IP reale (`X-Forwarded-For`) con `trust proxy` e allowlist dell'origine SSR

**Scartata come soluzione primaria.** `trust proxy` trasforma `X-Forwarded-For` in una fonte
di verità: qualunque client in grado di raggiungere il backend direttamente dichiara l'IP che
preferisce e **annulla ogni rate limit del progetto**, incluso il throttler `auth` a 20/60s
(ADR-1) e l'anti-spam dei Form. È sicura solo se il backend è irraggiungibile se non
attraverso un proxy noto e se `trust proxy` è configurato sul hop/CIDR specifico — condizione
che questo repository **non può garantire**: `docker-compose.prod.yml` dichiara il reverse
proxy fuori scope e pubblica oggi `53000:3000` sull'host.

Inoltre A non riduce il volume: redistribuisce il secchio lasciando intatta l'amplificazione
3 + G. Un visitatore che apre 21 pagine continua a costare 300 richieste al backend.

**Non è però archiviabile**: la correzione `trust proxy` resta necessaria e va aperta come
**task separato** per gli endpoint browser-facing (§ «Un secondo difetto»), pena il collasso
dell'anti-spam dei Form il giorno in cui il proxy viene introdotto. Qui è un prerequisito di
igiene, non la risposta al problema posto.

### Alt. B — Rate limit proprio sul server SSR

**Adottata** come D1. Unica opzione in cui il limite misura ciò che dichiara di misurare.
Costo: introduce stato (contatori per IP) in un processo oggi stateless. Limite noto: il
server SSR eredita lo stesso problema di `trust proxy` un livello più su, il giorno in cui un
proxy viene messo davanti a `public-site` — va dichiarato nella ADR, non scoperto dopo.

### Alt. C — Cache di rendering nel `public-site`

**Scartata**, per due motivi indipendenti.

*Non è un rate limit.* Riduce l'amplificazione — tema, sezioni globali e risoluzione
`guid → path` sono identici per ogni visitatore — ma un client che colpisce N percorsi
distinti produce comunque N risoluzioni. Non soddisfa il requisito § Security.

*Contraddice una regola vincolante.* Regola 8 del modello di contenuto: «Cache pubblica
invalidata per evento, mai per TTL». Una cache TTL nel `public-site` la viola; una cache
invalidata per evento richiede un canale dal backend al processo SSR, che **ADR-53 § 4 vieta**
(air-gap, consegna solo push). Il modello di contenuto sta sopra le ADR nella gerarchia
decisionale: non è aggirabile da questa RFC.

L'amplificazione che C mitigherebbe va rimossa alla radice da ADR-53 (export statico: zero
chiamate per pageview), non ricostruita a metà strada nel consumer.

### Alt. D — Esenzione della sorgente SSR con limite separato

**Adottata** come D2, ma **non da sola**. Presa isolatamente sposta il tetto senza dare al sito
alcuna difesa per visitatore: il secchio resta condiviso, solo più capiente. È la metà backend
della soluzione; D1 è la metà che protegge.

Respinta esplicitamente la variante «esenzione» pura (SSR completamente fuori dal throttler):
un consumer senza tetto è un moltiplicatore senza freno verso PostgreSQL, ed è precisamente la
superficie DoS che ADR-53 § Contesto dichiara di voler recidere.

### Alt. E — Alzare 300 a un numero più grande

Registrata per completezza e scartata: sostituisce un numero senza base con un altro numero
senza base, lascia intatta l'amplificazione e la degradazione silenziosa, e sposta la soglia di
rottura senza cambiarne la natura.

---

## Soluzione indicata

**D1 + D2 + D3 + D4** — limite per visitatore sul server SSR, identità server-to-server
riconosciuta con throttler dedicato sul backend, `429` mai mascherato da pagina degradata,
numeri firmati con unità dichiarate.

Motivo della scelta in una riga: **il difetto è un errore di categoria, non un numero
sbagliato** — il backend misura un server e chiama il risultato «rate limit del pubblico». La
correzione ripristina la categoria (il visitatore si misura dove si connette, il consumer si
misura come capacità) invece di ritarare la misura sbagliata.

Il costo è deliberatamente contenuto perché il percorso è transitorio (ADR-53): nessuna cache,
nessuno storage distribuito, nessuna dipendenza npm nuova richiesta da D1/D2 — da confermare in
sede di plan.

---

## Impatto

- **`app/public-site/`** (frontend-developer): contatore per IP e risposta `429` in
  `server.ts`; propagazione esplicita del `429` in `public-api-client.ts` (D3); lettura del
  nuovo segreto in `config.ts`.
- **`app/backend/`** (backend-developer): terzo throttler nominato `ssr` in `app.module.ts`;
  guard/tracker che distingue il consumer firmato; `@Throttle` rivisti sui controller pubblici;
  nuova variabile in `AppConstants` + schema Joi. **Nessuna modifica di schema DB.**
- **Config di root**: nuova variabile d'ambiente in `.env.example`, `docker-compose.prod.yml`
  (backend e `public-site`).
- **`bruno/` e test** (test-engineer): copertura del `429` su superficie pubblica, del consumer
  firmato che non viene limitato dal throttler `public`, e della non-degradazione silenziosa
  (D3) — quest'ultimo è lo scenario che oggi manca del tutto.
- **`docs/openapi.yaml`**: nessun endpoint nuovo; `429` da documentare sulle risposte pubbliche.
- **Documenti**: se approvata, genera **ADR-61**. Il commento di `app.module.ts:109-113` va
  riscritto per citare la ADR invece di una spec che non contiene il valore.

---

## Rischi

1. **Il segreto SSR diventa una chiave di bypass.** Chi lo ottiene ottiene il tetto del
   consumer al posto di quello anonimo. Mitigazione: rotazione, e limite `ssr` dimensionato
   sulla capacità reale, mai «illimitato».
2. **Il contatore in memoria del `public-site` non regge più repliche.** Con due istanze SSR il
   limite per visitatore raddoppia. Accettabile finché `public-site` è istanza singola: da
   dichiarare nella ADR come vincolo di dispiegamento, non da scoprire in produzione.
3. **`429` troppo stretto = sito percepito come rotto.** Il rischio si sposta sul numero di D4:
   è il motivo per cui i valori richiedono firma e non stima automatica.
4. **Lavoro su percorso transitorio.** Se F03/T5-T6 chiudono l'air-gap prima, D2 diventa
   ridondante (nessun traffico pubblico verso il backend) mentre D1 e D3 restano utili
   all'anteprima. Mitigazione: tenere D2 minimale — un throttler nominato in più, non
   un'infrastruttura.
5. **Convivenza con `trust proxy`.** Se il task separato su `trust proxy` viene eseguito dopo,
   la configurazione deve essere rivista congiuntamente: `trust proxy` attivo cambia `req.ip`
   per **tutti** i throttler contemporaneamente, incluso `auth`.

---

## Questioni aperte che questa RFC non chiude

1. **I valori numerici** (D4, assunzione A-RFC61-1): nessuna base documentale esiste.
2. **`trust proxy` e la superficie browser-facing**: difetto reale e distinto, da aprire come
   task a sé.
3. **Storage condiviso del throttler** per il backend multi-istanza: prerequisito noto,
   fuori dal perimetro di questa RFC.
4. **`non-functional-requirements.md` § Performance pubblica**: descrive un profilo superato da
   ADR-53; la correzione richiede autorizzazione umana per quel file specifico, non inclusa
   nella richiesta che ha originato questa RFC. Segnalata, non corretta.

---

## Decisione umana
**Esito**: [ ] Approvato · [ ] Rifiutato · [ ] Modificato

**Valori da fissare in sede di firma** (D4):
- Limite per visitatore, `public-site`: _______ pageview / IP / 60s
- Limite consumer SSR, throttler `ssr`: _______ richieste / 60s
- Limite `public` su media: _______ richieste / IP / 60s (Form: confermato 10/60s?)

**Note**: ___________

**Approvato da**: ___________ · **Data**: ___________

**Azione successiva**: [ ] Genera ADR-61 · [ ] Archivio
