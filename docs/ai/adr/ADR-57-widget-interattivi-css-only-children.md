# ADR-57 — Widget interattivi enterprise: `accordion`/`accordionItem`, `tabs`/`tabPanel`, `carousel`/`carouselSlide`, `modalTrigger` — CSS-only, composizione a `children`

## Status
[ ] In discussione · [x] **Approvata** · [ ] Rifiutata · [ ] Superseded da ADR-XXX

## Data approvazione
**2026-09-05**, firmata dall'umano in sede di task (stesso pattern di autorizzazione di
ADR-38/47/50/51/52/53): l'umano ha scartato esplicitamente l'Opzione B (`itemList`)
proposta nella prima bozza di RFC-57 e diretto l'implementazione verso l'Opzione A
(composizione a `children`), confermando in risposta a domanda diretta che questa
direttiva tecnica vale come firma formale della decisione.

## RFC di riferimento
`docs/ai/rfc/RFC-57-widget-interattivi-enterprise-css-only.md` (interattività CSS-only +
confronto Opzione A/B, qui recepita l'Opzione A per decisione dell'umano).

---

## Decisione

1. **Sette nuovi tipi, tutti a `v: 1`**: `accordion`, `accordionItem`, `tabs`, `tabPanel`,
   `carousel`, `carouselSlide`, `modalTrigger` — tredicesimo/quattordicesimo/quindicesimo/
   sedicesimo/diciassettesimo/diciottesimo/diciannovesimo tipo del registro (dopo i dodici di
   ADR-21 §5 + ADR-39 + ADR-46 §1 + ADR-52 §1 + ADR-55 §1). **Il registro passa da dodici a
   diciannove tipi.** Nessun `minRole`: stessa classe di fiducia di ogni altro blocco di
   contenuto (il solo blocco riservato a SuperAdmin resta HTML/embed, tuttora disabilitato).

2. **Composizione a `children`, sul modello ADR-52/ADR-46, non a prop-array**: ogni widget a
   elenco è una coppia contenitore/voce — `accordion`→`accordionItem`, `tabs`→`tabPanel`,
   `carousel`→`carouselSlide` — ogni voce un nodo autonomo con `id` proprio, path di
   validazione ed editing indipendenti. `modalTrigger` non ha elenco (una sola regione di
   contenuto) e resta un tipo unico, ma anch'esso un contenitore a `children` reali, non una
   prop `body` a testo limitato — stessa filosofia estesa dove il problema è lo stesso
   (contenuto di seconda classe). **Nessun nuovo `kind` di prop**: `itemList` proposto nella
   prima bozza di RFC-57 è scartato (vedi "Alternative scartate"). Nessun nuovo
   `BlockPropInvalidReason`.
    - `accordion`: contenitore, `children.allow: ['accordionItem']`, `ROOT_ALLOWED`, prop
      `exclusive: boolean` (default `false`).
    - `accordionItem`: `children.allow: ['heading','richText','image','button','container']`,
      **non** in `ROOT_ALLOWED` (stesso trattamento di `navMenuItem`/`form-field`), prop
      `title: plainText` (required, `maxLength: 120`).
    - `tabs`: contenitore, `children.allow: ['tabPanel']`, `ROOT_ALLOWED`, nessuna prop
      propria.
    - `tabPanel`: `children.allow: ['heading','richText','image','button','container']`, non
      in `ROOT_ALLOWED`, prop `label: plainText` (required, `maxLength: 60`).
    - `carousel`: contenitore, `children.allow: ['carouselSlide']`, `ROOT_ALLOWED`, prop
      `autoplay: boolean` (default `false`), `transition: enum('manual-scroll'|'fade-loop'|
      'slide-loop')` (default `manual-scroll`).
    - `carouselSlide`: `children.allow: ['heading','richText','image','button','container']`,
      non in `ROOT_ALLOWED`, nessuna prop propria (immagine/didascalia sono `children`, un
      `image` + un `richText`, non prop dedicate).
    - `modalTrigger`: `children.allow: ['heading','richText','image','button','container']`,
      `ROOT_ALLOWED`, prop `triggerLabel: plainText` (required, `maxLength: 80`),
      `animation: enum('none'|'fade'|'slide-down')` (default `fade`); id di ancora derivato
      dal `id` del nodo (`modal-{nodeId}`), non una prop.
   Nessuno dei sette tipi ammette come figlio un altro widget interattivo di questo gruppo, né
   `navMenu`/`globalRef`/`form` — set esplicito e limitato a `heading`/`richText`/`image`/
   `button`/`container` per v1 (evita conflitti CSS-only da annidamento di più widget
   interattivi, es. `name` dei radio del tabs-hack condiviso per errore, target `:target`
   multipli).

3. **`section.children.allow`** (`section.block.ts`) è esteso con i quattro tipi
   contenitore (`accordion`, `tabs`, `carousel`, `modalTrigger`): senza questa modifica i
   widget sarebbero inseribili solo alla radice o dentro `container`, un blocco funzionale
   immediato per l'uso previsto (contenuto di pagina dentro una `section`). `container` non
   richiede modifiche: `children.allow: '*'` li ammette già tutti.

4. **Interattività: CSS-only per tutti e quattro i widget contenitore, zero JavaScript,
   nessuna isola**. `accordion` → `<details>/<summary>` nativi (`exclusive:true` → attributo
   `name` condiviso fra gli `accordionItem` figli, degrado ad apertura multipla sui browser
   senza supporto). `tabs` → radio-hack (`<input type=radio>` nascosti + `<label>` +
   `:checked ~ .panel`), stato non indirizzabile via URL e non persistente al reload.
   `carousel` → `manual-scroll` di default (`scroll-snap` + ancore `#slide-N`, drag nativo);
   `fade-loop`/`slide-loop` opzionali via `@keyframes`, durata fissa uguale per slide, unica
   pausa `:hover`/`:focus-within`. `autoplay:true` con `transition:'manual-scroll'` è un
   **no-op silenzioso del renderer**, non un errore di validazione — stessa natura di
   precedenza a valle già accettata per `url`/`pageGuid` in `navMenuItem` (ADR-52 § 2).
   `modalTrigger` → tecnica `:target`, senza focus trap, senza `aria-modal` dinamico, senza
   chiusura da tastiera Escape — limite del pattern, da verificare in test come "contenuto
   escluso dall'albero di accessibilità quando non `:target`". Nessuno dei sette tipi carica
   un runtime, uno script di hydration o un event listener: **piena conformità ad ADR-53 §
   2**, nessuna eccezione richiesta, nessuna isola proposta.

5. **Nessuna modifica allo schema PostgreSQL, nessuna nuova dipendenza npm.** Nessun
   contenuto pregresso usa questi sette tipi: nessuna migrazione di dati necessaria.

## Alternative scartate

- **`itemList` — nuovo `kind` a prop, quattro tipi nuovi invece di sette, registro a sedici
  (prima bozza di questa RFC)** — **scartata dall'umano con motivazione tecnica esplicita**:
  degrada accordion/tabs/carousel a contenitori di solo testo formattato (profilo
  `richText: 'basic'`, senza `<img>`), impedendo immagini, bottoni o layout annidati dentro
  un pannello/slide/modale — "un compromesso mediocre... non l'unico standard architetturale
  accettabile per un Page Builder di livello enterprise". L'economia di registro non
  compensa la perdita di espressività né la coerenza con ADR-21/ADR-39.
- **Isola JS (hydration parziale) per uno o più widget** — stessa riga già scartata nella
  tabella di ADR-53 ("Ogni isola futura resta una decisione a sé"): nessuno dei quattro
  comportamenti la giustifica, avendo tutti un pattern CSS-only maturo.
- **Un solo tipo `widget` con `variant: enum`** — conflaterebbe tre `children.allow` e
  vincoli diversi in un tipo con comportamento ramificato a runtime, contro il principio "un
  tipo, uno schema esplicito" del registro.
- **`modalTrigger` scomposto in due tipi (`modal`+`modalTriggerButton`)** — il modale ha
  un'unica regione di contenuto, non un elenco: la coppia contenitore/voce ha senso solo
  dove esistono più voci ripetute; un tipo unico autosufficiente evita un ottavo tipo senza
  necessità.
- **`children.allow` permissivo (`'*'`) sulle voci, inclusi altri widget interattivi fra
  loro** — scartata per v1: l'annidamento di più widget CSS-only interattivi moltiplica i
  punti di attrito (name-space condivisi, target in conflitto) senza un caso d'uso reale che
  lo richieda.
- **Rifiuto in validazione di `autoplay:true` + `transition:'manual-scroll'`** —
  introdurrebbe la prima regola di validazione cross-prop del registro; la precedenza
  silenziosa a valle (stesso principio di `navMenuItem`) risolve lo stesso problema senza
  quel precedente.

## Conseguenze

- Registro blocchi: dodici → **diciannove** tipi. Nessun nuovo `PropKind`, nessun nuovo
  `BlockPropInvalidReason` — tutte le prop dei sette tipi riusano `plainText`/`boolean`/
  `enum` già chiusi da ADR-21 § 4.
- `block-tree-validator.service.ts`: nessun ramo di validazione strutturale nuovo atteso —
  la composizione a `children.allow` è già il meccanismo generico del validatore (stesso
  principio di `navMenu`/`form`); va verificato in fase di implementazione che non emerga un
  caso non coperto, non assunto qui.
- **Property Inspector: nessuna nuova infrastruttura di editing.** Aggiunta/rimozione/
  riordino delle voci (`accordionItem`/`tabPanel`/`carouselSlide`) riusano integralmente
  palette, Editor Structure Navigator e drag & drop già generici sul registro
  (`allowedChildTypes`/`canContainType`/`canDropInto`, `block-registry.utils.ts`) — lo
  stesso meccanismo già in produzione per `container`/`section`/`navMenu`. Il solo lavoro
  nuovo è l'aggiunta dei campi prop specifici (`title`/`label`/`exclusive`/`autoplay`/
  `transition`/`triggerLabel`/`animation`) al mapping esistente, tutti `kind` già supportati.
- `app/public-site`: sette nuovi template di rendering statico + frammenti CSS, generati a
  build-time (ADR-45/53), costo zero a runtime. Nessuna chiave Redis `public:*`.
- Contenuto per voce/pannello/slide/modale **non è limitato** a un profilo di sanitizzazione
  ristretto: ogni voce ammette `heading`/`richText`/`image`/`button`/`container` come
  qualunque altro contenitore del registro, sanitizzato con le stesse regole già esistenti
  per quei tipi (nessuna nuova regola di sanitizzazione introdotta da questa ADR).
- L'editor React (Canvas) deve approssimare visivamente i quattro comportamenti CSS-only per
  il WYSIWYG, senza il vincolo zero-JS che vale solo per `app/public-site` — parità visiva da
  verificare per ciascun widget, non garantita per costruzione.
- Un incremento futuro di `v` su uno di questi sette tipi resta un deploy a senso unico
  (ADR-21 § 1), come per ogni altro tipo del registro.
- Diciannove tipi nel registro sono sette voci in più da mantenere e migrare per sempre
  (ADR-21 § 3.5): costo accettato esplicitamente dall'umano in cambio di contenuto per voce
  non degradato.

## Conformità

`BLOCK_REGISTRY` contiene i sette tipi (`accordion`, `accordionItem`, `tabs`, `tabPanel`,
`carousel`, `carouselSlide`, `modalTrigger`), tutti `v: 1`. `ROOT_ALLOWED` include i quattro
contenitori, non le tre voci. `section.children.allow` include i quattro contenitori.
`accordionItem`/`tabPanel`/`carouselSlide`/`modalTrigger` hanno `children.allow` limitato a
`['heading','richText','image','button','container']`, mai un altro widget interattivo di
questo gruppo. Nessuna prop `items`/`body` a testo limitato compare in nessuno dei sette
tipi. Il markup prodotto dal job di export per ciascun tipo non contiene `<script>`, `on*`,
framework runtime o attributi di hydration — verificato come gate di CI sull'HTML generato,
stesso principio del test di escaping `plainText` di ADR-53 § Conformità. `autoplay:true`
con `transition:'manual-scroll'` non produce animazione nel CSS emesso e non produce un
errore `400` in validazione.
