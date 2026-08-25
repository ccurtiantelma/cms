# RFC-31 — Layout Engine a colonne responsive per il blocco `Section`

## Status
[x] In discussione · [ ] Approvato → genera ADR-31 · [ ] Rifiutato

## Proposto da
AI Orchestrator · Data: 2026-08-23

## Problema

È stato chiesto di estendere lo schema del blocco `section` con tre nuove props —
`columns` (`1|2|3|4`), `gap` (`none|sm|md|lg`), `alignItems`
(`stretch|flex-start|center|flex-end`) — per un layout a colonne responsive, sia lato
editor (`PropertyInspector` con "selettori visivi") sia lato renderer (CSS Grid, wrap a 1
colonna sotto 768px). **ADR-31 non esiste**: l'ultima ADR approvata è ADR-30. Nessuna RFC,
spec o plan tratta oggi "colonne" o "layout engine" per `section`. Per
`docs/ai/adr/ADR-21-schema-blocchi-versionamento.md` § 5 e `CLAUDE.md` § Ask first,
qualunque modifica allo schema di un blocco esistente — incluse props opzionali nuove —
richiede una ADR e approvazione umana esplicita: questo documento è il passo che la
precede, non l'implementazione.

Lo schema attuale di `section` (`app/backend/src/blocks/types/section.block.ts`, `v: 1`)
dichiara solo le quattro props di stile responsive di ADR-29 (`styleSpaceBefore`,
`styleSpaceAfter`, `stylePadding`, `styleBackground`), tutte `EnumPropSpec` con
`responsive: true` e default `{ default: '...' }`, ciascuna con la propria voce in
`meta.props` (`tab: 'style'`, `order` 1–4). Nessuna prop di layout a colonne è dichiarata.

**Un secondo problema, di governance, precede quello tecnico.** `RFC-F04c-editor-maturo.md`
§ Decisione 4 ha deliberatamente escluso le colonne dal perimetro del round F04c,
insieme all'annidamento di `section`, al navigator e allo schermo intero, rinviandoli a un
round a sé (**F04d**) — con la motivazione esplicita: *"colonne senza navigator è un round
che consegna una capacità che nessuno userà bene"*, e la numerazione ADR liberata di
conseguenza ("le colonne prenderanno il numero libero al momento di F04d"). `docs/TODO.md`
§ "Prossimo passo consigliato" ribadisce che colonne, annidamento, navigator e schermo
intero restano un pacchetto unico, subordinato alla firma di **ADR-26** (oggi ancora "in
discussione", non approvata). Lo stato del working tree (`git status`) mostra però
`EditorStructureNavigator.tsx` e `FullScreenEditorLayout.tsx` come file nuovi non
committati: il navigator e la chrome full-screen — le due precondizioni di usabilità che
la Decisione 4 poneva — risultano già in costruzione, ma **senza un `RFC-F04d`/`PLAN-F04d`
che ne documenti perimetro e stato**. Questa RFC propone solo la forma dello schema delle
colonne; non decide se il momento di introdurle sia già arrivato o se debba attendere che
F04d sia formalizzato — è il primo punto che la decisione umana deve sciogliere.

Sette punti restano aperti e sono trattati singolarmente in "Soluzione proposta":

1. `columns`/`gap`/`alignItems` sono props di **contenuto** o di **stile**?
2. Forma del valore: scalare con auto-wrap CSS, o oggetto per-breakpoint dalla nascita
   (ADR-29 § 2)?
3. `kind` da usare — `enum` è l'unico compatibile col contratto di sanitizzazione chiuso di
   ADR-21 § 4?
4. La modifica è davvero senza incremento di `v` e senza migrazione?
5. Metadati d'editor (`meta.props`) per le tre props nuove, pena il test di invariante di
   ADR-30 § 4.
6. Icone per selettori visivi 1/2/3/4 colonne — esiste già l'infrastruttura?
7. Implementazione CSS: classi generate da variabili, mai `style` inline, soglia 768px.

## Soluzione proposta

### 1. Tab: `style`, non `content` — raccomandato, con lo scarto dichiarato

La richiesta originale parla di "Contenuto", ma `columns`/`gap`/`alignItems` non
aggiungono testo, media o link: sono scelte puramente presentazionali sullo stesso
registro di `stylePadding`/`styleBackground`, che ADR-29 tratta come stile pur trattando
anch'esse di spaziatura e disposizione. Nessun figlio del blocco viene assegnato a una
colonna specifica (vedi § "Rischi" sul flusso automatico): non è una scelta strutturale
sull'albero, è resa visiva dello stesso albero. **Raccomandazione: `tab: 'style'`** per
tutte e tre, in coerenza con ADR-29 e col precedente `PropertyInspector.tsx` (le schede
"Contenuto"/"Stile" sono un raggruppamento dei descrittori per `meta.props[...].tab`, non
per tipo — ADR-30 § 5). La menzione "Contenuto" nella richiesta originale è trattata qui
come descrizione imprecisa del compito, non come decisione: **va confermata o corretta
dall'umano in sede di approvazione.**

### 2. Forma del valore: oggetto per-breakpoint dalla nascita — raccomandato

ADR-29 § 5 è tassativo: la forma per-breakpoint va scelta *ora* perché aggiungerla dopo su
props scalari già salvate è un `v: 2` con migrazione — "un deploy a senso unico in cui il
rollback del backend esige il rollback dei contenuti". Le colonne sono il caso d'uso
canonico per un controllo per-breakpoint reale (3 colonne desktop, 2 tablet, 1 mobile è un
pattern comune, non un'eccezione), quindi il costo di *non* renderle responsive dalla
nascita sarebbe pagato quasi subito. **Raccomandazione: tutte e tre `responsive: true`**,
stessa forma di ADR-29 § 2 — `{ default, tablet?, mobile? }` — con lo stesso limite
dichiarato allora: l'interfaccia di questo round scrive solo il controllo `default`,
`tablet`/`mobile` restano raggiungibili solo via API finché non si chiude
`docs/TODO.md` § "Anteprima responsive" (debito già tracciato, non riaperto qui).

**Tensione da sciogliere esplicitamente.** La richiesta originale impone anche "wrap a 1
colonna sotto 768px" come se fosse una regola incondizionata. Le due letture non sono la
stessa cosa:

- **Opzione A (raccomandata)** — `columns` per-breakpoint con default del token `mobile`
  pari a `'1'` quando l'editor non sovrascrive: la cascata di ADR-29 § 2 (mobile assente →
  ricade su tablet → ricade su default) produce lo stesso risultato visivo del wrap
  automatico nel caso comune, ma resta **sovrascrivibile** — un editor può scegliere 2
  colonne anche sotto 768px se il contenuto lo richiede (es. due card strette). Coerente
  con ADR-29, nessuna eccezione al pattern.
- **Opzione B** — `columns` scalare, nessun controllo per breakpoint, e una regola CSS
  `@media (max-width: 768px)` che forza `grid-template-columns: 1fr` **sempre**,
  incondizionatamente. Più vicino alla lettera della richiesta ("wrap a 1 colonna sotto
  768px" come garanzia, non come default disattivabile), ma riapre esattamente il
  problema che ADR-29 § 5 ha chiuso: se in futuro serve un controllo per breakpoint su
  `columns`, è un `v: 2` con migrazione su tutto il contenuto già salvato.

Le due opzioni sono incompatibili con la stessa firma: l'ADR-31 deve sceglierne una.
Questa RFC raccomanda A per coerenza con ADR-29 e perché il costo di partenza (tre chiavi
invece di uno scalare) è, per ammissione della stessa ADR-29 § 5, "la struttura dati più
economica che esista" — ma segnala che A **non garantisce** il wrap a 1 colonna sotto
768px come vincolo assoluto, mentre B sì. **Decisione umana richiesta.**

`gap` e `alignItems` sono meno ovviamente bisognose di un controllo per breakpoint (uno
spazio fra colonne o un allineamento verticale che cambia da desktop a mobile è un caso
raro), ma per lo stesso principio di ADR-29 § 5 si raccomanda comunque `responsive: true`
su entrambe: il costo marginale è identico e la firma è la stessa comunque richiesta per
`columns`.

### 3. `kind: 'enum'` — nessuna eccezione possibile

Tutte e tre restano `EnumPropSpec` (`kind: 'enum'`), coerenti con ADR-21 § 4 e col
principio di ADR-29 § 1 ("ogni valore è un token, mai una misura"): `columns` è l'insieme
chiuso `['1', '2', '3', '4']` come **stringhe**, non `NumberPropSpec` — quest'ultimo
(`app/backend/src/blocks/prop-spec.types.ts` righe 60–62) non ha vincoli di intervallo
dichiarabili (nessun `reason` per un range numerico nell'insieme chiuso di
`BLOCK_PROP_INVALID`, per esplicita scelta di design), quindi un `NumberPropSpec` per
`columns` accetterebbe silenziosamente `47`. Zero impatto sul contratto di sanitizzazione:
un `enum` non passa da `sanitize-html`, `responsive: true` cambia solo la forma attesa del
valore, mai il `kind` (ADR-29 § 3).

Valori proposti:
- `columns`: `['1', '2', '3', '4']`, default `{ default: '1' }`
- `gap`: `['none', 'sm', 'md', 'lg']`, default `{ default: 'none' }`
- `alignItems`: `['stretch', 'flex-start', 'center', 'flex-end']`, default
  `{ default: 'stretch' }`

I default sono scelti per **zero regressione visiva**: `section.module.css` oggi è
`display: flex; flex-direction: column` (nessun gap, nessun `align-items` esplicito, che
di default vale `stretch` in flexbox). Un nodo `section` già salvato, senza queste tre
props, letto con i default proposti, produce `grid-template-columns: 1fr` (colonna
singola) più `align-items: stretch` e nessun gap — visivamente identico al rendering
attuale.

### 4. Zero incremento di `v`, nessuna migrazione — confermato

Come le quattro props di ADR-29, sono props opzionali (`required: false`) con `default`
dichiarato: `BasePropSpec` (`prop-spec.types.ts` righe 22–27) ammette esattamente questo
caso, e il validatore accetta una prop dichiarata e assente su un nodo esistente
(comportamento già in produzione per le quattro props di stile). `v` resta `1`,
`migrations` resta `[]`. Il token del registro (`type:v:migrations.length`, ADR-29 § 5) è
invariato: nessuna invalidazione della cache pubblica di ADR-23.

### 5. Metadati d'editor — obbligatori, altrimenti test rosso (ADR-30 § 4)

Le tre props devono comparire in `section.block.ts` → `meta.props`, proseguendo
l'ordinamento delle quattro esistenti (1–4):

```ts
columns:    { label: 'Colonne', tab: 'style', order: 5, help: 'Numero di colonne del contenitore' },
gap:        { label: 'Spaziatura tra colonne', tab: 'style', order: 6 },
alignItems: { label: 'Allineamento verticale', tab: 'style', order: 7 },
```

Etichette in italiano, coerenti con le quattro esistenti ("Spazio prima", "Sfondo", ecc.).
Senza queste voci il test di invariante del registro (ADR-30 § 4, che enumera le props
dichiarate e ne verifica la voce in `meta.props`) fallisce per costruzione — non è
opzionale.

### 6. Selettori visivi a icone — infrastruttura assente, MVP raccomandato senza

`PropertyInspector.tsx` (righe 227–259) rende **ogni** prop `kind: 'enum'` — responsive o
no — con un unico controllo Mantine `<Select>`: non esiste, in nessun punto del frontend,
un pattern di "selettore visivo a icone" per un valore enum. `ADR-30 § 6` ha introdotto
una mappa `nome icona → componente Tabler` (`ICON_MAP` in `BlockPalette.tsx`), ma quella
mappa risolve **l'icona del tipo di blocco** nella palette, non l'icona di un singolo
valore possibile di una prop — sono due problemi diversi. Un selettore a icone per
`columns` richiederebbe:

- un nuovo campo opzionale in `BlockEditorPropMeta` (es. `variant?: 'select' | 'icons'`
  più una mappa valore→icona), cioè **una seconda estensione dello schema dei metadati
  d'editor**, oltre a quella di ADR-30 — con la stessa formalità (ADR-30 ha già trattato
  l'introduzione di un campo opzionale nel blocco di metadati come parte della propria
  firma, non come rifinitura);
- un ramo nuovo nello `switch` di `PropertyInspector.tsx` (o un componente satellite) per
  renderizzare un `SegmentedControl`/gruppo di bottoni con icona invece del `<Select>`
  esistente.

**Raccomandazione MVP**: usare il `<Select>` esistente per tutte e tre le props, a costo
zero di codice frontend oltre ai metadati del punto 5 — è già la via percorsa per le
quattro props di ADR-29 e per ogni prop `enum` degli altri quattro tipi. I "selettori
visivi con icone" richiesti nel compito originale sono una rifinitura UX rimandabile: il
rischio di over-engineering è esplicitamente segnalato qui, coerente con l'indicazione che
il rischio di sovradimensionamento di questo progetto si concentra nell'editor visivo. Se
l'umano conferma di volerli comunque in questo stesso round, la RFC dovrebbe essere estesa
con la firma sul nuovo campo di `BlockEditorPropMeta` prima che diventi lavoro di
implementazione — **punto aperto per la decisione umana**, non deciso qui in autonomia.

### 7. Rendering CSS

`Section.tsx` passa da `flex` a **CSS Grid**: `grid-template-columns` deriva da classi
generate, mai da `style` inline (ADR-29 § 6). Nuovo blocco di token in
`style-tokens.module.css` (o file dedicato con lo stesso import pattern), sullo stesso
schema a tre parti già in uso (variabili `:root`, soglie di breakpoint esistenti — tablet
≤ 768px, mobile ≤ 480px, già dichiarate una sola volta nel repository per ADR-29 — e una
classe per combinazione prop/breakpoint/token):

```css
.columns_default_1 { grid-template-columns: repeat(1, 1fr); }
.columns_default_2 { grid-template-columns: repeat(2, 1fr); }
.columns_default_3 { grid-template-columns: repeat(3, 1fr); }
.columns_default_4 { grid-template-columns: repeat(4, 1fr); }
/* + columns_tablet_*, columns_mobile_* per la cascata (Opzione A) */
.gap_default_none { gap: 0; }
.gap_default_sm { gap: var(--cms-space-xs); }
/* ... */
.alignItems_default_stretch { align-items: stretch; }
/* ... */
```

`resolveResponsiveClassNames` (`app/frontend/src/components/blocks/style-tokens.ts`) è
già generico rispetto allo `slot`: si riusa senza modifiche per `columns`/`gap`/
`alignItems`, esattamente come per le quattro props esistenti. Nessun figlio di `section`
riceve un indice di colonna: il posizionamento nella griglia segue **l'ordine dei figli
nell'albero** (flusso automatico del grid), coerente con l'assenza, nello schema attuale,
di qualunque meccanismo di assegnazione per-figlio — introdurne uno sarebbe una modifica
più ampia, fuori dal perimetro di questa RFC (vedi "Rischi").

## Alternative valutate

- **Props scalari ora, responsive dopo** — scartata: è esattamente l'errore che ADR-29 § 5
  documenta come costoso, un `v: 2` con migrazione totale del contenuto salvato per
  risparmiare oggi tre chiavi.
- **`kind: 'number'` per `columns`** — scartata: nessun vincolo di intervallo dichiarabile
  con lo schema attuale (`NumberPropSpec` non ha `min`/`max`), accetterebbe valori fuori
  dall'insieme voluto senza un `reason` di validazione dedicato.
- **Tab `content` per le tre props** — considerata perché è la richiesta letterale del
  compito originale, ma scartata a favore di `style` per coerenza col precedente diretto
  di ADR-29 (props di disposizione/spaziatura → stile); resta comunque il punto più
  soggettivo di questa RFC e va confermato, non solo assunto.
- **Selettori visivi a icone in questo stesso round** — valutata e non raccomandata per
  l'MVP: richiede un secondo campo nuovo in `BlockEditorPropMeta` (oltre a quelli di
  ADR-30) senza benefici funzionali sopra un `<Select>` già esistente e già usato per
  ogni altra prop `enum` del registro.
- **Assegnazione esplicita di un figlio a una colonna** (un indice colonna per figlio) —
  non richiesta dal compito originale e non proposta qui: trasformerebbe `section` da
  contenitore a griglia con celle indirizzabili, un salto di complessità che il compito
  non giustifica e che riaprirebbe la discussione sull'annidamento già rinviata a F04d.
- **Procedere subito, ignorando la Decisione 4 di RFC-F04c** — non scartata ma segnalata
  come rischio di governance (vedi sotto): questa RFC non decide se il momento sia giusto,
  lo dichiara come domanda aperta per l'umano.

## Impatto

**Backend** (`app/backend/src/blocks/types/section.block.ts`): +3 `EnumPropSpec`
responsive, +3 voci `meta.props`. Nessuna migrazione DB, nessun incremento di `v`,
nessuna nuova migrazione di blocco. Rigenerazione obbligatoria `blocks:export` +
`blocks:types` (gate CI `blocks-sync`, ADR-21 § 2). Il test di invariante del registro
(ADR-30 § 4) deve essere eseguito e verde prima del merge. Nessun endpoint nuovo o
modificato: nessun impatto su `openapi.yaml` o su `bruno/`.

**Frontend**: `Section.tsx` passa da flex a grid; `Section.module.css` aggiorna la classe
base; `style-tokens.module.css` cresce di un blocco di token nuovo (3 props × fino a 4
token × fino a 3 breakpoint, se Opzione A). `PropertyInspector.tsx` non richiede modifiche
se si adotta il `<Select>` esistente (punto 6); le richiede se si sceglie il selettore a
icone. Nessuna modifica a `BlockPalette.tsx`.

**Test**: unit test sul default (nodo senza le tre props → griglia a 1 colonna, invariato
visivamente); test di invariante del registro esteso automaticamente (enumerazione delle
props); se Opzione A, un test dedicato sul modello di ADR-29 T8 — salva un valore con
tutti e tre i breakpoint di `columns`, rilegge identico, verifica sull'HTML prodotto che
le classi di tutti e tre i breakpoint siano presenti — per lo stesso motivo per cui
ADR-29 lo richiede: un renderer che ne dimentica uno perde contenuto salvato in silenzio.

## Rischi

1. **Conflitto di sequenza con `RFC-F04c-editor-maturo.md` § Decisione 4.** Le colonne
   sono state deliberatamente escluse dal round precedente e rinviate a F04d, in blocco
   con navigator e schermo intero, con la motivazione che le colonne senza una superficie
   di navigazione dell'albero sono "una capacità che nessuno userà bene". Il navigator e
   la chrome full-screen risultano in costruzione (file non committati:
   `EditorStructureNavigator.tsx`, `FullScreenEditorLayout.tsx`) ma **non esiste ancora un
   `RFC-F04d`/`PLAN-F04d`** che ne dichiari perimetro e stato di completamento. Approvare
   questa RFC prima che F04d sia formalizzato rischia di consegnare le colonne prima che
   la superficie che le rende usabili sia effettivamente pronta e documentata. Non è un
   rischio tecnico: è un rischio di processo, e va sciolto esplicitamente dall'umano
   (procedere ora vs. attendere e fondere questa RFC nel piano di F04d).
2. **Perdita silenziosa di contenuto responsive**, stesso rischio dichiarato in ADR-29
   Conseguenza: se si sceglie l'Opzione A e un renderer futuro (o una modifica
   dell'ispettore) emette solo la classe `default` ignorando `tablet`/`mobile`, il valore
   salvato non si perde dal database ma smette di produrre effetto — un guasto che non dà
   errore. Mitigato dal test dedicato indicato in "Impatto".
3. **Flusso automatico dei figli nella griglia.** L'ordine visivo nelle colonne coincide
   con l'ordine dei figli nell'albero, senza possibilità di assegnare un figlio a una
   colonna specifica. È una scelta di semplicità deliberata (vedi "Alternative valutate"),
   ma va comunicata come limite noto dell'MVP, non scoperta in uso: un editor che si
   aspetta di "trascinare in una colonna" trova invece un contenitore che si limita a
   avvolgere N colonne intorno all'ordine esistente.
4. **Crescita del foglio dei token.** Stesso freno naturale già osservato da ADR-29
   Conseguenza — il moltiplicatore ×3 per breakpoint si applica anche qui; con `columns`
   a 4 valori più `gap` a 4 più `alignItems` a 4, il foglio cresce di un altro blocco
   comparabile a quello di ADR-29 per dimensione.
5. **Tensione irrisolta su "wrap a 1 colonna sotto 768px"** (punto 2 della soluzione
   proposta): se l'ADR-31 approva l'Opzione A senza notare esplicitamente che il wrap
   automatico diventa un *default sovrascrivibile* e non una garanzia assoluta, il
   comportamento realizzato potrebbe non corrispondere all'aspettativa implicita nella
   richiesta originale.

## Decisione umana
**Esito**: [x] Approvato · [ ] Rifiutato · [ ] Modificato

**Note**: Approvate le raccomandazioni della RFC senza scarti: tab `style` per tutte e tre
le props (punto 1); forma per-breakpoint dalla nascita, Opzione A — cascata di ADR-29 § 2,
wrap a 1 colonna sotto 768px come default sovrascrivibile, non garanzia assoluta (punto 2);
`kind: 'enum'` (punto 3); zero incremento di `v` (punto 4); metadati d'editor come da
tabella RFC (punto 5); nessun selettore a icone in questo round, `<Select>` esistente
(punto 6). **Rischio 1 (conflitto di sequenza con RFC-F04c Decisione 4) risolto con
override esplicito**: si procede ora, prima che F04d sia formalizzato in un
RFC-F04d/PLAN-F04d dedicato e prima della firma di ADR-26. Il navigator e la chrome
full-screen restano lavoro in corso non coperto da RFC propria — debito di governance
dichiarato, non richiuso da questa decisione.

**Approvato da**: marketing@antelmagroup.net · **Data**: 2026-08-23

**Azione successiva**: [x] Genera ADR-31 · [ ] Archivio
