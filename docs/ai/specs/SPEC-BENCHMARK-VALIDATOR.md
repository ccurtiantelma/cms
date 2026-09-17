# SPEC — Requisiti di Benchmark del `BlockTreeValidatorService`

## Status
[x] Bozza — round R0 di `docs/PLAN-parita-elementor-pro.md` · [ ] Approvata · [ ] Superseded

## Dominio
`docs/ai/INDEX.md` § "Schema & Migrazione Blocchi JSON". Riferimento di codice:
`app/backend/src/blocks/validator/block-tree-validator.service.ts`.

## ADR applicabili
- `ADR-21-schema-blocchi-versionamento.md` — il validatore è l'unico interprete che
  legge il registro; questa spec non ne cambia il contratto funzionale, ne fissa il
  contratto di prestazione.
- `ADR-75`/`ADR-76`/`ADR-78` (questo round) — ognuna aggiunge rami allo `switch`
  esaustivo di `validatePropValue` (nuovi `kind`, nesting `stateful`, chiavi
  configurabili): il costo per nodo cresce con il numero di `kind` complessi
  dichiarati da un blocco, non solo con la dimensione dell'albero. Questo benchmark
  esiste apposta per misurare quell'effetto prima che si accumuli silenziosamente
  round dopo round.
- `docs/PLAN-parita-elementor-pro.md` § R2 T7 — dichiara il vincolo di destinazione
  (`MAX_DEPTH 8`/`MAX_NODES 1500`, "< 50 ms su 1500 nodi"). Questa spec **restringe**
  quel numero a **< 20 ms**, § "Perché 20 ms e non 50 ms" motiva lo scostamento.

## Stato di partenza (letto dal codice, 2026-09-17)
`BlockTreeValidatorService.validateTree`/`validateNode` (righe 106-177) **non applica
oggi alcun limite di profondità o di numero di nodi**: la ricorsione su `node.children`
prosegue fino a esaurire l'albero fornito, senza guardia. `MAX_DEPTH`/`MAX_NODES` non
esistono ancora come costanti nel codice: sono un requisito dichiarato nel piano
(R2 T7) ma non ancora implementato. Questa spec **precede** quell'implementazione — è
il contratto di prestazione che l'implementazione di R2 T7 deve soddisfare fin dal
primo commit che introduce il guard, non un benchmark aggiunto a posteriori.

## Outcomes tecnici
Al termine dell'implementazione esiste: (a) le due costanti `MAX_DEPTH = 8`/
`MAX_NODES = 1500` in `block-tree-validator.service.ts`, con relativi codici di errore
nell'insieme chiuso esistente; (b) una suite di benchmark eseguibile in CI
(`block-tree-validator.bench.spec.ts` o equivalente, Jest + `perf_hooks`) che genera
alberi sintetici alle soglie dichiarate e asserisce il tempo di esecuzione; (c) un
gate CI che fallisce la pipeline se il benchmark supera la soglia.

## In scope
- Definizione degli alberi sintetici di riferimento (§ 1).
- Soglia di tempo e metodo di misurazione (§ 2).
- Guardia di profondità/nodi e suo punto di innesto nella ricorsione esistente (§ 3).
- Instrumentazione CI e criteri di fallimento (§ 4).

## Out of scope
- Ottimizzazione del validatore oltre quanto necessario a rientrare nella soglia:
  questa spec fissa il contratto, non prescrive l'implementazione (memoizzazione,
  early-exit, worker thread — tutte fuori scopo salvo necessità dimostrata).
- Benchmark di `BlockPropSanitizerService` (stadio successivo della pipeline, ADR-21 §
  3.7): ha un proprio costo (parsing `sanitize-html`/`css-tree`, ADR-78) e merita una
  spec di benchmark a sé se necessario, non coperta qui.

---

## 1. Alberi sintetici di riferimento

Il benchmark genera alberi deterministici (seed fisso, nessuna randomicità fra run,
per rendere il numero riproducibile e comparabile fra commit) secondo tre profili,
tutti sotto il vincolo `MAX_NODES = 1500`/`MAX_DEPTH = 8` dichiarato da R2 T7:

| Profilo | Forma | Nodi | Profondità | Motivo |
|---|---|---|---|---|
| **Largo** | Radice `container` con ~187 figli diretti `container`, ognuno con 7 figli foglia (`heading`/`richText`/`image`/`button` in rotazione) | 1500 | 3 | Caso realistico dominante: pagine "a sezioni" con molti blocchi fratelli, poca nidificazione — il caso che una Loop/grid a griglia (ADR-79/R7) produce per costruzione |
| **Profondo** | Catena di `container` annidati fino a `MAX_DEPTH` (8 livelli), ogni livello con 2-3 figli, fino a esaurire 1500 nodi in ampiezza distribuita sugli 8 livelli | 1500 | 8 | Caso peggiore per una validazione ricorsiva: verifica che il costo per livello di ricorsione (nuovo stack frame, nuovo `path` di stringa concatenata) non degradi in modo non lineare |
| **Denso di `kind` complessi** | 1500 nodi `button`/`container` che dichiarano **ogni** prop `stateful`+`responsive` introdotta da questo round (`background`, `typography`, `transform`, `filter`, `border`, `shadow` — ADR-75), ciascuna valorizzata con tutti e 4 gli stati × tutti i 7 breakpoint attivabili (ADR-76) | 1500 | 4 | Isola il costo introdotto **da questo round** (ADR-75/76/78) rispetto al costo strutturale puro dei due profili sopra: senza questo profilo, un rallentamento di `validatePropValue` sui nuovi `kind` potrebbe restare invisibile su alberi "larghi" con blocchi semplici |

Ogni profilo è generato da una funzione pura e riusabile
(`buildSyntheticTree(profile, nodeCount)` in un file di fixture condiviso), non
duplicata inline nel test — coerente con il resto della suite di test del validatore,
che già riusa fixture per gli alberi di regressione.

## 2. Soglia di tempo e metodo di misurazione

**Vincolo: `validateTree()` su ciascuno dei tre profili sopra completa in < 20 ms**,
misurato come mediana di 20 esecuzioni consecutive nello stesso processo Node (per
attenuare il rumore di JIT warm-up: la prima esecuzione fredda non entra nella
mediana, coerente con la pratica standard di micro-benchmark su V8). Il tempo è
misurato con `performance.now()` immediatamente prima/dopo la chiamata a
`validateTree`, **esclusa** la generazione dell'albero sintetico (che avviene una sola
volta prima del loop di misurazione, non ad ogni iterazione).

### Perché 20 ms e non 50 ms
`PLAN-parita-elementor-pro.md` § R2 T7 dichiara "< 50 ms su 1500 nodi" come vincolo di
piano. Questa spec lo restringe a **< 20 ms** per un motivo concreto legato al punto in
cui il validatore viene invocato oggi: ogni salvataggio di bozza (`PATCH` su una
Pagina) passa dal validatore **in modo sincrono, dentro la richiesta HTTP**, prima
della sanitizzazione e della persistenza (ADR-21 § 3). Un salvataggio "a ogni pausa di
digitazione" (autosave, pattern già in uso nell'editor) con 1500 nodi e 50 ms di solo
validator sommerebbe una latenza percepibile alla scrittura e alla sanitizzazione a
valle. 20 ms lascia margine per gli stadi successivi della stessa richiesta
(sanitizzazione, query di UPDATE con lock ottimistico) restando sotto una soglia di
"risposta immediata" complessiva. Il numero non è negoziato al ribasso arbitrariamente:
è il 40% del vincolo di piano, scelto per lasciare margine esplicito e misurabile,
non per azzerarlo.

## 3. Guardia di profondità/nodi

L'implementazione di `MAX_DEPTH`/`MAX_NODES` (R2 T7, non ancora scritta) si innesta
nella ricorsione esistente con due condizioni verificate **prima** di scendere sui
figli di un nodo, non dopo aver già validato l'intero sottoalbero (fail-fast, evita di
pagare il costo di validazione di un ramo che verrà comunque rifiutato per dimensione):

- **`MAX_DEPTH` (8)**: un parametro di profondità corrente, incrementato ad ogni
  chiamata ricorsiva di `validateNode` (oggi assente dalla firma, § "Outcomes tecnici"
  lo aggiunge), confrontato contro la soglia. Un nodo all'ottavo livello con figli
  produce un errore dedicato (`BLOCK_TREE_MAX_DEPTH_EXCEEDED`, nuovo codice — non
  riusa `BLOCK_NESTING_NOT_ALLOWED`, che ha semantica di *tipo* non ammesso in quella
  posizione, non di *profondità* eccessiva) e **non scende oltre su quel ramo**,
  mentre il resto dell'albero continua a essere validato (stesso principio "mai
  fermarsi al primo errore" già in vigore, righe 121, 169-170).
- **`MAX_NODES` (1500)**: un contatore condiviso fra tutte le chiamate ricorsive di
  una singola invocazione di `validateTree` (stato locale alla chiamata, mai un
  campo di istanza del servizio — il servizio è stateless e riusato fra richieste
  concorrenti, coerente con l'iniezione Nest `@Injectable()` di default singleton).
  Al superamento della soglia, la validazione dell'intero albero si interrompe con un
  singolo errore (`BLOCK_TREE_MAX_NODES_EXCEEDED`, senza `path` di un nodo specifico:
  è un vincolo sull'albero nel suo complesso, non su un nodo) — a differenza di
  `MAX_DEPTH`, qui **non ha senso continuare a collezionare altri errori**: un albero
  che eccede 1500 nodi è respinto per intero, la sua forma esatta oltre la soglia non
  è rilevante per l'autore (business-rules.md § Blocchi regola 4, "la persistenza è
  sempre integrale o nulla", si applica identica: un rifiuto è un rifiuto, il dettaglio
  di *quali* nodi oltre il 1500° sarebbero stati validi non aggiunge informazione
  utile).

Questi due controlli sono **prima** della validazione di tipo/props del nodo corrente,
non dopo: un nodo oltre `MAX_DEPTH` non viene validato nelle sue props (nessun lavoro
sprecato su un ramo già respinto per struttura).

## 4. Instrumentazione CI e criteri di fallimento

- Il benchmark gira come step dedicato della pipeline CI (`npm run test:bench` o
  incluso nel job `npm test` con un progetto Jest separato — dettaglio di
  implementazione, non vincolato da questa spec), **non** come parte della suite di
  unit test ordinaria: un benchmark che fallisce per rumore di macchina CI (non per
  regressione reale) non deve bloccare una pull request non collegata alle prestazioni
  del validatore in modo intermittente — la mediana su 20 run (§ 2) è la mitigazione
  principale, un margine di tolleranza esplicito (soglia CI a 25 ms, non 20 ms netti)
  assorbe la varianza residua di un runner condiviso.
- Il gate fallisce la pipeline (non un semplice warning) quando la mediana supera la
  soglia CI su **uno qualunque** dei tre profili del § 1: i tre profili non si
  compensano a vicenda (un profilo "Largo" veloce non giustifica un profilo "Denso di
  `kind` complessi" lento — sono rischi indipendenti).
- Il report del benchmark (tempo mediano per profilo, per ogni run CI) viene
  conservato come artifact della pipeline per costruire una serie storica — nessuna
  infrastruttura di dashboard richiesta da questa spec, il file di output è
  sufficiente come base per un'analisi futura se le soglie iniziano a essere sfiorate
  sistematicamente (segnale di debito tecnico da aprire come voce in `docs/TODO.md`,
  non da questa spec).

## Criteri di verifica
- I tre alberi sintetici del § 1 sono generati da fixture riusabile, deterministica
  (stesso input → stesso albero, verificato da un test che confronta due generazioni
  consecutive).
- `validateTree()` su ciascun profilo, mediana di 20 run a freddo escluso il primo,
  è < 20 ms in ambiente di sviluppo locale e < 25 ms nel gate CI.
- Un albero a `MAX_NODES + 1` produce esattamente un errore
  `BLOCK_TREE_MAX_NODES_EXCEEDED`, nessun altro errore collezionato insieme.
- Un albero con un ramo a `MAX_DEPTH + 1` produce `BLOCK_TREE_MAX_DEPTH_EXCEEDED` sul
  nodo eccedente **e** continua a validare gli altri rami dell'albero (verificato con
  un albero che ha sia un ramo troppo profondo sia un errore di tipo indipendente su
  un altro ramo: entrambi gli errori compaiono nel risultato).
- Un albero valido a esattamente `MAX_NODES`/`MAX_DEPTH` (soglia inclusa, non
  superata) valida senza errori di struttura — test di confine esplicito, non solo
  del caso "oltre soglia".
