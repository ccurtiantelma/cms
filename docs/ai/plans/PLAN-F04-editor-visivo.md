# Plan — F04 Editor visivo (page builder)

## Spec di riferimento

Nessuna `SPEC-F04-*` redatta. I vincoli sotto sono stati dettati direttamente dall'umano
nel prompt che ha originato questo piano e vanno trattati come vincolanti quanto una spec
approvata — non come commenti discrezionali. Se durante l'implementazione un task li
viola, il task è sbagliato, non il vincolo.

## Criterio di Done (unico, non negoziabile)

Si crea una Pagina reale del sito, dall'inizio alla fine, **senza mai toccare `curl` o
l'API a mano**: dalla dashboard admin, si crea la Pagina, si apre l'editor, si aggiunge
almeno un blocco `section` con figli, si modificano le proprietà, si riordina, si elimina
un blocco, si salva la bozza, si pubblica, e il contenuto è verificabile letto da
`app/public-site` (F03). Ogni task sotto dichiara a quale tratto di questo percorso serve.
Nessun task che non ci serve entra nel piano.

## Perimetro del primo rilascio

**Dentro**: aggiungere un blocco, modificarne le proprietà, riordinarlo (su/giù fra
fratelli), eliminarlo, salvare la bozza, pubblicare.

**Fuori — non si reintroduce durante l'implementazione**: drag & drop, anteprima
responsive, duplicazione blocco, copia-incolla fra pagine, scorciatoie da tastiera, ricerca
nella palette, template di partenza, modalità a schermo intero, anteprima live del sito
pubblico dentro l'editor. Anche un WYSIWYG per `richText` è fuori: nessuna nuova dipendenza
npm pesante senza approvazione (CLAUDE.md § Ask first) — la prop si edita come testo/HTML
grezzo in un controllo generato dal registro, la sanitizzazione autorevole resta server-side
(ADR-20/21, invariata).

## Audit strategico

### Cosa esiste già e non va ricostruito

- **Registro dei blocchi (F02, ADR-21)**: `app/backend/src/blocks/block-registry.ts` è
  l'autorità; `app/frontend/src/types/blocks.types.ts` (generato, `blocks:export` +
  `blocks:types`) espone già `BLOCK_TYPES: BlockTypeDescriptor[]` con `props[].kind`,
  `required`, `maxLength`, `values`, `profile`, `nonEmpty`, `childrenAllow`, `meta.label`,
  `meta.category`. Tutto ciò che serve per generare palette e ispettore esiste e non va
  duplicato a mano.
- **Renderer dei blocchi (F02 T8)**: `app/frontend/src/components/blocks/BlockRenderer.tsx`
  + `blocks/{Section,Heading,RichText,Image,Button}.tsx` — dispatcher ricorsivo type→
  componente, un `BlockErrorBoundary` per nodo. L'editor lo avvolge, non lo riscrive.
- **API di salvataggio/pubblicazione (F01)**: `PATCH app/pages/:guid` accetta già
  `draftContent` (validato contro il registro, 400 con path del blocco colpevole in
  `details`, lock ottimistico `version`→409) e `POST app/pages/:guid/status` gestisce già
  la transizione `draft → published` (macchina a stati in `pages.types.ts`). **Nessuna
  modifica backend è necessaria per questo rilascio** — è la ragione per cui non c'è un
  task per `backend-developer` in questo piano.
- **Pattern di gestione 409/errori**: già scritto in
  `app/frontend/src/pages/pages/PagePageDetail.tsx` (`notifyVersionConflict`,
  `PAGE_SLUG_DUPLICATE`) — da riusare, non da reinventare.

### Falla evitata: dove NON deve vivere lo stato dell'albero

Il registro genera l'ispettore; lo stato dell'albero in editing (selezione, props in corso
di modifica) deve vivere in **uno store Zustand locale alla sessione di editing**, non in
`useReducer` locale al componente. Non è una preferenza stilistica: `docs/
non-functional-requirements.md` § Performance — editor lo impone esplicitamente ("modifica
di una proprietà di un blocco: nessun ri-render dell'intero albero — è la ragione della
scelta Zustand, ADR-17") ed è la stessa regola che CLAUDE.md impone al ruolo Frontend
Developer ("selettori Zustand mirati, mai render dell'intero albero"). Un T1 che partisse
da `useReducer` sarebbe da rifare.

### Rischio principale: un `HeadingInspector.tsx` per tipo

Il rischio esplicito del piano (`docs/roadmap.md`: "maggior potenziale di
over-engineering") è cinque form scritti a mano. Il piano lo previene strutturalmente:
**un solo** componente ispettore (T5) che interpreta `PropSpec.kind`; nessun task successivo
può aggiungere un componente per tipo di blocco. Lo stesso vale per il renderer: un solo
`BlockRenderer` (F02), l'editor lo decora, non lo duplica (T4).

### Gap NFR dichiarato e rinviato, non ignorato

`docs/non-functional-requirements.md` § Accessibilità richiede che "l'editor deve poter
segnalare i salti di livello" nella gerarchia dei titoli (es. `h2` seguito da `h4`). Non è
nell'elenco "cosa entra nel primo rilascio" dettato dall'umano e non è necessario al
criterio di Done. **Resta fuori da questo piano** ed è annotato qui come debito NFR noto per
il rilascio successivo — non è stato silenziosamente perso.

---

## Note registrate dall'umano in approvazione (2026-08-19)

Piano approvato senza modifiche. Due note vincolanti per il rilascio, non per l'implementazione dei task:

1. **Limite noto del primo rilascio — `richText` come testo/HTML grezzo**: la `Textarea` grezza di T5 richiede che chi scrive digiti i tag HTML a mano. È la scelta corretta per questo rilascio — una libreria WYSIWYG dentro F04 lo farebbe gonfiare, ed è comunque fuori perimetro senza approvazione della dipendenza (vedi Perimetro sopra). Da dichiarare esplicitamente come limite noto nella comunicazione di chiusura feature; un editor di testo ricco è il primo candidato per il rilascio successivo, subordinato all'approvazione umana di una nuova dipendenza npm (CLAUDE.md § Ask first).
2. **Punto di stop dopo T4**: l'implementazione si ferma al termine di T4 per una revisione umana dell'editor così com'è — caricamento, palette, canvas con selezione e riordino, senza ispettore (T5 non ancora costruito). Questo è il punto in cui si verifica cosa manca davvero rispetto a cosa sembrava servire, prima di investire in T5/T6. Non procedere a T5 senza conferma esplicita post-revisione.

---

## Task operativi (6, ordinati per dipendenze)

### T1 — Motore dell'albero: funzioni pure + store Zustand

- **Output atteso**:
  - `app/frontend/src/pages/pages/editor/block-tree.utils.ts` — funzioni pure e testabili
    senza React: `addBlock(tree, parentId|null, type, index, defaultProps)`,
    `moveBlock(tree, id, 'up'|'down')` (solo fra fratelli — la profondità è 1, `section` non
    contiene `section`, nessun caso di riordino annidato da gestire), `removeBlock(tree,
    id)`, `updateBlockProps(tree, id, props)`, `findNode(tree, id)`. Ognuna ritorna un nuovo
    albero (immutabile), mai muta in place.
  - `app/frontend/src/hooks/useBlockEditorStore.ts` — store Zustand (pattern di
    `useAuth.ts`/`useNotifications.ts`) che tiene `{ tree, selectedId }` e espone azioni che
    chiamano le funzioni pure sopra. Selettori granulari esportati (es.
    `useSelectedNode()`, `useNodeById(id)`) — mai un selettore che ritorna l'intero `tree`
    dentro un componente che renderizza solo un nodo.
- **Dipendenze**: nessuna.
- **Criterio di Done**: le funzioni pure superano gli unit test di T6 (aggiunta, riordino
  fra fratelli con clamp ai bordi, eliminazione con rimozione ricorsiva dei figli,
  aggiornamento props). Lo store si inizializza da un `draftContent.blocks` esistente senza
  perdita/riordino spurio di nodi.
- **Agente**: frontend-developer.

### T2 — Shell dell'editor: caricamento, salvataggio bozza, pubblicazione

- **Output atteso**:
  - `app/frontend/src/pages/pages/PagePageEditor.tsx`, route `pages/:guid/editor` in
    `App.tsx` (accanto a `pages/:guid` in `App.tsx:119`).
  - Link "Apri editor" nel tab "Contenuto" di `PagePageDetail.tsx`, al posto del testo
    "editor visivo — F04, non ancora sviluppato" (che va rimosso insieme al commento che lo
    giustifica).
  - Caricamento pagina (`fetchPage`), inizializzazione dello store di T1 da
    `page.draftContent.blocks`, layout a due colonne (contenitore canvas a sinistra —
    popolato da T3/T4 — ispettore a destra — popolato da T5).
  - Pulsante "Salva bozza": `updatePage(guid, { version, draftContent: { version:
    ENVELOPE_VERSION, blocks: tree } })`, lock ottimistico riusando `notifyVersionConflict`
    (stesso pattern di `PagePageDetail.tsx`). Un **400 con `details.path`** (blocco
    validazione registro) va mostrato come notifica che nomina il blocco colpevole (usa
    `meta.label` del tipo da `BLOCK_TYPES` per il messaggio), non come errore generico —
    è la sola autorità di validazione, il client non ne duplica la logica.
  - Pulsante "Pubblica" (visibile solo da stato `draft`, riusa `PAGE_STATUS_TRANSITIONS`):
    `ConfirmModal` + `changePageStatus(guid, { status: 'published' })`, stesso pattern già
    in `PagePageDetail.tsx`.
- **Dipendenze**: T1.
- **Criterio di Done**: apertura editor su una Pagina esistente, salvataggio bozza persiste
  e sopravvive a un reload, un 409 concorrente mostra il messaggio esistente senza
  overwrite, pubblicazione da bozza porta la Pagina a `published` e il tab "Stato" di
  `PagePageDetail` lo riflette.
- **Agente**: frontend-developer.

### T3 — Palette: aggiungere un blocco generata dal registro

- **Output atteso**: `app/frontend/src/pages/pages/editor/BlockPalette.tsx`. Dato un
  contenitore target (radice della pagina, o un nodo `section` selezionato), filtra
  `BLOCK_TYPES` per `enabled && (target === root ? ROOT_ALLOWED.includes(type) :
  descriptorDelGenitore.childrenAllow.includes(type))`, mostra `meta.label`/`meta.category`
  come voci di menu (Mantine `Menu`/`ActionIcon`, nessuna libreria nuova), e alla scelta
  chiama `addBlock` dello store con props di default calcolate dal descrittore: stringa
  vuota per `plainText`/`richText`/`url`/`mediaRef`, primo valore di `values` per `enum`,
  `false`/`0` per `boolean`/`number` (nessuna prop richiesta nasce con un default che la
  renda finta-obbligatoria, coerente con SPEC-F02 § 3).
- **Dipendenze**: T1.
- **Criterio di Done**: dalla radice si può aggiungere solo `section`/`heading`/`richText`/
  `image`/`button` (i cinque tipi, per costruzione di `ROOT_ALLOWED`); da dentro una
  `section` si possono aggiungere solo i tipi del suo `childrenAllow`; un tipo `enabled:
  false` o `deprecated: true` non compare mai in palette.
- **Agente**: frontend-developer.

### T4 — Canvas: selezione, riordino, eliminazione — un solo renderer

- **Output atteso**: `app/frontend/src/pages/pages/editor/EditorCanvas.tsx` +
  `EditorBlockWrapper.tsx`. Il wrapper avvolge **l'esistente** `BlockRenderer` (F02 T8,
  invariato) con: overlay/bordo su hover e su selezione (click → `selectNode` dello store),
  toolbar per-nodo con pulsanti su/giù (disabilitati ai bordi della lista fratelli, chiamano
  `moveBlock`), elimina (`ConfirmModal` + `removeBlock`), e — solo su un nodo `section` —
  il trigger della palette di T3 per aggiungere figli. Ogni componente della toolbar legge
  solo il nodo/selettore che gli serve dallo store (`useNodeById(id)`), mai l'intero
  `tree`, per il vincolo NFR di non ri-renderizzare l'albero intero a ogni modifica.
- **Dipendenze**: T1, T3.
- **Criterio di Done**: nessun componente di blocco duplicato — grep su
  `app/frontend/src` conferma un solo file `BlockRenderer.tsx` e zero componenti tipo
  `EditorHeading.tsx`/`HeadingBlock2.tsx`. Riordino sposta un nodo solo fra i suoi fratelli
  diretti (mai fra genitori diversi). Eliminazione di una `section` rimuove anche i suoi
  figli e deseleziona se il nodo eliminato era selezionato.
- **Agente**: frontend-developer.

### T5 — Ispettore delle proprietà generato dal registro

- **Output atteso**: `app/frontend/src/pages/pages/editor/PropertyInspector.tsx` — **un
  solo componente**, mai uno per tipo di blocco. Dato il nodo selezionato (dallo store),
  risolve il suo `BlockTypeDescriptor` in `BLOCK_TYPES` e itera `props`, mappando `kind` →
  controllo Mantine:
  - `plainText` → `TextInput`/`Textarea` (autosize se `maxLength` alto), `maxLength`
    applicato, asterisco se `required`/`nonEmpty`.
  - `enum` → `Select` con `data: values`, `allowDeselect={false}`.
  - `url` → `TextInput` con validazione client (solo UX — schema `http`/`https`/`mailto`/
    root-relative, stesso vincolo di SPEC-F02 § 3.6) accanto al `maxLength`.
  - `mediaRef` → `TextInput` disabilitato con placeholder "Libreria media non disponibile
    (F09 non ancora costruita)" — nessuna scorciatoia che finga una media library.
  - `richText` → `Textarea` grezza (nessun WYSIWYG, vedi Perimetro sopra); nota visibile
    che il contenuto è sanitizzato server-side al salvataggio.
  - Scrittura in store `onBlur` (non `onChange` a ogni tasto — rispetta il vincolo NFR
    "nessun ri-render dell'intero albero" evitando dispatch ad ogni carattere).
  - Se `node.id` cambia (nuova selezione, incl. nessuna selezione → pannello vuoto con
    messaggio "Seleziona un blocco").
- **Dipendenze**: T1, T4 (necessita la selezione prodotta dal canvas).
- **Criterio di Done**: se compare un file con un nome tipo `HeadingInspector.tsx` il task
  è respinto — un solo componente deve coprire tutti e cinque i tipi solo leggendo il
  registro. Aggiungere una prop nel registro (ipoteticamente) non richiede toccare questo
  file, solo il dato.
- **Agente**: frontend-developer.

### T6 — Copertura di test: motore dell'albero, ispettore, percorso end-to-end

- **Output atteso**:
  - Unit test (Jest) su `block-tree.utils.ts` (T1): aggiunta a radice/dentro `section`,
    riordino con clamp ai bordi, eliminazione ricorsiva, aggiornamento props immutabile
    (nessuna mutazione dell'albero originale).
  - Unit/component test su `PropertyInspector.tsx` (T5): un caso per ciascuno dei sette
    `kind` — verifica che il controllo giusto compaia e che la scrittura `onBlur` chiami lo
    store con il valore atteso; un caso con `enabled:false`/tipo sconosciuto già escluso a
    monte (non arriva mai qui, ma verificato che il componente non esplode su un nodo senza
    match).
  - Test E2E (Playwright) che esegue **esattamente il criterio di Done**: login admin →
    crea Pagina → apre l'editor → aggiunge una `section` in radice → aggiunge `heading` +
    `richText` dentro la `section` → modifica le proprietà di entrambi → riordina i due
    figli → elimina uno dei due → salva bozza (verifica assenza di 409/400) → pubblica →
    verifica via richiesta HTTP a `app/public-site` (F03) che il contenuto pubblicato
    contenga il testo inserito. Nessun passaggio del test tocca `curl`/l'API direttamente:
    solo interazione UI (più la sola verifica finale lato pubblico, che è lettura, non
    scrittura).
- **Dipendenze**: T1, T2, T3, T4, T5.
- **Criterio di Done**: le tre suite sopra verdi in CI; il test E2E fallisce (rosso) se
  reintrodotto uno qualsiasi degli elementi fuori perimetro (nessuno di questi è nel test,
  quindi la sua assenza è già la verifica).
- **Agente**: test-engineer.

---

## Matrice dei rischi

| Rischio | Probabilità | Impatto | Mitigazione |
|---|---|---|---|
| Un ispettore per tipo di blocco (5 form a mano) | Media | Alto — ogni prop futura diventa modifica UI | Criterio di Done di T5 vieta esplicitamente file per tipo; code review lo verifica con un grep |
| Stato dell'albero in `useReducer` locale invece di Zustand | Media | Medio — viola NFR performance editor, richiede riscrittura di T3/T4/T5 | T1 fissa lo store Zustand come unica fondazione; T2-T5 dipendono da T1, non possono introdurre stato alternativo |
| Riordino che scivola verso drag & drop "per UX migliore" | Bassa | Alto — riapre una decisione già chiusa | T4 vincolato a pulsanti su/giù, criterio di Done non menziona drag handle |
| WYSIWYG per `richText` introdotto come dipendenza npm | Bassa | Alto — richiede approvazione umana non ottenuta, blocca il rilascio | T5 fissa `Textarea` grezza; qualunque editor WYSIWYG richiede un giro di approvazione fuori da questo piano |
| Editor letto come superficie che può reintrodurre HTML non sanitizzato | Bassa | Alto — XSS | Nessuna modifica alla pipeline di sanitizzazione server-side (F02/ADR-20); l'editor non introduce un secondo percorso di persistenza |

---

## Definition of Done — Checklist globale

### Implementazione
- [ ] T1–T5 implementati, nessun task fuori dal perimetro dichiarato
- [ ] Un solo `BlockRenderer.tsx`, un solo `PropertyInspector.tsx`
- [ ] Nessun `any` TypeScript senza commento, nessun `console.log`
- [ ] Nessuna prop di stile introdotta nel registro dei blocchi (nessuna modifica ad
      `app/backend/src/blocks/`: questo piano non tocca lo schema)

### Test
- [ ] Unit test su `block-tree.utils.ts` e `PropertyInspector.tsx` verdi
- [ ] Test E2E Playwright del percorso di Done verde
- [ ] Nessun test placeholder

### Build e qualità
- [ ] `npm run build --workspace=app/frontend` superata
- [ ] Lint superato
- [ ] Code review completata

### Contratti e documentazione
- [ ] Nessun endpoint nuovo/modificato → `openapi:export`/`types` non necessari in questo
      piano (da rieseguire solo se emerge un gap non previsto qui)
- [ ] `docs/ai/progress-tracker.md` aggiornato — solo su richiesta umana esplicita, a fine
      feature

### Commit
- [ ] Commit atomico per task, Conventional Commits
- [ ] Branch `feature/F04-editor-visivo`
