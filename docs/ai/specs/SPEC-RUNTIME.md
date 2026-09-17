# SPEC — Runtime Pubblico `public-runtime.js`: struttura del pacchetto, contratto dei moduli, inclusione condizionale e CSP

## Status
[x] Bozza — round R5 di `docs/PLAN-parita-elementor-pro.md` · [ ] Approvata · [ ] Superseded

## Dominio
`docs/ai/INDEX.md` § "Parità Elementor Pro — R0 Decisioni fondative" (la riga copre anche i round
che ne dipendono, R5 incluso, finché l'INDEX non viene aggiornato con una riga propria — stessa
convenzione già usata da `docs/ai/specs/SPEC-PROPKIND-V2-DETAILS.md` e
`docs/ai/specs/SPEC-GLOBAL-KIT.md` per R1).

## Relazione con gli altri documenti
Questo documento **non è una firma**: è il dettaglio implementativo di
`ADR-74-isole-js-pubbliche.md` (decisione già approvata a livello di principio: un solo bundle,
budget ≤ 30 KB gzip, inclusione condizionale via `meta.runtime`, CSP con nonce per pagina, zero
chiamate di rete salvo due eccezioni chiuse), scritto per rendere eseguibile
`docs/PLAN-parita-elementor-pro.md` § R5 (T1–T5). Nessuna decisione di `ADR-74` viene riaperta qui:
questo documento ne fissa la struttura di codice, l'API di ciascun modulo e l'algoritmo di
rilevazione/iniezione nel worker `static-export`, allo stesso livello di dettaglio con cui
`SPEC-GLOBAL-KIT.md` ha fissato lo schema concreto già deciso in linea di principio da `ADR-77`.

Il modulo `popup` (§ 4.8) ha il proprio contratto runtime riassunto qui e dettagliato per intero in
`docs/ai/specs/SPEC-POPUP.md` — questo documento non duplica il protocollo di frequenza/trigger,
solo l'interfaccia DOM/JS che lo rende eseguibile lato client.

## ADR applicabili
- `ADR-74-isole-js-pubbliche.md` — bundle unico, budget, inclusione condizionale, CSP/nonce,
  `prefers-reduced-motion`, le due eccezioni di rete chiuse, "il bundle è codice del CMS, non
  contenuto utente" (nessuna prop di alcun `kind` inietta codice eseguito da questo bundle).
- `ADR-53-air-gapped-ssg-zero-db.md` — il worker `static-export` (coda BullMQ `static-export`) resta
  l'unico punto in cui il contenuto attraversa il confine gestione→pubblico; questo documento
  aggiunge uno stadio a quel worker, non ne cambia il principio.
- `ADR-76-breakpoints-configurabili.md` — `resolveActiveBreakpoints()` è la stessa funzione già in
  uso dal validatore, riusata qui per `sticky.onBreakpoints`/`motion.onBreakpoints` a runtime.
- `ADR-77-global-kit-schema.md` / `docs/ai/specs/SPEC-GLOBAL-KIT.md` § 1 `LightboxSettings` — il
  modulo `lightbox` (§ 4.2) legge la configurazione di sito già compilata in `global-kit.css` come
  custom property, mai una seconda fonte.
- `ADR-78-sanitizzazione-css-e-sandbox-html.md` — nessun modulo di questo bundle esegue mai una
  stringa proveniente da `kind: 'css'`/`kind: 'html'`: quei due `kind` restano l'unica superficie di
  contenuto utente semi-libero, indipendente da questo runtime.
- `ADR-80-provider-media-e-mappe.md` — le eccezioni di rete già approvate per tile OSM e per il
  click-to-load video (§ 7 sotto le riprende in un'unica tabella consolidata, non le ridecide).
- `docs/SPEC-propkind-v2.md` § 3.10/§ 3.11 (`animation`, `motion`) — i moduli `observer` (§ 4.1) e
  `motion` (§ 4.7) sono i consumer runtime di questi due `kind`, già approvati a livello di schema.
- `ADR-82-container-unificato-grid-flex.md` § "Decisione" punto 1 — `link`/`animation`/`motion` su
  `container` erano stati accettati dallo schema "senza renderer" in attesa di R5: questo documento
  chiude quel debito dichiarato per `animation`/`motion` (non per `link`, che non richiede JS).

---

## 1. Struttura del pacchetto `app/public-runtime/`

```
app/public-runtime/
├── package.json          # nessuna dipendenza runtime (dependencies: {}); devDependencies: vite, typescript, vitest
├── vite.config.ts         # build.lib, formats: ['es'], nessun UMD/CJS (il bundle è sempre <script type="module">)
├── tsconfig.json          # target ES2022, "types": [] (nessun lib DOM di terze parti oltre lib.dom.d.ts)
├── src/
│   ├── index.ts           # entry point unico: importa e registra gli N moduli, legge data-runtime-modules
│   ├── shared/
│   │   ├── reduced-motion.ts   # matchMedia('(prefers-reduced-motion: reduce)'), letto una sola volta (ADR-74 § 5)
│   │   ├── dom.ts              # querySelectorAll helper tipizzati, nessuna dipendenza
│   │   └── raf-throttle.ts     # throttle a un frame per gli scroll/mouse listener condivisi (motion)
│   ├── observer/index.ts
│   ├── lightbox/index.ts
│   ├── carousel/index.ts
│   ├── countdown/index.ts
│   ├── toc/index.ts
│   ├── formSteps/index.ts
│   ├── motion/index.ts
│   ├── popup/index.ts
│   ├── search/index.ts
│   └── loopPagination/index.ts
└── test/                   # vitest + jsdom, un file per modulo
```

`vite.config.ts` compila in modalità libreria (`build.lib.entry: 'src/index.ts'`), output
`dist/public-runtime.<hash>.js` (fingerprint sul contenuto, stesso meccanismo di cache-busting già
in uso per il CSS critico esterno di `ADR-53` § 3). Nessun secondo entry point per sotto-insieme di
moduli (`ADR-74` § 3: "nessun secondo bundle per sottoinsieme"): l'unico artefatto pubblicabile è
questo file.

### 1.1 Regola di composizione dell'entry point

`index.ts` non importa condizionalmente: importa staticamente i 10 moduli (`side-effect free import`,
`ADR-74` § 1) e li registra in una tabella `{ [name: string]: () => void }`. All'esecuzione, legge
`document.currentScript?.dataset.runtimeModules` (impostato dal worker di export, § 5), lo divide
per spazio, e invoca **solo** le funzioni di init dei moduli elencati. Un modulo non elencato non
esegue mai il proprio `init()` — resta `import`-ato (il suo codice è comunque nel bundle, `ADR-74` §
3) ma inerte: nessun `querySelectorAll`, nessun listener registrato, costo a runtime pressoché nullo
oltre al parsing JS già pagato dal solo scaricamento del file.

```ts
// src/index.ts (struttura, non implementazione integrale)
import { init as initObserver } from './observer';
import { init as initLightbox } from './lightbox';
// … gli altri 8

const MODULES: Record<string, () => void> = {
  observer: initObserver,
  lightbox: initLightbox,
  carousel: initCarousel,
  countdown: initCountdown,
  toc: initToc,
  formSteps: initFormSteps,
  motion: initMotion,
  popup: initPopup,
  search: initSearch,
  loopPagination: initLoopPagination,
};

const requested = (document.currentScript as HTMLScriptElement | null)
  ?.dataset.runtimeModules?.split(' ')
  .filter(Boolean) ?? [];

for (const name of requested) {
  MODULES[name]?.();
}
```

### 1.2 Isolamento degli errori

Ogni chiamata `MODULES[name]?.()` è avvolta in un `try/catch` non rilanciante che logga in
`console.error` senza interrompere il ciclo: un modulo che lancia un'eccezione all'inizializzazione
(es. un attributo `data-*` malformato per un valore scritto prima che una regressione del validator
server-side venga corretta) non deve impedire agli altri N-1 moduli della stessa pagina di
funzionare. Questo è un contratto del **loader** (`index.ts`), non di ciascun modulo: un singolo
modulo non deve implementare il proprio `try/catch` di primo livello, per evitare N pattern diversi
di gestione errore.

---

## 2. Budget di peso

Il gate resta unico e totale (`ADR-74` § 2: "non è un obiettivo, è un gate... ≤ 30 KB gzip per
l'intero bundle"), misurato in CI sull'artefatto finale con tutti i 10 moduli inclusi (caso
peggiore, indipendentemente da quanti `data-runtime-modules` una singola pagina ne richieda). La
tabella sotto è un **budget di progettazione indicativo per modulo**, usato per allocare la
complessità in fase di scrittura — non è un sotto-gate CI separato, per lo stesso motivo per cui
`ADR-74` non ne introduce uno: un modulo che sfora la propria riga ma resta sotto il totale non fa
fallire nulla, ma segnala in review che un altro modulo deve essere alleggerito per restare sotto
30 KB complessivi.

| Modulo | Budget indicativo (gzip) | Nota |
|---|---|---|
| `shared/*` (reduced-motion, dom, raf-throttle) | 0,5 KB | Comune a più moduli, contato una volta |
| `observer` | 3 KB | `IntersectionObserver` singolo, toggle classe + tween numerico per `counter` (§ 4.1) |
| `lightbox` | 5 KB | Overlay, focus trap, navigazione gruppo, zoom |
| `carousel` | 5 KB | Autoplay, touch/swipe (Pointer Events), arrows/dots, riuso per `testimonialCarousel`/`mediaCarousel`/`animatedHeadline` (§ ADR-86) |
| `countdown` | 2 KB | Calcolo differenza date, formattazione, persistenza evergreen |
| `toc` | 1,5 KB | Solo scroll-spy (l'indice è statico, generato a export — `ADR-85` § 4.17) |
| `formSteps` | 4 KB | Navigazione step, `Constraint Validation API` nativa, condizionali, submit |
| `motion` | 4 KB | Scroll/mouse effects con `raf-throttle` condiviso |
| `popup` | 3 KB | Apertura/chiusura, valutazione trigger, frequenza `localStorage` (`SPEC-POPUP.md` § 3) |
| `search` | 2 KB | Fetch indice statico, match per sottostringa, debounce |
| `loopPagination` | 1,5 KB | Fetch pagina successiva, estrazione frammento, sentinel `IntersectionObserver` per `infinite` |
| **Totale progettato** | **≈ 31,5 KB** | Sopra il gate nominale: il 5% di margine è deliberatamente negativo per forzare la minificazione/tree-shaking reale in CI a essere la prova, non la somma sulla carta — il numero vincolante resta l'artefatto compilato, non questa tabella |

---

## 3. Contratto comune ai moduli

1. **Attivazione solo su `data-*` presente** (`ADR-74` § 1): nessun modulo cerca classi CSS
   generiche (`.carousel`) — sempre un attributo `data-<modulo>` o `data-<modulo>-*` come selettore
   di init, mai un nome di classe che una prop utente (`cssClass`, `SPEC-propkind-v2.md` § 4.2)
   potrebbe accidentalmente riusare.
2. **Nessun effetto collaterale all'`import`**: un modulo non registrato in `data-runtime-modules`
   non tocca il DOM, non registra listener, non alloca timer.
3. **`prefers-reduced-motion` è letto una sola volta** da `shared/reduced-motion.ts`, esportato come
   valore booleano già risolto — `observer` e `motion` lo leggono per non applicare alcuna
   trasformazione (`ADR-74` § 5); gli altri 8 moduli non lo leggono (nessuno di essi è "motion" nel
   senso di quella clausola).
4. **Idempotenza dell'init**: ogni modulo verifica un marcatore (`data-<modulo>-initialized`, o un
   `WeakSet` di elementi già osservati) prima di agganciarsi due volte allo stesso nodo — utile se
   `index.ts` fosse in futuro invocato più di una volta sullo stesso documento (non previsto oggi,
   ma un contratto difensivo a costo quasi nullo).
5. **Nessuna dipendenza fra moduli**: `carousel` non importa `lightbox` anche se un caso d'uso reale
   li combina (una gallery a carousel con lightbox sulle slide) — la combinazione avviene a livello
   di markup (due attributi `data-*` sullo stesso sotto-albero, letti da due moduli indipendenti),
   mai a livello di codice JS che importa un altro modulo del bundle.
6. **Localizzazione**: nessuna stringa visibile hardcoded in inglese nei moduli che producono testo
   (es. label "Chiudi" del lightbox/popup, "Avanti/Indietro" del carousel/formSteps) — ogni stringa è
   letta da un attributo `data-i18n-*` emesso dal worker di export nella lingua della pagina, mai
   una costante nel bundle (coerente con la gestione multilingua già esistente nel CMS, fuori scope
   di dettaglio qui).

---

## 4. Registro dei moduli

### 4.1 `observer` — entrance animation + counter

Consumer di `kind: 'animation'` (`SPEC-propkind-v2.md` § 3.10) e del widget `counter`
(`ADR-86-registro-widget-pro-interattivi.md` § 3.1 — nessun undicesimo modulo introdotto per
`counter`, riuso deliberato dello stesso `IntersectionObserver`).

| Attributo | Presente su | Significato |
|---|---|---|
| `data-animate="<preset>"` | nodo con `animation.entrance` valorizzata | Nome preset (allowlist ~40, `SPEC-propkind-v2.md` § 3.10) — corrisponde a una classe CSS `cms-anim-<preset>` già emessa nel CSS critico |
| `data-animate-duration="slow\|normal\|fast"` | idem | Mappata a una custom property `--cms-anim-duration` nel CSS critico, letta solo da CSS |
| `data-animate-delay="<ms>"` | idem | Applicato come `transition-delay`/`animation-delay` via CSS, il modulo lo usa solo per non far scattare l'animazione due volte troppo ravvicinate su elementi impilati (debounce visivo, non temporizzazione dell'effetto) |
| `data-counter-end="<n>"` | widget `counter` | Valore finale del conteggio |
| `data-counter-start="<n>"` (default 0) | idem | Valore iniziale |
| `data-counter-duration="<ms>"` (default 2000) | idem | Durata del tween |
| `data-counter-separator="<char>"` (default nessuno) | idem | Separatore delle migliaia applicato a ogni frame renderizzato |
| `data-counter-prefix` / `data-counter-suffix` | idem | Testo statico prima/dopo il numero, già presente nel markup: il modulo aggiorna solo il nodo di testo del numero, mai l'intero `innerHTML` |

**Algoritmo**: un solo `IntersectionObserver` (soglia 0.2, `rootMargin: '0px 0px -10% 0px'`) osserva
ogni nodo con `data-animate` **o** `data-counter-end`. Al primo ingresso in viewport:
- se `prefers-reduced-motion: reduce` (§ 3 punto 3): per `data-animate`, applica immediatamente la
  classe di stato finale senza transizione; per `data-counter-end`, scrive direttamente il valore
  finale senza tween (un conteggio è comunque un'informazione, non un puro effetto — mostrarlo
  istantaneamente rispetta comunque "il contenuto resta visibile e statico" di `ADR-74` § 5);
- altrimenti, per `data-animate`: aggiunge la classe `cms-anim-in` (la keyframe/transition è nel CSS
  critico, non nel JS: il modulo non anima nulla direttamente, orchestral solo lo stato);
- per `data-counter-end`: avvia un tween `requestAnimationFrame` con easing `ease-out` fisso (nessun
  easing configurabile — un solo comportamento, coerente con "un solo uso sensato" già applicato a
  `radius`/`border` in `SPEC-PROPKIND-V2-DETAILS.md` § 5).
- in entrambi i casi, l'elemento viene **disosservato** dopo il trigger (l'ingresso è un evento
  singolo, mai ripetuto se l'utente scrolla su e giù — comportamento Elementor identico).

### 4.2 `lightbox`

| Attributo | Presente su | Significato |
|---|---|---|
| `data-lightbox="<group-id>"` | `<a href="<mediaRef risolto>">` che avvolge `image`/`gallery`/`video` (poster) | Raggruppa più trigger nella stessa galleria di navigazione (frecce prev/next dentro l'overlay) |
| `data-lightbox-type="image\|video"` | idem | Determina se l'overlay monta un `<img>` o un `<iframe>`/`<video>` (per video hosted, riusa l'elemento nativo; per YouTube/Vimeo, apre l'iframe con dominio no-cookie/dnt, `ADR-80` § 4, **solo** al click, mai precaricato) |
| `data-lightbox-caption` | opzionale | Testo mostrato se `LightboxSettings.showTitle`/`showDescription` sono `true` (§ 4.2.1) |

#### 4.2.1 Configurazione di sito

`LightboxSettings` (`SPEC-GLOBAL-KIT.md` § 1: `enabled, bgColor, uiColor, showTitle,
showDescription, zoom, share`) è compilata da `global-kit.css` in custom property
(`--gk-lightbox-bg`, `--gk-lightbox-ui`, coerente con `SPEC-GLOBAL-KIT.md` § 3) lette dal CSS
dell'overlay, **mai** da JavaScript: il modulo legge solo i tre booleani (`showTitle`,
`showDescription`, `zoom`, `share`) da un attributo `data-lightbox-settings` emesso una sola volta
sul `<body>` dal worker di export (`data-lightbox-settings="title,description,zoom"`, elenco chiuso
separato da virgola — stessa forma compatta già usata per `data-runtime-modules`), non da una
seconda fetch. Se `LightboxSettings.enabled === false`, il worker non emette **nessun**
`data-lightbox` su alcun nodo (link diretto al media a piena risoluzione, comportamento
degradazione elegante) e il modulo, se comunque incluso da un altro blocco della stessa pagina, non
trova nulla da osservare.

**Comportamento**: al click su un trigger, crea un `<div role="dialog" aria-modal="true">` in coda a
`<body>`, sposta il focus al primo elemento interattivo dell'overlay (pulsante Chiudi), intrappola
`Tab`/`Shift+Tab` dentro l'overlay, `Escape` chiude e **restituisce il focus** al trigger originale
(requisito di accessibilità non negoziabile, stesso principio già richiesto per il modale esistente
del CMS). Frecce sinistra/destra navigano il gruppo (`data-lightbox` uguale); swipe touch
(Pointer Events, nessuna libreria) equivalente su mobile. `share` (se abilitato) mostra pulsanti
`<a href>` statici (Web Share API se disponibile, altrimenti link diretti — mai un popup
`window.open` script-driven, stesso principio già scelto per `shareButtons`, `ADR-85` § 4.12).

### 4.3 `carousel`

Consumer del widget `carousel` esistente e, da R6, di `testimonialCarousel`, `mediaCarousel` e della
variante "rotate" di `animatedHeadline` (`ADR-86-registro-widget-pro-interattivi.md` § 3.3/3.4/3.5 —
stesso modulo, tre superfici di markup diverse, nessuna logica duplicata).

| Attributo | Significato |
|---|---|
| `data-carousel` (sul contenitore) | Attiva il modulo su questo nodo |
| `data-carousel-slides-to-show="<n>"` | Colonne visibili simultaneamente (responsive via CSS `@media`, il modulo legge solo il valore per il breakpoint corrente al resize, throttled) |
| `data-carousel-autoplay="<ms>"` (assente = nessun autoplay) | Intervallo di avanzamento automatico |
| `data-carousel-loop` (booleano, presenza = true) | Torna al primo slide dopo l'ultimo |
| `data-carousel-arrows` / `data-carousel-dots` (booleani) | Mostra/nasconde i controlli — se assenti, il modulo non monta i pulsanti (l'HTML dei controlli è comunque nel markup statico per SEO/no-JS fallback: **senza** JS, tutte le slide restano visibili impilate in colonna, degradazione elegante coerente con "il contenuto resta visibile" già richiesto per `observer`) |
| `data-carousel-mode="slide\|fade\|text"` | `slide` (orizzontale, default), `fade` (crossfade, usato da `mediaCarousel`/`testimonialCarousel` su richiesta stile), `text` (nessun controllo, solo autoplay a intervallo fisso, usato da `animatedHeadline` "rotate" — stesso algoritmo di avanzamento indice, sola differenza nella transizione CSS applicata) |
| `data-carousel-pause-on-hover` (booleano) | Ferma l'autoplay al passaggio del mouse, lo riprende all'uscita |

**Algoritmo**: mantiene un indice `current` per istanza (una `WeakMap<Element, State>`, nessuna
variabile globale condivisa fra più caroselli sulla stessa pagina). Avanzamento = rimuove la classe
di stato attivo dallo slide corrente, la aggiunge al successivo (modulo il numero di figli), aggiorna
`aria-hidden`/`tabindex` per l'accessibilità degli slide non visibili (mai `display:none` sullo slide
corrente per mantenere le transizioni CSS fluide). Touch: `pointerdown`/`pointermove`/`pointerup`
calcolano uno scarto orizzontale minimo (soglia 40 px) per decidere avanti/indietro, mai una libreria
di gesture. `prefers-reduced-motion` **non** disattiva l'autoplay (il carousel non è "motion" nel
senso di `ADR-74` § 5 — è un contenuto che cambia, non un effetto di scroll/mouse): la transizione fra
slide passa da CSS `transition` a `opacity`/nessuna transizione visibile, ma l'avanzamento logico
resta identico, coerente con la distinzione già fatta da `ADR-74` § 5 fra i due soli moduli
realmente "motion" (`observer`, `motion`) e gli altri otto.

### 4.4 `countdown`

| Attributo | Significato |
|---|---|
| `data-countdown-type="fixed\|evergreen"` | Corrisponde a `countdown.type` (`SPEC-propkind-v2.md` § 4.3) |
| `data-countdown-due="<ISO8601 UTC>"` | Solo `fixed`: data/ora assoluta di scadenza |
| `data-countdown-duration-hours` / `-minutes` | Solo `evergreen`: durata relativa dal primo ingresso del visitatore |
| `data-countdown-onexpire="hide\|redirect\|message"` | Comportamento a scadenza |
| `data-countdown-redirect-url` | Solo con `onexpire="redirect"` |
| `data-countdown-id` | Identificatore stabile del nodo (`blockId`), usato come chiave `localStorage` per l'evergreen |

**Evergreen**: al primo rendering per un dato `data-countdown-id` non ancora presente in
`localStorage` (chiave `cms_countdown_<blockId>`), il modulo calcola `now + duration` e lo persiste
come timestamp assoluto; ogni visita successiva dello stesso visitatore (stesso browser) legge quel
timestamp già fissato, mai una nuova scadenza — questo è il comportamento "evergreen" standard
(scadenza personale per visitatore, non globale), non una nuova invenzione di questo documento:
replica lo stesso meccanismo già descritto per la frequenza dei popup (`SPEC-POPUP.md` § 3), stesso
principio "stato lato client, mai lato server" per una feature puramente cosmetica che non deve
attraversare l'air-gap (`ADR-74` § 6). **Fixed**: nessun `localStorage`, il calcolo è sempre
`due − now`, identico per ogni visitatore.

**Tick**: un solo `setInterval(1000)` per istanza, cancellato allo scadere. A `0`: se `hide`,
applica `display:none` al contenitore (o a un nodo fratello dichiarato "messaggio di scadenza" se
presente — presentazione, non validazione, come già per altri `kind` compositi); se `redirect`,
`window.location.href = url` dopo un breve ritardo cosmetico (500 ms, per permettere di leggere il
messaggio "0" prima del redirect); se `message`, sostituisce il contenuto interno con il testo già
presente in un nodo `data-countdown-expired-message` nel markup (mai testo iniettato via
`innerHTML` da una stringa non sanitizzata: il messaggio è già nel DOM, il modulo si limita a
mostrarlo togliendo `hidden`).

### 4.5 `toc` — scroll-spy

L'indice stesso (i link `<a href="#h-<n>">`) è generato interamente dal worker di export
(`ADR-85` § 4.17): questo modulo **aggiunge solo** l'evidenziazione della voce attiva durante lo
scroll, il miglioramento esplicitamente rinviato a R5 da quella stessa ADR.

| Attributo | Significato |
|---|---|
| `data-toc` (sul contenitore dell'indice) | Attiva il modulo |
| `data-toc-target="<id heading>"` su ciascun `<a>` | Collega il link al proprio heading (stesso `id` già presente nell'`href`, ridondante ma esplicito per evitare un parsing di stringa sull'`href`) |

**Algoritmo**: un `IntersectionObserver` con `rootMargin: '-20% 0px -70% 0px'` (fascia centrale dello
schermo) osserva tutti gli heading referenziati; l'heading più in alto attualmente intersecante
determina quale `<a>` riceve la classe `cms-toc-active` (rimossa da tutti gli altri). Nessun calcolo
di scroll position manuale (`getBoundingClientRect` in un listener di scroll) — `IntersectionObserver`
evita il costo di layout thrashing, stesso principio già scelto per `observer`.

### 4.6 `formSteps`

Consumer dell'estensione multi-step del widget `form` esistente
(`ADR-86-registro-widget-pro-interattivi.md` § 4).

| Attributo | Significato |
|---|---|
| `data-form-steps` (sul form) | Attiva il modulo |
| `data-form-step="<n>"` (0-based, su ciascun fieldset/step) | Indice dello step |
| `data-form-step-next` / `data-form-step-prev` (sui pulsanti) | Naviga avanti/indietro |
| `data-form-condition='{"field":"<name>","op":"eq\|neq\|contains","value":"<v>"}'` | Su un campo/step: visibilità condizionale (§ ADR-86 § 4.2 per lo schema completo) |
| `data-captcha="recaptcha\|hcaptcha"` | Presenza di un campo captcha (§ 7, eccezione di rete esplicita) |

**Navigazione**: "Avanti" invoca `HTMLFormElement.reportValidity()` limitato ai campi dello step
corrente (selezionati per `[data-form-step="n"] :invalid`) usando la **Constraint Validation API
nativa** (`required`, `pattern`, `type=email`, già presenti negli attributi HTML emessi dal worker di
export per ogni `form-field` — nessuna libreria di validazione, zero dipendenze): se non valido, il
browser mostra il proprio messaggio nativo e il modulo non avanza. Se valido, nasconde lo step
corrente (`hidden` attribute, mai `display:none` per non rompere `:invalid`/focus management),
mostra il successivo, sposta il focus al primo campo, aggiorna una progress bar se presente
(`data-form-progress`, calcolata come `currentStep / totalSteps`).

**Condizionali**: a ogni `input`/`change` su un campo referenziato da un `data-form-condition`
altrove nel form, il modulo rivaluta l'espressione (un solo operatore per condizione, nessuna
combinazione AND/OR in questo round — coerente con l'ambito "campo singolo" dichiarato da
`ELEMENTOR_PRO_GAP_ANALYSIS_v2.md` § 1.2 "campi condizionali", non un motore di regole generico) e
applica `hidden`/rimuove `hidden` sul nodo target; un campo nascosto perde temporaneamente
`required` (salvato in un `data-form-was-required` per essere ripristinato se il campo torna
visibile) per non bloccare `reportValidity()` su un campo che l'utente non vede.

**Submit**: il form invia a un endpoint pubblico di submission **già esistente** per il modulo di
contatto (`ADR-74` § 6, prima eccezione di rete) — nessuna nuova rotta introdotta da questo
documento. Le azioni post-invio (email già esistente, redirect, webhook) sono elaborazione
**server-side** dopo la ricezione, fuori dallo scope di questo runtime client (dettagliate in
`ADR-86-registro-widget-pro-interattivi.md` § 4.3).

### 4.7 `motion`

Consumer di `kind: 'motion'` (`SPEC-propkind-v2.md` § 3.11).

| Attributo | Significato |
|---|---|
| `data-motion='{"scroll":{...},"mouse":{...}}'` | JSON compatto, stessa forma del `MotionValue` validato server-side — mai una stringa eseguita, un solo `JSON.parse` per nodo all'init |

**Scroll effects**: un solo listener di scroll condiviso fra tutte le istanze
(`shared/raf-throttle.ts`, un frame al massimo per evento), che per ciascun nodo osservato calcola la
posizione relativa a `viewportFrom`/`viewportTo` (percentuali di avanzamento nel proprio ciclo di
vita nel viewport) e applica `verticalTranslate`/`horizontalTranslate`/`opacity`/`blur`/`rotate`/
`scale` come custom property CSS (`--cms-motion-y`, `--cms-motion-opacity`, …) lette da una
`transform`/`filter` già dichiarata nel CSS critico — il modulo non scrive mai `element.style.transform`
direttamente: scrive solo le custom property, la trasformazione composita resta dichiarativa in CSS,
stesso principio "il JS orchestral lo stato, il CSS applica l'effetto" già usato da `observer`.

**Mouse effects**: `track` (parallasse: offset proporzionale alla posizione del puntatore rispetto al
centro del contenitore) e `tilt` (rotazione 3D `rotateX/rotateY` proporzionale), stesso meccanismo di
custom property. Un solo `pointermove` condiviso sul `document`, filtrato per gli elementi
effettivamente osservati (nessun listener per-elemento).

**`onBreakpoints`**: al resize (throttled), il modulo verifica se il breakpoint attivo corrente
(risolto contro `resolveActiveBreakpoints()`, `ADR-76`) è incluso nell'array dichiarato; se no, rimuove
ogni custom property applicata (l'elemento torna alla propria posizione/stile di base) e non
ricalcola per quel nodo finché il breakpoint non rientra.

**`prefers-reduced-motion`**: l'intero modulo non registra alcun listener se `reduce` è vero
(`ADR-74` § 5) — non un "meno movimento", **zero** movimento, en tutto coerente con la lettura più
restrittiva già scelta da `ADR-74` per questo stesso modulo.

### 4.8 `popup`

Contratto DOM/JS riassunto qui; protocollo di trigger/condizioni/frequenza completo in
`docs/ai/specs/SPEC-POPUP.md`.

| Attributo | Significato |
|---|---|
| `data-popup="<guid>"` (sul contenitore, iniettato a fine `<body>`, `hidden` di default) | Identifica il popup |
| `data-popup-config='{"trigger":{...},"frequency":{...}}'` | Configurazione risolta a export (SPEC-POPUP.md § 2) |
| `data-popup-close` (sul pulsante di chiusura) | Chiude e registra l'evento in `localStorage` |

**API esposta**: nessuna funzione globale `window.CmsPopup` in questo round (nessun requisito che la
chieda: "anteprima trigger nel builder", `PLAN` § R6, è risolta lato editor con un meccanismo
separato di forzatura in modalità anteprima, non un'API pubblica runtime). Apertura/chiusura restano
interne al modulo, innescate solo dalla valutazione dei trigger propri.

### 4.9 `search`

| Attributo | Significato |
|---|---|
| `data-search` (sul form/input) | Attiva il modulo |
| `data-search-index="/search-index.<hash>.json"` | URL dell'indice statico (seconda eccezione di rete, `ADR-74` § 6) |
| `data-search-results` (sul contenitore dei risultati) | Dove iniettare i risultati |

**Indice**: generato dal worker `static-export` a ogni build (§ 5 sotto — stesso stadio che genera
il bundle e il nonce), un array `{ title, excerpt, url }[]` per pagina pubblicata (le collezioni,
`ADR-79`, non esistono ancora in R5/R6: l'indice copre solo Pagine fino a quando R7 lo estenderà —
stesso schema di rinvio già usato da `ADR-85` per `video`/`map`, nessuna migrazione richiesta quando
R7 arriverà, si aggiungono voci allo stesso array). **Fetch**: al primo `focus` dell'input (non al
caricamento pagina — un visitatore che non usa la ricerca non scarica mai l'indice, coerente con
"zero chiamate di rete" per il caso comune), cacheato in memoria di modulo per la sessione di
navigazione. **Match**: sottostringa case-insensitive su `title`/`excerpt` (nessun motore fuzzy,
nessuna libreria — coerente con "zero deps"), con un debounce di 200 ms sull'`input`.

### 4.10 `loopPagination`

Modulo scaffolded da R5, **inerte fino a R7** (Loop Builder, `PLAN` § R7 T3): nessun `BlockDefinition`
di R5/R6 dichiara `meta.runtime: ['loopPagination']`, coerente con il grafo di dipendenza del PLAN
("R7 dopo R5"). Documentato qui per completezza del contratto del bundle (`ADR-74` § 1 lo nomina fra
i dieci moduli fin da R0) e perché il suo costo (§ 2) è già contato nel budget totale.

| Attributo | Significato |
|---|---|
| `data-loop-pagination="loadMore\|infinite"` | Modalità |
| `data-loop-next-url="/collezione/pagina/2/"` | URL della pagina statica successiva pre-generata (`SPEC-propkind-v2.md` § 3.18) |
| `data-loop-items` (sul contenitore degli item) | Dove appendere gli item recuperati |

**Algoritmo**: `fetch` della pagina successiva (terza eccezione di rete, ma verso una risorsa
**statica pubblica dello stesso sito**, non un endpoint applicativo — coerente con "pagine statiche
pre-generate" del PLAN), parsing con `DOMParser`, estrazione del contenuto di
`[data-loop-items]` da quel documento, append al contenitore corrente, aggiornamento di
`data-loop-next-url` dal valore dichiarato nella pagina appena recuperata (o rimozione
dell'attributo/pulsante se quella pagina non ne dichiara uno, cioè è l'ultima). `infinite` usa un
elemento sentinella con `IntersectionObserver` (soglia 0) invece di un pulsante "Carica altro"
click-driven — stesso algoritmo di fetch, diverso innesco.

---

## 5. `meta.runtime` e rilevazione nel worker di export

### 5.1 Campo di registro

```ts
// app/backend/src/blocks/types/*.block.ts — estensione del contratto BlockDefinition
interface BlockDefinition {
  // … campi esistenti (type, v, props, children, minRole, enabled, …)
  meta?: {
    runtime?: RuntimeModuleName[]; // sottoinsieme chiuso dei 10 nomi del bundle
  };
}

type RuntimeModuleName =
  | 'observer' | 'lightbox' | 'carousel' | 'countdown' | 'toc'
  | 'formSteps' | 'motion' | 'popup' | 'search' | 'loopPagination';
```

`meta.runtime` è **statico per tipo di blocco**, non condizionato dal valore delle prop di
un'istanza specifica (un `countdown` dichiara sempre `['countdown']`, indipendentemente da
`type: 'fixed'|'evergreen'`) — eccezione dichiarata: `animation`/`motion` sono prop **opzionali**
del mixin Avanzato (`ADR-85` § 1) presenti su *ogni* widget/container, quindi il contributo di
`observer`/`motion` a `meta.runtime` è **per istanza**, non per tipo (§ 5.2 punto 2).

### 5.2 Algoritmo di rilevazione (worker `static-export`)

1. Per ogni nodo dell'albero pubblicato, unire `meta.runtime` **statico** del proprio
   `BlockDefinition` (es. `countdown` → sempre `['countdown']`, `carousel`/`testimonialCarousel`/
   `mediaCarousel` → sempre `['carousel']`, `popup` → sempre `['popup']`).
2. Aggiungere `'observer'` se la prop `animation` (mixin Avanzato) del nodo ha
   `entrance` valorizzato; aggiungere `'counter'`… **non applicabile**: `counter` non è un modulo a
   sé (§ 4.1), il widget `counter` dichiara `meta.runtime: ['observer']` staticamente come qualunque
   altro tipo — l'unica eccezione "per istanza" reale è `animation`/`motion` sul mixin Avanzato
   condiviso da ogni widget, non un caso per-widget dedicato.
3. Aggiungere `'motion'` se la prop `motion` (mixin Avanzato) del nodo ha almeno uno fra `scroll`/
   `mouse` valorizzato.
4. **Unione su tutto l'albero della pagina**, non per nodo: il risultato finale è l'insieme di tutti
   i nomi raccolti da ogni nodo, deduplicato — un solo `data-runtime-modules` per pagina.
5. Se l'insieme è vuoto: **nessun** tag `<script>` nel file prodotto (`ADR-74` § 3, invariato) — la
   pagina resta byte-per-byte nel regime "markup terminale" di `ADR-53`.
6. Se non vuoto: iniettare
   ```html
   <script type="module" src="/assets/public-runtime.<hash>.js" defer
           nonce="<nonce-pagina>"
           data-runtime-modules="observer motion popup"></script>
   ```
   con `<hash>` il fingerprint di contenuto del bundle (stabile fra build che non toccano
   `app/public-runtime/`, coerente con la cache lunga già in uso per gli altri asset statici) e
   `<nonce-pagina>` generato una volta per build di quella specifica pagina (§ 6).

### 5.3 Non regressione

Un test snapshot sull'output del job di export asserisce che nessun file `.html` prodotto da una
pagina il cui albero non contiene alcun nodo con `meta.runtime` (statico o per-istanza) contenga la
sottostringa `<script`, in nessuna forma — stesso principio già richiesto da `ADR-74` § "Conformità".

---

## 6. CSP e nonce

1. **Nonce per pagina, generato dal worker a ogni build** (`crypto.randomBytes(16).toString('base64')`
   o equivalente, mai riusato fra pagine della stessa esecuzione né fra build successive — `ADR-74`
   § 4, "non un nonce di sito fisso").
2. **Doppia iniezione**: header `Content-Security-Policy: script-src 'self' 'nonce-<v>'` quando l'edge
   lo supporta (`ADR-53` § 4, "header/meta"), **e** `<meta http-equiv="Content-Security-Policy"
   content="script-src 'self' 'nonce-<v>'">` nel `<head>` come fallback per edge che non permettono
   header custom per file statici (es. un semplice bucket S3 senza funzione edge) — le due forme
   portano lo **stesso** valore di nonce, generato una sola volta per pagina e riusato in entrambe le
   iniezioni, mai due nonce diversi che romperebbero l'uno o l'altro canale.
3. **Estensione per pagine con reCAPTCHA/hCaptcha** (§ 7, quarta eccezione): quando l'albero
   contiene un `form` con `data-captcha`, la policy di **quella pagina soltanto** aggiunge l'host
   allowlisted allo `script-src` (`https://www.google.com/recaptcha/ https://www.gstatic.com/recaptcha/`
   per reCAPTCHA, `https://js.hcaptcha.com` per hCaptcha) — mai una policy di sito globale rilassata
   per tutte le pagine, coerente con "il numero minimo di eccezioni necessarie", stesso principio già
   applicato da `ADR-80` per il solo dominio dei tile OSM.
4. **Nessun `unsafe-inline`/`unsafe-eval`** in nessun caso (invariato da `ADR-74` § 4): lo script del
   captcha esterno è comunque caricato con `<script src="..." nonce="<stesso-nonce-pagina>">` quando
   il provider lo consente (reCAPTCHA/hCaptcha supportano `nonce` sul proprio `<script>` di
   caricamento); se una versione futura del provider lo impedisse, l'eccezione andrebbe rivalutata
   con una nota qui, non con un rilassamento silenzioso della policy.

---

## 7. Eccezioni di rete — tabella consolidata

`ADR-74` § 6 ne dichiara due, chiuse; `ADR-80` ne aggiunge una terza per i tile; questo documento
aggiunge una quarta (captcha, già implicita nel requisito "reCAPTCHA/hCaptcha" del gap analysis ma
mai resa esplicita come eccezione di rete prima d'ora) e riafferma che `loopPagination` (§ 4.10)
**non** è un'eccezione nuova: la pagina statica che recupera è una risorsa dello stesso sito, non di
terze parti.

| # | Origine | Verso | Modulo | ADR che la introduce |
|---|---|---|---|---|
| 1 | `formSteps` | Endpoint pubblico di submission esistente (stesso host) | `formSteps` | `ADR-74` § 6 |
| 2 | `search` | `search-index.<hash>.json` (stesso host, statico) | `search` | `ADR-74` § 6 |
| 3 | `map` (widget, non un modulo di questo bundle) | `tile.openstreetmap.org` (tile raster) | — (embed/Leaflet, R6 se implementato) | `ADR-80` § 2 |
| 4 | `formSteps` con `data-captcha` | `www.google.com/recaptcha`, `www.gstatic.com/recaptcha` **o** `js.hcaptcha.com` | `formSteps` | Questo documento, § 6 punto 3 |

Ogni eccezione futura richiede una riga aggiunta a questa tabella **e** un caso dedicato in
`check-air-gap.js` (§ 8) — non un'estensione implicita della policy.

---

## 8. Estensione `check-air-gap.js`

1. Un proxy di test intercetta ogni richiesta uscente dalla pagina caricata in un browser headless e
   la confronta contro la tabella § 7: qualunque host non presente fa fallire il test.
2. Per ogni pagina campione con **tutti** i 10 moduli attivi contemporaneamente (caso peggiore reale,
   stesso principio già richiesto da `ADR-74` § "Conformità" per il budget di peso), la suite
   verifica che le uniche richieste oltre al documento stesso e ai propri asset (`public-runtime.js`,
   CSS, media) siano quelle enumerate.
3. Un nuovo caso dedicato verifica che una pagina con `data-captcha` presente carichi lo script del
   provider **solo** con l'host corrispondente al valore dichiarato (`recaptcha` non deve mai
   risultare in una richiesta verso `hcaptcha.com` e viceversa).
4. Un caso dedicato per `lightbox`/`carousel` con video YouTube/Vimeo verifica che **nessuna**
   richiesta verso quei domini avvenga prima del click esplicito sul trigger (coerente con
   "click-to-load", `ADR-80` § 6).

---

## Criteri di verifica

- L'artefatto compilato `dist/public-runtime.*.js` con tutti e 10 i moduli inclusi misura ≤ 30 KB
  gzip in CI (gate bloccante, `ADR-74` § 2).
- Nessun modulo esegue codice al di fuori del proprio `init()` invocato dal loader; un test unit per
  modulo verifica che l'`import` da solo (senza invocare `init`) non produca alcuna mutazione del DOM
  né alcun listener registrato (`jsdom`, conteggio di `addEventListener` prima/dopo l'import).
- Test combinatorio del loader: un documento con `data-runtime-modules="countdown popup"` inizializza
  **solo** quei due moduli — verificato contando le chiamate effettive alle rispettive funzioni
  `init` con degli spy, gli altri 8 non vengono mai invocati.
- Un modulo che lancia un'eccezione nel proprio `init()` (simulata in test) non impedisce
  l'inizializzazione degli altri moduli richiesti sulla stessa pagina (§ 1.2).
- `observer`/`motion` non applicano alcuna trasformazione con `prefers-reduced-motion: reduce`
  emulato in Playwright (stesso criterio già in `ADR-74` § "Conformità", esteso qui a `counter`: il
  valore finale è scritto immediatamente, senza tween).
- Nessun file `.html` prodotto da una pagina senza `meta.runtime` attivo (statico o per-istanza)
  contiene la sottostringa `<script` (test snapshot sull'output del job di export, § 5.3).
- Due pagine qualunque della stessa build portano nonce diversi; lo stesso nonce compare
  identico nell'header e nel `<meta>` fallback della stessa pagina (test di integrazione sul worker).
- `check-air-gap.js` esteso (§ 8) è verde su una pagina campione con tutti i 10 moduli attivi e sui 4
  casi dedicati della tabella § 7.
- Lighthouse CI su una pagina demo con tutti i moduli attivi: `TBT < 50 ms` (gate ereditato da
  `PLAN` § R5 T5, non ridecise qui).
