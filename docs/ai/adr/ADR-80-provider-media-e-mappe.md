# ADR-80 — Standard provider: mappe (OpenStreetMap/Leaflet), video privacy-enhanced (no-cookie), sprite icone SVG (Tabler)

## Status
[x] **In discussione** · [ ] Approvato · [ ] Rifiutato · [ ] Superseded da ADR-XXX

## Data approvazione
_In attesa di firma umana — vedi "Decisione umana" in fondo a questo documento._

## RFC di riferimento
Nessuna RFC dedicata (round R0, vedi ADR-74 § "RFC di riferimento"). Riferimento sostanziale:
`docs/SPEC-propkind-v2.md` § 3.13/§ 4.3 (widget `map`), `docs/ELEMENTOR_PRO_GAP_ANALYSIS_v2.md`
§ 1.3.

## Numerazione
Vedi ADR-74 § "Numerazione": questo round occupa ADR-74–ADR-80.

## ADR di riferimento (non modificate)
`docs/constitution.md` § Frontend, "Icone: SOLO @tabler/icons-react": questa ADR **estende**, non
sostituisce, quel vincolo alla superficie pubblica, dove `@tabler/icons-react` (dipendenza React,
runtime admin) non è applicabile per costruzione (ADR-53: il pubblico non carica React).

---

## Contesto

`ELEMENTOR_PRO_GAP_ANALYSIS_v2.md` § 1.3 segnala tre provider esterni come prerequisito di widget
altrimenti bloccati: mappa (`map`), video (`video`, incluso nella lista widget "Pro" e "Base"),
icone (`icon`, `iconList`, `iconBox` e ogni widget che ne fa uso). Ognuno dei tre tocca un principio
già fermo del progetto — air-gap pubblico (ADR-53), zero tracciamento non dichiarato, "SOLO
@tabler/icons-react" per le icone — e nessuno dei tre può risolversi con la semplice importazione
del provider "di default" che Elementor userebbe (Google Maps embed, YouTube/Vimeo embed
standard, icon font), perché tutti e tre presuppongono un runtime, un tracciamento di terze parti o
una dipendenza incompatibile con lo stack ammesso sul pubblico. Questa ADR fissa lo standard per
ciascuno, in modo che i widget di R4/R6 non debbano riaprire la scelta uno per uno.

---

## Decisione

### Mappe

1. **OpenStreetMap + Leaflet self-hosted come default**, non Google Maps embed. `kind: 'icon'`
   e `kind: 'html'` a parte, il widget `map` (`SPEC-propkind-v2.md` § 4.3: `provider: osm|google-
   embed, lat/lng or address, zoom, height, markers[]`) dichiara **entrambe** le opzioni nel
   `kind`, ma questa ADR fissa `osm` come scelta raccomandata e unica implementata nel round R4:
   `google-embed` resta nel tipo come valore ammesso per compatibilità futura (un cliente che
   preferisce Google Maps per la propria mappa dei negozi), ma la sua implementazione (un
   `<iframe>` verso `google.com/maps/embed`) è rinviata — non richiede JS pubblico e rientra
   comunque nel profilo `embed` di ADR-78 § 7 se e quando implementata, quindi non è bloccata da
   questa ADR, solo non prioritaria.
2. **Leaflet è una dipendenza nuova, approvata qui** (constitution § "Regola sulle nuove
   dipendenze"), caricata **solo** dal bundle pubblico (`public-runtime.js`, ADR-74) come modulo
   dedicato (`map`), mai come dipendenza dell'admin (l'inspector del widget non ha bisogno di
   Leaflet per configurare lat/lng/zoom: un input numerico e un'anteprima statica bastano,
   coerente con "nessuna libreria pesante senza necessità" della constitution). I tile OSM sono
   richiesti dal browser del visitatore direttamente al tile server pubblico
   (`tile.openstreetmap.org` o un mirror configurato) — questa è l'unica eccezione esplicita
   aggiunta all'elenco chiuso di ADR-74 § 6 (zero chiamate di rete dal bundle): la richiesta di
   tile non è verso l'infrastruttura del CMS e non è evitabile senza un proxy di tile self-hosted,
   fuori scopo di questo round. Va dichiarata nell'informativa privacy del sito (nessun cambiamento
   di codice, nota operativa).
3. **Nessuna API key richiesta lato pubblico**: OSM/Leaflet non necessitano di credenziali; questo
   evita di introdurre un segreto lato client (un'API key Google Maps in un file statico pubblico
   sarebbe comunque visibile ed estraibile, un problema che OSM elimina per costruzione).

### Video

4. **Privacy-Enhanced Mode obbligatorio per gli embed YouTube/Vimeo**: ogni URL/embed video generato
   dal widget `video` (`SPEC-propkind-v2.md` § 4.3) usa il dominio
   `youtube-nocookie.com` (mai `youtube.com/embed`) per YouTube, e il parametro `dnt=1`
   (`Do-Not-Track`) per Vimeo. Questo non è opzionale né configurabile per singolo widget: è un
   vincolo del renderer, coerente con l'assenza dichiarata di tracciamento non consentito
   dall'utente sul pubblico (nessun principio esplicito della constitution lo richiedeva prima
   d'ora, perché il widget video non esisteva; questa ADR lo introduce come standard non
   derogabile, non come default modificabile).
5. **Nessun autoplay con audio.** Il widget può dichiarare `autoplay: true` solo insieme a
   `mute: true` (vincolo di validazione, non di UX opzionale): coerente con le policy autoplay dei
   browser moderni (un video con audio in autoplay viene comunque bloccato dal browser stesso) e
   con l'assenza di sorprese sonore non richieste dal visitatore.
6. **Poster + click-to-load senza JS come default per il caricamento**: coerente con
   `PLAN-parita-elementor-pro.md` § R4 ("poster + click-to-load senza JS: `<a>` → pagina embed"),
   l'`<iframe>` dell'embed viene inserito nel markup solo al click su un `<a>`/`<button>` che lo
   costruisce via un piccolo modulo del bundle pubblico (`observer`-adiacente, non un modulo a sé:
   riusa lo stesso principio "attiva su data-* presente" di ADR-74) — questo evita che ogni
   caricamento di pagina scarichi l'iframe di YouTube/Vimeo (con il proprio JS e le proprie
   richieste di rete) anche quando il visitatore non guarda il video, riducendo sia il peso reale
   di pagina sia la superficie di terze parti attiva di default.
7. **`hosted` (video self-hosted via `FilesModule`) non ha vincoli di provider**: `<video>` nativo
   con `poster`, nessun embed di terze parti, nessuna eccezione aggiuntiva ad ADR-74 § 6.

### Icone

8. **Admin: invariato, `@tabler/icons-react` esclusivo** (vincolo costituzionale già in vigore, non
   toccato da questa ADR).
9. **Pubblico: sprite SVG inline generato a build-time, mai un font icone, mai un `<iframe>` o
   fetch a runtime.** Il `kind: 'icon'` (`SPEC-propkind-v2.md` § 3.13) con `set: 'tabler'`
   referenzia un `name` da un'**allowlist sincronizzata** dei nomi Tabler effettivamente
   disponibili (non l'intero catalogo — solo quelli inclusi nello sprite di build, per contenere il
   peso): il worker `static-export` risolve il nome nel proprio path SVG dal pacchetto
   `@tabler/icons` (variante "outline" SVG pura, non il pacchetto React) e inietta il markup
   `<svg>` **inline** nel file HTML della pagina, mai un riferimento esterno a un file sprite
   condiviso via `<use href="...">` cross-documento (che aggiungerebbe una richiesta di rete in più
   e un problema di caching per pagina) — la scelta "inline per pagina" ripete la stessa logica già
   adottata per il CSS critico di ADR-53 § 2: il costo di duplicazione fra pagine diverse è
   accettato in cambio di zero richieste aggiuntive e zero dipendenza da un file sprite che
   potrebbe non essere ancora sincronizzato sull'edge.
10. **`set: 'custom'` referenzia un `mediaRef` SVG**, sanificato con lo stesso profilo
    `DOMPurify` "svg-strict" già menzionato in `SPEC-propkind-v2.md` § 3.13 — libreria nuova
    (`DOMPurify`, non `sanitize-html` che opera su HTML generico, non ottimizzato per la superficie
    SVG-specifica: `<script>` dentro `<svg>`, `xlink:href` javascript, `<foreignObject>`) approvata
    da questa stessa ADR, usata **solo** per SVG caricati dall'utente in questo `kind`, non come
    sostituto di `sanitize-html` altrove.

---

## Alternative valutate

| Opzione | Pro | Contro | Motivo scarto |
|---|---|---|---|
| Google Maps embed come unico provider | Zero dipendenze nuove, standard de facto | Richiede API key esposta lato client o quota condivisa; tracciamento Google non dichiarabile "air-gapped"; nessun self-hosting possibile | Contraddice lo spirito di minimizzazione delle terze parti già scelto per il resto del progetto |
| YouTube/Vimeo embed standard (senza no-cookie/dnt) | Comportamento identico all'embed "di default" copiato da altri siti | Imposta un cookie di tracciamento al primo caricamento, anche senza interazione dell'utente | In conflitto con l'assenza di tracciamento non richiesto; nessun costo per usare la variante privacy-enhanced |
| Autoplay senza vincolo `mute` | Comportamento "come Elementor" letterale | I browser lo bloccano comunque silenziosamente, producendo un'esperienza inconsistente; nessun beneficio reale | Il vincolo `mute` non toglie funzionalità percepita, la rende affidabile |
| Font icone (icon font, es. Tabler come `@font-face`) sul pubblico | Un solo file, cache lunga, sintassi CSS semplice (classe su elemento) | Introduce un `@font-face` con centinaia di glifi per usarne una decina per pagina; peggiore accessibilità (icona come testo/font, screen reader) rispetto a SVG inline con `aria-hidden`/`role` espliciti | `SPEC-propkind-v2.md` § 3.13 dichiara già "Render pubblico: SVG inline... nessun font icone" |
| Sprite SVG condiviso via `<use href="sprite.svg#icona">` | Un solo file scaricato una volta, cacheato fra pagine | Una richiesta di rete in più per il file sprite, complessità di invalidazione cache allineata al deploy, comportamento incoerente in alcuni browser per `<use>` cross-document con `xlink:href` verso file esterno | Costo di rete e complessità non giustificato rispetto all'inline, coerente con la scelta già fatta per il CSS critico |
| `sanitize-html` anche per gli SVG custom | Nessuna dipendenza nuova | Non specializzato per i vettori SVG (namespace XML, `foreignObject`, `xlink:href`); rischio di falsi negativi | `DOMPurify` con profilo dedicato è lo standard di settore per SVG sanitization |

---

## Conseguenze

- Nuove dipendenze approvate da questa ADR: **Leaflet** (bundle pubblico soltanto), **DOMPurify**
  (backend, sanitizzazione SVG custom soltanto). `@tabler/icons` (pacchetto SVG puro, distinto da
  `@tabler/icons-react` già in uso) come dipendenza di build del worker di export, mai spedita al
  browser come pacchetto — solo i singoli SVG risolti finiscono nell'HTML.
- Un'allowlist di nomi icone Tabler sincronizzata (analoga a `fonts.google_allowlist` di ADR-77)
  determina quali icone sono selezionabili nell'inspector: ampliarla è un'operazione di
  configurazione, non una firma, ma la prima sincronizzazione (quali ~200-300 nomi includere) è
  una scelta editoriale che il round R4 dovrà fissare.
- L'eccezione di rete per i tile OSM (punto 2) va nella nota privacy del sito e nel test
  `check-air-gap.js` esteso da ADR-74 § 6 come **secondo** caso ammesso oltre a form/search-index —
  aggiornamento di quella suite, non di questa ADR.
- Il click-to-load video introduce un secondo modulo del bundle pubblico oltre ai dieci già
  nominati da ADR-74 § 1 (`video-embed` o integrato in `observer`): la decisione di merge/separazione
  è un dettaglio di implementazione di R4, non vincolato da questa ADR.
- Nessuna modifica allo schema PostgreSQL.

## Conformità

- Nessuna chiamata di rete dal bundle pubblico verso host non allowlisted, salvo tile OSM: verificato
  da `check-air-gap.js` aggiornato.
- Ogni embed YouTube generato punta a `youtube-nocookie.com`, mai `youtube.com/embed`: test
  snapshot sull'output del worker di export.
- Un widget `video` con `autoplay: true` e `mute` assente/`false` è rifiutato dal validator
  (`reason` coerente con l'insieme chiuso esistente, dettaglio del `kind` che lo ospita).
- Ogni icona Tabler nel markup pubblico è un `<svg>` inline con `aria-hidden="true"` (icona
  puramente decorativa) o `role="img"`+`aria-label` (icona con significato semantico, a scelta del
  widget che la usa) — mai una classe di font icone.
- Un SVG custom che fallisce la sanitizzazione `DOMPurify` "svg-strict" produce `400`, mai
  persistenza parziale (stesso principio di ADR-78 per CSS/HTML).

---

## Decisione umana

**Esito**: [ ] Approvato così com'è · [ ] Approvato con modifiche (vedi note) · [ ] Rifiutato ·
[ ] Rinviato

**Approvato da**: _______________ · **Data**: _______________

**Note**:
