# RFC-F04e — "Super Clone Elementor": isolamento canvas, ponte di stato, gerarchia e breakpoint

## Status
[ ] In discussione · [x] **Approvato** → genera ADR-70, ADR-71 · [ ] Rifiutato

## Proposto da
AI Orchestrator (via sessione interattiva) · Data: 2026-09-14

---

## Problema

Il task che origina questa RFC chiedeva la stesura diretta di una SPEC vincolante
(`docs/ai/specs/SPEC-F04-super-elementor.md`) che definisse cinque capacità per la FASE 2
dell'editor visivo: isolamento del canvas in Iframe/Shadow DOM, un ponte di stato
postMessage/Zustand con patch `immer`, un albero ricorsivo Container→Row→Column→Widget su
`@dnd-kit/core`, controlli visuali flottanti al mouse-over, e un motore di breakpoint
Desktop(>1024px)/Tablet(768-1023px)/Mobile(<767px).

Il controllo documentale preliminare imposto da `CLAUDE.md` ("non inventare... regole non
presenti in `docs/`") e dalla gerarchia EAIDOS (`docs/constitution.md` §"Gerarchia delle
decisioni": `ADR → Spec`, mai il contrario) ha trovato che **quattro delle cinque richieste
confliggono con architettura già approvata e implementata**, non con un vuoto documentale:

| Richiesta | ADR/architettura già firmata | Natura del conflitto |
|---|---|---|
| Canvas in Iframe/Shadow DOM | ADR-54 (editor = rotta `/studio/:id`, un solo documento) · ADR-42 §5 (isolamento CSS già ottenuto via variabili scopate su una classe radice, non via iframe) · ADR-32 §5 (`DndContext` richiede un antenato DOM comune fra palette e canvas) | Un iframe rompe il requisito di antenato comune di `dnd-kit`; l'isolamento CSS che l'iframe cercherebbe di dare è già coperto da ADR-42 con un meccanismo più economico |
| Ponte postMessage/Zustand+`immer` | ADR-17 (Zustand singleton in-process, letto/scritto diretto, senza serializzazione) | Presuppone due processi/documenti React distinti che oggi non esistono; `immer` non è nello stack (`docs/constitution.md` § Stack immutabile) |
| Albero Container→Row→Column→Widget | ADR-31 (rifiuta esplicitamente l'assegnazione di figli a colonne indirizzabili) · ADR-39/41 (sesto tipo `container`, layout flex, nesting ricorsivo via sentinel `children.allow: '*'`) | Non esiste (né è mai stato proposto) un tipo `Row`; `Column` con figli assegnati per slot è un'alternativa **già scartata per iscritto** da ADR-31 |
| Breakpoint Desktop/Tablet/Mobile a 1024/768/767px | ADR-29 §2 (chiavi `default`/`tablet`/`mobile`, non `desktop` — motivazione esplicita contro un quarto nome `wide`) · soglie CSS già fissate (`SPEC-F04-grid-responsive-engine.md` §1: tablet ≤768px, mobile ≤480px) | La chiave `default` è già persistita dentro `pages.content` (jsonb) sul contenuto esistente: rinominarla in `desktop` è una modifica di schema retroattiva, non un dettaglio di stile |

Solo la richiesta **Overlays & Controls** (barre d'azione flottanti, maniglie, indicatore di
drop) è in continuità con l'esistente: `BlockHoverOverlay.tsx`, `InlineFloatingToolbar.tsx`,
la action bar generica e la linguetta di `section` (RFC-45, PLAN-F04c-editor-maturo.md §T7/T9)
coprono già gran parte della superficie descritta, con un vincolo esplicito ereditato da
ADR-28 §6 (la linea di inserimento è un pseudo-elemento, mai un nodo nel DOM dell'albero).

Per `CLAUDE.md` § Architecture Policy, ciascuno dei quattro punti in conflitto rientra fra gli
esempi che innescano obbligatoriamente un'ADR (cambio di pattern strutturale, caching/state
management, versionamento dello schema blocchi). Una SPEC non può stabilirli da sola: da qui
questa RFC, invece della SPEC richiesta.

---

## Soluzione proposta

Cinque decisioni indipendenti nella firma, ma con due catene di dipendenza dichiarate:

> **La Decisione 2 dipende dalla 1.** Un ponte di stato serve solo se il canvas smette di
> condividere il documento con la shell. Se la Decisione 1 resta sul documento singolo, la
> Decisione 2 non ha oggetto e si archivia con essa.

> **La Decisione 3 è indipendente dalle altre quattro** — riguarda lo schema dei blocchi, non
> il meccanismo del canvas — ma è la più costosa da invertire (ADR-21 §1: un tipo di blocco
> nuovo o un cambio di `children.allow` è terreno di migrazione dei contenuti).

### Decisione 1 — Isolamento del canvas

**Opzione (a) — Status quo, nessuna modifica.** ADR-54 (rotta isolata, nessuna chrome admin)
+ ADR-42 (variabili CSS scopate sulla classe radice del canvas, colore forzato chiaro, token
`--cms-*` separati da `--theme-*`) restano il meccanismo di isolamento. Costo zero, nessuna
ADR nuova. Limite dichiarato: l'isolamento è per convenzione (classe CSS + scope esplicito),
non per confine di motore di rendering — un selettore troppo generico nel CSS del tema
potrebbe in teoria attraversarlo. Non risulta un incidente concreto che lo abbia dimostrato.

**Opzione (b) — Shadow DOM solo sulla radice del canvas**, shell (palette, ispettore,
toolbar) fuori dallo shadow tree. Isolamento CSS strutturale (nessun selettore del tema può
attraversare il confine), stesso documento e stesso albero React quindi **nessun ponte di
stato nuovo** — Zustand resta diretto, `dnd-kit` mantiene l'antenato comune richiesto da
ADR-32 §5 **se** il `DndContext` include lo shadow root nel proprio `document` di
riferimento (verifica preliminare non banale: `dnd-kit` usa `PointerEvent`/`getBoundingClientRect`
sul documento reale, il comportamento attraverso un confine shadow non è documentato dalla
libreria e andrebbe verificato con una spike prima di impegnarsi). Mantine monta i propri
portali (`Tooltip`, `Popover`, `Modal`) fuori dall'albero locale per default: andrebbero
ripuntati dentro lo shadow root o il canvas perderebbe tooltip/popover dei controlli interni.

**Opzione (c) — Iframe con documento separato.** Isolamento massimo, ma rompe ADR-32 §5 alla
radice (`DndContext` non attraversa un iframe senza un adattatore custom che nessuna versione
pubblica di `dnd-kit` fornisce) e richiede necessariamente la Decisione 2. È l'opzione più
vicina al comportamento di Elementor/Webflow reali, ed è l'unica che elimina strutturalmente
anche il rischio di leakage dichiarato come limite dell'opzione (a) — ma il costo è la row
successiva.

### Decisione 2 — Ponte di stato (rilevante solo se Decisione 1 = c)

**Opzione (a) — Nessun ponte** (conseguenza obbligata se Decisione 1 = a/b).

**Opzione (b) — postMessage con patch `immer`.** Introduce una dipendenza nuova (`immer`,
non nello stack — `docs/constitution.md` § "Regola sulle nuove dipendenze del dominio CMS"
si applica), una seconda istanza di store nell'iframe da tenere sincronizzata, e un costo di
latenza per ogni dispatch: il debounce di digitazione già tarato a 300ms (RFC-45, non 150ms
"finché non emerge un problema concreto di percepita lentezza") andrebbe ri-verificato con la
serializzazione postMessage nel percorso critico. Rischio diretto sul NFR "editor: 100 blocchi
interattivi entro 2s" (`docs/non-functional-requirements.md` § Performance), la stessa soglia
che ADR-28 §3 cita per vietare lo stato del drag nello store Zustand.

### Decisione 3 — Gerarchia e drop zone

**Opzione (a) — Nessun tipo nuovo.** Il modello esistente (`section` con colonne CSS Grid
non indirizzabili per figlio, ADR-31; `container` con layout flex e nesting ricorsivo via
sentinel `'*'`, ADR-39/41) resta la gerarchia. "Widget" sono gli altri tipi già registrati
(19 tipi in `app/backend/src/blocks/types/`, incluse `accordion`/`carousel`/`tabs`/`form`).
`dnd-kit` è già l'input layer (ADR-28), già con predicato `canDropInto` unico per
l'ammissibilità.

**Opzione (b) — Un tipo `Row` distinto da `container`.** Da giustificare: `container` con
`flexDirection: 'row'` copre già il caso d'uso dichiarato. Se la richiesta è realmente un
alias semantico per l'onboarding (nome più familiare a chi viene da Elementor), è un problema
di etichetta nella palette (`meta.label`, ADR-30), non di schema — non richiede un tipo nuovo.

**Opzione (c) — `Column` con assegnazione esplicita di figli a colonna.** Riapre
letteralmente l'alternativa scartata da ADR-31 ("trasforma `section` da contenitore a griglia
con celle indirizzabili, fuori perimetro"). Ammissibile solo con una motivazione nuova che
quell'ADR non aveva davanti, non come conseguenza automatica di questa RFC.

### Decisione 4 — Overlays & Controls

**Continuità, non conflitto.** `BlockHoverOverlay.tsx`, `InlineFloatingToolbar.tsx`, la
action bar generica (drag/seleziona padre/duplica/elimina) e la linguetta di `section`
coprono la maggioranza della superficie richiesta. Punto da confermare esplicitamente: le
"maniglie di ridimensionamento" — oggi esiste solo quella di `container.styleFlexBasis`
(`kind: 'unitValue'`, 0-100%, un token vincolato, non un pixel libero). Una maniglia di
ridimensionamento generica per proprietà arbitrarie (altezza, margini in pixel) richiederebbe
un nuovo `kind` di `PropSpec` con un range libero — lo stesso genere di apertura che ADR-29
§7 e ADR-38 hanno tenuto deliberatamente chiuso per restare su token, mai su misure libere.
Se la richiesta si ferma a `styleFlexBasis`-like (nuove props a token con maniglia), **nessuna
ADR nuova serve**; se richiede un valore libero in pixel, è una sesta decisione da aggiungere
qui prima di procedere.

### Decisione 5 — Breakpoint responsive

**Opzione (a) — Nessuna modifica.** Chiavi `default`/`tablet`/`mobile` (ADR-29 §2), soglie
CSS tablet ≤768px / mobile ≤480px (`style-tokens.module.css`, documentate in
`SPEC-F04-grid-responsive-engine.md` §1). Costo zero.

**Opzione (b) — Solo le soglie in pixel cambiano** (es. tablet ≤1023px, mobile ≤767px),
chiavi invariate. Le soglie vivono "solo in CSS, mai nel registro, mai nel contenuto" per
scelta esplicita di ADR-29 §2 — è quindi tecnicamente un ritocco CSS a basso rischio, senza
migrazione, ma **cambia il rendering di ogni pagina già pubblicata** che ha un valore
`tablet`/`mobile` salvato (il contenuto non cambia, la soglia a cui si attiva sì): va trattato
come una modifica visibile in produzione, non come un dettaglio interno, e verificato contro
le pagine esistenti prima del deploy.

**Opzione (c) — Rinominare `default` in `desktop`.** **Sconsigliata.** `default` è una chiave
letterale già persistita in `pages.content` (jsonb) su ogni pagina con almeno una prop
responsive salvata (produzione dal 2026-08-20, round F04c). Rinominarla è un cambio di forma
del contenuto esistente — la stessa classe di operazione che ADR-21 §1 qualifica come "deploy
a senso unico" e che richiede `v` incrementato + migrazione, non un ritocco di CSS. Va anche
contro la motivazione esplicita di ADR-29 §2 (il nome `default` evita l'apertura a un quarto
livello `wide` che `desktop` inviterebbe).

---

## Alternative valutate

- **Riscrivere l'intero canvas da zero attorno a un iframe, accettando la migrazione di
  `dnd-kit` a un fork o libreria alternativa con supporto cross-frame** — scartata in questa
  RFC per assenza di libreria di drag & drop cross-iframe matura nell'ecosistema React 19 al
  momento della stesura; riaprirebbe ADR-28 dalla base.
- **Portare avanti la SPEC come richiesta originariamente, senza passare da RFC/ADR** —
  scartata: violerebbe `docs/constitution.md` § Gerarchia delle decisioni (una Spec non può
  precedere le ADR che dovrebbe rispettare) e § AI Governance ("le AI non possono... auto-approvare
  RFC, ADR, Spec").

---

## Impatto

Dipende dalle opzioni scelte. Il ventaglio più leggero (tutte le opzioni "a", più
eventualmente "b" sulla Decisione 5) non tocca alcuna ADR esistente e non richiede ADR nuove:
è documentabile direttamente in una SPEC as-built, come già avvenuto per
`SPEC-F04-grid-responsive-engine.md`. Il ventaglio più pesante (Decisione 1 = c, quindi
Decisione 2 = b) richiede: nuova dipendenza `immer` autorizzata esplicitamente, ADR che
supera ADR-32 §5 sul luogo del `DndContext`, ADR che supera (non modifica: ADR-17 resta
storico) l'accesso diretto allo store per il ramo canvas, e una spike di verifica prima di
qualunque implementazione — nessun task di F04e parte prima che quella spike dia esito
scritto.

---

## Rischi

- **Isolamento CSS via iframe risolve un problema già chiuso da ADR-42**, al prezzo di
  rompere un vincolo strutturale di `dnd-kit` (ADR-32 §5) che oggi funziona e ha copertura
  E2E: il rapporto costo/beneficio della Decisione 1 = c va giudicato contro un rischio reale
  già mitigato, non contro un vuoto.
- **`immer` + postMessage nel percorso di digitazione** rischia di sforare il NFR "100 blocchi
  interattivi entro 2s" per lo stesso motivo per cui ADR-28 §3 vieta lo stato del drag nello
  store: seriale attraverso un canale asincrono, su un albero che può avere fino a
  `MAX_NODES: 500` nodi.
- **Rinominare `default` in `desktop` (Decisione 5c)** è irreversibile senza migrazione dei
  contenuti già pubblicati — il rischio più alto di questa RFC in rapporto al beneficio (un
  nome più familiare) se scelto senza la migrazione dichiarata a monte.
- **Riaprire ADR-31 (Decisione 3c)** senza una motivazione nuova rispetto a quella già
  valutata e respinta lascia un'incoerenza fra questa RFC e la sua stessa ADR di riferimento.

---

## Decisione umana

**Decisione 1 — Isolamento canvas**
**Esito**: [ ] (a) Status quo · [ ] (b) Shadow DOM sulla radice canvas · [x] **(c) Iframe + ponte di stato, vincolato a Same-Origin** · [ ] Rinviato

> **Precisazione vincolante rispetto al testo dell'opzione (c)**: l'iframe è **same-origin**
> (stesso dominio/scheme/porta del documento `/studio/:id`), mai cross-origin. Questo non
> elimina di per sé il vincolo di ADR-32(vecchia numerazione) § 5 — `dnd-kit` non attraversa
> un confine di `document` — ma rende disponibile l'accesso diretto a
> `iframe.contentWindow.document` e `iframe.contentDocument`, che l'opzione (c) generica non
> presupponeva. Il meccanismo di superamento del confine è formalizzato in **ADR-70**, non qui:
> questa RFC autorizza la direzione (iframe same-origin), l'ADR ne fissa il contratto tecnico.

**Decisione 2 — Ponte di stato** (rilevante solo se D1 = c)
**Esito**: [ ] (a) Nessun ponte · [ ] (b) postMessage + `immer` · [x] **Meccanismo alternativo, non enumerato sopra: Same-Origin Direct Store Synchronization (riferimento diretto allo store Zustand via `contentWindow`, nessuna serializzazione)** · [ ] N/A (D1 ≠ c)

> Non è l'opzione (b) di questa RFC: evita la dipendenza `immer` (non nello stack,
> `docs/constitution.md` § Regola sulle nuove dipendenze) e il costo di latenza/serializzazione
> `postMessage` segnalato come rischio in Decisione 2 e in "Rischi", proprio perché same-origin
> consente di esporre l'istanza dello store (non una sua copia serializzata) attraverso
> `contentWindow`. Formalizzato in **ADR-70**.

**Decisione 3 — Gerarchia e drop zone**
**Esito**: [x] **(a) Nessun tipo nuovo** · [ ] (b) Alias `Row` = `container` (solo etichetta) · [ ] (c) `Column` con assegnazione esplicita · [ ] Rinviato

> Conferma esplicita del modello esistente: `section` (colonne CSS, ADR-31 vecchia numerazione)
> e `container` (flex, nesting ricorsivo, ADR-39/41) restano l'unica gerarchia. Nessuna ADR
> nuova per quest'area — è status quo, non una decisione da formalizzare oltre questa RFC.

**Decisione 4 — Overlays & Controls**
**Esito**: [ ] Continuità (estendere overlay esistenti, maniglie solo su props a token) · [x] **Richiede un'estensione a valore libero (px e %) — formalizzata come estensione del `kind: 'unitValue'` già esistente (ADR-38), non un `kind` nuovo** · [ ] Rinviato

> Maniglie di resize a valore dinamico in px/%, su props aggiuntive oltre
> `container.styleFlexBasis`. Non riapre ADR-29 § 1 ("token, mai una misura") per le props a
> scala di token esistenti: usa l'infrastruttura `unitValue` già approvata da ADR-38 § 2
> (valore `{ value, unit }`, `min`/`max` e lista `units` dichiarati per prop — restano
> **obbligatori**, "valore libero" significa libertà dal token discreto, non dal range).
> Formalizzato in **ADR-71**.

**Decisione 5 — Breakpoint responsive**
**Esito**: [x] **(a) Nessuna modifica** · [ ] (b) Solo soglie CSS · [ ] (c) Rinominare `default`→`desktop` · [ ] Rinviato

> Confermato con l'umano dopo segnalazione di un'incoerenza nella richiesta originale (soglia
> "1024px" non corrisponde a nessun valore reale: le soglie in vigore restano tablet ≤768px /
> mobile ≤480px, ADR-29 § 2). Nessun cambio di soglie, nessuna chiave nuova. Si documenta solo,
> in `SPEC-F04-super-elementor.md`, che la chiave `default` **rappresenta semanticamente** il
> desktop (è il valore che vale sopra la soglia `tablet`), senza introdurre un quarto nome né
> un valore numerico associato a "desktop" nel registro o nel contenuto.

**Note**: Due numeri ADR erano già occupati da decisioni precedenti e non correlate
(`ADR-31-layout-colonne-section.md`, `ADR-32-navigator-editor-fullscreen.md`, entrambe
approvate). Le ADR di superamento per le Decisioni 1/2 e 4 di questa RFC sono quindi numerate
**ADR-70** e **ADR-71** (prossimi numeri liberi in sequenza), non ADR-31/32 come indicato nella
richiesta originale che ha originato questa firma.

**Approvato da**: marketing@antelmagroup.net · **Data**: 2026-09-14

**Azione successiva**: [x] Genera ADR-70 (Decisioni 1+2) e ADR-71 (Decisione 4) · [x] Genera SPEC-F04-super-elementor.md as-built sulle sole decisioni approvate · [ ] Archivio
