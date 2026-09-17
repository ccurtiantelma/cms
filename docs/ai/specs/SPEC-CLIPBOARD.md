# SPEC — Clipboard Cross-Page: copia/incolla di nodi e sotto-alberi di blocchi

## Status
[x] Bozza — round R3 di `docs/PLAN-parita-elementor-pro.md` § T4 · [ ] Approvata · [ ] Superseded da SPEC-XXX

## Dominio
`docs/ai/INDEX.md` § "Parità Elementor Pro — R0 Decisioni fondative" (la riga copre anche i round
che ne dipendono, R3 incluso, finché l'INDEX non viene aggiornato con una riga propria — stessa nota
di allineamento già usata da `docs/ai/specs/SPEC-PROPKIND-V2-DETAILS.md` e
`docs/ai/specs/SPEC-GLOBAL-KIT.md`).

## Relazione con gli altri documenti
Questo documento **non introduce alcun `kind` nuovo** nel registro dei blocchi
(`docs/SPEC-propkind-v2.md`): il payload trasporta un `BlockNode` (o un array di `BlockNode`
fratelli) già valido secondo il registro corrente al momento della copia, mai un formato dati
parallelo o un valore eseguibile.

- Riusa **lo stesso, unico punto di rigenerazione ricorsiva degli `id` di nodo** già stabilito da
  `docs/ai/adr/ADR-34-subtree-insertion-engine-preset-statici.md` § 2 ("un solo punto di
  rigenerazione UUID ricorsiva nel codebase, non due") e già esteso da
  `docs/ai/adr/ADR-56-template-library-import-export-json.md` § 1 per l'import/export JSON di
  sotto-alberi: la funzione è quella già usata da `duplicateSubtree`/`insertSubtreeAction`
  (`block-tree.utils.ts`, `crypto.randomUUID()`), mai una terza implementazione.
- Riusa il principio "l'euristica client anticipa, il validatore server-side resta l'autorità" già
  stabilito da ADR-34 § 3 e ADR-56 § 2 per l'import di JSON: `canContainType` e
  `CONTENT_TREE_LIMITS.maxDepth`/`maxNodes` lato client anticipano il verdetto; `BlockTreeValidatorService`
  lato server, invocato al salvataggio della bozza, resta invariato e autoritativo.
- Il meccanismo di firma HMAC è nuovo per questo dominio ma non per il progetto: segue lo stesso
  pattern già in produzione di `FORM_ANTISPAM_SECRET` (`ADR-46-dynamic-form-builder.md` § 3,
  HMAC-SHA256 di una chiave applicativa con un segreto d'ambiente dedicato) e di
  `PAGE_PREVIEW_TOKEN_SECRET` (`ADR-25-anteprima-bozza-non-pubblicata.md` § 1, segreto dedicato e
  distinto da `SECURITY_KEY` per limitare il danno di una fuga a un solo uso) — nessuna libreria di
  crittografia nuova, `crypto.createHmac`/`crypto.timingSafeEqual` (Node, già in uso).
- `docs/PLAN-parita-elementor-pro.md` § R3 T4: *"Copia/Incolla nodo: clipboard interno +
  `navigator.clipboard` JSON firmato (HMAC per ambiente) per cross-pagina/cross-tab; 'Incolla' in
  menu contestuale e Ctrl+V su selezione."*
- `CanvasContextMenu.tsx` (esistente) già dichiara `copyStyleAction`/`pasteStyleAction` sullo stesso
  store (`useBlockEditorStore`): questo documento estende lo stesso menu con `copyNodeAction`/
  `pasteNodeAction`, stesso punto di innesto UI, azione diversa e non sovrapposta.

## ADR applicabili
- `ADR-21-schema-blocchi-versionamento.md` — ordine di pipeline invariato: un nodo incollato
  attraversa comunque `envelope → migrazione → validazione → sanitizzazione → persistenza` al
  salvataggio della bozza, indipendentemente dalla propria provenienza (digitato, duplicato,
  template, clipboard).
- `ADR-34-subtree-insertion-engine-preset-statici.md` — punto unico di rigenerazione `id`,
  principio "anticipa, non sostituisce" per la validazione client.
- `ADR-46-dynamic-form-builder.md` § 3 — precedente diretto per il pattern HMAC-SHA256 con segreto
  d'ambiente dedicato.
- `ADR-56-template-library-import-export-json.md` — precedente diretto per l'euristica di
  validazione client su contenuto esterno all'albero corrente.

## Principi
1. Il payload trasportato è **sempre e solo** uno o più `BlockNode` fratelli, validi secondo il
   registro corrente al momento della copia — mai codice eseguibile, mai una stringa CSS/HTML
   libera fuori dai `kind` già regolati da `ADR-78-sanitizzazione-css-e-sandbox-html.md`.
2. Il clipboard **interno** (stesso tab, stessa sessione dello store) e il clipboard **di sistema**
   (`navigator.clipboard`, cross-tab/cross-pagina) sono due canali distinti con la stessa origine
   dati: ogni "Copia" scrive su entrambi, ogni "Incolla" preferisce l'interno quando disponibile.
3. La firma HMAC autentica **la provenienza** (questa stessa installazione del CMS), non sostituisce
   e non anticipa la validazione di dominio: un payload con firma valida ma tipo di blocco
   sconosciuto o annidamento non ammesso è comunque respinto dagli stessi controlli di ADR-34 § 3/§ 4.
4. Nessun `id` di nodo presente nel payload sopravvive all'incolla: la rigenerazione è totale e
   ricorsiva, sempre, anche per un payload proveniente dallo stesso tab (stessa garanzia già offerta
   da `duplicateSubtree` per la duplicazione in-canvas).

---

## 1. Schema del payload

### 1.1 Struttura del nodo trasportato
Il payload trasporta il/i nodi **esattamente come vivono nell'albero dell'editor** (`BlockNode`,
`block-tree.utils.ts`): `{ id, type, props, children }`. Nessuna proiezione o riduzione: `props` è
l'oggetto integrale già validato lato client per la sessione di editing corrente, incluse le forme
`stateful`/`responsive` (ADR-75/ADR-29) che porta al momento della copia.

### 1.2 Involucro (envelope) del clipboard

```ts
interface ClipboardEnvelope {
  v: 1;                       // versione dell'involucro, elenco chiuso — un salto futuro è additivo, mai una riscrittura muta
  nodes: BlockNode[];         // 1..20 nodi fratelli copiati nello stesso momento (§ 1.3)
  copiedAt: string;           // ISO-8601, solo diagnostico — mai usato per decidere la validità
  originHint: {
    pageGuid: string | null;  // guid della Pagina/Sezione globale/Template di origine, solo diagnostico
    blockType: string;        // type del nodo radice copiato (o del primo, se selezione multipla) — solo per il messaggio di conferma "Blocco 'button' copiato", mai per decidere la validità
  };
}

interface SignedClipboardPayload {
  envelope: ClipboardEnvelope;
  sig: string; // hex, HMAC-SHA256 (§ 2), calcolata sulla forma canonica di `envelope` (§ 2.3)
}
```

`v` è un elenco chiuso a un solo valore oggi (`1`): un incolla che riceve un `v` diverso da quelli
noti è respinto con lo stesso trattamento di un payload malformato (§ 4), mai un tentativo di
migrazione dell'involucro stesso — l'involucro non è contenuto persistito, non ha bisogno della
stessa garanzia di sopravvivenza di ADR-21.

### 1.3 Selezione multipla
Il clipboard accetta **fino a 20 nodi fratelli** copiati in un solo gesto (stesso ordine di
grandezza già implicito nei preset statici di ADR-34, nessun requisito del gap analysis chiede di
più per R3): una selezione di N nodi allo stesso livello (meccanismo di selezione multipla nel
Navigator o Ctrl+click nel canvas — non normato da questo documento, a carico dell'implementazione
frontend) produce un solo `ClipboardEnvelope` con `nodes.length === N`. Un incolla inserisce tutti
gli N nodi, nello stesso ordine, a partire dal punto di destinazione — stesso principio di
inserimento di `insertSubtreeAction`, esteso a più nodi in sequenza invece di uno solo; `N === 1` è
lo stesso codice, non un ramo speciale.

### 1.4 Limiti dimensionali
Il payload complessivo (somma di tutti i nodi copiati, sotto-alberi inclusi) rispetta gli stessi
`CONTENT_TREE_LIMITS` già derivati da `app/backend/src/pages/content-tree.ts`
(`ADR-82-container-unificato-grid-flex.md`: `MAX_DEPTH = 8`, `MAX_NODES = 1500`) — non un limite
nuovo, una proiezione dello stesso: nessun sotto-albero copiato può eccedere da solo il numero
massimo di nodi ammesso nell'intera pagina di destinazione. Un payload che eccede è respinto
**prima** della verifica HMAC (§ 4, ordine dei controlli) — un controllo di forma economico non deve
attendere una chiamata di rete per fallire.

---

## 2. Firma HMAC

### 2.1 Segreto
Nuova variabile d'ambiente **`CLIPBOARD_HMAC_SECRET`** (backend, mai esposta al frontend — nessun
prefisso `VITE_`), stesso principio già dichiarato per `PAGE_PREVIEW_TOKEN_SECRET`/
`FORM_ANTISPAM_SECRET`: segreto dedicato e distinto da `SECURITY_KEY`, così che una fuga limiti il
danno a questo solo uso. Algoritmo `HMAC-SHA256` (`crypto.createHmac('sha256', secret)`, stessa
primitiva già in uso per `FORM_ANTISPAM_SECRET`), nessuna libreria di crittografia nuova.

### 2.2 Cosa firma, cosa verifica
1. **Firma (in copia)**: il frontend invia `POST app/blocks/clipboard/sign` con `{ envelope }`
   (§ 1.2, senza `sig`) al backend. Il backend calcola la stringa canonica di `envelope` (§ 2.3) e
   restituisce `{ sig: HMAC-SHA256(canonica, CLIPBOARD_HMAC_SECRET) }`. Il frontend compone
   `SignedClipboardPayload` e lo scrive sul clipboard di sistema (§ 3.2).
2. **Verifica (in incolla)**: il frontend invia `POST app/blocks/clipboard/verify` con l'intero
   `SignedClipboardPayload` letto dal clipboard di sistema. Il backend **ricalcola** la stringa
   canonica di `envelope` a partire dall'oggetto ricevuto (mai fidandosi di una stringa canonica
   inviata dal client) e confronta l'HMAC ricalcolato con `sig` tramite `crypto.timingSafeEqual`
   (confronto a tempo costante, previene un attacco a canale laterale sul confronto byte-a-byte).
   Risposta `{ valid: boolean }`, mai il dettaglio del motivo (§ 4).
3. **Il segreto non lascia mai il backend**: né l'endpoint di firma né quello di verifica lo
   restituiscono in alcuna forma, diretta o derivata. Questo è il motivo per cui entrambe le
   operazioni richiedono un round-trip di rete anche per un incolla nello stesso tab — mitigato dal
   clipboard **interno** (§ 3.1), che non richiede mai una chiamata di rete perché non attraversa
   mai il confine di firma.

### 2.3 Canonicalizzazione
La stringa su cui si calcola l'HMAC è la serializzazione JSON di `envelope` con le chiavi di ogni
oggetto **ordinate alfabeticamente in modo ricorsivo** (gli array mantengono l'ordine originale, mai
riordinati) — stesso principio "nessuna ambiguità di serializzazione" già implicito nella build
deterministica di ADR-53 e in `SPEC-PROPKIND-V2-DETAILS.md` § 10 punto 2 ("due export dello stesso
contenuto producono byte identici"). Una funzione pura e condivisa
(`canonicalizeClipboardEnvelope(envelope): string`) vive **solo** lato backend (unico luogo che
firma e verifica) — il frontend non calcola mai una forma canonica propria, invia l'oggetto grezzo e
si fida della risposta del backend.

### 2.4 Cosa l'HMAC protegge, cosa non protegge
- **Protegge**: l'autenticità della provenienza (il payload è stato prodotto da un'azione "Copia" di
  questa stessa installazione, con questo stesso segreto) e l'integrità (nessuna alterazione
  byte-a-byte dopo la firma). Questo permette di **fallire rapidamente e con un messaggio chiaro**
  ("Contenuto degli appunti non riconosciuto") quando l'utente incolla testo che non è un payload di
  questo CMS — un file JSON qualunque presente sul clipboard di sistema per un motivo estraneo, o un
  payload di un'altra installazione con un segreto diverso — invece di un errore di
  parsing/validazione oscuro o, peggio, un tentativo silenzioso di interpretarlo come albero di
  blocchi.
- **Non protegge**: la validità di dominio del contenuto (tipo di blocco noto, annidamento ammesso,
  intervalli di prop) — quella resta, come sempre, il validatore server-side invocato al salvataggio
  della bozza (ADR-21 § 3.7, principio invariato). Una firma valida su un `envelope` con un `type`
  non più nel registro (es. un blocco copiato da una versione precedente del CMS il cui tipo è stato
  rimosso) supera la verifica HMAC ma fallisce comunque ai controlli di forma del § 4 punto 5.
- **Non è un controllo di autorizzazione per pagina**: la firma non lega il payload a una Pagina, un
  utente o una sessione specifica — un Manager che copia da una Pagina e incolla in un'altra Pagina
  che non potrebbe modificare direttamente è comunque fermato dal controllo RBAC ordinario
  sull'endpoint di salvataggio della bozza di destinazione (invariato, non duplicato qui).

---

## 3. Due canali, un solo punto di rigenerazione

### 3.1 Clipboard interno (same-tab)
Una nuova fetta dello store esistente (`useBlockEditorStore`, accanto a `copyStyleAction`/
`pasteStyleAction` già presenti in `CanvasContextMenu.tsx`): `internalClipboard: BlockNode[] | null`,
popolata da `copyNodeAction(nodeIds: string[])` con una copia **profonda** (mai un riferimento) dei
nodi selezionati, così come si trovano nell'albero al momento della copia. Nessuna firma, nessuna
chiamata di rete: vive solo in memoria per la durata della sessione del tab, si azzera al
reload/chiusura — stessa natura effimera già accettata per `copyStyleAction`.

### 3.2 Clipboard di sistema (cross-tab/cross-pagina)
`copyNodeAction` **anche** compone `ClipboardEnvelope`, chiama `POST app/blocks/clipboard/sign`
(§ 2.2 punto 1), e scrive il `SignedClipboardPayload` serializzato su `navigator.clipboard.writeText()`
(Clipboard API asincrona, permessa senza prompt in un contesto sicuro a partire da un gesto utente
diretto — il click su "Copia" lo è per costruzione). Se la chiamata di firma fallisce (rete assente,
backend irraggiungibile), il clipboard **interno** resta comunque popolato: il fallimento della via
cross-tab non blocca la via same-tab, un solo avviso non bloccante informa che "Incolla in un'altra
scheda" non sarà disponibile per questa copia.

### 3.3 Lettura in incolla
`pasteNodeAction(targetParentId, targetIndex)`:
1. Se `internalClipboard` non è vuoto: usa direttamente quello, nessuna rete, nessuna verifica HMAC
   (il canale non lascia mai il processo del browser che l'ha scritto — non c'è provenienza da
   autenticare).
2. Altrimenti (clipboard interno vuoto: nuovo tab, nuova pagina dopo reload, o cross-browser):
   l'azione "Incolla" o l'evento `paste` (Ctrl+V) legge il testo dal clipboard di sistema — evento
   `paste` con `event.clipboardData.getData('text/plain')` per l'incolla da tastiera (sincrono,
   nessun prompt di permesso, coerente con "Ctrl+V su selezione" di `PLAN-parita-elementor-pro.md`
   § R3 T4), oppure `navigator.clipboard.readText()` per la voce di menu contestuale "Incolla"
   (asincrono, richiede un gesto utente diretto già garantito dal click sul menu). `JSON.parse` in
   try/catch: fallimento → tratta come testo semplice, nessuna azione (non è un errore, è "l'utente
   ha incollato del testo normale", stesso trattamento silenzioso di ogni editor di testo).
3. Se il parsing produce un oggetto con la forma di `SignedClipboardPayload` (chiavi
   `envelope`/`sig` presenti): procede al controllo di forma e alla verifica HMAC (§ 4).

### 3.4 Rigenerazione degli id (punto unico, invariato da ADR-34)
Sia il percorso interno sia quello di sistema, una volta accettato il payload, passano **entrambi**
dalla stessa funzione di rigenerazione ricorsiva già usata da `duplicateSubtree`/
`insertSubtreeAction` (ADR-34 § 2): ogni nodo copiato, radice e discendenti, riceve un nuovo `id`
(`crypto.randomUUID()`), mai riusato l'`id` originale — questo è ciò che elimina per costruzione ogni
collisione nell'albero di destinazione, anche quando origine e destinazione sono la stessa Pagina
(incolla dopo copia, nello stesso punto). Nessuna terza implementazione di questa rigenerazione:
questo documento **estende l'uso** della funzione esistente a un terzo chiamante (dopo duplicazione
in-canvas e import JSON di ADR-56), non ne scrive una nuova.

---

## 4. Ordine dei controlli e trattamento degli errori

Un incolla dal clipboard di sistema attraversa, **in quest'ordine**, controlli a costo crescente
(falliscono presto quando possibile):

1. **Parsing JSON** (§ 3.3 punto 2) — fallimento: nessuna azione, trattato come testo semplice.
2. **Forma dell'involucro**: `v` noto, `envelope`/`sig` presenti, `nodes` è un array non vuoto di
   lunghezza ≤ 20 (§ 1.3) — fallimento: notifica "Contenuto degli appunti non riconosciuto", nessuna
   chiamata di rete.
3. **Limiti dimensionali** (§ 1.4): profondità/numero di nodi del sotto-albero più esteso in `nodes`
   proiettato nell'albero di destinazione — fallimento: notifica "Il contenuto incollato supera i
   limiti della pagina", stesso messaggio già in uso per `insertSubtreeAction`/import JSON (ADR-56).
4. **Verifica HMAC** (`POST app/blocks/clipboard/verify`, § 2.2 punto 2) — fallimento
   (`valid: false`): notifica "Contenuto degli appunti non riconosciuto o alterato" — **stesso
   messaggio del punto 2**, deliberatamente: distinguere "forma non valida" da "firma non valida"
   nell'interfaccia darebbe a un tentativo di forgiatura un segnale su quale parte del controllo ha
   fallito (stesso principio di non rivelare il motivo esatto già adottato per gli errori di
   autenticazione, `docs/constitution.md` § Security baseline).
5. **Validazione euristica di dominio** (client, anticipatoria — ADR-34 § 3/ADR-56 § 2):
   `canContainType` nel punto di destinazione per ogni nodo radice di `nodes`, tipo noto nel registro
   frontend — fallimento: notifica specifica per nodo ("Il blocco 'xyz' non è ammesso qui"), **questo**
   messaggio può essere specifico perché non riguarda l'autenticità, riguarda una regola di dominio
   pubblica (le stesse regole di annidamento sono visibili a chiunque usi l'editor).
6. **Rigenerazione id + inserimento** (§ 3.4): sempre l'ultimo passo, mai eseguito se uno dei
   controlli precedenti fallisce.
7. **Validazione server-side autoritativa**: invariata, avviene al primo salvataggio della bozza
   dopo l'incolla (`PATCH app/pages/:guid`), esattamente come per ogni altro contenuto — questo
   documento non introduce né bypassa alcun controllo in quel punto.

Nessun controllo di questa catena persiste uno stato: un incolla respinto non lascia traccia
nell'albero (nessun inserimento parziale), stesso principio "mai un albero parzialmente valido" di
`docs/business-rules.md` § Blocchi regola 4.

---

## 5. Endpoint

| Metodo | Path | Autenticazione | Note |
|---|---|---|---|
| `POST` | `app/blocks/clipboard/sign` | JWT, qualunque ruolo con accesso all'editor a blocchi (nessuna soglia RBAC aggiuntiva — la firma non concede alcun privilegio, autentica solo la provenienza) | Body `{ envelope }`; risposta `{ sig }`. Rate limiting standard (`ADR-1-rate-limiting-auth.md`), stesso bucket delle altre azioni di editing frequenti. |
| `POST` | `app/blocks/clipboard/verify` | JWT, stessa soglia di sopra | Body `{ envelope, sig }`; risposta `{ valid: boolean }`, mai un dettaglio del motivo. Rate limiting standard. |

Nessuna delle due rotte legge o scrive `pages`/`page_revisions`/alcuna tabella: sono funzioni
crittografiche pure esposte via HTTP, stateless, senza alcuna riga di persistenza — coerente con
"nessuna modifica allo schema PostgreSQL" già dichiarato da ogni ADR del round R0 per decisioni di
questa natura.

---

## 6. Fuori scope

- **Clipboard condiviso fra utenti diversi** (copia da un utente, incolla da un altro): il clipboard
  di sistema è per costruzione locale al dispositivo/browser dell'utente, questo documento non
  introduce alcuna sincronizzazione server-side del contenuto copiato — solo la firma è un fatto
  server-side, il contenuto stesso non transita mai per la persistenza.
- **Copia/incolla di stile separato dal nodo**: `copyStyleAction`/`pasteStyleAction` esistenti
  restano invariati, meccanismo distinto, non firmato (copia solo `props` di stile su un nodo già
  esistente nell'albero di destinazione, mai un nodo nuovo — nessun rischio di collisione `id` da
  mitigare).
- **Incolla fra installazioni diverse del CMS** (due ambienti con `CLIPBOARD_HMAC_SECRET` diversi):
  fallisce per costruzione alla verifica HMAC (§ 2.4) — se in futuro serve un caso d'uso esplicito di
  trasferimento fra ambienti, la via già esistente è l'export/import JSON di
  `ADR-56-template-library-import-export-json.md` (validazione euristica, nessuna firma), non
  un'estensione di questo meccanismo.
- **Selezione multipla non contigua o a livelli diversi dell'albero**: § 1.3 copre solo nodi
  fratelli allo stesso livello; una selezione mista è fuori scope, l'implementazione la impedisce a
  monte (UI di selezione).

---

## Criteri di verifica
- Test unit: `canonicalizeClipboardEnvelope` produce la stessa stringa per due oggetti con le stesse
  chiavi in ordine diverso, stringhe diverse per contenuti diversi.
- Test unit: `sign` + `verify` round-trip con lo stesso segreto verifica `true`; con un segreto
  diverso (simulando un'altra installazione) verifica `false`.
- Test unit: un payload con `sig` alterata di un solo carattere verifica `false` (nessuna tolleranza).
- Test e2e: copia di un nodo in una Pagina, apertura di una seconda scheda su una Pagina diversa,
  incolla via Ctrl+V — il nodo compare con un `id` diverso dall'originale, in ogni discendente.
- Test e2e: incolla di testo semplice (non JSON) nel canvas non produce alcun errore visibile né
  alcun inserimento.
- Test e2e: incolla di un JSON valido ma non firmato (es. copiato a mano da un file) produce la
  notifica "Contenuto degli appunti non riconosciuto o alterato", nessun inserimento.
- Test di limite: un `envelope.nodes` con un sotto-albero che eccede `MAX_NODES` proiettato nella
  pagina di destinazione è respinto al punto 3 della catena (§ 4), prima di qualunque chiamata a
  `verify`.
- Test di non-collisione: incolla dello stesso payload due volte di seguito nello stesso punto
  produce due sotto-alberi con insiemi di `id` disgiunti (nessun id ripetuto, verificato
  ricorsivamente).
