# RFC-38 — Espansione schema blocchi per parità di controlli con Elementor Pro

## Status
[x] In discussione · [ ] Approvato → genera ADR-38 · [ ] Rifiutato

## Proposto da
AI Orchestrator · Data: 2026-08-26

## Problema

È stata chiesta l'introduzione di 4 nuovi `PropKind` (`color`, `unitValue`, `shadow`,
`border`) più due campi avanzati universali (`customCssClass`, `customElementId`) su
tutti e cinque i tipi di blocco, per colmare i gap P0 individuati in
`docs/ELEMENTOR_PRO_GAP_ANALYSIS.md` (stile libero, bordi, ombre, CSS custom). La
richiesta include implementazione diretta nel registro backend.

Questo tocca `ADR-21-schema-blocchi-versionamento.md` (schema e versionamento,
ADR obbligatoria per `CLAUDE.md` § Architecture) e `CLAUDE.md` § Ask first elenca
esplicitamente "nuovo tipo di blocco o modifica schema blocco esistente". `prop-spec.types.ts`
riga 8-11 è tassativo: *"Estenderlo è 'nuovo schema di blocco' ai fini di `CLAUDE.md`
§ Ask first — richiede firma, non si aggiunge qui."* Questa RFC precede l'implementazione,
non la sostituisce.

Tre osservazioni tecniche emerse leggendo il registro attuale, non presenti nella richiesta
originale:

1. **`color` esiste già.** ADR-33 § 3 lo ha introdotto (`HEX_COLOR_PATTERN`, solo hex 3/6
   cifre), unico uso reale oggi `section.styleBackgroundColor`. Non è un `kind` da
   aggiungere: è un `kind` da **riusare** su altri tipi (`heading.styleTextColor`,
   `richText.styleTextColor`, ecc.) — zero rischio di schema nuovo, stesso pattern fisso
   già validato.

2. **`unitValue` come proposto (`{value:number, unit}`) contraddice una decisione già
   firmata.** `ADR-29-proprieta-di-stile-per-breakpoint.md` § 1: *"ogni valore è un token,
   mai una misura"*. `ADR-37-scheda-avanzato-layer-visibilita.md`, tabella alternative
   scartate, boccia esplicitamente `NumberPropSpec` libero per `styleLayer` con
   motivazione tecnica concreta: *"nessun vincolo di intervallo nello schema attuale... un
   valore libero romperebbe lo stacking di Mantine senza difesa."* Un `unitValue` genuinamente
   libero (numero + unità, nessun range) è esattamente la "misura libera" già respinta due
   volte, non un concetto nuovo. Introdurlo qui — dentro una RFC di "parità Elementor" —
   sarebbe far rientrare dalla porta di servizio un'alternativa già bocciata dalla porta
   principale, lo stesso schema di rischio che RFC-37 § "Alternative" ha segnalato per
   `customCss`.

3. **`shadow` e `border` sono un cambio di categoria nell'interprete, non solo due `kind`
   in più.** Ogni `kind` esistente (`prop-spec.types.ts`) ha un valore scalare (stringa,
   numero, booleano) o — per `enum` con `responsive:true` — uno scalare per breakpoint.
   `BlockPropSanitizerService.sanitizeProp` (`app/backend/src/common/sanitizer/
   block-prop-sanitizer.service.ts` riga 114) ha una guardia esplicita:
   `if (typeof value !== 'string') return value;` — un valore oggetto oggi **bypassa
   silenziosamente** la sanitizzazione. `shadow: {x,y,blur,spread,color}` e
   `border: {width,style,color,radius}` sono i primi valori non-scalari del registro:
   servono (a) un validatore di forma annidata (oggi il validator fa solo
   tipo/appartenenza-a-enum su uno scalare), (b) una sanitizzazione per-campo dentro
   l'oggetto (il campo `color` interno deve passare dallo stesso `HEX_COLOR_PATTERN`, i
   campi numerici hanno lo stesso problema del punto 2). Questa è una capacità nuova
   dell'interprete, non una riga nella tabella esistente.

## Soluzione proposta

Punto per punto, come RFC-37. Raccomandazione dichiarata come tale — decide l'umano.

### 1. `color` su altri tipi — nessun `kind` nuovo, solo riuso

**Raccomandazione**: aggiungere `styleTextColor` (`ColorPropSpec`, stesso
`HEX_COLOR_PATTERN`) a `heading` e `richText`; `styleBorderColor`/`styleShadowColor` (se i
punti 3/4 vengono approvati) riusano lo stesso kind. Zero righe nuove in
`prop-spec.types.ts`, zero righe nuove nella tabella di sanitizzazione. Rischio più basso
dell'intera RFC.

### 2. Valori liberi (px/%/em/rem/vw/vh) — non raccomandato come proposto; due alternative

**Raccomandazione**: **non** introdurre `unitValue` libero. Due strade compatibili con
ADR-29 § 1:

- **(a) Enum a scala, come oggi** (`styleFontSize: sm|md|lg|xl`) esteso con più gradini se
  la scala attuale è troppo rada — zero `kind` nuovo, nessuna supersede.
- **(b) `NumberPropSpec` con `min`/`max` obbligatori** (non libero: un intervallo
  dichiarato dalla prop stessa, es. `styleBorderRadius: {min:0, max:48}`) — richiede
  estendere `NumberPropSpec` con `min`/`max` e il `reason: 'range'` in
  `BLOCK_PROP_INVALID` (già previsto come lavoro futuro dal commento in
  `prop-spec.types.ts` riga 56-58). Questa è la strada che **non** contraddice ADR-29: il
  token diventa "un numero dentro un intervallo dichiarato", non una misura libera.

Se l'umano vuole comunque unità libere senza intervallo (vw/vh in particolare non hanno un
massimo sensato lato server), questa RFC non la consegna: servirebbe una RFC dedicata che
proponga esplicitamente il superamento di ADR-29 § 1, con le conseguenze sulle prop di
stile già in produzione — stesso trattamento che RFC-37 § "Rischi" 3 riserva a un caso
analogo.

### 3. `border` — nuovo `kind`, forma vincolata

**Raccomandazione, solo se il punto 2 è risolto con (b)**: `BorderPropSpec { kind:
'border'; width: {min:0,max:12}; style: 'solid'|'dashed'|'dotted'|'none'; color: hex;
radius: {min:0,max:48} }` — un solo `kind` nuovo, validato come oggetto a 4 campi fissi
(non un record aperto), ciascun campo con lo stesso rigore già in produzione per gli
scalari (style = enum chiuso, color = `HEX_COLOR_PATTERN`, width/radius = intervallo
dichiarato). Sanitizzazione: nessun campo passa da `sanitize-html` (nessun HTML), il
validator guadagna la capacità di validare un oggetto a forma fissa — un'estensione
dell'interprete, non solo del registro.

### 4. `shadow` — nuovo `kind`, stessa logica di `border`

**Raccomandazione**: `ShadowPropSpec { kind: 'shadow'; x: {min:-48,max:48}; y:
{min:-48,max:48}; blur: {min:0,max:64}; spread: {min:-24,max:24}; color: hex }`. Stesso
meccanismo di validazione a oggetto fisso di `border`. Consiglio di implementare `border` e
`shadow` con lo **stesso codice di validazione oggetto** (un solo pezzo di infrastruttura
nuova, riusato due volte), non due implementazioni parallele.

### 5. `customCssClass` / `customElementId` — non `plainText` con pattern generico

**Raccomandazione**: seguire lo stesso principio dichiarato per `color`
(`prop-spec.types.ts` riga 111-118: *"un pattern fisso e stretto, non un campo `pattern`
generico riusabile altrove"*) invece di aggiungere un campo `pattern?: string` configurabile
a `PlainTextPropSpec` — un `pattern` arbitrario scritto dal registro sarebbe una superficie
di configurazione che nessun altro `kind` ha, e andrebbe essa stessa validata come regex
sicura. Due `kind` nuovi, minimi:

- `CssClassNamePropSpec { kind: 'cssClassName' }` — un solo pattern fisso, es.
  `^[a-zA-Z_-][a-zA-Z0-9_-]{0,49}$` per token, 1-3 token separati da spazio singolo, somma
  ≤ 100 char. Nessuna sanitizzazione HTML: è validazione di forma, come `url`.
- `HtmlIdPropSpec { kind: 'htmlId' }` — stesso pattern ma un solo token, ≤ 50 char.

`meta.props[...].tab: 'advanced'` su tutti e 5 i tipi, stesso meccanismo di
`styleHideDesktop/Tablet/Mobile` in ADR-37 § 5 — nessuna quarta scheda, restano
nell'"Avanzato" già esistente.

### 6. `v` e migrazione

Tutte le props nuove sono opzionali, senza default obbligatorio → nessun incremento di `v`
per nessuno dei 5 tipi, stesso ragionamento di ADR-29 § 5 / ADR-37 § 6.

## Alternative valutate

| Opzione | Pro | Contro | Motivo scarto |
|---|---|---|---|
| `unitValue` libero come richiesto | Aderente 1:1 alla richiesta, parità visiva immediata | Contraddice ADR-29 § 1 e l'alternativa già scartata in ADR-37 (`NumberPropSpec` libero) | Stesso rischio concreto già documentato due volte: nessun vincolo di intervallo, valori patologici senza difesa |
| `customCssClass` come `plainText` + campo `pattern` generico | Un solo `kind` invece di due, riuso massimo | Introduce una superficie di configurazione (regex arbitraria nel registro) che nessun `kind` esistente ha — la regex stessa andrebbe validata come sicura | Contraddice il principio "pattern fisso, non generico" già dichiarato per `color` |
| `border`/`shadow` come stringa CSS libera (`box-shadow: ...`) validata da regex | Zero nuova infrastruttura di validazione oggetto | Stessa famiglia di rischio di `customCss`, già respinta in RFC-37: una regex non è un parser, non garantisce che il valore sia solo shadow/border e non altro CSS iniettabile | Falsa sicurezza, stesso motivo di scarto di RFC-37 |
| Tutto in un solo round (come richiesto) | Consegna rapida, un solo ciclo RFC→ADR | 5 `kind` nuovi in un colpo solo (contro 1 storicamente per ADR: `color` in ADR-33) — concentra il rischio "over-engineering editor visivo" che `CLAUDE.md` § Orchestrator segnala esplicitamente; nessuna delle 4 ADR precedenti ha introdotto più di un `kind`/concetto per volta | Scope più ampio di qualunque precedente in questo repository — vedi § Rischi |

## Impatto

**Backend** (`app/backend/src/blocks/`): `prop-spec.types.ts` guadagna fino a 5 `kind`
nuovi (`border`, `shadow`, `cssClassName`, `htmlId`, più eventuale `min`/`max` su
`NumberPropSpec`) — `color` riusato, zero righe. `validator/block-tree-validator.service.ts`
guadagna la prima capacità di validare un valore-oggetto a forma fissa (non solo scalare).
`common/sanitizer/block-prop-sanitizer.service.ts` guadagna un ramo per i `kind` oggetto
(oggi la guardia `typeof value !== 'string'` li farebbe passare invariati — comportamento
corretto solo se ogni campo interno è già stato validato a monte, da verificare con un test
esplicito). Ogni `*.block.ts` dei 5 tipi aggiunge le props avanzate universali
(`customCssClass`, `customElementId`) più le props di stile pertinenti al tipo. Nessuna
migrazione DB, nessun incremento di `v`. Rigenerazione obbligatoria `blocks:export` +
`blocks:types` (gate CI `blocks-sync`).

**Frontend**: nuovi controlli nell'ispettore per oggetto (border/shadow non hanno un
editor esistente — servono componenti Mantine nuovi, non solo un `ColorInput` in più).

**Test**: 8 scenari di dominio invariati, più: nodo con `border`/`shadow` a forma
malformata → 400 con path del campo interno colpevole (non solo del blocco); valore
oggetto con XSS nel campo `color` interno → sanitizzato/respinto identicamente allo
scalare; `customCssClass` con caratteri fuori pattern → 400, mai troncamento silenzioso.

## Rischi

1. **Scope concentrato in editor visivo** (`CLAUDE.md` § Orchestrator lo segnala
   esplicitamente come rischio di questo dominio). 5 `kind` nuovi in un solo round è 5 volte
   il ritmo storico di questo registro. Raccomandazione: **fasare** — round 1 (`color` su
   più tipi, `cssClassName`/`htmlId`, entrambi a rischio quasi nullo), round 2
   (`NumberPropSpec` con `min`/`max`), round 3 (`border`/`shadow`, che dipendono dal round
   2 ed è la parte con infrastruttura di validazione nuova).
2. **Conflitto diretto con ADR-29 § 1** se si procede con `unitValue` libero come
   letteralmente richiesto — questa RFC non lo consegna in quella forma. Se l'umano
   conferma di volere unità davvero libere (incluso `vw`/`vh` senza massimo), serve una RFC
   di supersede esplicita di ADR-29, non una riga di questa.
3. **Nuova classe di bug nel sanitizer**: il primo `kind` non-scalare del registro rompe
   un'invariante implicita (`typeof value !== 'string'` come guardia unica) mai stata messa
   alla prova. Un test insufficiente qui lascerebbe passare un oggetto `shadow`/`border`
   con un campo `color` non validato — la stessa classe di rischio che la sanitizzazione
   per-`kind` di ADR-21 § 4 esiste per prevenire.

## Decisione umana
**Esito**: [x] Approvato · [ ] Rifiutato · [x] Modificato

**Note**: Approvata la strada (b) del punto 2 — `NumberPropSpec`/campi numerici sempre con
`min`/`max` dichiarati, mai liberi: nessun supersede di ADR-29 § 1. `unitValue` è un `kind`
a sé (oggetto `{value, unit}`, `unit` da un elenco chiuso per prop, `value` vincolato da
`min`/`max` dichiarati dalla prop), non un `NumberPropSpec` esteso, perché il valore
composto value+unit è già l'oggetto non-scalare descritto al punto 3 — stessa
infrastruttura di validazione a forma fissa di `border`/`shadow`. A differenza della
raccomandazione RFC (fasare in 3 round), l'umano ha scelto di consegnare tutti e 5 i `kind`
nuovi (`unitValue`, `border`, `shadow`, `cssClassName`, `htmlId`) più il riuso di `color`
in un solo round/ADR — rischio di concentrazione (§ Rischi 1) accettato consapevolmente,
non riproposto in fasi separate.

**Approvato da**: marketing@antelmagroup.net · **Data**: 2026-08-26

**Azione successiva**: [x] Genera ADR-38 · [ ] Archivio
