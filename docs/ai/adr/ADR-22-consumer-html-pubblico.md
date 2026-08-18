# ADR-22 — Consumer HTML pubblico

## Status
[ ] In discussione · [x] **Approvata** · [ ] Rifiutata · [ ] Superseded da ADR-XXX

## Data approvazione
2026-08-17 — approvata da: ccurti

---

## Decisione

1. **SSR a richiesta, in un'app Node dedicata, senza framework.** `app/public-site` riceve
   una richiesta HTTP, chiama `api/v1/public/`, restituisce HTML. Server: `node:http`.
   Rendering: `react-dom/server`. Build: Vite in modalità `--ssr` — già devDependency di
   `app/frontend`, gestisce TSX e CSS Modules, che `tsc` da solo non gestisce.
   **Nessun pacchetto nuovo entra nel lockfile** (Node 20 delle immagini ha `fetch` globale).

2. **`renderToStaticMarkup`, non `renderToString`: il sito pubblico non ha JavaScript.**
   F03 non idrata nulla, quindi i marcatori di idratazione sarebbero byte morti. Ne segue un
   fatto che va scritto perché non è intuitivo: **gli Error Boundary non girano in SSR** —
   nessun renderer server-side invoca `componentDidCatch`. Il boundary per blocco di F02/T8
   protegge l'admin e **non** la pagina pubblica, dove un blocco che solleva porta via
   l'intera risposta. È accettabile solo perché un albero non servibile è già respinto a
   monte (ADR-21 § 3.7, ADR-24 § 3): un'eccezione in rendering è un bug e deve dare `500`,
   mai una pagina mutilata.

3. **Un solo componente per blocco, mai due copie.** I componenti restano in
   `app/frontend/src/components/blocks/`; `app/public-site` li consuma con un alias di build
   (Vite `resolve.alias` + `paths` di `tsconfig`). Nessun pacchetto condiviso, nessun symlink
   in `node_modules`, quindi nessuna trappola runtime Docker (PLAN-F01 § A.7): l'alias è
   risolto a build time e i componenti finiscono bundlati nell'output SSR. La duplicazione
   prevista da PLAN-F01 § B.3 **non si paga**, perché il vincolo di isolamento è stato
   rispettato davvero: gli unici import fuori dalla cartella sono `react` e il tipo generato
   `types/blocks.types`.

4. **Il workspace condiviso non si crea.** PLAN-F01 § B.3 fissava la riapertura al terzo
   consumer: è arrivato, ma ciò che il terzo consumer chiede è il **codice**, e un alias lo
   condivide a costo zero — il **contratto** è già condiviso dalla pipeline generata
   (`blocks:export` → `blocks:types`). Un pacchetto vero si valuta quando esisterà un
   consumer che l'alias non raggiunge: un secondo repository, o un pacchetto pubblicato.

5. **Proprietà: `app/public-site` è del frontend-developer**, con estensione esplicita del
   perimetro in `CLAUDE.md` § Ruoli — emendamento che richiede firma umana. Il confine è
   verificabile: dentro sono ammessi `node:http`, `fetch`, `react-dom/server` e i componenti;
   sono vietati database, ORM, code, autenticazione, sessioni. Il "mai server-side" di quel
   ruolo vieta il codice **applicativo**, e qui non ce n'è.

6. **L'app è stateless e non ha cache propria.** L'unica cache del contenuto pubblico è
   quella dell'API (ADR-23). Due cache significherebbero due percorsi di invalidazione e un
   canale di eventi dall'API al renderer. Se un giorno servirà cachare l'HTML, il posto è un
   reverse proxy davanti, invalidato dallo stesso evento.

7. **Invariante bloccante ereditato da ADR-21 (`docs/TODO.md` voce 1.9): ogni renderer escapa
   `plainText`.** Qui l'invariante è mantenuta per costruzione — `plainText` è interpolato
   come figlio JSX o valore di attributo, e React escapa entrambi; l'unico
   `dangerouslySetInnerHTML` sta in `RichText`, su HTML già sanitizzato server-side. "Per
   costruzione" però non è una verifica: l'invariante è verificata da un test che renderizza
   `<script>`, `"` e `&` in `heading.text`, `button.label` e `image.alt` e asserisce
   sull'**HTML prodotto**, non sul componente, più un controllo che
   `dangerouslySetInnerHTML` compaia esattamente una volta nella cartella. Entrambi sono gate
   di CI.

## Alternative scartate

- **Next.js / Remix** — un framework, il suo routing e la sua cadenza di aggiornamento per un problema che è "JSON in, HTML out".
- **SSG a build time** — la pubblicazione diventerebbe un trigger di build: incompatibile con l'NFR "invalidazione entro 5 secondi", e duplicherebbe l'invalidazione che ADR-23 costruisce comunque. La cache di ADR-23 dà già il profilo di servizio di SSG senza pipeline di build.
- **Prerender con browser headless** — Chromium in produzione per renderizzare la SPA admin: la dipendenza più pesante possibile, e nessun riuso dei componenti isolati di T8.
- **Rendering dentro NestJS** — viola il divieto assoluto "rendering HTML nell'API" e lega la disponibilità del sito a quella dell'API.
- **Componenti duplicati nei due consumer** — l'invariante di escaping avrebbe due implementazioni e un solo test; la deriva fra le due è uno XSS stored.
- **Workspace condiviso `app/blocks-ui`** — cinque file di infrastruttura e la trappola del symlink Docker per ottenere ciò che un alias di build dà gratis.
- **`renderToString`** — marcatori di idratazione senza idratazione.

## Conseguenza

Esiste un terzo processo da distribuire, monitorare e mettere in CI: Dockerfile, job di
lint/test/build, health check. `app/frontend` acquisisce un vincolo che prima era una
convenzione di review: la regola di isolamento di `components/blocks/` diventa una dipendenza
di build di un altro workspace, e violarla rompe la build del sito pubblico invece di passare
inosservata. Il sito pubblico non ha JavaScript: ogni interattività futura (form di F10,
chatbot di F11) è un'isola da introdurre con la sua decisione, non un'aggiunta naturale. E gli
Error Boundary per blocco proteggono solo l'admin — sul pubblico l'unica difesa è il rifiuto a
monte dell'albero non servibile.
