# RFC-37 — Scheda "Avanzato": layer di impilamento e visibilità per breakpoint

## Status
[ ] In discussione · [x] Approvato → genera ADR-37 · [ ] Rifiutato

## Proposto da
AI Orchestrator · Data: 2026-08-26

## Problema

È stato chiesto di estendere lo schema dei blocchi con una terza scheda "Avanzato"
nell'ispettore, che porti Z-Index, "Scoped Custom CSS" e tre interruttori di visibilità
per breakpoint (`hideDesktop`/`hideTablet`/`hideMobile`), più una forma
`styles.responsive: { tablet?: Partial<StyleProps>, mobile?: Partial<StyleProps> }` per
gli override di stile per breakpoint. Il compito è stato bloccato prima
dell'implementazione perché tocca `docs/ai/adr/ADR-21-schema-blocchi-versionamento.md`
(schema e versionamento dei blocchi, ADR obbligatoria per `CLAUDE.md` § Architecture) e
`CLAUDE.md` § Ask first elenca esplicitamente "nuovo tipo di blocco o modifica schema
blocco esistente". Questa RFC è il passo che precede l'implementazione, non
l'implementazione.

Tre problemi di governance, non solo uno tecnico:

1. **La forma `styles.responsive` proposta contraddice una decisione già firmata.**
   `ADR-29-proprieta-di-stile-per-breakpoint.md` (approvata 2026-08-20) ha già scelto la
   forma per gli override responsive: l'oggetto `{ default, tablet?, mobile? }` vive
   **dentro il valore di ogni singola prop** (`EnumPropSpec` con `responsive: true`), non
   in un contenitore separato a livello di blocco. ADR-29 § "Alternative scartate" boccia
   esplicitamente "Props separate per breakpoint" perché "triplica le props dichiarate,
   rende la cascata implicita e non verificabile" — un `styles.responsive.tablet` con un
   `Partial<StyleProps>` dentro è la stessa famiglia di forma, con lo stesso difetto: due
   fonti di verità per lo stesso stile (la prop base e l'override), invece di un valore
   solo per prop.

2. **`customCss` è un'alternativa già scartata in ADR-29, per iscritto, con motivazione
   esplicita**: *"Una stringa CSS libera per blocco — superficie di iniezione
   nell'attributo `style`, non vincolabile con lo schema attuale, e deriva di design
   senza ritorno."* Riproporla richiede di indirizzare quella motivazione con una
   soluzione tecnica diversa, non di ripeterla.

3. **Il `kind` di prop è un insieme chiuso** (`app/backend/src/blocks/prop-spec.types.ts`,
   riga 12): `richText | plainText | number | boolean | enum | url | mediaRef | color`.
   ADR-21 § 4 è tassativo: *"Estendere l'insieme dei `kind` è 'nuovo schema di blocco' ai
   fini di `CLAUDE.md` § Ask first: richiede firma."* Un CSS libero, anche scoped,
   avrebbe bisogno di un `kind` nuovo (nessuno dei kind esistenti valida/sanitizza un
   frammento CSS) — la firma più costosa del repository, per citare ADR-29 § 3.

## Soluzione proposta

Punto per punto, con la raccomandazione dell'Orchestrator dichiarata come tale — non
un'implementazione, una proposta su cui l'umano decide.

### 1. Niente namespace `styles.advanced` / `styles.responsive` nell'envelope

**Raccomandazione**: restare sulla convenzione già in produzione (ADR-29, ADR-30, ADR-33)
— ogni prop è una voce piatta di `props`, prefissata `style` per convenzione leggibile
(`styleSpaceBefore`, `stylePadding`, `styleTextColor`, …), mai un oggetto annidato
`styles.*`. Introdurre un secondo livello di struttura per "avanzato" e un terzo per
"responsive" sarebbe una seconda convenzione di forma accanto a quella di ADR-29, per lo
stesso concetto (stile di un blocco) — esattamente il tipo di frattura che ADR-29 § 7 ha
già segnalato come scostamento consapevole e unico. Gli override per breakpoint delle
props nuove, se richiesti, riusano il modificatore `responsive?: boolean` già esistente su
`EnumPropSpec` (ADR-29 § 3): stesso meccanismo, zero forma nuova.

### 2. Z-Index → token enum, non numero libero

**Raccomandazione**: `styleLayer`, `kind: 'enum'`, valori chiusi (es.
`base | raised | overlay | top`) mappati a z-index reali nel foglio dei token CSS, non
scritti dal contenuto. Motivazione, in continuità con ADR-29 § 1 ("ogni valore è un
token, mai una misura"): `NumberPropSpec` oggi non ha vincolo di intervallo — il commento
nel codice lo dichiara esplicitamente ("Nessun vincolo di intervallo... aggiungerlo
richiederebbe un nuovo `reason` e quindi una revisione della spec") — quindi un intero
libero per z-index permetterebbe valori come `999999` che rompono lo stacking di chrome
Mantine (modali, drawer, notifiche) senza alcuna difesa nello schema. Un `kind: 'enum'`
riusa il contratto di sanitizzazione esistente (nessuna riga nuova in ADR-21 § 4 tabella).
Non responsive per default in questo round (lo stacking non cambia tipicamente per
breakpoint) — apribile in un round successivo col solo modificatore `responsive: true`,
se un caso d'uso reale lo richiede.

### 3. Visibilità per breakpoint → tre boolean props indipendenti, non un `responsive` su `boolean`

**Raccomandazione**: `styleHideDesktop`, `styleHideTablet`, `styleHideMobile` —
`kind: 'boolean'`, `default: false`, scalari, non responsive. A differenza degli altri
casi ADR-29 (dove il breakpoint è un override dello *stesso* concetto — uno spazio, un
colore — e la forma `{default, tablet, mobile}` mantiene le tre varianti sotto un'unica
verità), qui i tre interruttori sono concetti indipendenti fin dall'origine: nascondere su
mobile non ricade in cascata da desktop, è un'affermazione a sé. Tre props scalari
evitano di introdurre un `responsive` modifier su `BooleanPropSpec` (un meccanismo nuovo
in un `kind` che oggi non lo porta) per ottenere una cascata che, semanticamente, non
esiste fra questi tre valori: è la stessa alternativa "props separate per breakpoint" che
ADR-29 scarta per gli enum, qui accettata proprio perché il difetto che la faceva
scartare — cascata implicita fra varianti dello stesso valore — non si applica.

### 4. `customCss` — non raccomandato in questo round, resta fuori

**Raccomandazione**: non implementarlo ora. Riaprirlo richiederebbe *due* firme separate,
non una: (a) un `kind` nuovo nell'insieme chiuso, con un profilo di sanitizzazione da
progettare da zero — un parser CSS reale (non regex/allowlist di stringhe) capace di
forzare ogni regola dentro `[data-block-id="{id}"]`, rifiutare `@import`, `url(...)` con
schema non-`data:`/relativo, `expression()`, `behavior:`, e qualunque selettore che esca
dallo scope; (b) verosimilmente una dipendenza npm nuova per quel parser (es. una libreria
di CSS parsing/AST), anch'essa in `CLAUDE.md` § Ask first ("dipendenze npm pesanti").
Il trattamento coerente con la costituzione è lo stesso già riservato al blocco HTML/embed
da ADR-21 § 5: **resta disabilitato finché non esiste un'ADR dedicata**, che tratti la
sanitizzazione da sola e non come una riga fra tante di questa RFC. Implementarlo qui
significherebbe far rientrare dalla porta di servizio l'alternativa che ADR-29 ha già
respinto dalla porta principale.

### 5. Terza scheda "Avanzato" nell'ispettore

**Raccomandazione**: estendere l'unione chiusa `tab?: 'content' | 'style'` di
`BlockEditorPropMeta` (`app/backend/src/blocks/block-definition.types.ts` riga 25, ADR-30
§ 1) a `'content' | 'style' | 'advanced'`. È un'estensione incrementale dello stesso
meccanismo già approvato — ADR-30 § 5 descrive "due schede" come lo stato di quel round,
non come un tetto ("L'ispettore deriva la propria struttura dai metadati"): una terza
scheda con lo stesso pattern (raggruppamento per `meta.props[...].tab`, mai per
`prop.type`) non richiede una nuova ADR-30, solo l'estensione del literal union e delle
voci `meta.props` delle due props nuove (`styleLayer`, `styleHideDesktop/Tablet/Mobile`)
con `tab: 'advanced'`. Un tipo senza props avanzate non mostra la scheda vuota — stesso
vincolo di ADR-30 § 5 già in vigore per "Stile".

### 6. `v` e migrazione

Props nuove, opzionali, con default (`false` per i booleani, valore token di base per
`styleLayer`) → nessun incremento di `v`, nessuna migrazione, stesso ragionamento di
ADR-29 § 5: il validatore accetta una prop dichiarata e assente, il contenuto già salvato
resta valido così com'è.

### 7. Sanitizzazione (ADR-21 § 4)

Nessuna riga nuova nella tabella dei `kind`: `styleLayer` è `enum` (validato per
appartenenza a lista), `styleHideDesktop/Tablet/Mobile` sono `boolean` (validati per
tipo). Nessuno dei due passa da `sanitize-html` perché nessuno dei due è testo.

## Alternative valutate

| Opzione | Pro | Contro | Motivo scarto |
|---|---|---|---|
| `styles.advanced`/`styles.responsive` come proposto originariamente | Aderente 1:1 alla richiesta | Contraddice la forma già firmata in ADR-29 §2; introduce una seconda convenzione di stile nello stesso registro | Frattura di forma non giustificata da un beneficio tecnico nuovo |
| `customCss` con sanitizzazione regex/allowlist "leggera" | Nessuna dipendenza npm nuova | Una regex non è un parser: non garantisce lo scoping né blocca in modo affidabile `@import`/`expression()`/selettori che escono dal blocco — la stessa superficie di iniezione che ADR-29 ha già respinto | Falsa sicurezza: sembra chiudere il rischio, non lo chiude |
| `styleLayer` come `NumberPropSpec` libero | Più espressivo, valore in px/unità diretta | Nessun vincolo di intervallo nello schema attuale (dichiarato nel codice); un valore libero rompe lo stacking di Mantine senza difesa | Contraddice ADR-29 §1 ("token, mai una misura") |
| `responsive: true` su `BooleanPropSpec` per la visibilità | Simmetrico ad `EnumPropSpec`, un solo oggetto `{default,tablet,mobile}` | Introduce un meccanismo nuovo per una cascata che semanticamente non esiste fra i tre interruttori (indipendenti, non varianti dello stesso valore) | Complessità senza il beneficio che giustifica il meccanismo in ADR-29 |

## Impatto

**Backend** (`app/backend/src/blocks/`): `prop-spec.types.ts` invariato (nessun `kind`
nuovo); `block-definition.types.ts` riga 25, unione `tab` estesa a `'advanced'`; ogni
`*.block.ts` che vuole le props avanzate aggiunge `styleLayer` (`EnumPropSpec`) e le tre
`styleHideDesktop/Tablet/Mobile` (`BooleanPropSpec`) più le relative voci `meta.props`
con `tab: 'advanced'`. Nessuna migrazione DB, nessun incremento di `v`. Rigenerazione
obbligatoria `blocks:export` + `blocks:types` (gate CI `blocks-sync`). Il test di
invariante del registro (ADR-30 § 4) deve restare verde. `customCss` **non** viene
implementato: nessun impatto backend per quella parte.

**Frontend**: `PropertyInspector.tsx` aggiunge la terza scheda seguendo lo stesso
raggruppamento per `meta.props[...].tab` di ADR-30 § 5 (nessuna logica per tipo di
blocco); `useBlockEditorStore.ts` non necessita di un percorso di scrittura diverso per le
props avanzate — sono props come le altre, scritte con lo stesso azione di update già
esistente per `EnumPropSpec responsive`/`BooleanPropSpec`; il foglio dei token CSS cresce
delle classi `styleLayer`/visibilità (per breakpoint via media query, come già fa ADR-29
per le altre props responsive). Nessun endpoint nuovo o modificato: nessun impatto su
`openapi.yaml` o `bruno/`.

**Test**: test di invariante del registro esteso automaticamente (nuove props
enumerate); unit test sul default (nodo senza le props nuove → nessun override di layer,
nessuna visibilità nascosta, invariato); test dedicato che verifica che le tre props di
visibilità siano indipendenti (impostarne una non tocca le altre due, né tocca `styleLayer`
o le altre props di stile esistenti).

## Rischi

1. **Scope creep sull'editor visivo**, il punto che `CLAUDE.md` § Orchestrator segnala
   come rischio concentrato. Questa RFC lo contiene limitando il round a `styleLayer` +
   3 props di visibilità + estensione della scheda; `customCss` è escluso esplicitamente,
   non implicitamente, proprio per non farlo rientrare come "già che c'è aggiungiamo
   anche quello".
2. **Se l'umano vuole comunque `customCss`**, questa RFC non lo consegna: serve una RFC
   dedicata che affronti la scelta del parser CSS, il profilo di scoping, e la nuova
   dipendenza npm come propria decisione — non una riga di questa.
3. **Divergenza dalla richiesta originale sulla forma dei dati** (punto 1): se l'umano
   in approvazione vuole comunque la forma `styles.responsive` come originariamente
   specificata invece della cascata ADR-29, questa RFC non la consegna così com'è — andrebbe
   riscritta come proposta di **superseding di ADR-29**, con le sue conseguenze sulle
   props di stile già in produzione (`stylePadding`, `styleBackground`, …, tutte già
   salvate nella forma `{default, tablet, mobile}` dentro la prop).

## Decisione umana
**Esito**: [x] Approvato · [ ] Rifiutato · [ ] Modificato

**Note**: Approvata così com'è, raccomandazioni 1-7.

**Approvato da**: marketing@antelmagroup.net · **Data**: 2026-08-26

**Azione successiva**: [x] Genera ADR-37 · [ ] Archivio
