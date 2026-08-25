# Plan — F04c Editor maturo: drag & drop, stile per breakpoint, metadati d'editor

> **Stato: NON ATTIVO.** Questo piano corrisponde alla **v2** di
> `docs/ai/rfc/RFC-F04c-editor-maturo.md`, che è **in discussione e non firmata**. Nessun
> task qui sotto si esegue, e **nessuna ADR si scrive**, prima dell'approvazione umana delle
> cinque decisioni dell'RFC. Il documento esiste ora solo per mostrare a cosa impegnano
> quelle decisioni.

## RFC di riferimento

`docs/ai/rfc/RFC-F04c-editor-maturo.md` **v2** (2026-08-20) — cinque decisioni:

1. `dnd-kit` come strato di input sopra `moveNodeToAction`, pulsanti freccia/indent/outdent
   conservati. **Verifica della peer dependency React 19 prima dell'installazione**: esito
   negativo → STOP, ritorno all'umano, nessun override.
2. Sette props di stile a token chiusi, con **valore a oggetto `{ default, tablet?, mobile? }`
   dalla nascita**, espresse con un modificatore `responsive` su `EnumPropSpec` — nessun
   `kind` nuovo, nessun `reason` nuovo, tipi fermi a `v: 1`.
3. **Metadati d'editor unificati nel registro** (etichetta, icona, categoria, scheda,
   ordine), opachi alla validazione. Assorbe la voce **3.10 di `docs/TODO.md`** e impone
   l'ispettore **a schede** Contenuto/Stile.
4. Perimetro: **dentro** "duplica blocco" e l'indicatore di rilascio del drag; **fuori**
   colonne, annidamento di `section`, navigator e schermo intero → **F04d**.
5. ADR-27 (lettura pubblica dei media) firmata e dentro questo round. **ADR-26 (WYSIWYG)
   resta fuori**: round a sé, F04d.

Nessuna spec `SPEC-F04c-*` esiste. L'RFC approvata sarà la fonte vincolante: se un task devia
da ciò che l'RFC decide, è il task a essere sbagliato.

**Numerazione delle ADR**: ADR-28 = libreria di drag & drop · ADR-29 = proprietà di stile per
breakpoint · **ADR-30 = metadati d'editor nel registro**. Il numero 30 **non** è più
«annidamento e colonne» come nella v1: quel lavoro esce dal round e prenderà il numero libero
quando F04d verrà scritto.

---

## Ordine fra le decisioni — dichiarato

L'RFC le presenta come indipendenti in approvazione; in esecuzione non lo sono. Due catene,
entrambe vincolanti:

> **La Decisione 2 è a monte della Decisione 3.** I metadati d'editor servono a rendere
> leggibili e ordinabili props che devono prima esistere. La scheda `Stile` di un registro
> senza props di stile è una scheda vuota.

> **Il registro cambia una volta sola.** Le due modifiche (props responsive + metadati
> d'editor) atterrano nello **stesso task (T3)** perché toccano gli stessi cinque file
> `*.block.ts`, lo stesso `block-definition.types.ts`, lo stesso `generate-blocks-types.js` e
> lo stesso ciclo `blocks:export` + `blocks:types` con un solo passaggio del gate CI
> `blocks-sync`. Separarle costerebbe due giri sugli stessi file senza comprare
> reversibilità: **una ADR per decisione (ADR-29 e ADR-30 restano due documenti), un task per
> il registro.**

Terza dipendenza, di sostanza e non di file: **le colonne sono uscite, la convenzione no.**
`styleColumns` non esiste più in questo round, ma quando F04d la introdurrà dovrà nascere
`responsive` come tutte le altre — un layout a colonne che non cambia su mobile è
esattamente il caso in cui una prop di stile scalare si rivela sbagliata. La convenzione
fissata in T3 è ciò che glielo impone.

---

## Audit strategico

### Cosa esiste già e non va ricostruito

- **`moveNodeTo` / `moveNodeToAction`** (F04b/T2, testati): la firma di un drop esiste già,
  con guardie di discendenza e ammissibilità di tipo via `canContainType`. Il drag & drop è
  **strato di input**, non una seconda via di mutazione dell'albero (RFC § A.3).
- **`addBlockAtExact` + `removeBlock` + `generateBlockId`**: le tre primitive di "duplica",
  tutte già scritte. `addBlockAtExact` è oggi privata in `useBlockEditorStore.ts` e serve
  all'inverso di `removeBlockAction` — è la stessa forma di comando invertibile che serve
  qui, letta al contrario (RFC § A.3).
- **`BlockEditorMeta`** esiste già nel registro ed è già dichiarata **opaca alla
  validazione** (ADR-21 § 2): la Decisione 3 estende un innesto esistente, non ne apre uno.
- **`PropertyInspector.tsx`** mappa su `prop.kind`, mai su `prop.type`: le props nuove
  compaiono come controlli senza modifiche strutturali. Mancano le schede, le etichette e la
  scrittura in profondità del valore responsive (RFC § A.2).
- **Colonna `entity` di `files`** già esistente: ADR-27 § 2 non chiede migrazioni.

### Falle evitate, dichiarate

1. **Lo stato del trascinamento.** Vive nel contesto di `dnd-kit`, **mai** nello store
   Zustand. Un `set()` per movimento del puntatore su uno store da cui dipende tutto l'albero
   viola `docs/non-functional-requirements.md` § Performance — editor (100 blocchi
   interattivi entro 2s). È un vincolo di T7, non una raccomandazione.
2. **Il responsive scritto a metà.** Un renderer che emette solo `default`, o un ispettore
   che sovrascrive l'oggetto con lo scalare del controllo desktop, **perde contenuto salvato
   in silenzio**. È il rischio nuovo di questa versione (RFC § Rischi 2) ed è presidiato in
   tre punti: T5 (il renderer emette ogni breakpoint presente), T6 (l'ispettore scrive
   `{ ...valore, default: nuovo }`), T8 (un test che scrive tutti e tre i breakpoint, li
   rilegge e li verifica sull'HTML — non basta che il salvataggio non dia errore).
3. **La voce 3.10 che si riapre da sola.** Un'etichetta leggibile aggiunta a mano oggi
   ricompare come nome tecnico alla prossima prop. Presidio: l'invariante di T3 — una prop
   dichiarata senza voce in `meta.props` fa fallire un test del registro.
4. **Id duplicati in profondità.** "Duplica" che rigenera l'id solo della radice della copia
   produce un `findNode` che restituisce il gemello sbagliato, lontano dalla causa. Presidio:
   il test di unicità su **tutti** gli id dell'albero risultante (T8).

### Rischio di sovradimensionamento, affrontato per sottrazione

Questa versione **toglie** dal round ciò che la v1 ci aveva messo: colonne, annidamento di
`section`, e con essi il controllo di `MAX_DEPTH` nel drag & drop. Restano fuori anche
navigator, schermo intero, anteprima responsive, WYSIWYG, galleria, `spacer`, `divider`,
`columns`/`column`, `video`, `embed`, `html`, `icon-box`, `testimonial`, `counter`, `pricing
table`, `tabs`, `accordion`, `carousel`. **Se uno di questi ricompare in fase di
implementazione è un cambio di scope, non un dettaglio**: richiede un ritorno all'umano, non
un task in più.

### Scarti documentali segnalati e non corretti qui

RFC § A.5 elenca sei divergenze fra codice e `docs/`. Questo piano **non le corregge**: i file
di `docs/` sono territorio umano e nessuna richiesta esplicita li copre. Due meritano però di
essere tenute a vista durante l'esecuzione:

- **Scarto 5** (anteprima responsive fuori radar): questo round produce props per breakpoint
  che **nessuno può vedere** finché l'anteprima non esiste. Dichiarato e accettato nell'RFC,
  ma è il primo candidato del giro successivo.
- **Scarto 6** (commento obsoleto in `generate-blocks-types.js:52`): quel file **viene
  toccato in T3**, e il commento afferma «nessun contratto di rendering nel registro» —
  esattamente il punto su cui ADR-29 e ADR-30 dichiarano il proprio scostamento da ADR-21
  § 2. Chi esegue T3 lo vedrà; **non lo corregge d'iniziativa**, lo segnala.

---

## Task operativi (8, ordinati per dipendenze)

### T1 — Gate: peer dependency di `dnd-kit` con React 19

- **Output atteso**: esito scritto della verifica riportato all'umano (nessun file di `docs/`
  toccato), e — **solo se l'esito è positivo** — installazione di `@dnd-kit/core`,
  `@dnd-kit/sortable`, `@dnd-kit/utilities` nel solo workspace `app/frontend`, con
  `app/frontend/package.json` e `package-lock.json` aggiornati.
- **Come si verifica, prima di installare**: `npm info @dnd-kit/core peerDependencies`,
  idem per `@dnd-kit/sortable` e `@dnd-kit/utilities`; poi installazione **senza**
  `--legacy-peer-deps` e **senza** `--force`, con `npm ls react` a confermare una sola copia
  di React 19 nell'albero.
- **Dipendenze**: nessuna.
- **Criterio di Done**: le tre peer dependency dichiarano compatibilità con React 19 e
  `npm install` va a buon fine **senza alcun flag di forzatura e senza aggiungere una voce a
  `overrides` nel `package.json` di root** (che ne ha già quattro e non è il posto dove
  nascondere un problema). `app/public-site/package.json` **non** cambia.
- **Se il criterio non è soddisfatto**: **STOP**. Nessun override, nessuna libreria
  sostitutiva scelta d'iniziativa. La Decisione 1 torna all'umano; **decade la sola parte
  drag & drop di T7 e la sua copertura in T8** — "duplica blocco" (T7) non dipende da questa
  libreria e prosegue, come tutto T2–T6.
- **Agente**: frontend-developer.

### T2 — ADR-28, ADR-29, ADR-30 in bozza per la firma

- **Output atteso**: `docs/ai/adr/ADR-28-libreria-drag-and-drop.md`,
  `docs/ai/adr/ADR-29-proprieta-di-stile-per-breakpoint.md`,
  `docs/ai/adr/ADR-30-metadati-editor-registro.md`. Formato imposto da `CLAUDE.md`
  § Architecture per le ADR dalla 19 in poi: **decisione · alternative scartate, una riga
  ciascuna · conseguenza. Nient'altro.** Il materiale di contesto resta nell'RFC.
  - **ADR-29** deve dichiarare in chiaro due cose: lo **scostamento consapevole da ADR-21
    § 2** (il registro acquisisce un contratto di rendering parziale dalla porta delle
    props), e che la forma per breakpoint è scelta **ora** perché cambiarla dopo sarebbe un
    `v: 2` con migrazione, cioè un deploy a senso unico.
  - **ADR-30** deve dichiarare che la **struttura dell'ispettore è da oggi dettata dal
    registro** e che una prop senza voce in `meta.props` è un difetto, non un default.
  - **Nessuna ADR sull'annidamento o sulle colonne**: fuori scope, F04d.
- **Dipendenze**: T1 per la sola ADR-28 (che nomina la libreria: se T1 si ferma, ADR-28 non
  si scrive e ADR-29/ADR-30 procedono comunque).
- **Criterio di Done**: le ADR stanno **una pagina ciascuna**, ADR-27 risulta firmata, e
  nessuna riga di codice di T3–T7 è stata scritta prima delle firme.
- **Agente**: orchestrator. **Nessun ruolo AI si auto-approva un'ADR**: il Done si chiude con
  la firma umana, non con la scrittura del file.

### T3 — Registro dei blocchi: props di stile per breakpoint + metadati d'editor

Un solo task, un solo ciclo di rigenerazione (§ Ordine fra le decisioni). Tre parti, in
quest'ordine dentro il task.

- **Parte 1 — il descrittore (Decisione 2)**: modificatore `responsive?: boolean` su
  `EnumPropSpec` in `prop-spec.types.ts`; nel validatore, il ramo `enum` si sdoppia fra
  scalare e per breakpoint, con la verifica del token **estratta in una funzione sola** usata
  da entrambi i percorsi. Elenco chiuso dei breakpoint (`default` obbligatorio, `tablet`,
  `mobile`) dichiarato **una volta** nel backend. Errori: `reason: 'type'` sul path della
  prop per envelope malformato (non oggetto, `default` mancante, chiave sconosciuta),
  `reason: 'enum'` sul path **della singola voce** (`…props.styleSpaceBefore.tablet`) per un
  token fuori lista.
- **Parte 2 — le sette props (Decisione 2)** su `app/backend/src/blocks/types/*.block.ts`,
  tutte `kind: 'enum'`, `responsive: true`, **opzionali con `default` a oggetto**
  (`{ default: … }`): `styleSpaceBefore`/`styleSpaceAfter` (`none|xs|sm|md|lg|xl`) su tutti e
  cinque; `stylePadding` (`none|sm|md|lg`) e `styleBackground` (`none|subtle|accent|inverse`)
  su `section`; `styleTextColor` (`default|muted|accent|inverse`), `styleFontSize`
  (`sm|md|lg|xl`), `styleFontWeight` (`regular|medium|bold`) su `heading`, `richText`,
  `button`.
- **Parte 3 — i metadati d'editor (Decisione 3)**: `BlockEditorPropMeta`
  (`label`, `tab?: 'content'|'style'`, `order?`, `help?`) e `meta.props` su
  `BlockEditorMeta`; compilazione per **ogni** prop di **ogni** tipo, comprese quelle di
  contenuto già esistenti (`level`, `text`, `html`, `src`, `alt`, `href`, …); `meta.icon`
  valorizzata sui cinque tipi.
- Poi `generate-blocks-types.js` aggiornato per **entrambi** i campi nuovi (RFC § A.2: le
  interfacce del contratto generato sono stringhe letterali dentro quel file), e
  `npm run blocks:export && npm run blocks:types`.
- **Vincoli non negoziabili**: **nessun `v` incrementato**, `migrations` resta `[]` su tutti e
  cinque, **nessun `kind` nuovo** in `prop-spec.types.ts`, **nessun `reason` nuovo** in
  `BlockPropInvalidReason` (estenderlo significa revisionare `SPEC-F02-blocchi.md`, territorio
  umano), **nessun tipo di blocco nuovo**, **nessuna modifica a `children.allow`**, **nessuna
  migrazione di database**. Ogni valore è un token, mai una misura o un colore esadecimale.
  I metadati d'editor **non entrano in `PropSpec`**: stanno in `meta`, dove il validatore li
  ignora per costruzione.
- **Dipendenze**: T2 (firma di ADR-29 e ADR-30).
- **Criterio di Done**:
  - `git diff` su `prop-spec.types.ts` mostra **solo** il campo `responsive`; nessun `kind`
    aggiunto; `git diff` su `validation-result.types.ts` **vuoto**;
  - `git diff` sui cinque `*.block.ts` non contiene né `v:` né `migrations` modificati, né
    `children`;
  - il **token del registro calcolato da `computeBlockRegistryToken` è invariato** rispetto al
    valore pre-round (dipende da `type:v:migrations.length`) — se cambia, qualcosa è stato
    incrementato che non doveva esserlo;
  - un **test di invariante** fallisce se una prop dichiarata non ha voce in `meta.props`;
  - il gate CI `blocks-sync` è verde e `app/frontend/src/types/blocks.types.ts` rigenerato
    mostra `responsive`, `meta.props` e le props nuove;
  - **un contenuto già salvato senza alcuna prop di stile supera ancora la validazione** senza
    modifiche (verificato in T8);
  - il commento obsoleto in `generate-blocks-types.js:52` è **segnalato all'umano, non
    corretto** (RFC § A.5 scarto 6).
- **Agente**: backend-developer.

### T4 — ADR-27: rotta pubblica di lettura dei media, con le sue variabili d'ambiente

- **Output atteso, due deliverable distinti e verificati separatamente**:
  1. **La rotta** `GET api/v1/public/media/:guid` in `app/backend/src/`, anonima, di sola
     lettura, in streaming dal driver di storage di ADR-8. Regole dell'ADR, tutte: serve
     **solo** le righe con `entity = 'page-media'`; `Content-Type` dedotto dai **byte reali**
     contro una tabella chiusa di firme raster (`image/jpeg`, `image/png`, `image/gif`,
     `image/webp`, `image/avif`) scritta in casa, **nessuna dipendenza nuova**; **SVG
     rifiutato senza eccezioni configurabili**; **404 uniforme** per ogni altro caso (guid
     inesistente, file soft-eliminato, MIME non ammesso, nessuna corrispondenza di firma) —
     mai 403, mai un messaggio che distingua i casi; header `X-Content-Type-Options: nosniff`,
     `Content-Disposition: inline`, `Cache-Control: public, max-age=31536000, immutable` sul
     200 e **nessun caching della 404**; **nessuna lettura né scrittura su Redis**. Poi
     `npm run openapi:export && npm run openapi:types`.
  2. **Le variabili d'ambiente** `PUBLIC_MEDIA_BASE_URL` e `VITE_PUBLIC_MEDIA_BASE_URL`
     (stesso valore, rivolte al browser, **distinte da `PUBLIC_API_BASE_URL`** che il sito
     pubblico usa server-side e che in produzione può essere un host interno irraggiungibile
     da un `<img>`) in `.env.example`, `docker-compose.yml` e nel workflow CI se necessario;
     lettura backend **solo** via `AppConstants`, mai `process.env` diretto.
  > Stanno nello stesso task perché sono la stessa consegna vista da due lati — la rotta
  > senza la variabile non è raggiungibile da un browser — ma restano **due voci di Done
  > separate**: la ragione per cui l'RFC insisteva era la visibilità, e un deliverable
  > nominato con un proprio criterio è visibile quanto un task.
- **Dipendenze**: T2 (ADR-27 firmata). Indipendente da T3.
- **Criterio di Done**: `openapi.yaml` e `api.types.ts` rigenerati; un JPEG con
  `entity <> 'page-media'` risponde **404**; un file rinominato `.png` ma con byte SVG
  risponde **404**; nessuna chiamata a Redis nel percorso della rotta; collezione Bruno
  presente (scritta in T8). Separatamente: `grep -rn "process.env.PUBLIC_MEDIA_BASE_URL"
  app/backend/src` non restituisce nulla fuori da `AppConstants`; `docker compose config`
  risolve entrambe le variabili; l'assenza della variabile **non** fa partire il backend con
  un default silenzioso che punterebbe all'host sbagliato.
- **Agente**: backend-developer (proprietario della config di root, assegnazione 2026-08-17).

### T5 — Frontend: token CSS con breakpoint, stile applicato, `src` dei media

- **Output atteso**, in quest'ordine:
  1. **Strato di token** in `app/frontend/src/components/blocks/` — variabili CSS dichiarate
     una volta sola, portate identiche in admin e sul sito pubblico dall'alias `@blocks`
     (ADR-22), **più le tre soglie di breakpoint**, che oggi non esistono da nessuna parte
     (RFC § A.4). Le soglie stanno **solo** qui: mai nel registro, mai nel contenuto. Sono
     anche il solo innesto su cui il tema di F09 potrà agire senza riscrivere contenuto già
     salvato.
  2. **Classi per (prop, breakpoint, token)** — circa un centinaio di regole meccaniche in un
     file solo, con la cascata `mobile → tablet → default` implementata in **un punto solo**
     (media query `max-width`). È il costo dichiarato della forma responsive (RFC
     § Decisione 2): non si aggira senza `style` inline, che è vietato.
  3. **Applicazione delle sette props** nei componenti di `components/blocks/blocks/` come
     **classi CSS Modules, mai attributo `style` inline**, mai `!important`. **Il renderer
     emette le classi di ogni breakpoint presente nel valore**, non solo `default`: ignorare
     `tablet`/`mobile` significa perdere contenuto salvato in silenzio. Un valore assente usa
     il `default` del registro; un valore malformato non fa esplodere il renderer (Error
     Boundary per blocco già in vigore).
  4. **`src` dell'immagine** — composizione dell'URL da `mediaRef` in **un solo modulo**
     condiviso (ADR-27 § 6), mai due risoluzioni che possono divergere fra i due workspace.
- **Vincoli**: i componenti dei blocchi **non importano Mantine** (solo CSS Modules e markup
  semantico); `app/public-site` resta **senza JavaScript client e senza Mantine**.
- **Dipendenze**: T3 (props nel registro e tipi rigenerati), T4 (variabile della base media).
- **Criterio di Done**: nessun attributo `style` inline e nessun valore in pixel scritto dentro
  un componente di blocco (`grep` su `components/blocks/`); `npm run build:public-site` verde e
  l'HTML prodotto porta **le classi di tutti i breakpoint presenti nel valore** e un `src`
  risolto; una pagina già salvata **prima** di questo round rende identica a prima (i default
  dei token equivalgono al CSS attuale).
- **Agente**: frontend-developer.

### T6 — Frontend: ispettore a schede, etichette dal registro, controllo desktop del responsive

- **Output atteso**:
  1. **Due schede, `Contenuto` e `Stile`**, costruite da `meta.props[nome].tab` e ordinate da
     `order`. Un tipo senza props di stile mostra **una scheda sola**, mai una scheda vuota.
  2. **Etichette da `meta.props[nome].label`** — `propLabel()` smette di restituire il nome
     tecnico: è la voce **3.10 di `docs/TODO.md`**, chiusa qui come parte della Decisione 3.
  3. **Controllo desktop delle props responsive**: la `Select` legge `valore.default` e
     scrive **`{ ...valore, default: nuovo }`** — mai lo scalare nudo, che cancellerebbe
     `tablet` e `mobile`. Nessun controllo per gli altri due breakpoint in questo round: è
     una scelta di superficie, dichiarata, e non deve lasciar cadere il dato.
  4. **`meta.icon` consumata dalla palette** tramite una **mappa esplicita nome → componente**
     (nessun import dinamico), con fallback su un'icona generica per un nome sconosciuto.
- **Vincoli**: resta **un solo** `PropertyInspector.tsx`, che mappa su `prop.kind` e **mai**
  su `prop.type` — le schede sono un raggruppamento dei descrittori *prima* dello `switch`,
  non una seconda strada per tipo di blocco. Nessun file `HeadingInspector.tsx`-simile.
  Nessuna etichetta scritta a mano nel frontend: se manca, manca nel registro (T3).
- **Dipendenze**: T3 (metadati nel registro e tipi rigenerati). Indipendente da T5.
- **Criterio di Done**: nell'ispettore non compare più alcun nome tecnico di prop; un tipo
  senza props di stile non mostra la scheda `Stile`; modificare il controllo desktop di una
  prop che ha `tablet` e `mobile` valorizzati **li lascia intatti** (verificato in T8); la
  palette mostra le cinque icone dichiarate.
- **Agente**: frontend-developer.

### T7 — Frontend: duplica blocco, poi drag & drop con indicatore di rilascio

Due parti con dipendenze diverse: **la prima non dipende da T1**, la seconda sì. In caso di
STOP su T1 la prima si consegna comunque.

- **Parte 1 — Duplica blocco** (nessuna dipendenza da `dnd-kit`):
  - funzione **pura** in `block-tree.utils.ts` che copia un sottoalbero rigenerando **l'id di
    ogni nodo** con `generateBlockId()`, non solo quello della radice della copia;
  - `duplicateNodeAction` nello store, con comando invertibile costruito sulle primitive
    esistenti: `apply` = `addBlockAtExact(tree, parentId, index + 1, copia)`, `invert` =
    `removeBlock(copia.id)`;
  - **controllo di `MAX_NODES = 500` prima dell'inserimento**, con avviso all'utente:
    duplicare è il solo comando che aggiunge decine di nodi con un click, e il limite si dice
    prima, non lo si scopre dal `400` al salvataggio;
  - **il duplicato diventa il nodo selezionato**;
  - pulsante nella toolbar di `EditorBlockWrapper.tsx`, con `aria-label` coerente con quelli
    già usati dagli helper e2e.
- **Parte 2 — Drag & drop** (dipende dall'esito positivo di T1):
  - `EditorCanvas.tsx` ospita `DndContext` e `DragOverlay`;
  - `EditorBlockWrapper.tsx` — ogni nodo `useDraggable` **e** `useDroppable`; **maniglia di
    trascinamento nella toolbar esistente**, mai il corpo del blocco (il click sul corpo deve
    continuare a selezionare); zone di rilascio **fra** fratelli e zona "dentro" sui
    contenitori;
  - **indicatore di rilascio, tre segni distinti** (RFC § Decisione 4): **linea di
    inserimento** fra fratelli, **evidenziazione del contenitore** per il drop "dentro",
    **stato di rifiuto** durante l'hover quando il drop non è ammesso. La linea è un
    **pseudo-elemento sulla zona di rilascio**, mai un nodo inserito nel DOM dell'albero — un
    nodo vero sposta il layout e perturba la collision detection che lo ha appena calcolato;
  - un solo **predicato puro** riusabile `canDropInto(tree, dragId, targetParentId)`, che
    compone la guardia di discendenza già in `moveNodeTo` con `canContainType` già in
    `block-registry.utils.ts` (**mai una regola scritta due volte**). Con la profondità 2 di
    oggi il ramo "discendente" è irraggiungibile: si scrive comunque, perché è la sede unica
    della regola e F04d deve trovarla già lì. **Nessun controllo di `MAX_DEPTH`**:
    l'annidamento è fuori scope, nessun drop può superarlo;
  - sensore da tastiera di `dnd-kit` attivo — è anche la via deterministica per i test E2E.
- **Vincoli non negoziabili**: **nessuna azione nuova per il drop** — chiama
  `moveNodeToAction(id, targetParentId, index)`, già validata, già invertibile, già testata
  (`duplicateNodeAction` è l'unica azione nuova del round, e nasce dalle stesse primitive).
  **Lo stato del trascinamento in corso non entra mai nello store Zustand.** **I pulsanti
  freccia / dentro / fuori restano**: sono l'unico percorso da tastiera già coperto dai test
  e reggono gli `aria-label` su cui poggiano gli helper e2e
  (`e2e/tests/helpers/page-editor.ts`).
- **Dipendenze**: Parte 1 → T3 (nessuna, in pratica: opera sull'albero). Parte 2 → T1 (esito
  positivo) e T5 (il canvas mostra i blocchi con lo stile applicato).
- **Criterio di Done**: duplicare un sottoalbero di tre livelli produce **id tutti nuovi** e
  un undo che lo rimuove per intero; il tentativo di superare `MAX_NODES` avvisa invece di
  fallire al salvataggio; `grep` sullo store non mostra alcun campo di stato del drag; un drop
  non ammesso è **visibile durante l'hover** e non è un no-op silenzioso al rilascio; il
  riordino via pulsanti continua a funzionare identico.
- **Agente**: frontend-developer.

### T8 — Copertura di test

- **Output atteso**:
  - **Backend (Jest + Supertest)** — contenuto salvato **senza** props di stile resta valido
    (retro-compatibilità: è il cuore della scelta di restare a `v: 1`); un valore responsive
    completo (`default` + `tablet` + `mobile`) è accettato e **riletto identico**; `default`
    mancante → `reason: 'type'`; chiave di breakpoint sconosciuta → `reason: 'type'`; token
    fuori lista su `tablet` → `reason: 'enum'` **con il path della voce**
    (`…props.styleSpaceBefore.tablet`); un valore scalare su una prop `responsive` è respinto;
    l'invariante dei metadati (prop senza voce in `meta.props`) fallisce; il token del
    registro invariato rispetto al valore pre-round.
  - **Rotta media (Supertest + Bruno)** — happy path 200 con `Content-Type` dai byte reali;
    `entity` diversa da `page-media` → 404; SVG → 404; byte non corrispondenti all'estensione
    → 404; guid inesistente → 404; **nessun 403 su nessun percorso**; header `nosniff` e
    `Cache-Control` presenti; **RBAC**: la rotta è anonima e resta fuori dal middleware JWT.
    `bruno/media/*.yml` + `bruno/opencollection.yml` aggiornata.
  - **Frontend (Vitest)** — `PropertyInspector` mostra due schede quando ci sono props di
    stile e una sola quando non ce ne sono, con etichette leggibili per **tutte** le props;
    **modificare il controllo desktop di una prop responsive lascia intatti `tablet` e
    `mobile`** (è il test che presidia la perdita silenziosa di contenuto); la duplicazione
    di un sottoalbero di tre livelli produce **id tutti univoci** nell'albero risultante e il
    suo inverso lo rimuove interamente; `canDropInto` come funzione pura: tipo non ammesso,
    nodo su sé stesso, caso ammesso.
  - **E2E (Playwright)** — riordino via **sensore da tastiera** di `dnd-kit` (il trascinamento
    a puntatore richiede passi intermedi espliciti ed è la via fragile: **è messo in conto
    qui, non scoperto durante l'esecuzione**); duplicazione di un blocco dal pulsante di
    toolbar; applicazione di una spaziatura e di uno sfondo; salvataggio, pubblicazione e
    verifica sull'HTML di `app/public-site` che le classi (**di ogni breakpoint presente**) e
    l'`src` dell'immagine ci siano.
- **Dipendenze**: T3, T4, T5, T6, T7 (la parte E2E e unit del drag & drop decade se T1 si è
  fermato; **la copertura di "duplica" vale comunque**, come tutto il resto).
- **Criterio di Done**: suite verdi in CI, nessun test placeholder, nessun `any` su mock o
  payload, nessuna correzione di logica applicativa da parte di questo ruolo — i bug trovati
  si segnalano.
- **Agente**: test-engineer.

### T9 — Frontend: editing in-place del testo, dispatch debounced verso l'albero, floating menu

> **Nota di governance**: questo task non è nell'RFC né nei T1–T8 originali e non ha un'ADR
> dedicata — è stato implementato direttamente nel codice (`Heading.tsx`, `Button.tsx`,
> `RichText.tsx`, `BlockRenderer.tsx`, `EditorBlockWrapper.tsx`, tutti già lo citano come
> `PLAN-F04c-editor-maturo.md T9`). Questa sezione lo documenta **a consuntivo**, su richiesta
> esplicita dell'umano (`CLAUDE.md` § Documentation Policy — implementazione che devia dal
> piano scritto). Non tocca schema blocchi, `PropSpec`, `kind` o sanitizzazione server-side:
> resta interazione di chrome sul valore già esistente delle prop `text`/`html`/`label`, quindi
> sotto la soglia che `CLAUDE.md` riserva all'ADR obbligatoria — ma è comunque un'estensione di
> scope rispetto all'RFC originale, **segnalata qui invece che corretta d'iniziativa** (stesso
> principio della sezione "Scarti documentali" più sopra).

- **Output realizzato**:
  - `Heading`/`Button`/`RichText` (componenti di blocco, senza Mantine — confine `CLAUDE.md`)
    accettano ciascuno una tripla opzionale `editable`/`on<Prop>Change`/`on<Prop>Input`,
    valorizzata solo dall'editor sul nodo selezionato — mai dal sito pubblico, dove restano
    `undefined` e il rendering non cambia. `contentEditable` nativo, nessuna dipendenza nuova
    (niente TipTap, che resta il territorio separato di ADR-26).
  - `BlockRenderer.tsx` fa da pass-through con una prop `editing` opzionale verso i tre
    componenti; non si propaga in ricorsione dentro `Section` (l'editor monta i contenitori
    con `CONTAINER_COMPONENTS`, non `BlockRenderer`, quindi l'editing lì non esiste).
  - `EditorBlockWrapper.tsx`: il commit (`onTextChange`/`onHtmlChange`/`onLabelChange`, su
    `blur`) passa sempre da `updateBlockPropsAction` — resta un comando invertibile
    sull'undo stack, mai una mutazione diretta. La notifica ad ogni tasto
    (`onTextInput`/`onHtmlInput`/`onLabelInput`) dispatcha con debounce
    (`scheduleDebouncedUpdate`, `useRef`+`setTimeout`, non `useDebouncedCallback` di
    `@mantine/hooks` — vedi commento in linea sul motivo); il `blur` cancella sempre il
    debounce pendente prima del proprio dispatch immediato, così i due non corrono mai in
    coppia contro lo stesso valore stantio.
  - Nessuna sanitizzazione lato client: resta autorità esclusiva del server pre-persistenza
    (ADR-20/ADR-21), invariata.
  - Floating menu: la action bar generica (`floatingActionBar` — drag/seleziona
    padre/duplica/elimina) e la linguetta azione di `section` (`sectionActionTab`) restano
    mutuamente esclusive sullo stesso nodo selezionato — nessuna sovrapposizione, nessuna
    funzionalità rimossa rispetto alla toolbar integrata esistente di T7.
- **Dipendenze**: T5/T6 (renderer e ispettore già in campo), T7 (stessa toolbar del nodo
  selezionato).
- **Criterio di Done**: digitare nel canvas su un nodo selezionato non dispatcha ad ogni tasto
  un aggiornamento non-debounced; il sito pubblico (`BlockRenderer` montato senza `editing`)
  rende identico a prima; nessun `any` senza commento, nessuna dipendenza nuova, nessuna
  sanitizzazione lato client introdotta.
- **Agente**: frontend-developer.

---

## Matrice dei rischi

| Rischio | Probabilità | Impatto | Mitigazione |
|---|---|---|---|
| Responsive scritto a metà: renderer o ispettore che perdono `tablet`/`mobile` | **Alta** | **Alto** — perdita silenziosa di contenuto salvato | Tre presidi: T5 (il renderer emette ogni breakpoint presente), T6 (l'ispettore scrive in profondità), T8 (test di round-trip su tutti e tre) |
| `dnd-kit` non compatibile con React 19 | Bassa | Medio — cade la Parte 2 di T7, non il round | T1 è un gate **prima** dell'installazione; STOP e ritorno all'umano, mai un override. "Duplica" e T2–T6 proseguono |
| Rilascio "fra due blocchi" contro "dentro il contenitore" sul confine di una sezione | **Alta** | Alto — il blocco finisce dove nessuno voleva | Tre segni visivi distinti e `canDropInto` mostrato **durante l'hover** (T7), non scoperto al rilascio |
| Duplicazione con id ripetuti in profondità | Media | Alto — guasto che si manifesta lontano dalla causa | Rigenerazione su **ogni** nodo del sottoalbero + test di unicità su tutti gli id (T8) |
| Stato del trascinamento nello store Zustand | Media | Alto — un `set()` per movimento del mouse, NFR editor sfondato | Vincolo esplicito di T7, verificabile con un `grep` sullo store nel Done |
| Un `v: 2` introdotto "per pulizia" durante T3 | Bassa | **Alto** — deploy a senso unico, il rollback del backend esigerebbe il rollback dei contenuti | Il Done di T3 verifica che il token del registro sia **invariato**: un `v` incrementato lo fa cambiare e fallisce il task |
| Il `reason` nuovo aggiunto "perché serviva" durante T3 | Media | Medio — revisione implicita di `SPEC-F02-blocchi.md`, territorio umano | Il Done di T3 esige `git diff` **vuoto** su `validation-result.types.ts`: il path porta l'informazione, non un `reason` in più |
| La voce 3.10 si riapre alla prossima prop | Media | Medio — il debito torna dov'era | Invariante di T3: una prop senza voce in `meta.props` fa fallire un test del registro |
| Il centinaio di regole CSS diventa disordine | Media | Medio — foglio dei token illeggibile a sei mesi | Un file solo, generazione meccanica per (prop, breakpoint, token), scale di token corte per costruzione |
| La Decisione 2 scivola verso un editor di CSS | Media | Alto — deriva di design senza ritorno | Difesa strutturale: `enum` a valori chiusi, nessun campo libero, nessun `pattern` in `PropSpec`. Il moltiplicatore ×3 dei breakpoint è un secondo freno |
| Rientrano colonne, annidamento, navigator o schermo intero | Media | Medio — sovradimensionamento, il rischio dichiarato di F04 | Esclusi per iscritto nell'RFC § Decisione 4: la ricomparsa è un cambio di scope che torna all'umano |
| Un JPEG privato diventa leggibile perché è un'immagine | Bassa | Alto — esposizione di allegati | ADR-27 § 2: opt-in su `entity = 'page-media'`, verificato da un test dedicato in T8 |

---

## Definition of Done — Checklist globale

### Firme e decisioni
- [ ] RFC **v2** approvata (cinque decisioni)
- [ ] ADR-27 firmata
- [ ] ADR-28, ADR-29, ADR-30 scritte in una pagina ciascuna e **firmate dall'umano** prima di T3
- [ ] Nessun elemento escluso dall'RFC reintrodotto senza un nuovo giro di approvazione
- [ ] ADR-26 (WYSIWYG) **non** toccata da questo round; nessuna ADR su annidamento o colonne

### Implementazione
- [ ] T1–T8 implementati (la Parte 2 di T7 e la sua copertura solo se T1 è positivo)
- [ ] Nessun `v` incrementato, `migrations` invariate, token del registro invariato
- [ ] Nessun `kind` nuovo in `prop-spec.types.ts`, nessun `reason` nuovo, nessun tipo di
      blocco nuovo, nessuna modifica a `children.allow`
- [ ] Nessuna migrazione di database, nessuna colonna nuova
- [ ] Metadati d'editor in `meta`, mai in `PropSpec`; invariante sulle props senza etichetta
- [ ] Una sola azione nuova nello store (`duplicateNodeAction`); stato del drag fuori da Zustand
- [ ] Nessun attributo `style` inline nei componenti di blocco; nessuna Mantine nei blocchi;
      nessuna soglia di breakpoint fuori dal foglio dei token
- [ ] Un solo `BlockRenderer.tsx`, un solo `PropertyInspector.tsx`
- [ ] Nessun `any` senza commento, nessun `console.log`, `process.env` solo via `AppConstants`
- [ ] JSDoc sulle funzioni pubbliche nuove (duplicazione del sottoalbero, `canDropInto`,
      composizione dell'URL media)

### Test
- [ ] Unit (Jest/Vitest), integration (Supertest), Bruno per la rotta media, E2E Playwright
- [ ] Retro-compatibilità dimostrata: contenuto pre-round valido e reso identico
- [ ] Round-trip responsive dimostrato su tutti e tre i breakpoint
- [ ] Unicità degli id dimostrata dopo la duplicazione di un sottoalbero
- [ ] Nessun test placeholder, nessun `any` su mock o payload

### Build e qualità
- [ ] `npm run build` (backend + frontend + public-site) verde
- [ ] Gate CI `blocks-sync` verde
- [ ] Lint verde
- [ ] Code review completata

### Contratti e documentazione
- [ ] `npm run blocks:export` + `npm run blocks:types` eseguiti dopo T3
- [ ] `npm run openapi:export` + `npm run openapi:types` eseguiti dopo T4
- [ ] `docs/TODO.md` voce 3.10 chiusa — **solo su richiesta umana esplicita**
- [ ] `docs/ai/progress-tracker.md` aggiornato a fine feature — **solo su richiesta umana
      esplicita**

### Commit
- [ ] Commit atomico per task, Conventional Commits
- [ ] Branch `feature/F04-editor-visivo`

---

## Fuori perimetro — non si reintroduce durante l'implementazione

**Rinviato a F04d, come blocco unico**: layout a colonne (`styleColumns`), annidamento di
`section` dentro `section`, **navigator** (outline navigabile dell'albero), **schermo
intero**. Escono insieme perché sono la stessa capacità: una struttura annidata senza un
albero navigabile si usa male. Quando rientreranno, `styleColumns` dovrà nascere
**`responsive`** come ogni altra prop di stile — la convenzione fissata in T3 glielo impone.

**Rinviato a F04d, separatamente**: WYSIWYG per `richText` (ADR-26, dipendenza npm pesante).

**Rinviato senza data**: **anteprima responsive** — questo round produce props per breakpoint
che nessuno può vedere (RFC § A.5 scarto 5, § Decisione 2). È il primo candidato del giro
successivo, e va tracciato invece di restare fuori radar · presenza di altri editor via
Socket.io (stesso scarto) · galleria / immagine multipla (richiede un `kind` di lista, cioè
una firma di sicurezza) · varianti dimensionali dei media, libreria media in navigazione,
cartelle e tag, protezione dei media referenziati (F09) · potatura delle Revisioni (decisione
aperta, nessuna retention si implementa nel frattempo) · retrofit della colonna `version`
sulle quattro entità mutabili (task a sé, divergenza nota).

**Escluso, non rinviato**: `spacer` (le props di spaziatura della Decisione 2 lo rendono un
nodo di contenuto senza contenuto), `divider`, `columns`/`column` come tipi a sé, `video`,
`embed`, `html` (disabilitato finché non ha la sua ADR), `icon-box`, `testimonial`,
`counter`, `pricing table`, `tabs`, `accordion`, `carousel` — ADR-21 § 5 li ha già messi
fuori esplicitamente.
