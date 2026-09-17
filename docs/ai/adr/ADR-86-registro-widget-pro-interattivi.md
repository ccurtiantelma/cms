# ADR-86 — Registro dei Widget Pro interattivi: riuso dei moduli runtime, nuova dipendenza Lottie, estensione multi-step del Form

## Status
[x] **In discussione** · [ ] Approvato · [ ] Rifiutato · [ ] Superseded da ADR-XXX

## Data approvazione
_In attesa di firma umana — vedi "Decisione umana" in fondo a questo documento._

## RFC di riferimento
Nessuna RFC dedicata nuova: round **R6 — Widget Pro dinamici + Popup** di
`docs/PLAN-parita-elementor-pro.md` § R6. Riferimenti sostanziali:
`docs/ELEMENTOR_PRO_GAP_ANALYSIS_v2.md` § 1.3 (riga "Pro"), `docs/SPEC-propkind-v2.md` § 4.3,
`docs/ai/adr/ADR-85-registro-widget-base-css-only.md` (stesso pattern di registro, round precedente).

## Numerazione
Vedi `ADR-85-registro-widget-base-css-only.md` § "Numerazione": round R6, primo numero libero dopo
ADR-85. `docs/PLAN-parita-elementor-pro.md` § "Riepilogo" assegnava a R6 il numero 85 ("popup") nella
numerazione originale pre-cascata; quella riga è superata su due fronti — la cascata di
rinumerazione (`ADR-74` § "Numerazione") ha già spostato "85" al registro dei widget base di R4, e
il Popup Builder di questo round non richiede una propria ADR (`docs/ai/specs/SPEC-POPUP.md` §
"Perché una SPEC e non una nuova ADR" ne spiega il motivo: le decisioni di principio erano già
chiuse da `ADR-74`/`ADR-83`/`SPEC-propkind-v2.md`). Questa ADR occupa quindi **86**, la prima
decisione di R6 che introduce davvero un principio nuovo — la sola in questo round che lo richiede.

## ADR di riferimento (non superate, non modificate)
- `ADR-74-isole-js-pubbliche.md` § "Decisione" punto 1 — l'elenco dei dieci moduli del bundle
  `public-runtime.js` è **chiuso**: questa ADR non lo riapre, decide invece **come mappare** ogni
  widget di questo registro su uno dei dieci moduli esistenti (§ "Decisione" punto 1), e tratta
  l'unico caso che non ci sta in quella chiusura (`lottie`, § "Decisione" punto 4) esattamente come
  `ADR-74` § "Decisione" punto 2 aveva previsto: *"se un modulo futuro... non ci sta nel budget
  condiviso, la sua libreria di supporto non entra in questo bundle — resta un caso R6 a sé, con la
  propria ADR se necessaria"*. Questa **è** quella ADR.
- `docs/ai/specs/SPEC-RUNTIME.md` — fissa il contratto DOM/JS di ciascun modulo riusato qui
  (`observer`, `carousel`, `countdown`, `search`, `formSteps`); questa ADR non ne ridichiara
  l'algoritmo, solo il mapping widget→modulo e le prop di ciascun widget.
- `ADR-85-registro-widget-base-css-only.md` — stesso pattern "Contenuto/Stile/Avanzato",
  `ADVANCED_MIXIN_PROPS`, pattern di composizione a `children` per sotto-elementi ripetibili;
  questa ADR **applica** lo stesso pattern al registro Pro, non ne introduce uno diverso.
  `EnumPropSpec.multiple` (introdotto da `ADR-85` § "Decisione" punto 2) è riusato identico.
  `ADR-85` § 4.20 ("`video` chiude solo il dettaglio R4… l'iniezione in-pagina dell'iframe al click
  resta un miglioramento progressivo disponibile solo a partire da R5/R6") è **chiuso da questa ADR**
  (§ "Decisione" punto 6): non introduce un widget nuovo, aggiorna il renderer del widget `video`
  esistente per usare il modulo `observer`-adiacente già previsto da `ADR-80` § "Conseguenze".
- `ADR-80-provider-media-e-mappe.md` § "Conseguenze" — aveva lasciato esplicitamente aperta "la
  decisione di merge/separazione" del secondo modulo per il click-to-load video; questa ADR la
  chiude (§ "Decisione" punto 6): nessun modulo separato, il comportamento si aggancia a `observer`.
- `ADR-83-tabella-templates-e-api-libreria.md` — `insertSubtreeAction` resta il punto unico di
  rigenerazione `id`; nessun widget di questo registro introduce una quarta implementazione.
- `docs/business-rules.md` § Blocchi / `docs/glossary.md` — nessuna soglia di ruolo esistente viene
  toccata da questa ADR (§ "Decisione" punto 8: tutti i widget di questo registro restano
  `minRole: User`, salvo dove indicato).

---

## Contesto

`docs/PLAN-parita-elementor-pro.md` § R6 elenca undici capacità Pro da registrare:
`counter, countdown, testimonialCarousel, mediaCarousel, animatedHeadline, hotspot, lottie, search,
nav-menu completo (dropdown/hamburger/mega), form multi-step con condizionali/azioni/reCAPTCHA-
hCaptcha`. `docs/ELEMENTOR_PRO_GAP_ANALYSIS_v2.md` § 1.3 riga "Pro" le classifica come "richiedono
**JS pubblico**" nel loro insieme, ma `ADR-74` ha già chiuso l'elenco dei moduli disponibili a dieci
nomi fissi, nessuno dei quali si chiama `counter`, `nav-menu` o `lottie`. Prima che i singoli
`BlockDefinition` di questo registro possano essere scritti, occorre decidere, widget per widget,
**quale meccanismo runtime già esistente lo implementa** — e, per l'unico widget che non può essere
implementato da nessuno dei dieci moduli esistenti né da CSS puro (`lottie`, un formato di animazione
vettoriale che richiede un interprete, non un semplice orchestratore di classi CSS), se introdurre
un'eccezione al bundle condiviso e a quali condizioni.

Un secondo problema, distinto ma dello stesso round: il widget `form` esistente
(`ELEMENTOR_PRO_GAP_ANALYSIS_v2.md` riga 17, già dotato di invii ed email) non ha oggi né step
multipli, né campi condizionali, né azioni post-invio oltre l'email, né captcha. Questa ADR ne fissa
l'estensione (§ "Decisione" punto 5), perché introduce due rischi di sicurezza reali (SSRF sul
webhook, script di terze parti per il captcha) che meritano una decisione esplicita, non
un'aggiunta silenziosa di prop.

---

## Decisione

### 1. Mapping widget → modulo runtime (nessun undicesimo modulo)

| Widget | Modulo (`SPEC-RUNTIME.md`) | Motivo del riuso |
|---|---|---|
| `counter` | `observer` (§ 3.1 sotto) | Stesso `IntersectionObserver` di singolo trigger già usato per le entrance animation: un conteggio che parte "quando l'elemento entra nel viewport" è lo stesso evento, non un secondo osservatore |
| `countdown` | `countdown` | Nome già identico, nessuna estensione richiesta oltre a quanto già in `SPEC-RUNTIME.md` § 4.4 |
| `testimonialCarousel` | `carousel` | Composizione a `children` di tipo `testimonial` (già esistente, `ADR-85` § 4.10) dentro un wrapper che monta lo stesso modulo `carousel` — nessuna logica di scorrimento duplicata |
| `mediaCarousel` | `carousel` | Composizione a `children` di tipo `image`/`video` (già esistenti) — stesso modulo, secondo `children.allow` |
| `animatedHeadline` (stile `rotate`) | `carousel` (`data-carousel-mode="text"`, `SPEC-RUNTIME.md` § 4.3) | L'algoritmo "avanza indice ogni N ms, applica classe attiva" è identico a un carousel in sola modalità autoplay senza controlli: nessun modulo dedicato per una variante di comportamento già coperta |
| `animatedHeadline` (stile `highlight`) | Nessuno (CSS puro) | Un'evidenziazione statica (colore/sottolineatura) non richiede alcun cambiamento di stato nel tempo |
| `hotspot` | Nessuno (CSS + `popover` nativo, § "Decisione" punto 3) | Vedi motivazione dedicata sotto |
| `lottie` | Chunk indipendente, **fuori** dal bundle condiviso (§ "Decisione" punto 4) | Non riducibile a nessuno dei dieci moduli: richiede un interprete del formato, non un orchestratore di classi |
| `search` | `search` | Nome già identico, nessuna estensione richiesta oltre `SPEC-RUNTIME.md` § 4.9 |
| `nav-menu` completo | Nessuno (CSS puro, § "Decisione" punto 2) | Vedi motivazione dedicata sotto |
| `form` multi-step | `formSteps` | Nome già identico, `SPEC-RUNTIME.md` § 4.6 |

Questo mapping è la decisione centrale di questa ADR: **nessun widget di R6 introduce un modulo
nuovo nel bundle pubblico**, coerente con il vincolo chiuso di `ADR-74` § 1. Ogni comportamento
apparentemente nuovo si riconduce a uno dei dieci nomi già approvati, salvo l'unico caso (`lottie`)
per cui questa stessa ADR introduce l'eccezione prevista esplicitamente da `ADR-74` § "Decisione"
punto 2.

### 2. `nav-menu` completo — CSS puro, nessun modulo runtime

Il widget `nav-menu` esistente (`ELEMENTOR_PRO_GAP_ANALYSIS_v2.md` riga 17) guadagna, come
estensione additiva (nessun bump di `v`, coerente con `SPEC-propkind-v2.md` § 1 principio 5: "nessun
bump di `v` per i blocchi che aggiungono solo prop opzionali"), le prop mancanti indicate dal gap
analysis (§ 1.2: "layout, hamburger breakpoint, indicator, stile item normal/hover/active, submenu
stile") **senza** introdurre alcun `meta.runtime`:

1. **Dropdown desktop**: `:hover`/`:focus-within` sul singolo `nav-menu-item` che ha figli
   (submenu), stesso principio già usato da `flipBox`/`cta` (`ADR-85` § 4.15/4.14) per gli effetti
   hover CSS-only. Un submenu è quindi sempre **presente nel markup** (mai iniettato a runtime),
   nascosto con `visibility:hidden; opacity:0` di default e reso visibile dalla combinazione
   `:hover`/`:focus-within` — accessibile da tastiera per costruzione (`:focus-within` si attiva
   quando un discendente riceve il focus, non solo il trigger diretto).
2. **Hamburger mobile**: pattern "checkbox hack" (`<input type="checkbox" id="nav-<blockId>"
   class="cms-nav-toggle" hidden>` + `<label for="nav-<blockId>">` come pulsante hamburger + CSS
   `:checked ~ .cms-nav-panel { ... }`), tecnica CSS-only consolidata, zero JavaScript. Nessuna
   libreria, nessun listener: lo stato aperto/chiuso vive nell'attributo nativo `checked` del
   checkbox, sopravvive a un resize senza alcun ricalcolo.
3. **Mega-menu**: stesso meccanismo del punto 1 (`:hover`/`:focus-within`) applicato a un pannello
   più ampio (`grid`/`flex` interno con più colonne, `container` v2 riusato come contenuto del
   pannello, `ADR-82`) — nessuna differenza architetturale rispetto al dropdown semplice, solo la
   larghezza e il layout interno del pannello.
4. **Indicator**: un elemento decorativo CSS (`::after` con `border`/icona `chevron` da `kind: 'icon'`
   già esistente) che ruota via `transform` su `:hover`/`:checked` — nessuna logica.
5. **Stile item normal/hover/active**: già coperto dal modificatore `stateful` esistente
   (`ADR-75`), nessuna estensione di `kind` richiesta — solo nuove prop `Stile` sul
   `nav-menu-item` esistente (`color: colorRef (stateful)`, `background: colorRef (stateful)`,
   `activeIndicator: enum('none'|'underline'|'background'|'border')`).

Questa decisione chiude, per `nav-menu`, lo stesso spazio di scelta che `ADR-85` aveva già percorso
per `flipBox`/`tableOfContents`/`cta`: un comportamento "dinamico" percepito che non richiede
alcuna esecuzione di script, ottenibile con le stesse tecniche CSS-only già validate in questo
progetto per widget di categoria diversa.

### 3. `hotspot` — CSS + Popover API nativa, nessun modulo runtime

**Contenuto** (nuovo widget, pattern a composizione `children` come `iconList`/`socialIcons`,
`ADR-85` § "Decisione" punto 3): `image: mediaRef`; children `hotspotItem` (`children.allow:
['hotspotItem']`, nessun limite di cardinalità — un'immagine può avere N punti). `hotspotItem`
Contenuto: `position: { x: number(0–100), y: number(0–100) }` (percentuale sull'immagine, non
pixel — resta corretto a qualunque dimensione responsive dell'immagine), `icon: icon`, `title:
plainText`, `description?: richText`, `link?: link`, `trigger: enum('hover'|'click')`.
**Stile** (`hotspot`): `dotColor: colorRef`, `dotSize: unitValue (px, 8–60)`, `pulse: boolean`
(animazione `@keyframes` di pulsazione, puramente decorativa e CSS-only — disattivata sotto
`prefers-reduced-motion` **via CSS** con `@media (prefers-reduced-motion: reduce) { animation: none
}`, senza bisogno del modulo `observer`: questa è una `@media` CSS nativa, non una lettura
JavaScript, quindi non richiede alcun modulo del bundle pubblico per rispettare lo stesso principio
di `ADR-74` § 5). `hotspotItem` Stile: `tooltipBackground: colorRef`, `tooltipColor: colorRef`,
`tooltipWidth: unitValue (px, 100–400)`, `tooltipPosition: enum('top'|'right'|'bottom'|'left')`.

**Rendering**: ogni `hotspotItem` con `trigger: 'hover'` usa `:hover`/`:focus-within` su un
`<button>` (sempre un elemento nativamente focalizzabile, mai un `<div>` con `tabindex` sintetico) che
avvolge il punto, con il tooltip come elemento fratello mostrato dalla stessa combinazione CSS.
`trigger: 'click'` usa l'attributo HTML nativo **Popover API** (`<button popovertarget="hotspot-
tooltip-<id>">` + `<div id="hotspot-tooltip-<id>" popover>`) — una funzionalità della piattaforma
web, non una libreria, supportata dai browser moderni (Chromium/Firefox/Safari recenti) senza
richiedere JavaScript per l'apertura/chiusura di base (il browser gestisce nativamente toggle,
`light-dismiss` al click fuori, e l'evento `Esc`). Su un browser che non supporta ancora l'attributo
`popover`, il pulsante resta comunque un link/bottone funzionante che naviga al proprio `link` se
presente (degradazione elegante, mai un elemento silenziosamente inerte).

### 4. `lottie` — nuova dipendenza, chunk indipendente fuori dal budget condiviso

1. **Nuova dipendenza approvata da questa ADR**: un interprete Lottie leggero e self-hosted (non
   `lottie-web` completo, che eccede da solo il budget di `ADR-74` § 2 — una build "light" limitata
   al renderer SVG, senza supporto per espressioni After Effects, coerente col punto 3 sotto),
   introdotta ai sensi di `docs/constitution.md` § "Regola sulle nuove dipendenze del dominio CMS"
   ("ogni singola aggiunta richiede RFC → ADR → approvazione umana... valutata contro il peso sul
   bundle"): qui la valutazione contro il peso porta a **non** condividerne il bundle, non a
   scartarla.
2. **Chunk separato, non parte di `public-runtime.js`**: compilato da un secondo entry point dello
   stesso pacchetto `app/public-runtime/` (`app/public-runtime/src/lottie-player/`, build a sé,
   `dist/lottie-player.<hash>.js`), caricato con un secondo `<script type="module" src="..."
   nonce="<stesso-nonce-pagina>" defer>` **solo** sulle pagine il cui `meta.runtime` unito include
   `'lottie'` — stesso meccanismo di rilevazione di `SPEC-RUNTIME.md` § 5, esteso con un secondo
   possibile tag script per lo stesso motivo per cui `ADR-74` § 3 vieta "un secondo bundle per
   sottoinsieme" solo per i dieci moduli condivisi: qui non è un sottoinsieme dello stesso bundle, è
   un bundle diverso con un profilo di peso incompatibile, la cui condivisione forzata
   penalizzerebbe ogni pagina che non usa mai `lottie`.
3. **Nessuna valutazione di espressioni**: il player è configurato per il solo rendering
   dichiarativo del formato Lottie/Bodymovin (forme, path, keyframe, colori) — **nessun supporto per
   espressioni** (l'estensione "expression" del formato After Effects permette codice JavaScript-like
   valutato dal player originale; questa build lo disabilita per costruzione, non per
   configurazione, coerente con "il bundle è codice del CMS, non contenuto utente" di `ADR-74` §
   7 esteso qui a un secondo chunk).
4. **Sanitizzazione server-side del file `.json` caricato**: `kind: 'mediaRef'` esistente più un
   controllo dedicato in `BlockPropSanitizerService` (stesso stadio di `ADR-78`/`ADR-80`): il JSON è
   parsato e verificato contro uno schema strutturale allowlist (chiavi Lottie note: `v, fr, ip, op,
   w, h, layers, assets, …`), **rifiutato** se contiene una chiave `x` (marker standard di
   espressione nel formato Bodymovin) su qualunque livello annidato, o se supera `500 KB` di
   dimensione. Rifiuto integrale con `400`, mai una rimozione silenziosa della sola chiave incriminata
   (stesso principio "mai persistere un valore diverso da quello validato" di `ADR-78` § "Decisione"
   punto 6).
5. **Contenuto**: `file: mediaRef` (il `.json` sanitizzato), `trigger: enum('autoplay'|'onScroll'|
   'onHover'|'onClick')`, `loop: boolean`, `speed: number (0.1–3)`. **Stile**: `width/height:
   unitValue`, `alignment: enum('left'|'center'|'right')`.
6. **`meta.runtime` per questo widget referenzia un nome fuori dall'unione chiusa di `ADR-74` § 1**:
   `'lottie'` è aggiunto come **undicesimo** valore ammesso di `RuntimeModuleName`
   (`docs/ai/specs/SPEC-RUNTIME.md` § 5.1), l'unica estensione di quell'unione chiusa che questa ADR
   introduce — motivata esplicitamente dal fatto che, a differenza degli altri dieci, il suo script
   **non vive nello stesso bundle** e quindi richiede un secondo tag `<script>` dedicato
   nell'algoritmo del worker (§ "Conseguenze").

### 5. Estensione multi-step del widget `form`

1. **Step**: il widget `form` esistente guadagna un contenitore opzionale `formStep` (pattern a
   composizione `children`, `children.allow: ['formStep']` quando l'autore attiva la modalità
   multi-step; senza `formStep`, il form resta a singolo step, comportamento invariato — nessuna
   migrazione, nessun bump di `v`). Ogni `formStep` contiene i propri `form-field` esistenti
   (nessuna nuova prop sul tipo `form-field` per la cardinalità, solo il nesting).
2. **Campi condizionali**: `form-field` guadagna una prop opzionale `visibleIf: { field: string;
   op: enum('eq'|'neq'|'contains'); value: string }` — un oggetto tipizzato dichiarato
   direttamente nel `BlockDefinition` di `form-field` (non un `kind` globale nuovo: la forma è
   sufficientemente stretta e specifica di questo singolo campo da non giustificare una voce
   nell'unione `PropKind`, stesso principio già usato per `sticky` dentro `kind: 'position'`,
   `SPEC-PROPKIND-V2-DETAILS.md` § 7). `field` referenzia il `name` di un altro `form-field` dello
   stesso form (validato in forma, non in esistenza — stesso principio di `mediaRef`/`colorRef`: un
   `field` verso un nome inesistente non fa fallire la validazione, semplicemente la condizione non
   corrisponde mai a runtime, comportamento innocuo).
3. **Azioni post-invio**: `form` guadagna `postSubmitActions: { type: enum('email'|'redirect'|
   'webhook'); config: … }[]` (array, ≤ 5 azioni, eseguite in ordine dal backend dopo la
   persistenza dell'invio — invariata l'email esistente, `redirect` restituisce l'URL al client per
   la navigazione, `webhook` è **server-side**, mai client-side).
4. **Webhook — mitigazione SSRF**: `config.url` per `type: 'webhook'` deve essere `https://`
   (rifiutato altrimenti), risolto e verificato **a ogni invio** (non solo alla configurazione)
   contro un controllo che rifiuta IP privati/loopback/link-local (RFC 1918, `127.0.0.0/8`,
   `169.254.0.0/16`, `::1`, `fc00::/7`) dopo la risoluzione DNS del hostname — stesso principio di
   difesa in profondità già scelto per `kind: 'css'` (`ADR-78` § "Decisione" punto 4, "nessun `url()`
   salvo..."): un allowlist di destinazione, non una blocklist, applicata al momento della richiesta
   e non solo alla scrittura, perché una risoluzione DNS può cambiare fra la configurazione e
   l'invio (rebinding). Configurazione del webhook riservata a **Manager+** (soglia coerente con
   "Gestire... Template" già in vigore per superfici di configurazione equivalenti, non
   un'apertura a User).
5. **reCAPTCHA/hCaptcha**: `form` guadagna `captcha?: { provider: enum('recaptcha'|'hcaptcha');
   siteKey: string }` — `siteKey` è pubblica per natura (embedded nello script del provider), la
   **secret key** di verifica server-side vive in `global_kit`/una configurazione Admin+ dedicata
   (non in questo `kind`, mai esposta al client). Verifica: il backend, alla ricezione di un invio
   da un form con `captcha` configurato, chiama l'endpoint di verifica del provider
   (`https://www.google.com/recaptcha/api/siteverify` o `https://hcaptcha.com/siteverify`) con la
   secret key **prima** di processare `postSubmitActions` — un invio senza token captcha valido è
   rifiutato con lo stesso `400` già usato per honeypot (gap analysis: "honeypot già c'è"), nessun
   nuovo formato di errore.
6. **Chiusura del debito `video`/`ADR-80`**: il renderer del widget `video` esistente (`ADR-85` §
   4.20) guadagna, per `source: 'youtube'|'vimeo'`, la variante "iniezione in-pagina dell'iframe al
   click" come **comportamento alternativo** attivabile via una nuova prop Stile
   `loadBehavior: enum('link'|'inline')` (default `'link'`, il comportamento zero-JS di R4 resta
   quindi il default invariato — nessuna migrazione, nessuna rottura di contenuto esistente):
   `'inline'` dichiara `meta.runtime: ['observer']` (il click sul poster costruisce l'`<iframe>` nel
   DOM, lo stesso modulo già usato per le entrance animation, riusato qui per il suo ruolo generico
   di "orchestratore di stato su interazione", coerente con la chiusura già indicata da `ADR-80` §
   "Conseguenze": "`observer`-adiacente, non un modulo a sé").

### 6. Composizione a `children` per i widget compositi di questo registro

Stesso pattern di `ADR-85` § "Decisione" punto 3, applicato qui:

| Parent | Child type | `children.allow` |
|---|---|---|
| `testimonialCarousel` | `testimonial` (esistente, riuso diretto) | `['testimonial']` |
| `mediaCarousel` | `image`, `video` (esistenti, riuso diretto) | `['image', 'video']` |
| `hotspot` | `hotspotItem` (nuovo) | `['hotspotItem']` |
| `form` (modalità multi-step) | `formStep` (nuovo) | `['formStep']`, solo quando l'autore attiva la modalità |

`testimonialCarousel`/`mediaCarousel` sono gli unici due widget di questo intero progetto la cui
composizione riusa un tipo di blocco **già esistente e indipendente** come figlio (non un nuovo
tipo "-Item" dedicato): `testimonial` e `image`/`video` sono già editabili singolarmente altrove
nel registro, quindi non serve duplicarne lo schema — l'unica differenza rispetto a un utilizzo
standalone è il contenitore `carousel` che li avvolge e il proprio modulo runtime.

### 7. `animatedHeadline`

**Contenuto**: `before: plainText`, `animatedWords: plainText[]` (2–10 voci), `after: plainText`.
**Stile**: `style: enum('highlight'|'rotate')`, `animationType: enum('typing'|'fade'|'slide')`
(rilevante solo con `style: 'rotate', presentazione non validazione — stesso principio già usato per
`gradient.position`), `intervalMs: number (1000–8000, con style:'rotate')`, `highlightColor:
colorRef` (con `style:'highlight'`), `typography: typography` (applicata all'intero testo, prima/
dopo/parola animata condividono lo stesso `typography`, nessuna tipografia separata per la sola
parola animata in questo round — un caso reale ma non richiesto esplicitamente dal gap analysis,
rinviabile senza migrazione se richiesto in futuro).

### 8. Riepilogo minRole/categoria

Tutti gli undici widget/estensioni di questo registro: `enabled: true`, categoria palette **"Pro"**
(`PLAN-parita-elementor-pro.md` § R4, la stessa tassonomia di categorie già dichiarata), `minRole:
User` — **nessuna eccezione**: a differenza di `html` (`ADR-85` § 4.18), nessun widget di questo
registro tocca una regola di dominio preesistente che ne riservi l'uso. La configurazione del
webhook (§ "Decisione" punto 4) e della secret key captcha (§ "Decisione" punto 5) restano
**Manager+/Admin+** a livello di *impostazione di sito*, non di inserimento del widget nella pagina
— un User può inserire un `form` con `postSubmitActions.webhook` già configurato da un Manager, ma
non può configurarne uno nuovo.

---

## Alternative valutate

| Opzione | Pro | Contro | Motivo scarto |
|---|---|---|---|
| Un modulo `counter` dedicato invece di riusare `observer` | Nome esplicito, forse più leggibile nel registro | Duplica esattamente lo stesso `IntersectionObserver` a soglia singola già scritto per le entrance animation, per un solo comportamento diverso (tween numerico invece di toggle classe) — nessun beneficio di peso o chiarezza che giustifichi un secondo osservatore | `ADR-74` § 1 chiude l'elenco a dieci nomi; riaprirlo per un caso riconducibile è un costo di manutenzione senza contropartita |
| `nav-menu` con hamburger/dropdown JS-driven (`meta.runtime` dedicato) | Comportamento identico "letterale" a Elementor Pro, animazioni più ricche (slide-down javascript-timed) | Introduce un modulo undicesimo (o estende `motion`/`observer` in modo non naturale) per un comportamento interamente esprimibile in CSS puro, già validato da `ADR-85` per casi analoghi (`flipBox`, `tableOfContents` collassabile) | Nessun requisito del gap analysis chiede animazioni oltre quanto CSS `transition` produce già; zero-JS è preferibile a parità di risultato percepito |
| `hotspot` con tooltip gestito da un modulo JS dedicato (posizionamento dinamico, flip automatico ai bordi) | Posizionamento del tooltip sempre ottimale anche vicino ai bordi dello schermo | Richiederebbe un dodicesimo modulo o un'estensione di `motion` per un calcolo di collision-detection — complessità non giustificata da un requisito esplicito; CSS `anchor-positioning`/posizionamento fisso per `tooltipPosition` copre il caso comune | Il gap analysis non richiede flip automatico; l'autore sceglie `tooltipPosition` manualmente, come già fa per side/align in altri widget (`iconBox`, `imageBox`) |
| `lottie` condiviso nello stesso bundle `public-runtime.js`, accettando di sforare il budget per le pagine che lo includono | Un solo file da cacheare, un solo meccanismo di iniezione | Penalizza **ogni** pagina del sito (anche quelle senza `lottie`) con un bundle sempre più pesante del gate di `ADR-74`, o costringerebbe ad alzare quel gate per tutti — `ADR-74` § 2 lo motiva esplicitamente come "resta muto rispetto al costo di ogni singolo widget" | `ADR-74` § "Decisione" punto 2 prevede esattamente questo caso e la sua soluzione (chunk a sé) |
| `lottie-web` completo (con supporto espressioni) invece di una build "light" | Copertura totale del formato, nessuna limitazione per l'autore | Le espressioni Bodymovin sono codice arbitrario valutato dal player — una superficie di esecuzione lato client indistinguibile da `eval()` su un file caricato dall'utente, in diretto conflitto con "il bundle è codice del CMS, non contenuto utente" di `ADR-74` § 7 | Rischio di sicurezza non giustificato da un requisito che chiede solo l'animazione, non l'estensibilità a codice arbitrario |
| Webhook con blocklist di IP invece di allowlist di scope pubblico | Meno falsi positivi su hostname legittimi con IP variabili | Una blocklist richiede prevedere ogni intervallo privato/riservato presente e futuro — stesso ragionamento già scartato da `ADR-78` per CSS/HTML | Whitelist-first è il pattern already stabilito nel repository per ogni altra superficie di rischio equivalente |
| Verifica captcha solo alla configurazione, non a ogni invio | Un solo round-trip verso il provider per form, non uno per invio | Un token captcha è **per-invio** per costruzione (scade dopo un singolo uso in entrambi i provider): verificarlo solo alla configurazione non verifica affatto l'invio reale, vanificando la protezione anti-bot | Non è un'alternativa valida, è un fraintendimento del meccanismo che il captcha esiste per fornire |

---

## Conseguenze

- 5 nuovi `BlockDefinition` in `app/backend/src/blocks/types/`: `counter`, `testimonialCarousel`,
  `mediaCarousel`, `animatedHeadline`, `hotspot`, più i tipi di composizione `hotspotItem`,
  `formStep` — `lottie` è un sesto tipo nuovo (§ "Decisione" punto 4).
- Estensioni additive (nessun bump `v`) a `nav-menu`/`nav-menu-item` (§ "Decisione" punto 2), `form`/
  `form-field` (§ "Decisione" punto 5), `video` (§ "Decisione" punto 6, nuova prop `loadBehavior`).
- `docs/ai/specs/SPEC-RUNTIME.md` § 5.1 guadagna un undicesimo valore in `RuntimeModuleName`
  (`'lottie'`), l'unico caso in cui il worker di export inietta **due** tag `<script>` invece di uno
  per la stessa pagina (`public-runtime.js` sempre presente se altri moduli sono richiesti,
  `lottie-player.js` in aggiunta solo se il widget `lottie` è presente — i due file sono
  indipendenti, nessuna dipendenza di caricamento fra loro).
- Nuova dipendenza approvata: l'interprete Lottie "light" self-hosted (§ "Decisione" punto 4 punto
  1) — nessuna dipendenza runtime aggiunta all'admin (l'inspector del widget `lottie` mostra solo
  un'anteprima statica del primo frame o un player identico a quello pubblico montato in un
  `iframe` isolato, dettaglio di implementazione non vincolato da questa ADR).
- Il backend guadagna una chiamata di rete server-side nuova (verifica captcha verso il provider,
  § "Decisione" punto 5) e una verifica DNS/IP a ogni invio di form con webhook configurato (§
  "Decisione" punto 4) — entrambe lato **gestione**, mai lato pubblico, nessun impatto sull'air-gap
  di `ADR-53`.
- Nessuna modifica allo schema PostgreSQL: ogni widget vive nel `jsonb` esistente
  (`draft_content`/`content`/`content_tree`); la configurazione captcha/webhook di sito vive in
  `app_settings` (stesso pattern singleton già in uso per `global_kit`/`breakpoints`), non in una
  tabella nuova.
- `npm run openapi:export && npm run openapi:types` richiesto per l'endpoint di verifica captcha
  server-side se esposto come rotta dedicata (dettaglio di implementazione, non vincolato in forma
  esatta da questa ADR — potrebbe restare una chiamata interna del servizio di submission esistente
  senza una rotta pubblica propria).

## Conformità

- Test per ciascuno dei 6 nuovi tipi di blocco: valore minimo/massimo/malformato per ogni prop, con
  `reason` atteso sul `path` corretto — stesso principio di ogni ADR precedente di questo progetto.
- Test dedicato `lottie`: un file `.json` con una chiave `x` a qualunque livello di annidamento è
  respinto `400`; un file oltre 500 KB è respinto `400`; un file valido e conforme produce un
  `mediaRef` persistito e un rendering che non include mai una chiamata a `eval`/`Function`
  (verificato con un test che ispeziona il codice del player per l'assenza statica di questi
  identificatori, oltre al comportamento a runtime).
- Test di rendering: una pagina con `lottie` presente riceve **due** tag `<script>` (`public-
  runtime.js` più `lottie-player.js`), entrambi con lo stesso nonce; una pagina senza `lottie` non
  riceve mai `lottie-player.js` anche se `public-runtime.js` è presente per altri moduli.
- Test SSRF: un `webhook.url` che risolve a `127.0.0.1`, `10.0.0.5`, `169.254.169.254` (metadata
  endpoint cloud, caso classico di SSRF) o `::1` è rifiutato al momento dell'invio, non solo alla
  configurazione — verificato con un mock del resolver DNS che restituisce questi indirizzi per un
  hostname apparentemente legittimo.
- Test captcha: un invio senza token o con token già consumato (simulato con la risposta mock del
  provider) è rifiutato `400`, `postSubmitActions` non viene eseguito.
- Test e2e per `nav-menu`: dropdown apribile da tastiera (`Tab` fino al trigger, submenu visibile
  senza click), hamburger funzionante con JavaScript disabilitato nel browser di test (verifica
  esplicita zero-JS, `check-air-gap.js` esteso con un caso "JS disabilitato" per questo widget).
- Test e2e per `hotspot`: tooltip apribile via `Enter`/`Space` da tastiera sul trigger, chiudibile
  con `Esc` quando renderizzato con l'attributo `popover` nativo.
- Test RBAC: un `User` può inserire un `form` con webhook/captcha già configurati da un Manager ma
  riceve `403` tentando di modificare la configurazione di sito corrispondente.
- Nessun tag `<script>` compare in una pagina il cui unico contenuto Pro è `hotspot`/`nav-menu`/
  `animatedHeadline (highlight)` — estensione dello stesso test snapshot già richiesto da `ADR-85` §
  "Conformità" per i widget CSS-only.

---

## Decisione umana

**Esito**: [ ] Approvato così com'è · [ ] Approvato con modifiche (vedi note) · [ ] Rifiutato ·
[ ] Rinviato

**Approvato da**: _______________ · **Data**: _______________

**Note**:
