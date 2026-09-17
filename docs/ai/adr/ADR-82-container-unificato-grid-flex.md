# ADR-82 — Container unificato: deprecazione di `section`, `container` v2 (Grid 12 colonne, Flexbox, min-height, shape divider, tag semantici)

## Status
[x] **In discussione** · [ ] Approvato · [ ] Rifiutato · [ ] Superseded da ADR-XXX

## Data approvazione
_In attesa di firma umana — vedi "Decisione umana" in fondo a questo documento._

## RFC di riferimento
Nessuna RFC dedicata: round **R2 — Container unico, grid, position** di
`docs/PLAN-parita-elementor-pro.md`, § T1/T2/T7. Riferimenti sostanziali:
`docs/SPEC-propkind-v2.md` § 4.1/§ 4.2/§ 6, `docs/ai/specs/SPEC-PROPKIND-V2-DETAILS.md`.

## Numerazione
`PLAN-parita-elementor-pro.md` § "Riepilogo" assegnava a R2 il numero **81** ("container v2"), in
continuità con "R0 = 73–79". Come già corretto da `ADR-74` § "Numerazione" (R0 → 74–80) e da
`ADR-81` § "Numerazione" (R1 → 81, non 80), questa ADR occupa il numero successivo libero:
**ADR-82**.

## ADR di riferimento (non superate, non modificate)
- `ADR-39-*.md` (approvata, container v1 flex-only) — resta storica: `container` `v: 1` dichiarava
  solo `display: 'flex'`, nessuna prop di stile, nesting ricorsivo (`children.allow: '*'`). Questa
  ADR estende quello schema con `v: 2`, non lo riscrive.
- `ADR-41-*.md` (approvata, padding/margin per lato su `container`) — le prop `stylePadding*`/
  `styleMargin*` scalari che introduce sono fra quelle sostituite da `margin`/`padding: spacing` qui
  (§ "Decisione" punto 4), stessa logica di migrazione di `ADR-81`.
- `ADR-33-*.md`/`ADR-50-*.md` (approvate, `section` origine e sfondo) — restano storiche, lette solo
  per il contesto: `section` non riceve più prop nuove da questo punto in avanti (§ "Decisione"
  punto 2).
- `ADR-21-schema-blocchi-versionamento.md` § 3/§ 5 — meccanica di migrazione e regola "un tipo nuovo
  richiede firma"; questa ADR introduce un caso che quella non aveva previsto esplicitamente: la
  migrazione **cross-type** (`section` → `container`), trattata al § "Decisione" punto 3.
- `ADR-81-migrazione-propkind-v1-v2.md` — stesso principio di migrazione difensiva, applicato qui a
  un salto di `type` oltre che di `v`.
- `docs/ai/specs/SPEC-PROPKIND-V2-DETAILS.md` — `background`, `position`, `transform`, `filter`,
  `radius` sono i `kind` che `container` v2 consuma; questa ADR non ne ridefinisce la forma.

---

## Contesto

`ELEMENTOR_PRO_GAP_ANALYSIS_v2.md` § 1.2 chiude la voce `section`/`container` con un'istruzione
esplicita: *"Unificare `section` → `container` (Elementor 3.6+ ha un solo contenitore)"*. Il
registro attuale (`app/backend/src/blocks/types/section.block.ts`,
`app/backend/src/blocks/types/container.block.ts`) porta invece due tipi paralleli con superfici
di stile in parte duplicate (`styleBackgroundColor`, `styleColor`, `stylePadding*`/`styleMargin*`
identiche carattere per carattere fra i due file) e in parte divergenti (`section` ha `columns`/
`columnRatio`/`styleBackground`/`contentWidth`/`styleLayer`/`styleHideDesktop`+`Tablet`+`Mobile`/
`styleBorder`/`styleShadow`/l'intero blocco di 9 prop sfondo di ADR-50; `container` ha solo
`display`/`flexDirection`/`justifyContent`/`alignItems`/`wrap`/`gap`/`styleFlexBasis`). Mantenerli
separati significa scrivere due volte ogni prop nuova (`background` unificato, `position`,
`transform`, grid) e mantenere per sempre l'ambiguità "quale contenitore uso" che Elementor stesso
ha eliminato nella propria versione 3.6.

Il vincolo tecnico che rende questa unificazione più di un semplice refactoring di superficie è che
`section` e `container` **sono tipi diversi** nel registro (`ADR-21` § 2: `type` è l'identificativo
stabile di un nodo). Una migrazione `v1 → v2` nel senso di `ADR-21` § 3 presuppone lo stesso `type`
lungo la catena; qui l'esito voluto è che un nodo `{ type: 'section', ... }` diventi un nodo
`{ type: 'container', v: 2, ... }` — un cambio di identità, non solo di forma. `ADR-21` § 3.6 aveva
già anticipato il caso opposto ("un cambiamento che non si esprime come funzione pura non è un
cambio di versione: è un tipo nuovo, il vecchio resta nel registro `deprecated`"), ma non aveva
dovuto specificare come si tratta una migrazione che **unisce** due tipi esistenti in uno solo:
questa ADR colma quel vuoto.

Il secondo vincolo tecnico è la profondità e il numero di nodi ammessi: `app/backend/src/pages/
content-tree.ts` fissa oggi `MAX_DEPTH = 5` e `MAX_NODES = 500`, scelti quando `section` non
conteneva `section` (profondità 1 per costruzione, `ADR-21` § 5) e il nesting di `container` era
limitato dall'assenza di un vero layout a griglia. Un `container` v2 con Grid 12 colonne e nesting
libero (colonna → container → colonna → widget) rende una profondità di 5 insufficiente per layout
realistici a più livelli (es. sezione → riga → colonna → card → icon-box, già 5 livelli senza
contare la pagina stessa).

---

## Decisione

1. **Un solo tipo per il layout: `container`, `v: 2`.** Sostituisce integralmente il ruolo di
   `section` come contenitore principale di pagina. Prop dichiarate (`SPEC-propkind-v2.md` § 4.1):
   - `tag: enum` (`div|section|header|footer|article|aside|nav|main`, default `div`) — sostituisce
     l'assenza di semantica HTML di entrambi i tipi v1: nessuno dei due dichiarava un tag, il markup
     era sempre `<div>` per costruzione del renderer.
   - `layout: { display: 'flex'|'grid', direction, wrap, justify, align, gap: {x,y},
     gridTemplateColumns, gridTemplateRows, autoFlow, justifyItems, alignItems }`, intero oggetto
     `responsive` (non i singoli campi: un cambio di `display` da `flex` a `grid` per breakpoint è
     un caso raro ma la forma unica per l'intero oggetto evita 9 envelope indipendenti per un guadagno
     di granularità che nessun requisito chiede). `display: 'grid'` è la ragione per cui questa ADR
     esiste e non poteva aspettare un'estensione di `ADR-39`: `ADR-39` § "Decisione" aveva escluso
     `'grid'` esplicitamente per l'assenza di `gridTemplateColumns`/`Rows` nel proprio schema — qui
     entrambi sono dichiarati, quindi il vincolo che aveva motivato l'esclusione non c'è più.
   - `gridTemplateColumns`/`gridTemplateRows`: **non** una stringa CSS libera (che riaprirebbe
     esattamente la superficie che `ADR-78` regola con `kind: 'css'`) — un valore chiuso a due forme:
     `{ preset: 'repeat'; count: 1–12 }` (emette `repeat(<count>, 1fr)`) oppure un array di 1–12
     `GridTrackValue` (`{ value: number; unit: 'fr'|'px'|'%' } | 'auto'`, `value` con lo stesso
     intervallo `[0, 4000]` già in uso per `styleWidth`/`styleHeight` di `container` v1). Il preset
     "12 colonne" richiesto dal titolo di questa ADR è quindi `{ preset: 'repeat', count: 12 }`, un
     valore fra i tanti ammessi, non un caso speciale nel validatore.
   - `contentWidth: 'boxed'|'full'`, `boxedWidth: UnitValue`, `minHeight: UnitValue` (px|vh),
     `overflow: 'visible'|'hidden'|'auto'`.
   - `background: background` (`stateful`), `border: border` (`stateful`, estensione di
     `BorderPropSpec`/`ShadowPropSpec` con il modificatore — § "Conseguenze"), `radius: radius`,
     `shadow: shadow` (`stateful`).
   - `padding`/`margin: spacing` — sostituiscono le 8 prop scalari `stylePadding*`/`styleMargin*` di
     entrambi i tipi v1 (stessa consolidazione di `ADR-81` § "Decisione" punto 2 per `margin` sui
     tipi foglia, applicata qui anche a `padding`).
   - `position: position`, `transform: transform` (`stateful`), `opacity: number` (0–1, già `kind`
     esistente), `filter: filter`.
   - `link: link`, `animation: animation`, `motion: motion` — dichiarate nello schema da questa ADR
     ma **non implementate a render** finché R5/R6 non introducono rispettivamente `meta.runtime`
     (`ADR-74`) e il bundle pubblico: uno schema che accetta il valore prima che il renderer lo onori
     non è una contraddizione, è la stessa sequenza già attraversata da `styleBackgroundType`
     "video"/"slideshow" dichiarati in `SPEC-propkind-v2.md` § 3.7 con implementazione rinviata a R5.
   - `shapeDividerTop`/`shapeDividerBottom: { style: enum (allowlist chiusa a 20 nomi, fissata
     nell'implementazione R2 T6 — questa ADR fissa solo che è un elenco chiuso, mai un upload SVG
     libero: coerente con la minimizzazione di superficie già scelta per le icone in `ADR-80` § 9,
     "mai un asset caricato dall'utente dove un allowlist chiusa basta"), color: colorRef, width:
     UnitValue, height: UnitValue, flip: boolean, invert: boolean, aboveContent: boolean }`.
   - `htmlId`, `cssClass`, `attributes`, `css`, `hideOn: BreakpointKey[]` — quest'ultimo sostituisce
     `styleHideDesktop`/`Tablet`/`Mobile` di `section` v1 (`container` v1 non li aveva mai
     dichiarati).
   - `children.allow: '*'` invariato rispetto a `container` v1: nesting libero, incluso
     `container` dentro `container`.

2. **`section` è deprecato, non rimosso.** `section.block.ts` resta nel registro con `enabled:
   false` (nascosto dalla palette, stesso meccanismo già usato dal registro per tipi non attivi) e
   `v: 1` invariato — nessuna prop nuova, nessuna correzione, è un binario morto mantenuto solo per
   leggibilità delle Revisioni esistenti (`ADR-19`, immutabilità). Coerente con `ADR-21` § 3.5 ("il
   vecchio resta nel registro, validabile in lettura, fuori dalla palette").

3. **La migrazione `section → container` è cross-type**, un caso non coperto letteralmente da
   `ADR-21` § 3 (che parla di `(type, v→v+1)` sullo stesso `type`). Questa ADR estende la pipeline
   di `ADR-21` con uno stadio esplicito: **prima** della catena di migrazione per-tipo (che opera a
   `type` invariato), un passaggio dedicato di "migrazione di identità" riscrive ogni nodo `{ type:
   'section', v: 1 }` in `{ type: 'container', v: 1 }` con le prop rimappate (tabella sotto), poi lo
   lascia proseguire nella normale catena `container` `v: 1 → v: 2` se necessario. Questo stadio vive
   nello stesso punto dell'`ADR-21` § 3.8 riservato all'"envelope, applicato prima delle migrazioni
   per nodo" — non è una terza catena, è un caso particolare di quella stessa fase, con la differenza
   che qui il campo che cambia è `type`, non solo la forma delle chiavi. La funzione
   (`migrateSectionToContainer`) è pura e totale come ogni altra migrazione di `ADR-21` § 3.6.

4. **Tabella di corrispondenza `section` → `container`** (`SPEC-propkind-v2.md` § 6):

   | Prop `section` v1 | Prop `container` v2 | Mappatura |
   |---|---|---|
   | `columns`/`columnRatio` | `layout.display`+`gridTemplateColumns` | `columns: '1'` → `layout.display:'flex'` (nessuna griglia necessaria per una sola colonna); `columns > '1'` → `layout.display:'grid'`, `gridTemplateColumns` da `columnRatio` (`equal` → `{preset:'repeat', count:<columns>}`; `33-66`/`66-33`/`30-70`/`70-30` → array esplicito di due `GridTrackValue` in `%` con quei due valori, ignorati se `columns !== '2'` — caso già "presentazione, non validazione" per `columnRatio` in v1, stesso principio riportato in avanti) |
   | `stylePadding`/`stylePaddingTop..Left` | `padding: spacing` | Se `stylePaddingTop..Left` (4 valori indipendenti) sono presenti, stessa regola di `ADR-81` § "Decisione" punto 2 riga `styleMargin*`; se solo `stylePadding` (token `none/sm/md/lg`) è presente, mappa a un valore uniforme in `px` dalla tabella `none→0, sm→8, md→16, lg→32` |
   | `styleBackground` (token) + `styleBackgroundColor`/`styleBackgroundType`/`Position`/`Size`/`styleGradientStart`/`End`/`styleBackgroundImageRef`/`styleOverlayColor`/`styleOverlayOpacity` (9 prop ADR-50) | `background: background` | Le 9 prop si consolidano in un solo `BackgroundValue` (`SPEC-propkind-v2.md` § 3.7): `type` da `styleBackgroundType` (default `'color'` se assente), `color`/`gradient`/`image` popolati dal ramo corrispondente, `overlay` da `styleOverlayColor`+`styleOverlayOpacity` se presente. Il token `styleBackground` (`none/subtle/accent/inverse`) quando **nessuna** delle 9 prop ADR-50 è valorizzata mappa a un colore letterale dalla stessa tabella di `ADR-81` (`subtle→'#f3f4f6'`, `accent→{ref:'accent'}`, `inverse→'#111827'`, `none` → `type:'none'`) |
   | `styleMarginTop..Left` | `margin: spacing` | Stessa regola di `ADR-81` § "Decisione" punto 2, riga `styleMargin*` |
   | `styleLayer` | `position.zIndex` | `base→0, raised→10, overlay→100, top→1000` (tabella fissata da `SPEC-propkind-v2.md` § 6), `position.type` resta `'default'` (`styleLayer` v1 non implicava un cambio di modello di posizionamento) |
   | `styleHideDesktop`/`Tablet`/`Mobile` | `hideOn[]` | Stessa regola di `ADR-81` § "Decisione" punto 2 |
   | `styleBorder`/`styleShadow` | `border`/`shadow` | Valore invariato (stessa forma, solo il modificatore `stateful` è ora disponibile e non retroattivamente popolato — nessun ramo `hover` da un valore v1 che non lo prevedeva) |
   | `contentWidth`/`maxWidth` | `contentWidth`/`boxedWidth` | `contentWidth` invariato (`boxed`→`boxed`, `full-width`→`full`); `maxWidth` (token `sm/md/lg/xl`) → `boxedWidth` in px dalla tabella `sm→640, md→1024, lg→1280, xl→1536` |
   | `alignItems`/`justifyContent`/`gap` | `layout.alignItems`/`layout.justify`/`layout.gap.x` (`gap.y` = stesso valore) | Invariati salvo l'incapsulamento dentro `layout` |
   | `customCssClass`/`customElementId` | `cssClass`/`htmlId` | Invariati, solo rinominati per coerenza col mixin "Avanzato" comune (`SPEC-propkind-v2.md` § 4.2) |

   I figli (`children`) non cambiano struttura: un nodo `section` con `children: [...]` diventa un
   nodo `container` con lo stesso array `children`, ricorsivamente migrato dalla stessa catena
   (ogni figlio è validato/migrato indipendentemente, `ADR-21` § 1).

5. **`MAX_DEPTH: 5 → 8`, `MAX_NODES: 500 → 1500`** in `app/backend/src/pages/content-tree.ts`.
   Entrambe le costanti si allentano, mai si stringono: nessun contenuto esistente diventa non
   valido (un albero già a profondità 4 resta valido a `MAX_DEPTH: 8`). Questo è l'unico verso in cui
   un cambio di questi limiti non è "un deploy a senso unico" nel senso di `ADR-21` § 1 (quello si
   applica a un `v` di schema, non a un limite di risorsa) — resta comunque un cambio da misurare: il
   benchmark del validatore (§ "Conformità") deve restare sotto la soglia NFR anche al nuovo massimo.
   `MAX_PAYLOAD_BYTES` (524 288, derivato da "500 nodi × ~1 KiB medio", commento in `content-tree.ts`
   riga 24) **non** si allenta in proporzione lineare (1 572 864 byte implicherebbe una crescita che
   nessun caso reale del gap analysis richiede oggi): questa ADR lo lascia invariato, da rivalutare
   solo se un benchmark concreto lo richiede.

6. **Il mixin "Avanzato" (`SPEC-propkind-v2.md` § 4.2) non è introdotto da questa ADR.** Il documento
   di riferimento lo dichiara "comune a ogni widget", non solo a `container`: definirlo qui
   duplicherebbe la decisione al momento in cui R4 (widget base) lo consuma per i propri tipi. Questa
   ADR fissa solo che le prop di `container` v2 elencate al punto 1 che coincidono con il mixin
   (`margin`, `padding`, `position`, `hideOn`, `animation`, `motion`, `transform`, `filter`,
   `opacity`, `border`/`radius`/`shadow`, `background`, `htmlId`, `cssClass`, `attributes`, `css`)
   sono le stesse che il mixin dichiarerà, non un sottoinsieme divergente — la coerenza è
   intenzionale, la definizione formale del mixin resta un task di R2 T3/R4.

---

## Alternative valutate

| Opzione | Pro | Contro | Motivo scarto |
|---|---|---|---|
| Mantenere `section`/`container` come due tipi paralleli, entrambi estesi con le nuove prop | Nessuna migrazione cross-type da progettare | Duplica ogni prop nuova (`background`, `position`, grid) in due schemi paralleli per sempre; contraddice esplicitamente `ELEMENTOR_PRO_GAP_ANALYSIS_v2.md` § 1.2 | Costo di manutenzione perpetuo senza beneficio, il gap analysis chiede l'unificazione esplicitamente |
| Un terzo tipo `grid` distinto da `container` (flex) | Nessuna estensione del validatore per un `display` a due valori | Elementor stesso ha unificato in un solo contenitore in 3.6+; introdurre un terzo tipo di layout va nella direzione opposta a quella richiesta e complica la palette con una scelta che l'utente Elementor non deve fare | Contraddice il modello di riferimento dichiarato dal committente |
| Rimozione immediata di `section` dal registro (hard deprecation) | Registro più pulito da subito | Viola `ADR-19` (Revisioni immutabili): ogni Revisione che referenzia `section` diventerebbe illeggibile, non solo "fuori palette" — un guasto sul pubblico (404 per contenuto pubblicato) che `ADR-21` § 3.7 vieta esplicitamente | Rottura diretta di due principi già firmati |
| Migrazione cross-type come una funzione dentro la catena `container` invece che come stadio dedicato prima di essa | Meno concetti nuovi nella pipeline | Una funzione `container` `v:1→v:2` non può ricevere in input un nodo `{type:'section'}`: la catena per-tipo di `ADR-21` § 3 è per costruzione indicizzata sul `type` del nodo, che qui deve cambiare prima che quella catena si applichi | Ordine logico impossibile senza lo stadio dedicato |
| Lasciare `MAX_DEPTH`/`MAX_NODES` invariati, contare sulla minore profondità media dei layout reali | Nessuna revisione dei limiti | Un layout Grid 12 colonne con card annidate (sezione→riga→colonna→card→icon-box) tocca già profondità 5 prima di qualunque nesting `container`-in-`container` aggiuntivo che il gap analysis richiede esplicitamente | Limite reale già insufficiente per il caso d'uso dichiarato |
| Stringa CSS libera per `gridTemplateColumns` invece di una forma chiusa | Massima fedeltà a "griglia CSS qualunque" | Riapre la superficie di iniezione che `ADR-78` regola con un `kind` dedicato (`css`) proprio perché una stringa CSS libera non è validabile a forma; qui non serve neppure quella libertà, 1–12 tracce coprono ogni preset Elementor | Superficie non necessaria, incoerente con `ADR-78` |

---

## Conseguenze

- `app/backend/src/blocks/types/container.block.ts` passa a `v: 2` con le prop elencate al § 1;
  `container.block.ts` `v: 1` diventa uno scalino della catena di migrazione (`migrateContainer
  V1ToV2`), permanente per `ADR-21` § 3.5.
- `app/backend/src/blocks/types/section.block.ts` guadagna `enabled: false`, nessuna nuova prop,
  `migrations: []` invariato (non ne ha bisogno: non migra più sé stesso, `migrateSectionToContainer`
  vive nello stadio di identità del § "Decisione" punto 3, non nella catena di `section`).
- `app/backend/src/pages/content-tree.ts`: `MAX_DEPTH = 8`, `MAX_NODES = 1500`, `MAX_PAYLOAD_BYTES`
  invariato — un commit che tocca solo queste due costanti, senza logica aggiuntiva.
- `BorderPropSpec`/`ShadowPropSpec` (`prop-spec.types.ts` righe 209-223) guadagnano il campo
  opzionale `stateful?: boolean` (coerente con `ADR-75` § "Decisione" punto 6, che li elenca fra i
  `kind` combinabili con lo stato) — estensione additiva, nessuna rottura dei descrittori esistenti
  che non lo dichiarano.
- `toCss()` (`SPEC-PROPKIND-V2-DETAILS.md` § 10) guadagna il ramo di emissione per `layout.display:
  'grid'` (`grid-template-columns`/`grid-template-rows`/`grid-auto-flow`/`justify-items` invece delle
  proprietà flex) e per `shapeDividerTop`/`Bottom` (un elemento decorativo assoluto con `svg`
  inline dall'allowlist a 20 nomi, non un `background-image`).
- L'inspector frontend guadagna un **Grid editor visuale** e l'estensione dell'handle di resize
  esistente (`ContainerResizeHandle`) a `minHeight`/`gap` — task di R2 T4/T5, non vincolato da questa
  ADR oltre alla forma dei dati che deve produrre.
- Nessuna modifica allo schema PostgreSQL: sia `container` v2 sia la migrazione di `section` vivono
  nel `jsonb` esistente.
- Il debito dichiarato: `link`/`animation`/`motion` su `container` sono accettati dal validatore
  prima che un renderer li onori (R5/R6) — un autore può salvare un valore che non produce ancora
  alcun effetto visibile, comportamento già accettato per `styleBackgroundType: 'video'`/`'slideshow'`
  in `ADR-50`/`SPEC-propkind-v2.md` § 3.7 con lo stesso schema di rinvio.

## Conformità

- Test della migrazione di identità: un nodo `{type:'section', v:1}` con ciascuna combinazione di
  prop della tabella al § "Decisione" punto 4 produce il `container` v2 atteso, incluso il caso
  `columns:'1'` → `layout.display:'flex'` e `columns:'3'` → `layout.display:'grid'`.
  `children` è preservato byte-per-byte a meno della migrazione ricorsiva dei figli stessi.
- Test su 40 alberi reali dal DB demo (`PLAN-parita-elementor-pro.md` § R2 T2): ogni albero contenente
  `section` migra senza eccezioni e senza nodi scartati.
- Benchmark validatore: un albero sintetico a `MAX_DEPTH: 8`/`MAX_NODES: 1500` valida in meno di
  50 ms (`PLAN-parita-elementor-pro.md` § R2 T7), CI gate.
- Test `gridTemplateColumns`: un valore `{preset:'repeat', count: 13}` (fuori range) e un array di
  13 `GridTrackValue` sono entrambi rifiutati con `reason: 'range'`/`reason: 'type'` sul path
  corretto; un valore stringa libero (es. `"1fr 1fr"`) è rifiutato con `reason: 'type'`.
- Test `MAX_DEPTH`/`MAX_NODES`: un albero già valido a profondità 5/500 nodi resta valido dopo
  l'innalzamento dei limiti (nessuna regressione), un albero a profondità 9 o 1501 nodi è rifiutato
  con lo stesso `tooDeep`/`tooManyNodes` già in uso, soglie aggiornate.
- Test `section` deprecato: un `POST`/`PATCH` che tenta di inserire un **nuovo** nodo `section` in un
  albero (non un nodo esistente da una Revisione precedente) è rifiutato dalla palette lato frontend
  (fuori scope del validatore backend, che continua ad accettare `section` in lettura per `ADR-21`
  § 3.7) — verificato con un test e2e che la palette dell'editor non offre più `section` come blocco
  inseribile.
