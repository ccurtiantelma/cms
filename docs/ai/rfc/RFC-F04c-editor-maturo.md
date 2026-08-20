# RFC-F04c — Editor maturo: drag & drop, stile per blocco, metadati d'editor

## Status
[x] **In discussione — seconda versione** · [ ] Approvato → genera ADR-28/29/30 · [ ] Rifiutato

## Proposto da
AI Orchestrator · Data: 2026-08-20 (v1) · **riscritta il 2026-08-20 (v2)**

---

## Cosa cambia rispetto alla v1 di questo documento

La v1 è stata fermata prima della scrittura delle ADR. Quattro correzioni, tutte
richieste per iscritto e tutte recepite qui:

1. **Le props di stile nascono per breakpoint, non scalari** (Decisione 2 riscritta). Una
   prop di stile che cambia *forma* dopo la nascita rompe `v: 1` su tutto il contenuto già
   salvato; nascere corretta costa una struttura dati in più, non una migrazione.
2. **Nuova decisione sui metadati d'editor unificati nel registro** (Decisione 3), che
   assorbe la voce 3.10 di `docs/TODO.md` e impone un ispettore **a schede**, non a lista
   piatta.
3. **Duplica blocco** e **indicatore di rilascio del drag** entrano nel perimetro
   (Decisione 4).
4. **Colonne e annidamento di `section` escono dal round** e vanno a F04d insieme a
   navigator e schermo intero (Decisione 4).

Restano **invariate e confermate**: la Decisione 1 (`dnd-kit`) e la collocazione di ADR-27
dentro il round / ADR-26 fuori (qui Decisione 5).

**Effetto sulla numerazione delle ADR**: la v1 destinava ADR-30 ad «annidamento di `section`
e colonne». Quel lavoro esce dal round e **non conserva il numero**: ADR-30 è ora «metadati
d'editor nel registro dei blocchi». Le colonne prenderanno il numero libero al momento di
F04d — un numero riservato a un'ADR che nessuno scrive è solo un buco nella sequenza.

---

## Problema

L'editor di F04 (più l'upgrade F04b) compone e riordina un albero di blocchi, ma tre cose
mancano perché sia una base "in stile Elementor" che regga la crescita senza essere rifatta:

1. lo spostamento è **a pulsanti** (frecce, dentro/fuori), non a trascinamento, e non esiste
   il comando più usato di un editor del genere — **duplicare** un blocco;
2. un blocco **non ha alcuna proprietà di presentazione**: nessuna spaziatura, nessun colore,
   nessuna dimensione di testo — il registro dichiara solo props di contenuto;
3. l'ispettore mostra il **nome tecnico** delle props in una **lista piatta**: sostenibile con
   due props per tipo, inutilizzabile con nove.

Nessuna delle tre si può iniziare senza firma: la prima è una dipendenza npm nuova
(`CLAUDE.md` § Ask first; `roadmap.md` § F04 chiede già una ADR per la libreria di drag &
drop), la seconda e la terza sono modifiche al contratto del registro dei blocchi (ADR-21
§ 4: l'insieme dei descrittori di prop è chiuso e vale come contratto di sanitizzazione;
ADR-21 § 2: il registro non porta alcun contratto di rendering).

Questo documento contiene **cinque decisioni** con l'opzione consigliata. Non è un piano:
il piano operativo (`docs/ai/plans/PLAN-F04c-editor-maturo.md`) vale solo dopo
l'approvazione, e nessuna riga di codice — né alcuna installazione di pacchetto — precede
quella firma.

---

## Fase A — Audit dello stato reale

Verificato nel codice del repository, non nei documenti. Ogni affermazione qui sotto è
ricontrollabile al file indicato.

### A.1 — Cosa espone oggi il registro (`app/backend/src/blocks/`)

- **Cinque tipi**, tutti `v: 1`, `migrations: []`, `enabled: true`, nessun `minRole`, nessun
  `deprecated`: `section`, `heading`, `richText`, `image`, `button`
  (`blocks/types/*.block.ts`). `ROOT_ALLOWED` li comprende tutti e cinque.
- **`section` è l'unico contenitore**, con `props: {}` — qualunque prop inviata produce
  `BLOCK_PROP_NOT_DECLARED` — e `children.allow: ['heading','richText','image','button']`:
  **`section` non contiene `section`**.
- **`PropSpec` è un insieme chiuso di sette `kind`** (`richText`, `plainText`, `number`,
  `boolean`, `enum`, `url`, `mediaRef`, in `prop-spec.types.ts`). Il descrittore **non ha**
  un campo `pattern`, **non ha** vincoli di intervallo numerico, **non ha** un `kind` di
  lista/array né di oggetto annidato. Ne segue che (a) un colore libero in esadecimale non
  è validabile con lo schema attuale, (b) **un valore composito — come un oggetto per
  breakpoint — non è esprimibile senza toccare il descrittore** (è il punto su cui la
  Decisione 2 chiede una firma).
- **Il validatore** (`validator/block-tree-validator.service.ts`) è un solo interprete
  guidato dai descrittori: `switch` esaustivo su `spec.kind`, ogni ramo assume un **valore
  scalare** (`typeof value !== 'string'` → `reason: 'type'`). Respinge ogni prop non
  dichiarata, esige le `required`, e accetta senza rumore una prop dichiarata **opzionale e
  assente** — è il fatto che rende una prop nuova opzionale retro-compatibile con tutto il
  contenuto già salvato, senza migrazione.
- **`BlockPropInvalidReason` è a sua volta un insieme chiuso** (`required`, `empty`, `type`,
  `maxLength`, `enum`, `urlScheme`, `guidFormat`) dichiarato in `SPEC-F02-blocchi.md` § 4.1.
  Estenderlo significa revisionare una spec, cioè territorio umano: **la Decisione 2 è
  progettata per non averne bisogno.**
- **`BlockEditorMeta` esiste già** (`block-definition.types.ts`): `label` obbligatoria,
  `icon?`, `category?`, dichiarati **opachi alla validazione**. È l'innesto che la
  Decisione 3 estende — non ne inventa uno nuovo.
- **Limiti dell'albero** (`pages/content-tree.ts`): `MAX_DEPTH = 5`, `MAX_NODES = 500`,
  512 KB. Oggi la profondità reale è **2 per costruzione** (radice → `section` → foglia).
- **Il token del registro** (`computeBlockRegistryToken`) è l'hash di `type:v:migrations.length`
  di ogni definizione, e fa da prefisso alla chiave della cache pubblica (ADR-23 § 2): cambia
  con un `v` o un gradino di migrazione, **non** con l'aggiunta di una prop a `v` invariato.

### A.2 — Cosa consuma la palette e l'ispettore (`app/frontend/`)

- `types/blocks.types.ts` è **generato** (`blocks:export` → `blocks:types`) con gate CI
  `blocks-sync`: nessun elenco di tipi scritto a mano nel frontend. Le *interfacce* del
  contratto generato (`BlockPropDescriptor`, `BlockEditorMeta`, `BlockTypeDescriptor`) sono
  però **stringhe letterali dentro `generate-blocks-types.js`**, alla radice del repository:
  ogni campo nuovo del registro va aggiunto lì, o non arriva mai al frontend.
- **`BlockPalette.tsx`** costruisce le voci da `BLOCK_TYPES`, filtrando per
  `allowedChildTypes` + `enabled` + `deprecated` + `minRole`, raggruppa per
  `meta.category` — **usata grezza come etichetta di gruppo** — e calcola le props iniziali
  con `defaultPropsFor`, che scrive **tutte** le props dichiarate rispettando il `default`
  del registro. Una prop opzionale con `default` nasce quindi già valorizzata sui blocchi
  nuovi. **`meta.icon` è dichiarata nel registro e non è consumata da nessuno**: la palette
  disegna `IconPlus` per ogni voce.
- **`PropertyInspector.tsx`** è **un solo componente per tutti i tipi**, con uno `switch` su
  `prop.kind` e **mai** su `prop.type`, e una **lista piatta** di controlli in un unico
  `Stack`. `propLabel()` restituisce `prop.name` — il nome tecnico — perché *«il registro non
  ne porta una»* (voce 3.10 di `docs/TODO.md`, che indica già la soluzione corretta: i
  metadati d'editor del registro, non una mappa scritta nel frontend).
- **Cosa NON è generato**, e va toccato a mano per ogni tipo nuovo: lo `switch` di
  `components/blocks/BlockRenderer.tsx` e la mappa `CONTAINER_COMPONENTS` di
  `EditorBlockWrapper.tsx` (oggi la sola `section`). **È il costo reale di un tipo di blocco
  nuovo, e non si vede dal registro.**

### A.3 — Come funziona oggi la manipolazione dell'albero (F04b/T2, chiuso e testato)

- `block-tree.utils.ts` — funzioni pure, nessuna mutazione dell'input, structural sharing:
  `moveBlock(tree, id, 'up'|'down')`; `moveNodeTo(tree, id, targetParentId, index)` con
  `index` interpretato **sulla lista di destinazione dopo la rimozione**; `removeBlock`;
  `updateBlockProps`; `generateBlockId()`; un `cloneNode` **privato** che copia in profondità
  **conservando gli id**. Guardie strutturali già implementate: nodo inesistente, destinazione
  inesistente, destinazione = sé stesso o un proprio discendente, posizione invariata → no-op
  con **lo stesso riferimento**.
- `useBlockEditorStore.ts` — cinque azioni (`addBlockAction`, `moveBlockAction`,
  `moveNodeToAction`, `removeBlockAction`, `updateBlockPropsAction`), history **per patch**
  con comandi `apply`/`invert` chiusi sui soli parametri (mai uno snapshot dell'albero);
  `pushCommand` scarta i no-op; `savePoint` calcola `isDirty` in O(1). L'ammissibilità di
  tipo è letta dal registro con `block-registry.utils.ts::canContainType` — la stessa
  funzione usata dalla palette: **mai una regola scritta due volte**.
  La funzione privata **`addBlockAtExact(tree, parentId, index, node)`** reinserisce un nodo
  completo con id e sottoalbero a una posizione esatta: oggi serve solo all'inverso di
  `removeBlockAction`, ed è **esattamente la primitiva di inserimento che serve a "duplica"**.
- `EditorBlockWrapper.tsx` — frecce su/giù, "sposta dentro il blocco precedente", "porta
  fuori dal contenitore", eliminazione con conferma, inserimento posizionale sopra/sotto,
  palette "aggiungi dentro". Sottoscrizioni allo store **mirate per id**, `memo` sul solo `id`.
  **Nessun comando di duplicazione.**
- **Nessun drag & drop di alcun tipo.** Nessun pacchetto dnd in `app/frontend/package.json`;
  il server MCP Mantine non espone alcun componente o hook di drag & drop (l'unico risultato
  con "drag" è `Dropzone`, che riguarda i file).
- **Conseguenza che orienta le Decisioni 1 e 4**: né il drop né la duplicazione hanno bisogno
  di una via nuova di mutazione dell'albero. Il drop **è** `moveNodeToAction(id, targetParentId,
  index)`; la duplicazione **è** `addBlockAtExact` più una copia con id rigenerati, e il suo
  inverso **è** `removeBlock`. Tutte e tre le primitive esistono e sono testate.

### A.4 — Renderer condiviso e sito pubblico

`app/public-site` importa i componenti di blocco per alias di build (`@blocks`, ADR-22),
non ha JavaScript client, e `cssCodeSplit: false` estrae in un unico foglio il CSS
attraversato dalla catena di import. Il CSS dei blocchi oggi è **cinque regole in tutto**
(`display`, `margin: 0`, `max-width`, `line-height`, `flex-direction`): **non esiste alcun
vocabolario di token, e non esiste alcun breakpoint dichiarato da nessuna parte** — né in
`components/blocks/`, né nel sito pubblico. Una proprietà di stile responsive deve quindi
crearli entrambi: è la parte della Decisione 2 che non si vede a prima vista.

### A.5 — Scarti fra questo audit e i documenti (segnalati, non corretti)

| # | Scarto | Dove |
|---|---|---|
| 1 | «Prossimo passo consigliato» chiede ancora di **chiudere la voce 3.11**, che la riga 3.11 dello stesso file dà ✅ chiusa il 2026-08-20 (l'intestazione del file è ferma al 2026-08-19) | `docs/TODO.md` |
| 2 | La sezione «F04b — upgrade editor, a metà» dice «**Fatto, senza test**… Nessun test lo copre»: smentito dalla riga F04 della tabella nello stesso file e dai file su disco (`useUnsavedChangesGuard.test.tsx`, `e2e/tests/page-editor-undo-redo.spec.ts`) | `docs/ai/progress-tracker.md` |
| 3 | Il round F04b **non ha un plan** in `docs/ai/plans/`, ma il suo lavoro è citato per numero di task (T1/T2): una numerazione senza documento che la ancori | `docs/ai/progress-tracker.md` |
| 4 | **Tutte** le feature risultano «⏳ Da avviare», comprese F01/F02/F03/F04 chiuse | `docs/roadmap.md` |
| 5 | Lo scope dichiarato di F04 comprende «**anteprima responsive**» e «**presenza di altri editor via Socket.io**»: nessuna delle due è stata costruita e **nessuna voce di `TODO.md` le traccia** — scope uscito dal radar, non rinviato per iscritto | `docs/roadmap.md` § F04 |
| 6 | L'intestazione del contratto generato rimanda alla «decisione aperta sul consumer HTML pubblico (`docs/TODO.md` 1.9)», chiusa da ADR-22 il 2026-08-17. Il commento vive nel **generatore**, quindi si ripropone a ogni rigenerazione | `generate-blocks-types.js:52` → `app/frontend/src/types/blocks.types.ts` |

Lo scarto **5** guadagna peso in questa v2: la Decisione 2 introduce **props per breakpoint**
senza costruire l'**anteprima responsive** che permetterebbe di vederne l'effetto. È una
scelta deliberata (§ Decisione 2, «cosa resta fuori»), non una dimenticanza — ma se
l'anteprima resta fuori radar anche dopo questo round, si accumulano dati che nessuno può
verificare a occhio.

Lo scarto **6** non è cosmetico: quel commento afferma «nessun contratto di rendering nel
registro», che è il punto fermo di ADR-21 § 2 — ed è esattamente ciò che le Decisioni 2 e 3
mettono in discussione, ciascuna a modo suo.

---

## Decisione 1 — Drag & drop reale *(invariata dalla v1, confermata)*

### Consigliata: **`dnd-kit`** come strato di input sopra `moveNodeToAction`, con i pulsanti attuali conservati

Pacchetti: `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities` (tre, nel solo
`app/frontend`; `app/public-site` non li vede mai — non ha JavaScript client).

**Perché.** È headless: non porta un solo componente di UI, quindi non entra in conflitto
con «Mantine è obbligatoria per la chrome, nessuna seconda UI lib» — a differenza di
qualunque libreria che imponga i propri elementi. Regge il drop **dentro un contenitore**,
con collision detection sostituibile; e porta un sensore da tastiera, cioè un percorso
accessibile che il trascinamento da solo non ha.

**Perché il resto non cambia.** Il drop è `moveNodeToAction(id, targetParentId, index)`:
firma già esistente, già validata contro il registro, già invertibile in history, già
testata. Lo strato dnd calcola i tre argomenti e li passa. Non introduce una seconda via di
mutazione dell'albero — se lo facesse, sarebbe da rifiutare.

**Cosa cambia davvero:**
- `EditorBlockWrapper.tsx` — ogni nodo diventa `useDraggable` **e** `useDroppable`; la
  maniglia di trascinamento sta nella toolbar esistente (mai l'intero blocco: il click sul
  corpo deve continuare a selezionare). Servono zone di rilascio **fra** fratelli e una zona
  "dentro" sui contenitori, con l'indicatore visivo della Decisione 4.
- `EditorCanvas.tsx` — ospita il `DndContext` e il `DragOverlay`.
- **Store: nessuna azione nuova.** Si aggiunge un solo *predicato puro* riusabile
  (`canDropInto(tree, dragId, targetParentId)`), che compone il controllo di discendenza già
  in `moveNodeTo` con `canContainType` già in `block-registry.utils.ts`, per **mostrare** il
  rifiuto durante l'hover invece di scoprirlo con un no-op silenzioso al rilascio. Regola
  vincolante: lo stato del trascinamento in corso vive nel contesto della libreria, **mai**
  nello store Zustand — sarebbe uno `set()` per movimento del mouse su uno store da cui
  dipende tutto l'albero.
- **I pulsanti freccia/indent/outdent restano.** Sono l'unico percorso da tastiera già
  coperto dai test e dagli `aria-label` su cui poggiano gli helper e2e
  (`e2e/tests/helpers/page-editor.ts`): rimuoverli significherebbe riscrivere quella
  copertura per sostituirla con la forma di interazione più fragile da automatizzare.
- **Test**: il trascinamento a puntatore in Playwright richiede passi intermedi espliciti; la
  via deterministica è il **sensore da tastiera** di dnd-kit. Va messo in conto nel piano,
  non scoperto durante l'esecuzione.

> **Nota della v2**: con l'annidamento di `section` rinviato a F04d (Decisione 4), il ramo
> "discendente di sé stesso" di `canDropInto` è **irraggiungibile** con la profondità 2 di
> oggi. Il predicato lo compone comunque, e non per completismo: è la sede unica della
> regola, e F04d deve trovarla già scritta invece di riaprire il problema dentro un altro
> round. Il controllo di `MAX_DEPTH`, invece, **esce** da questo round insieme
> all'annidamento: oggi non esiste alcun drop che possa superarlo.

**Da verificare prima dell'installazione, non dopo** (primo task del piano, esito da
riportare): compatibilità dichiarata delle peer dependency con **React 19**. Se non fosse
soddisfatta, la decisione torna al tavolo invece di essere forzata con un override — il
`package.json` di root ne ha già quattro e non è il posto dove nascondere un problema.

### Alternative scartate

- **`@hello-pangea/dnd`** (fork mantenuto di react-beautiful-dnd) — l'annidamento
  contenitore-dentro-contenitore è il suo caso debole, e impone vincoli al DOM circostante
  (nessuna trasformazione sugli antenati) proprio dove il canvas dovrà crescere.
- **`@atlaskit/pragmatic-drag-and-drop`** — tecnicamente adatto e più leggero, ma l'adattatore
  React e le ricette di lista annidata sono a carico nostro: si paga in codice ciò che si
  risparmia in bundle.
- **Eventi HTML5 nativi, zero dipendenze** — è l'unica opzione che non richiede firma npm, e
  per questo va detta; ma niente touch, niente auto-scroll, niente tastiera, e gli indicatori
  di rilascio sono tutto il lavoro: si riscrive una libreria mediocre per non installarne una
  buona.
- **Sortable.js / react-sortablejs** — mutazione diretta del DOM sotto React, cioè la classe
  di bug che con un albero derivato da uno store non si chiude più.
- **Non fare drag & drop, migliorare i pulsanti** — è lo stato attuale: componibile ma non
  "in stile Elementor", che è l'obiettivo dichiarato del round.

> Approvata, questa decisione genera **ADR-28 — libreria di drag & drop**, che `roadmap.md`
> § F04 chiede già per iscritto.

---

## Decisione 2 — Props di stile che **nascono per breakpoint**

### Consigliata: **props di stile opzionali su scala di token chiusa, con valore a oggetto `{ default, tablet?, mobile? }` dal primo giorno, rese come classi CSS, tipi fermi a `v: 1`**

Questa è la correzione centrale della v2. La v1 proponeva token **scalari** (`'md'`), con
l'idea implicita che il responsive si sarebbe aggiunto dopo. Non si aggiunge dopo a costo
zero: **cambiare la forma di una prop già salvata è precisamente ciò che ADR-21 chiama un
incremento di `v` con migrazione**, cioè un deploy a senso unico su contenuto scritto da
persone reali. La forma corretta costa **una struttura dati in più oggi**; la forma
sbagliata costa **una migrazione domani** — e le due cose non sono paragonabili.

Che l'interfaccia di questo round esponga **solo il controllo desktop** non cambia la forma
del dato: è una scelta di superficie, reversibile in qualunque momento, e proprio per questo
non deve dettare lo schema.

#### Le sette props (sei righe: `spaceBefore` e `spaceAfter` condividono scala e collocazione)

| Prop | Scala di token | Su quali tipi |
|---|---|---|
| `styleSpaceBefore` / `styleSpaceAfter` | `none` `xs` `sm` `md` `lg` `xl` | tutti e cinque |
| `stylePadding` | `none` `sm` `md` `lg` | solo `section` |
| `styleBackground` | `none` `subtle` `accent` `inverse` | solo `section` |
| `styleTextColor` | `default` `muted` `accent` `inverse` | `heading` `richText` `button` |
| `styleFontSize` | `sm` `md` `lg` `xl` | `heading` `richText` `button` |
| `styleFontWeight` | `regular` `medium` `bold` | `heading` `richText` `button` |

Tutte **opzionali con `default`**, e il `default` dichiarato nel registro è **esso stesso un
oggetto**: `{ default: 'md' }`. Ogni valore è un **token**, mai una misura: il numero di
pixel vive nel CSS, non nel contenuto. `styleColumns` **non c'è più** — vedi Decisione 4.

#### La forma del valore, e i tre breakpoint

```jsonc
"styleSpaceBefore": { "default": "md", "tablet": "sm", "mobile": "xs" }
```

- **`default` è obbligatoria dentro l'oggetto**, `tablet` e `mobile` sono opzionali.
- I nomi dei breakpoint sono un **elenco chiuso dichiarato una volta nel backend**. Sono
  tre e si chiamano così: `default` (che significa "da tablet in su", non "desktop"),
  `tablet`, `mobile`. Chiamare il primo `desktop` inviterebbe un quarto nome `wide` che non
  avrebbe alcuna regola di cascata: `default` dice cosa fa davvero — **è il valore che vale
  ovunque non sia sovrascritto**.
- **Cascata verso il basso**: `mobile` assente ricade su `tablet`, `tablet` assente ricade
  su `default`. Una sola direzione, dichiarata qui e implementata in un solo punto (le media
  query `max-width` del foglio dei token).
- **I pixel dei breakpoint stanno nel CSS**, mai nel contenuto e mai nel registro: il
  registro dichiara i *nomi*, il foglio dei token dichiara le soglie.

#### Come si esprime nel descrittore, senza toccare l'insieme chiuso dei `kind`

Un **modificatore booleano `responsive` su `EnumPropSpec`**, non un `kind` nuovo:

```ts
export interface EnumPropSpec extends BasePropSpec {
  kind: 'enum';
  values: readonly string[];
  /** `true`: il valore è `{ default, tablet?, mobile? }`, ogni voce validata contro `values`. */
  responsive?: boolean;
}
```

Tre conseguenze, tutte volute:

1. **Il contratto di sanitizzazione non cambia.** ADR-21 § 4 lega la sanitizzazione al
   `kind`: un `enum` è validato per appartenenza a una lista e non passa da `sanitize-html`
   perché non è testo. Con `responsive` il `kind` resta `enum`, e resta vero anche per ogni
   voce dell'oggetto. Un `kind` nuovo avrebbe invece richiesto una riga nuova nel contratto
   di sanitizzazione — cioè la firma più costosa che esista in questo repository.
2. **Nessun `reason` nuovo nell'insieme chiuso di `BLOCK_PROP_INVALID`** (A.1), e quindi
   nessuna revisione di `SPEC-F02-blocchi.md`, che è territorio umano. Bastano i due `reason`
   esistenti, perché **è il `path` a portare l'informazione nuova**:
   - valore non oggetto, `default` mancante, o chiave fuori dai tre nomi → `reason: 'type'`
     sul path della prop;
   - token fuori dalla lista → `reason: 'enum'` sul path **della singola voce**, es.
     `blocks[0].children[1].props.styleSpaceBefore.tablet`.
   È coerente con la regola già in vigore: `details` porta il path del nodo colpevole, e un
   path più profondo è un path migliore, non un contratto nuovo.
3. **Lo `switch` esaustivo del validatore resta esaustivo**: il ramo `enum` si sdoppia in
   "scalare" e "per breakpoint" **dentro** il ramo, con la verifica del token estratta in una
   funzione sola usata da entrambi i percorsi. Nessuna regola scritta due volte.

#### Perché il resto della v1 regge invariato

- **Nessuna migrazione, nessun `v: 2`.** Il validatore accetta una prop opzionale assente;
  tutto il contenuto già salvato resta valido così com'è. Un incremento di `v` è per ADR-21
  § 1 un **deploy a senso unico** (il rollback del backend esige il rollback dei contenuti):
  pagarlo per un'aggiunta puramente additiva è tutto costo e nessun beneficio. **È anche
  l'intero motivo per cui la forma va scelta bene ora**: la prossima volta il conto arriva.
- **Token, non valori liberi.** Sicurezza: un valore libero finirebbe in un attributo
  `style`, e `PropSpec` **non ha** un campo `pattern` con cui vincolarne la forma (A.1) —
  l'unica difesa disponibile *è* l'elenco chiuso. Prodotto: sei valori di spaziatura
  producono pagine che si somigliano; un campo libero produce trentasette spaziature diverse
  e nessun tema che le possa riprendere.
- **Classi CSS, mai `style` inline.** I token si dichiarano una volta come variabili CSS in
  `components/blocks/`, dove l'alias `@blocks` li porta identici in admin e sul sito pubblico
  (ADR-22); una variabile CSS è anche il solo innesto su cui il tema di F09 potrà agire senza
  riscrivere il contenuto già salvato.

#### Il costo che la forma responsive porta con sé, detto prima e non dopo

1. **Il foglio dei token cresce di circa un centinaio di regole**: una classe per ogni
   combinazione (prop, breakpoint, token) — 2×6 + 4 + 4 + 4 + 4 + 3 token, per tre
   breakpoint. È CSS meccanico, scritto una volta, in un file solo; ed è **il motivo per cui
   le scale di token restano corte**: ogni valore in più si moltiplica per tre. Nessuna
   alternativa che eviti quel conto senza usare `style` inline, che è vietato.
2. **Il renderer deve emettere le classi di *tutti* i breakpoint presenti nel valore**, non
   solo `default`, anche se l'interfaccia di questo round scrive solo `default`: un renderer
   che ignora `tablet`/`mobile` **perde silenziosamente contenuto salvato**, ed è un guasto
   peggiore di qualche regola CSS inutilizzata.
3. **L'ispettore scrive in profondità**: modificare il controllo desktop significa
   `{ ...valore, default: nuovo }`, mai `nuovo`. Un solo punto, ma va scritto una volta bene.
4. **Non c'è modo di vedere l'effetto** finché non esiste l'anteprima responsive (A.5,
   scarto 5). Resta fuori: costruirla qui sfonderebbe il tetto di task. **La conseguenza
   dichiarata è che in questo round il responsive è dati corretti senza superficie**, ed è
   accettabile solo perché la superficie è additiva e i dati non lo sono.

#### Lo scostamento che richiede davvero la firma

ADR-21 § 2 dichiara che il registro **non** porta alcun contratto di rendering. Props di
stile lette dal renderer sono un contratto di rendering *parziale* che entra nel registro
dalla porta delle props. La forma proposta è la più difendibile (il registro dichiara un
*vocabolario*, il CSS decide cosa significhi), ma resta uno scostamento consapevole da
ADR-21 § 2 e appartiene alla ADR che questa decisione genera — non a una nota a piè di pagina.

### Alternative scartate

- **Token scalari ora, responsive dopo (la proposta della v1)** — è la forma che cambia dopo
  la nascita: `v: 2` più migrazione su tutto il contenuto salvato, cioè un deploy a senso
  unico, per risparmiare oggi una struttura dati di tre chiavi.
- **Responsive solo dove "serve davvero"** (spaziature e dimensione del testo sì, colori e
  peso no) — due convenzioni nello stesso pannello, e la prima richiesta di uno sfondo
  diverso su mobile riapre esattamente la migrazione che questa decisione evita.
- **Un `kind: 'responsiveEnum'` nuovo** — estende l'insieme chiuso dei `kind`, cioè il
  contratto di sanitizzazione (ADR-21 § 4), per ottenere ciò che un modificatore booleano su
  un `kind` esistente già dà.
- **Props separate per breakpoint** (`styleSpaceBeforeMobile`, …) — moltiplica per tre il
  numero di props dichiarate, la cascata diventa implicita e non verificabile, e l'ispettore
  la eredita come ventun campi in lista.
- **Una stringa CSS libera per blocco** — superficie di iniezione nell'attributo `style`,
  non vincolabile con lo schema attuale, e deriva di design senza ritorno.
- **Valori numerici liberi (`kind: 'number'`) per le spaziature** — `NumberPropSpec` non ha
  vincoli di intervallo (A.1): niente impedirebbe `margin-top: 9999`.
- **Stile fuori dal blocco, in un foglio per Pagina** — il blocco smette di essere portabile e
  il modello di contenuto (regola 2) perde di significato.
- **Rimandare tutto al tema di F09** — il tema decide i default, non l'istanza: sono due
  livelli, e questa decisione costruisce proprio quello che manca fra i due.

> Approvata, questa decisione genera **ADR-29 — proprietà di stile dei blocchi, per breakpoint**.

---

## Decisione 3 — Metadati d'editor unificati nel registro, e ispettore a schede

### Consigliata: **un solo blocco di metadati d'editor nel registro — etichetta, icona, categoria di palette, scheda dell'ispettore, ordine — opaco alla validazione, con l'ispettore che ne deriva la struttura**

È la decisione che la v1 non aveva, e senza la quale la Decisione 2 produce un pannello
inutilizzabile: con sette props di stile in più, `heading` passa da **due** controlli a
**nove**, tutti in una lista piatta, e cinque di essi si chiamano `styleSpaceBefore`.

#### Cosa entra nel registro

`BlockEditorMeta` esiste già ed è già dichiarata **opaca alla validazione** (ADR-21 § 2,
A.1). Si estende in un punto solo:

```ts
export interface BlockEditorPropMeta {
  label: string;               // etichetta leggibile — chiude la voce 3.10 di docs/TODO.md
  tab?: 'content' | 'style';   // scheda dell'ispettore; assente = 'content'
  order?: number;              // ordine dentro la scheda; assente = ordine di dichiarazione
  help?: string;               // riga di aiuto sotto il campo, facoltativa
}

export interface BlockEditorMeta {
  label: string;
  icon?: string;
  category?: string;
  props?: Record<string, BlockEditorPropMeta>;   // indicizzato per nome di prop
}
```

Quattro proprietà di questa forma, tutte deliberate:

1. **I metadati d'editor non entrano in `PropSpec`.** `PropSpec` è il descrittore di
   validazione *e* il contratto di sanitizzazione: mescolarci l'etichetta e la scheda
   significa che ogni `kind` cresce campi di presentazione e che chi legge lo `switch`
   esaustivo del validatore trova roba che il validatore deve ignorare. Restano **dove
   stanno già le cose opache**: dentro `meta`.
2. **`tab` assente vale `'content'`.** Le props di contenuto esistenti non vanno annotate
   una per una perché una decisione di questo round ha aggiunto una scheda.
3. **Una prop dichiarata senza voce in `meta.props` è un difetto, non un default silenzioso.**
   Altrimenti la voce 3.10 si riapre da sola alla prima prop nuova. Il presidio è un test di
   invariante sul registro — costo una funzione, chiude il problema per sempre.
4. **`meta.icon` smette di essere decorativa.** Oggi è dichiarata e non consumata (A.2). Un
   nome di icona non si può risolvere dinamicamente in un componente Tabler senza import
   dinamici: serve una **mappa esplicita nome → componente nel frontend**, con fallback su
   un'icona generica per un nome sconosciuto. È un costo reale, va detto — ma è il solo modo
   perché la palette smetta di disegnare `IconPlus` cinque volte.

#### Cosa cambia nell'ispettore

**Due schede, `Contenuto` e `Stile`**, costruite dai metadati e non da un elenco scritto a
mano. Resta **un solo `PropertyInspector.tsx`** che mappa su `prop.kind` e **mai** su
`prop.type`: le schede sono un raggruppamento dei descrittori *prima* dello `switch`, non
una seconda strada per tipo di blocco. Un tipo senza props di stile mostra **una scheda
sola** — mai una scheda vuota. Le etichette vengono da `meta.props[nome].label`, e
`propLabel()` smette di restituire il nome tecnico.

#### Perché è una decisione, e non una rifinitura da inserire in un task

Perché il registro acquisisce un **contratto di presentazione** verso il frontend: campi
nuovi nel contratto generato (quindi in `generate-blocks-types.js`, A.2), un'invariante
nuova che il registro deve rispettare, e una struttura dell'ispettore che da oggi è
**dettata dal backend**. È esattamente il genere di cosa che fra sei mesi qualcuno deve poter
contestare leggendo una pagina — cioè una ADR.

E perché la voce 3.10 di `docs/TODO.md` **indica già questa strada** («l'etichetta appartiene
ai metadati d'editor del registro, non a una mappa scritta nel frontend»): trattarla come un
task a sé significherebbe deciderla due volte, la seconda per sbaglio.

### Alternative scartate

- **Etichette e schede in una mappa nel frontend** — una prop nuova nel registro nasce di
  nuovo senza etichetta e nel posto sbagliato; è precisamente ciò che la voce 3.10 esclude.
- **Campi d'editor dentro `PropSpec`** — mescola il contratto di validazione/sanitizzazione
  con la presentazione, ed espone campi che il validatore deve ignorare proprio dove il
  validatore guarda.
- **Solo l'etichetta ora, schede e ordine dopo** — la lista piatta con nove campi è il
  problema *di questo round*, non del prossimo, e sarebbe un secondo giro sullo stesso file.
- **Ispettore a schede senza metadati, con l'euristica del prefisso `style`** — una
  convenzione di naming che nessuno può dichiarare né violare esplicitamente, e che si rompe
  alla prima prop di contenuto che si chiama `styleGuideUrl`.
- **Un componente ispettore per tipo di blocco** — è il vincolo strutturale che F04/T5 ha
  posto e che il file dichiara in testa: si perde la proprietà che una prop nuova nel
  registro compare senza toccare il frontend.
- **Sezioni fisse invece di schede** (due `Fieldset` uno sotto l'altro) — è l'alternativa
  seria: meno codice, nessuno stato di scheda attiva, tutto visibile insieme. Scartata
  perché con nove props il pannello diventa una colonna da scorrere, e la prop di contenuto
  che si cerca sta sempre sopra sette tendine di stile. Se in implementazione le schede
  Mantine si rivelassero un attrito, il ripiego è questo — e non è un cambio di decisione,
  perché i metadati che lo governano sono gli stessi.

> Approvata, questa decisione genera **ADR-30 — metadati d'editor nel registro dei blocchi**.

---

## Decisione 4 — Perimetro del round: cosa entra, cosa esce

### Consigliata: **entrano "duplica blocco" e l'indicatore di rilascio; escono colonne, annidamento di `section`, navigator e schermo intero (→ F04d)**

#### Entra: duplica blocco

Il comando più usato in un editor di questo tipo, e oggi assente (A.3). **Costo basso perché
tutte le primitive esistono**: una copia in profondità del sottoalbero con `generateBlockId()`
su ogni nodo, poi l'inserimento con `addBlockAtExact(tree, parentId, index + 1, copia)` —
la funzione che già serve all'inverso di `removeBlockAction`. L'inverso del comando è
`removeBlock(nuovoId)`: la stessa coppia, letta al contrario.

Tre regole che il piano deve imporre, perché sono i tre modi in cui questo si sbaglia:

1. **Id nuovi su tutto il sottoalbero**, non solo sulla radice della copia. Un id duplicato
   in profondità produce una selezione che salta e un `findNode` che restituisce il gemello
   sbagliato — un guasto che si manifesta lontano dalla causa.
2. **`MAX_NODES = 500` va controllato prima di inserire.** Duplicare è il solo comando che
   può aggiungere decine di nodi con un click, e l'editor deve dirlo **prima**, non lasciarlo
   scoprire al `400` del salvataggio.
3. **Il duplicato diventa il nodo selezionato.** È quello che l'utente sta per modificare;
   selezionare l'originale è una piccola bugia ripetuta ogni volta.

**Non dipende da `dnd-kit`**: se il gate della Decisione 1 si ferma, "duplica" si costruisce
lo stesso.

#### Entra: l'indicatore di rilascio

`dnd-kit` dà la meccanica, **non il linguaggio visivo**: senza, il trascinamento è un blocco
che segue il cursore e atterra dove il codice ha deciso, non dove l'utente credeva.
Il vocabolario minimo è di tre segni, e sono tre perché rispondono a tre domande diverse:

- **linea di inserimento** fra due fratelli — dice *dove* finirà;
- **evidenziazione del contenitore** per il drop "dentro" — dice *in cosa* finirà, ed è il
  confine che si sbaglia più spesso;
- **stato di rifiuto** quando `canDropInto` è falso — dice *che non finirà*, durante l'hover
  e non con un no-op silenzioso al rilascio.

Vincolo di implementazione: la linea è un **pseudo-elemento sulla zona di rilascio**, mai un
nodo inserito nel DOM dell'albero — un nodo vero sposta il layout e perturba la collision
detection che lo ha appena calcolato.

#### Escono: colonne, annidamento di `section`, navigator, schermo intero → **F04d**

La v1 proponeva `section` dentro `section` più `styleColumns`. Escono **entrambi**, e per la
stessa ragione: **una struttura annidata senza un albero navigabile si usa male**. Un
`section` dentro un altro, in un canvas piatto, è un blocco che l'utente vede ma non
localizza; le colonne lo peggiorano perché rendono l'annidamento la struttura *normale*
invece che l'eccezione. Navigator (l'outline dell'albero) e schermo intero sono la
superficie che li rende usabili — e non stanno in questo round.

Che escano insieme non è un accorpamento di comodo: **colonne senza navigator è un round che
consegna una capacità che nessuno userà bene**, e il tetto di otto task è già pieno con le
Decisioni 1–3 più quanto entra qui sopra.

Conseguenza sulla Decisione 1, già annotata: niente controllo di `MAX_DEPTH` in
`canDropInto` per ora, e il ramo "discendente" del predicato resta scritto ma irraggiungibile.

Conseguenza sulla Decisione 3: **nessuna.** Le schede dell'ispettore servono per le sette
props di stile, non per le colonne — e sarebbero servite comunque.

**Nota di ricomposizione**: la v1 giustificava l'esclusione del tipo `spacer` con l'esistenza
di `styleSpaceBefore`/`styleSpaceAfter`. Quella giustificazione **regge invariata**: le
spaziature restano nella Decisione 2. `spacer` resta fuori.

### Alternative scartate

- **Tenere l'annidamento di `section` senza `styleColumns`** — un'ora di lavoro (una riga in
  `children.allow`), ma consegna la struttura difficile da usare senza la ragione per cui
  serviva, e obbliga comunque il controllo di `MAX_DEPTH` dentro il drag & drop.
- **Tenere le colonne e rinviare "duplica"** — si consegna la capacità che ha bisogno di una
  superficie che non c'è, e si rinvia quella che ne ha bisogno di zero.
- **Costruire anche il navigator in questo round** — è il nono task, e sarebbe il primo a
  essere tagliato male sotto pressione.
- **"Duplica" solo dalla scorciatoia da tastiera, senza pulsante** — il comando più usato
  non si nasconde; e la toolbar del blocco esiste già.
- **Indicatore di rilascio rinviato alla rifinitura** — è il round in cui il drag & drop
  nasce: nascere senza linguaggio visivo significa consegnare l'interazione peggiore di
  quella a pulsanti che sostituisce.

> Questa decisione **non genera una ADR**: è perimetro di round, non architettura. Le colonne
> avranno la propria ADR quando F04d verrà scritto, con il numero libero a quel momento.

---

## Decisione 5 — ADR-26 (WYSIWYG) e ADR-27 (media pubblici) *(invariata dalla v1, confermata)*

Entrambe sono redatte, decise nel merito, **non firmate**, e senza una riga di codice
(verificato: nessun pacchetto Tiptap in `app/frontend/package.json`, nessuna rotta
`public/media` in `app/backend/src`).

### Consigliata: **ADR-27 dentro F04c, ADR-26 in un round a sé (F04d)**

**Perché ADR-27 dentro.** La Decisione 2 si giudica **a occhio, su una pagina vera**:
spaziature, sfondi e colori si approvano guardandoli. Finché `image` è un `<img>` senza
`src` — un rettangolo vuoto con un `data-media-ref` — la pagina di prova non è
rappresentativa e il round produce lavoro che nessuno può valutare. Il costo è contenuto e
tutto backend: una rotta pubblica in sola lettura, la verifica del MIME reale, una riga nel
componente `Image` per comporre l'URL. **Nessuna dipendenza nuova.**

**Perché ADR-26 fuori.** Porta cinque pacchetti npm con ProseMirror sotto, più il test che
dimostra il contenimento della toolbar nell'allowlist del profilo `basic` — cioè il vincolo
che ADR-26 § 3 chiede di rendere verificabile. È un round intero, e il suo rischio (peso
della dipendenza, allineamento con un profilo di sicurezza) non ha **nulla** in comune con
quello di questo. Metterle insieme significa un round in cui il fallimento di una qualsiasi
delle due blocca anche l'altra.

**Nota di sequenza, non di merito**: ADR-27 § 6 introduce `PUBLIC_MEDIA_BASE_URL` /
`VITE_PUBLIC_MEDIA_BASE_URL`. Sono due variabili d'ambiente nuove in `.env.example` e nella
configurazione dei container, **distinte da `PUBLIC_API_BASE_URL`** (che il sito pubblico usa
server-side e che in produzione può essere un host interno irraggiungibile da un `<img>`).
Vanno consegnate come deliverable nominato e verificato, non come effetto collaterale
invisibile di un altro lavoro.

### Alternative scartate

- **Tutte e due dentro F04c** — otto task già occupati: il round diventa "tutto quello che
  resta dell'editor" e nessuna delle parti si chiude bene.
- **Nessuna delle due** — `image` resta un segnaposto e la Decisione 2 non si può valutare su
  una pagina reale: si approva a scatola chiusa ciò che è nato per essere visto.
- **Solo ADR-26** — migliora la scrittura del testo mentre la pagina continua a non poter
  mostrare un'immagine: è l'ordine inverso rispetto a ciò che il round deve dimostrare.
- **ADR-27 rimandata a F09** — è il rinvio che l'ADR stessa già rifiuta: decide la sola
  lettura pubblica per `guid`, cioè il minimo che rende vero il blocco `image` senza
  costruire la libreria media.

---

## Impatto complessivo

- **Dipendenze npm nuove**: tre (`@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`),
  solo in `app/frontend`. `app/public-site` resta senza JavaScript client e senza Mantine.
- **Contratto del registro**: un modificatore `responsive?: boolean` su `EnumPropSpec`
  (**nessun `kind` nuovo**), un blocco `meta.props` di metadati d'editor (**opaco alla
  validazione**), sette props di stile opzionali. `generate-blocks-types.js` va aggiornato
  per entrambi, o i campi non arrivano al frontend.
- **Schema dei blocchi**: **nessun incremento di `v`, nessuna migrazione, nessun deploy a
  senso unico, nessun tipo di blocco nuovo, nessuna modifica a `children.allow`.** Ogni
  contenuto già salvato resta valido e leggibile.
- **Errori di validazione**: nessun `reason` nuovo, nessuna revisione di `SPEC-F02-blocchi.md`.
  Il `path` di `BLOCK_PROP_INVALID` può però ora scendere **dentro** una prop
  (`…props.styleSpaceBefore.tablet`): è un'estensione della granularità, non del contratto.
- **Cache pubblica (ADR-23)**: il token del registro **non** cambia (dipende da `v` e dalla
  lunghezza della catena di migrazioni, A.1), e non deve: l'interpretazione server-side del
  contenuto è identica. L'HTML pubblico è prodotto a ogni richiesta da `app/public-site`
  (ADR-22), quindi il CSS e le classi nuove sono attive al deploy senza alcuna invalidazione.
- **Pipeline obbligatoria**: ogni modifica al registro richiede `blocks:export` + `blocks:types`
  (gate CI `blocks-sync`); ADR-27 aggiunge un endpoint, quindi `openapi:export` +
  `openapi:types` + collezione Bruno.
- **Database**: nessuna migrazione, nessuna tabella, nessuna colonna. ADR-27 § 2 usa la
  colonna `entity` già esistente.
- **Debito che questo round assorbe**: la voce **3.10** entra nella Decisione 3 come parte
  della decisione, non come rifinitura — e con l'invariante che impedisce di riaprirla.
- **Debito che questo round crea, dichiarato**: props per breakpoint **senza anteprima
  responsive** con cui vederle (A.5 scarto 5). Va tracciato, non lasciato al radar.

## Rischi

1. **Peer dependency di `dnd-kit` con React 19** — da verificare **prima** dell'installazione;
   esito negativo = la Decisione 1 torna al tavolo, non si forza con un override.
2. **La forma responsive scritta a metà** — il rischio nuovo della v2, ed è il più serio:
   un renderer che emette solo `default`, o un ispettore che sovrascrive l'oggetto con uno
   scalare, produce **perdita silenziosa di contenuto salvato**. Mitigazione: un test che
   salva un valore con tutti e tre i breakpoint, lo rilegge e verifica l'HTML prodotto — non
   basta che il salvataggio non dia errore.
3. **Il drag & drop annidato è la parte che si sbaglia**: rilascio "fra due blocchi" contro
   "dentro il contenitore" sul confine di una sezione. Mitigazione: i tre segni della
   Decisione 4 e il predicato di ammissibilità mostrato durante l'hover.
4. **Prestazioni dell'editor** (NFR: 100 blocchi interattivi entro 2s) — lo stato del
   trascinamento non deve entrare nello store Zustand, altrimenti ogni movimento del mouse
   ridisegna l'albero. Vincolo, non raccomandazione.
5. **Scivolamento della Decisione 2 verso un editor di CSS** — la difesa è strutturale
   (`enum` a valori chiusi, nessun campo libero): finché ogni valore è un token, l'unico modo
   di allargare è una firma. Il moltiplicatore ×3 dei breakpoint è un secondo freno naturale.
6. **Duplicazione con id ripetuti in profondità** — guasto che si manifesta lontano dalla
   causa. Mitigazione: test che duplica un sottoalbero di tre livelli e verifica l'unicità di
   **tutti** gli id dell'albero risultante.
7. **Sovradimensionamento** — è il rischio dichiarato di F04 in `roadmap.md`. La Decisione 4
   lo affronta togliendo dal round ciò che la v1 ci aveva messo: se colonne, annidamento,
   navigator o schermo intero ricompaiono in fase di piano, è un cambio di scope, non un
   dettaglio.

---

## Decisione umana

Cinque esiti indipendenti, con **una** dipendenza dichiarata: respingere la Decisione 2
riapre il tipo `spacer` (che la v1 escludeva proprio in forza delle props di spaziatura) e
svuota per metà la Decisione 3, che resterebbe la sola voce 3.10.

| # | Decisione | Esito | ADR generata |
|---|---|---|---|
| 1 | Drag & drop — `dnd-kit` sopra `moveNodeToAction` *(confermata dalla v1)* | [ ] Approvata · [ ] Modificata · [ ] Respinta | ADR-28 |
| 2 | Props di stile **per breakpoint dalla nascita**, `enum` + `responsive`, `v: 1` invariato | [ ] Approvata · [ ] Modificata · [ ] Respinta | ADR-29 |
| 3 | Metadati d'editor unificati nel registro + ispettore a schede (assorbe 3.10) | [ ] Approvata · [ ] Modificata · [ ] Respinta | ADR-30 |
| 4 | Perimetro — dentro duplica e indicatore di rilascio, **fuori** colonne/annidamento/navigator/schermo intero (→ F04d) | [ ] Approvata · [ ] Modificata · [ ] Respinta | — (scope) |
| 5 | ADR-27 dentro F04c, ADR-26 in F04d *(confermata dalla v1)* | [ ] Approvata · [ ] Modificata · [ ] Respinta | — (firma di ADR-26/27 come sono) |

**Note**: ___________

**Approvato da**: ___________ · **Data**: ___________

**Azione successiva**: [ ] Scrivere ADR-28/29/30 e attivare `docs/ai/plans/PLAN-F04c-editor-maturo.md` ·
[ ] Archivio

> Nessuna ADR, nessuna riga di codice e nessuna installazione di pacchetto precedono le firme
> qui sopra.
