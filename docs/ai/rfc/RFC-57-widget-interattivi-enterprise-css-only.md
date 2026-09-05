# RFC-57 — Widget interattivi enterprise (accordion, tabs, carousel, modal-trigger): interattività CSS-only sotto ADR-53, composizione a `children`

## Status
[ ] In discussione · [x] Approvato → genera ADR-57 · [ ] Rifiutato

## Proposto da
AI Orchestrator · Data: 2026-09-05

---

## Problema

Il task "FASE 7 / PROMPT 15: Espansione Widget Enterprise" chiede di registrare quattro
nuovi tipi di blocco — `accordion`, `tabs`, `carousel`, `modal-trigger` — con backend
registry+validator, componenti frontend, Property Inspector e test. Il controllo
documentale preliminare (obbligatorio per `CLAUDE.md` § Anti-hallucination) blocca
l'esecuzione diretta per due motivi verificati sul codice reale, non su un'assunzione:

1. **ADR-21 § 5**: *"Un sesto tipo... entra solo con una nuova firma"*. Il registro attuale
   (`app/backend/src/blocks/block-registry.ts` righe 37-58) elenca dodici tipi, ciascuno
   coperto da una ADR dedicata (`container`→ADR-39, `form`/`form-field`/`form-submit`→
   ADR-46, `navMenu`/`navMenuItem`→ADR-52, `globalRef`→ADR-55). Nessuna ADR copre
   accordion/tabs/carousel/modal-trigger.
2. **ADR-53** (2026-09-04, la più recente, supera ADR-22/23/24) impone al sito pubblico
   un'architettura air-gapped SSG **zero-JS lato client**: *"I blocchi statici non caricano
   framework runtime né script di hydration: il markup prodotto è terminale"* (§ 2). La
   tabella delle alternative di ADR-53 nomina esplicitamente *"Hydration parziale (islands)
   per i blocchi interattivi"* e la scarta, aggiungendo: *"Ogni isola futura resta una
   decisione a sé, come già in ADR-22"*. I quattro widget richiesti sono interattivi per
   natura: prima di poter scrivere uno schema props serve decidere **come** si ottiene
   quella interattività senza violare l'invariante.

A queste due tensioni se ne aggiunge una terza, emersa solo scrivendo lo schema delle
props e non menzionata nel task originario:

3. **Come si compone un elenco di elementi ripetuti (pannelli/voci/slide) nel registro
   blocchi.** ADR-21 § 4 chiude l'insieme dei `kind` di prop e non include mai una "lista di
   oggetti"; ADR-52 (`navMenu`/`navMenuItem`), l'unico precedente reale di un widget a
   elementi ripetuti in questo registro, ha scartato esplicitamente *"un solo tipo `navMenu`
   con prop `items: array<{...}>`"* proprio perché quel `kind` non è mai esistito, e ha
   invece composto l'elenco **a children** (`navMenu` contenitore + `navMenuItem` foglia, un
   nodo per voce, path di validazione ed editing indipendenti).

Una prima bozza di questa RFC aveva confrontato due strade — un `kind` nuovo a prop
(`itemList`, quattro tipi nuovi, registro a sedici) contro la composizione a `children` sul
modello ADR-52 (sette tipi nuovi, registro a diciannove) — raccomandando la prima per
economia di registro. **L'umano ha scartato quella raccomandazione con motivazione tecnica
esplicita**, qui recepita integralmente:

> "L'Opzione B (itemList) è un compromesso mediocre che degrada tab, accordion e caroselli a
> semplici contenitori di testo piatto, impedendo l'inserimento di immagini, bottoni o
> layout annidati. Per un Page Builder di livello enterprise, la composizione ad albero
> tramite children (Opzione A) è l'unico standard architetturale accettabile e coerente con
> ADR-21 e ADR-39."

Questa RFC riparte da questa decisione già presa: la composizione è **a `children`**, non a
prop. Il resto del documento la sviluppa fino allo schema di dettaglio.

---

## Soluzione proposta

### 1. Interattività: CSS-only per tutti e quattro i widget, nessuna isola JS

Indipendente dalla scelta di composizione (A o B) — analisi confermata invariata. Ciascuno
dei quattro comportamenti ha un pattern CSS-only maturo e senza dipendenze sperimentali.

| Widget | Tecnica CSS-only | Limite reale, dichiarato |
|---|---|---|
| **accordion** | `<details>/<summary>` nativi. Apertura multipla indipendente per costruzione. | Apertura **esclusiva** (un solo pannello aperto) richiede l'attributo `name` condiviso fra `<details>` dello stesso gruppo — supporto baseline recente (Chrome 120+/Firefox 125+, 2024). Su browser più vecchi degrada ad apertura multipla indipendente, mai a un blocco non funzionante. |
| **tabs** | Radio-button hack: `<input type=radio>` nascosti + `<label>` + selettore di fratelli generico (`:checked ~ .panel`). Nessuna feature sperimentale. | Il pannello selezionato **non è mai indirizzabile via URL** e non sopravvive a un reload — è uno stato puramente visivo. L'ordine sorgente del markup è vincolato (radio prima di label/pannelli nel DOM per il combinatore `~`), riordinato solo visivamente con `order` flex/grid. |
| **carousel** | Default `manual-scroll`: `overflow-x:auto; scroll-snap-type:x mandatory` + link ancora `#slide-N` con `scroll-margin` per prev/next — drag/swipe nativo. Modalità opzionale `fade-loop`/`slide-loop`: `@keyframes` su `opacity`/`transform`, loop infinito. | **`autoplay` in puro CSS ha limiti reali e non aggirabili senza JS**: (a) incompatibile con `manual-scroll` — non si può avere contemporaneamente scroll nativo trascinabile e un `transform` guidato da keyframe sullo stesso asse, quindi `autoplay` **non produce alcun effetto** quando `transition: manual-scroll` (no-op documentato, non un errore); (b) nei modi loop la durata per slide è fissa e uguale per tutte le slide; (c) l'unica pausa possibile è `:hover`/`:focus-within` — nessuna pausa permanente dopo un'interazione manuale, nessuna sincronizzazione con indicatori a pallini. |
| **modal-trigger** | Tecnica `:target`: un `<a href="#modal-{id}">` come innesco, un pannello `id="modal-{id}"` con `position:fixed` mostrato solo quando `:target`, un'ancora di chiusura verso un hash vuoto. Funziona ovunque da anni, nessuna feature sperimentale. | Nessun focus trap, nessun `aria-modal`/`aria-hidden` dinamico, nessuna chiusura con tasto Escape — limiti del pattern, da verificare in test come "contenuto escluso dall'albero di accessibilità quando non `:target`", non come "modale accessibile senza riserve". |

Nessuna delle quattro tecniche carica un framework, uno script di hydration o un event
listener: il markup prodotto resta terminale come richiede ADR-53 § 2. **Nessuna isola JS è
proposta.**

### 2. Composizione: a `children`, sette tipi nuovi (decisione presa dall'umano)

Sul modello ADR-52/ADR-46: ogni widget a elenco è una coppia contenitore/voce, ogni voce è
un nodo autonomo con `id` proprio, path di errore indipendente, riordino/rimozione tramite
l'Editor Structure Navigator e il drag & drop **già esistenti e generici** — non serve
alcuna nuova infrastruttura di editing, perché `allowedChildTypes`/`canContainType`/
`canDropInto` (`block-registry.utils.ts`) leggono il registro, non un elenco di tipi
cablato: dichiarare `children.allow` sui sette tipi basta perché palette, navigator e drag &
drop funzionino, esattamente come già accade per `navMenu`/`navMenuItem`.

- **`accordion`** (contenitore) → **`accordionItem`** (voce: prop `title`, children
  arbitrari)
- **`tabs`** (contenitore) → **`tabPanel`** (voce: prop `label`, children arbitrari)
- **`carousel`** (contenitore) → **`carouselSlide`** (voce: nessuna prop propria, children
  arbitrari — un'immagine e una didascalia sono semplicemente un `image` + un `richText`
  dentro la slide, non due prop dedicate)
- **`modalTrigger`** — a differenza dei tre sopra **non ha un elenco di voci**, ha
  un'unica regione di contenuto (il corpo del modale): resta un **tipo unico**, ma diventa
  esso stesso un contenitore con `children` reali (non più una prop `body: richText` a
  profilo limitato) — stessa filosofia "niente contenuto di seconda classe" richiesta
  dall'umano, applicata anche qui perché la motivazione ("impedire immagini/bottoni/layout
  annidati") vale per il corpo di un modale tanto quanto per un pannello di un accordion.

**Sette tipi nuovi in tutto** (tredicesimo–diciannovesimo del registro): registro da dodici
a **diciannove**.

Ogni voce/contenitore ammette come figli lo stesso set "di contenuto sicuro" già
componibile ovunque nell'albero: `heading`, `richText`, `image`, `button`, `container` —
**deliberatamente non** `accordion`/`tabs`/`carousel`/`modalTrigger`/`navMenu`/`globalRef`/
`form` fra loro. Non è un limite dell'Opzione A in quanto tale, è un limite di **v1**
dichiarato qui: annidare, ad esempio, un carousel dentro un pannello di un altro accordion
moltiplica i punti di attrito CSS-only (name-space dei radio del tabs-hack, target multipli
in conflitto, scroll-snap annidati) senza che nessun requisito del task lo richieda. Il
`container` resta comunque annidabile all'infinito (ADR-39), quindi un utente può comunque
comporre layout complessi *intorno* a questi widget — solo non *dentro* un altro widget
interattivo dello stesso tipo. Un ampliamento di questo elenco in futuro è additivo
(estensione di `children.allow`, non un cambio di forma delle prop esistenti) e non richiede
necessariamente una nuova ADR se resta dentro l'insieme di tipi già approvati — ma resta una
decisione da annotare esplicitamente quando servirà, non da anticipare qui senza un caso
d'uso reale.

### 3. Schema di massima delle props (Opzione A, decisa)

```jsonc
// accordion — v:1, contenitore (children.allow: ['accordionItem']), ROOT_ALLOWED
{
  "exclusive": { "kind": "boolean", "required": false, "default": false }
  // true → <details name="acc-{nodeId}"> condiviso su tutti gli accordionItem figli
  // (apertura esclusiva, degrado su browser senza supporto per l'attributo name)
}

// accordionItem — v:1, children.allow: ['heading','richText','image','button','container']
// NON in ROOT_ALLOWED (stesso trattamento di navMenuItem/form-field)
{
  "title": { "kind": "plainText", "required": true, "maxLength": 120 }
}

// tabs — v:1, contenitore (children.allow: ['tabPanel']), ROOT_ALLOWED, nessuna prop propria
{}

// tabPanel — v:1, children.allow: ['heading','richText','image','button','container']
// NON in ROOT_ALLOWED
{
  "label": { "kind": "plainText", "required": true, "maxLength": 60 }
}

// carousel — v:1, contenitore (children.allow: ['carouselSlide']), ROOT_ALLOWED
{
  "autoplay":   { "kind": "boolean", "required": false, "default": false },
  "transition": { "kind": "enum", "required": false, "default": "manual-scroll",
                   "values": ["manual-scroll", "fade-loop", "slide-loop"] }
  // autoplay:true + transition:"manual-scroll" → autoplay ignorato dal renderer (no-op
  // documentato, stessa natura di precedenza silenziosa di navMenuItem url/pageGuid,
  // mai un rifiuto di validazione)
}

// carouselSlide — v:1, children.allow: ['heading','richText','image','button','container']
// NON in ROOT_ALLOWED, nessuna prop propria: immagine/didascalia sono children, non prop
{}

// modalTrigger — v:1, children.allow: ['heading','richText','image','button','container']
// ROOT_ALLOWED (tipo unico, non ha coppia contenitore/voce)
{
  "triggerLabel": { "kind": "plainText", "required": true, "maxLength": 80 },
  "animation":    { "kind": "enum", "required": false, "default": "fade",
                     "values": ["none", "fade", "slide-down"] }
  // id di ancora derivato dal node id esistente ("modal-{nodeId}"), non una prop utente
}
```

Nessun nuovo `kind` di prop: tutte le prop dei sette tipi riusano `plainText`/`boolean`/
`enum`, già chiusi in ADR-21 § 4. Nessun nuovo `BlockPropInvalidReason`. Nessun `minRole`:
stessa classe di fiducia di ogni altro blocco di contenuto.

`section.block.ts` (`children.allow`, riga 240) va esteso con i quattro tipi contenitore
(`accordion`, `tabs`, `carousel`, `modalTrigger`) — oggi la lista esplicita non include
nemmeno `navMenu`, ma per widget di contenuto generico (a differenza di un menu di
navigazione, tipicamente di header/footer) l'uso previsto è proprio dentro una `section` di
pagina: l'omissione qui sarebbe un blocco funzionale immediato, non un limite dichiarato.
`container` non richiede alcuna modifica: il suo `children.allow: '*'` ammette già
qualunque tipo del registro, sette nuovi inclusi.

---

## Alternative valutate

- **Hydration parziale (isola JS) per uno o più widget** — scartata: è la stessa riga già
  scartata nella tabella di ADR-53 ("Ogni isola futura resta una decisione a sé"); nessuno
  dei quattro comportamenti richiesti giustifica l'eccezione, avendo tutti un pattern
  CSS-only maturo e senza feature sperimentali.
- **Opzione B — `itemList`, quattro tipi nuovi, registro a sedici** — **scartata
  dall'umano con motivazione esplicita**: degrada accordion/tabs/carousel a contenitori di
  solo testo formattato (profilo `richText: 'basic'`, verificato senza `<img>` in
  `block-sanitize-profiles.config.ts` riga 74), impedendo immagini, bottoni o layout
  annidati dentro un pannello/slide/modale — incompatibile con lo standard atteso da un
  Page Builder enterprise e con la regola 2 del modello di contenuto (*"Contenuto = albero
  Blocchi... nessun tipo privilegiato"*). L'economia di registro (sedici vs diciannove tipi)
  non compensa la perdita di espressività.
- **Un solo tipo `widget` con prop `variant: enum('accordion'|'tabs'|'carousel')`** —
  scartata: conflaterebbe tre forme di contenuto con validazione e `children.allow` diversi
  in un solo tipo con comportamento ramificato a runtime, contro il principio del registro
  di un tipo = uno schema esplicito.
- **`modalTrigger` scomposto in `modal` + `modalTriggerButton` separati** — scartata: il
  modale ha un'unica regione di contenuto, non un elenco; la coppia contenitore/voce ha
  senso solo dove esistono più voci ripetute (accordion/tabs/carousel). Un tipo unico
  autosufficiente (trigger + corpo nello stesso nodo, come una `section` con un innesco)
  evita di introdurre un ottavo tipo senza necessità.
- **`children.allow` permissivo (`'*'`) su `accordionItem`/`tabPanel`/`carouselSlide`/
  `modalTrigger`, inclusi altri widget interattivi fra loro** — scartata per v1: l'annidamento
  di più widget CSS-only interattivi (radio-hack dentro `:target` dentro `<details>`, ecc.)
  moltiplica i punti di attrito (name-space condivisi, target in conflitto) senza un caso
  d'uso reale che lo richieda; resta un set esplicito e "sicuro"
  (`heading`/`richText`/`image`/`button`/`container`), ampliabile in futuro se servirà.
- **Rifiuto in validazione di `autoplay:true` + `transition:'manual-scroll'`** —
  scartata: introdurrebbe la prima regola di validazione cross-prop del registro; la
  precedenza silenziosa a valle (stesso principio di `navMenuItem`) risolve lo stesso
  problema senza quel precedente.

## Impatto

- Registro blocchi: 12 → **19**.
- `ROOT_ALLOWED`: +4 (`accordion`, `tabs`, `carousel`, `modalTrigger`).
- `section.children.allow`: +4 (gli stessi quattro).
- Nessun nuovo `PropKind`, nessun nuovo `BlockPropInvalidReason`, nessun `minRole`.
- Nessuna migrazione di contenuto esistente: sono tipi nuovi, nessun contenuto pregresso li
  usa.
- Nessuna modifica allo schema PostgreSQL, nessuna nuova dipendenza npm.
- `app/public-site`: sette nuovi template di rendering statico (quattro contenitori + tre
  voci) + frammenti CSS, generati a build-time dal job di export (ADR-45/53) — costo zero a
  runtime.
- `app/frontend`: **nessuna nuova infrastruttura di editing** — palette, Structure
  Navigator e drag & drop sono già generici sul registro (`block-registry.utils.ts`); solo i
  campi prop specifici dei sette tipi (`title`/`label`/`exclusive`/`autoplay`/`transition`/
  `triggerLabel`/`animation`, tutti `kind` già supportati da `PropField.tsx`) vanno aggiunti
  al Property Inspector. Il Canvas React (non air-gapped) deve approssimare visivamente i
  quattro comportamenti CSS-only per il WYSIWYG — non garantito per costruzione, da testare
  per ciascun widget.

## Rischi

- **Parità WYSIWYG editor↔output statico**: il Canvas React non ha il vincolo zero-JS ma
  deve comunque "sembrare" un accordion/tab/carousel/modale nativo — rischio di divergenza
  visiva se non testato esplicitamente per ciascun widget.
- **`<details name>` non universalmente supportato**: degrado accettabile (apertura
  multipla invece che esclusiva), da verificare che non produca un layout rotto sui browser
  che ignorano l'attributo, solo un comportamento diverso.
- **Accessibilità del modal `:target`**: nessun focus trap, nessuna chiusura da tastiera —
  limite del pattern, da scrivere in spec come nota per il Test Engineer.
- **Autoplay-in-loop e riordino voci**: la durata dell'animazione è calcolata sul numero di
  slide al momento della build; è rigenerata a ogni pubblicazione (stesso ciclo di ogni
  altro blocco statico), non un problema runtime.
- **Diciannove tipi nel registro**: sette voci in più da mantenere e migrare per sempre
  (ADR-21 § 3.5) — costo accettato esplicitamente dall'umano in cambio di contenuto per
  voce non degradato.

## Decisione umana

**Esito**: [x] Approvato · [ ] Rifiutato · [ ] Modificato

**Opzione scelta — interattività**: [x] CSS-only per tutti e quattro · [ ] Altro

**Opzione scelta — composizione props**: [x] A — sette tipi a children, nessun nuovo `kind`
· [ ] B — quattro tipi, nuovo `kind: 'itemList'` · [ ] Altro

**Note**: "L'Opzione B (itemList) è un compromesso mediocre che degrada tab, accordion e
caroselli a semplici contenitori di testo piatto, impedendo l'inserimento di immagini,
bottoni o layout annidati. Per un Page Builder di livello enterprise, la composizione ad
albero tramite children (Opzione A) è l'unico standard architetturale accettabile e
coerente con ADR-21 e ADR-39." Direttiva data dall'umano in sede di task, confermata
esplicitamente come firma valida (stesso pattern di autorizzazione di
ADR-38/47/50/51/52/53).

**Approvato da**: marketing@antelmagroup.net · **Data**: 2026-09-05

**Azione successiva**: [x] Genera ADR-57 · [ ] Archivio
