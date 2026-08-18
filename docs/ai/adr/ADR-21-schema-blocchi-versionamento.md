# ADR-21 — Formato e versionamento dello schema dei Blocchi

## Status
[ ] In discussione · [x] **Approvata** · [ ] Rifiutata · [ ] Superseded da ADR-XXX

## Data approvazione
2026-08-17 — approvata da: ccurti

---

## Decisione

### 1. Envelope: versione per blocco, non per albero

```jsonc
{ "version": 1, "blocks": [ { "id": "b1", "type": "richText", "v": 1, "props": {}, "children": [] } ] }
```

`version` alla radice resta ciò che è già persistito da F01 e cambia significato: è la versione
del **formato dell'envelope** (le chiavi `id`/`type`/`v`/`props`/`children`), non l'aggregato
degli schemi dei tipi. Non si rinomina: `page_revisions` è immutabile (ADR-19), quindi ogni
chiave dell'envelope va letta per sempre — una rinomina non si paga una volta, si paga a ogni
lettura futura.

`v` per nodo è la versione dello schema di **quel tipo**. È il campo che decide il costo della
migrazione: con la sola `version` globale, cambiare lo schema di `accordion` obbliga a
riscrivere ogni albero — anche quelli che non contengono accordion — perché la versione globale
non dice quali tipi contiene la riga; e due nodi dello stesso tipo non possono coesistere a
versioni diverse, cioè la migrazione è obbligata a essere atomica su tutto il corpus. Con `v`
per nodo, la migrazione è una funzione locale al nodo e toccare `accordion` significa toccare i
soli nodi `type: "accordion"` con `v` inferiore al corrente.

In scrittura `v` è **obbligatorio** (assente → `400`): riempirlo col valore corrente del
registro stamperebbe "aggiornato" su props di forma vecchia, che così non verrebbero mai
migrate. In lettura `v` assente vale `1`, perché F01 ha persistito nodi senza il campo. Un `v`
superiore al corrente del registro è respinto: è contenuto scritto da un futuro che questo
backend non conosce.

**Policy sul `v` dal futuro in lettura, e sul rollback del deploy.** Il rifiuto è corretto in
scrittura, ma in lettura significa che un rollback del backend dopo un incremento di `v` rende
illeggibile il contenuto scritto nel frattempo: non è un caso teorico, è la conseguenza normale
di un deploy annullato. Quindi:

- Un nodo con `v` superiore al corrente è trattato come un nodo che fallisce la validazione
  (§ 3.7): sulla superficie amministrativa è **esposto con il suo path**, così l'editor vede che
  il backend è più vecchio del contenuto; sul pubblico la pagina **non si serve** — `404`, come
  ogni contenuto non servibile, e mai un albero mutilato del nodo incompatibile.
- Il rollback del backend oltre un incremento di `v` **richiede il rollback dei contenuti**
  (ripristino del database, o ripubblicazione da una Revisione precedente all'incremento).
  Nessun automatismo declassa i nodi: sarebbe una migrazione all'indietro, cioè una funzione che
  perde informazione — esattamente ciò che il § 3.6 esclude.
- Ne segue un vincolo operativo, non tecnico: **un incremento di `v` è un deploy a senso unico**,
  da trattare come una migrazione di schema DB e non come un rilascio ordinario.

### 2. Il registro vive nel backend, un file per tipo

`app/backend/src/blocks/` è la fonte di verità (PLAN-F01 § B.3, già deciso). Il frontend
consuma un artefatto generato — `app/frontend/src/types/blocks.types.ts`, script `blocks:export`
→ `blocks:types` sul modello di `openapi:export`/`openapi:types`, con gate CI di drift come
`openapi-sync`.

Un tipo si dichiara con: `type` (identificativo stabile), `v` (versione corrente), `props`
(mappa nome → descrittore), `children.allow` (elenco dei `type` ammessi come figli, vuoto se
foglia), `migrations` (§ 3), `enabled`, `minRole` opzionale, e metadati d'editor opachi alla
validazione (etichetta, icona, categoria). L'annidamento si dichiara in **una sola direzione**
— il genitore elenca i figli ammessi — perché due elenchi speculari possono contraddirsi. La
radice non è un caso speciale sparso nel codice: il registro dichiara `ROOT_ALLOWED`.

Le props si validano con **descrittori dichiarativi interpretati da un unico validatore**, non
con una classe `class-validator` per tipo: gli errori dell'albero devono essere path
(`blocks[0].children[2].props.href` in `details`, come pretende il contratto d'errore di
`CLAUDE.md`), e `class-validator` produce errori per classe, non per path. `class-validator`
resta dov'è, sui DTO esterni. Una prop non dichiarata è respinta, non ignorata — è
`forbidNonWhitelisted` applicato al dominio. Nessuna nuova dipendenza.

**Punto su cui mi fermo**: il registro **non** dichiara alcun contratto di rendering (tag
semantico, markup, contratto CSS). Se un renderer server-side dovesse consumare il registro,
quei campi diventerebbero obbligatori e la loro assenza un breaking change. Dipende dalla
decisione aperta sul consumer HTML pubblico: si decide lì, non qui.

### 3. Migrazioni: in lettura come norma, in scrittura come normalizzazione, batch come rinvio

1. **La migrazione in lettura è il meccanismo normativo.** Una catena di funzioni per
   `(type, v→v+1)` porta qualunque nodo alla versione corrente in memoria, prima di
   validazione e serializzazione. È l'unico punto che garantisce la regola 5 delle business
   rules su righe che non si possono riscrivere.
2. **La scrittura normalizza**: un `PATCH` che porta nodi a `v` inferiore li migra e persiste la
   forma corrente. Le bozze si allineano da sole a ogni salvataggio.
3. **Il job batch è specificato e non si implementa in F02.** Riscriverebbe solo `pages`
   (mutabile), mai `page_revisions`, e serve a accorciare la catena in lettura quando i volumi
   lo giustificheranno. Oggi non ci sono volumi: costruirlo adesso è ottimizzazione di un
   costo che non si misura.
4. **Una revisione scritta con uno schema vecchio si legge attraverso la stessa catena.** La
   riga resta com'è — la migrazione è una proiezione pura, non un `UPDATE`: nessuna tensione
   con ADR-19. Il ripristino produce quindi una bozza già alla versione corrente, e il diff fra
   due revisioni si calcola sulle forme migrate, altrimenti il rumore di versione domina il
   confronto.
5. **Le funzioni di migrazione sono codice permanente.** Finché esiste una revisione che le
   richiede non si cancellano, e le revisioni non si cancellano (potatura rinviata, ADR-19):
   è il prezzo reale di quell'ADR e va scritto, non scoperto. Ritirare un gradino della catena
   richiede il job batch **più** la decisione sulla potatura.
6. **Una migrazione è una funzione totale e pura**: nessun I/O, nessun accesso al database,
   nessun orologio, nessun caso di fallimento. Un cambiamento che non si esprime così **non è
   un cambio di versione: è un tipo nuovo**, con un `type` nuovo; il vecchio resta nel registro
   `deprecated` — validabile in lettura, fuori dalla palette. Questa regola rende
   strutturalmente impossibile la classe di guasti "questo contenuto non è migrabile".
   **E ogni migrazione è difensiva per contratto.** L'ordine della pipeline mette la migrazione
   *prima* della validazione, quindi una funzione di migrazione riceve props arbitrarie: il
   registro conserva solo lo schema corrente di ogni tipo, non quelli storici, perciò non esiste
   alcun modo di verificare la forma di partenza. "Totale" resta quindi una promessa che il
   codice deve mantenere da solo: ogni prop letta va trattata come possibilmente assente, di
   tipo sbagliato o malformata, e in quel caso si scrive il default dichiarato dallo schema di
   arrivo. Una migrazione non solleva e non propaga `undefined` — al peggio produce un nodo con
   valori di default, che la validazione successiva accetta o respinge con il suo path.
   Gli schemi storici **non** si conservano: costano una copia di ogni versione di ogni tipo per
   sempre, per validare un input che la difesa nel corpo della funzione già copre.
7. Un nodo che fallisce migrazione o validazione viene **esposto con il suo path** sulla
   superficie amministrativa (che ha un Error Boundary per blocco), mai scartato in silenzio;
   sul pubblico non si serve mai un albero migrato a metà. Se l'esito di una migrazione
   fallita sia cacheabile appartiene all'ADR sul caching (TODO 1.3).
8. L'envelope ha la sua catena, applicata prima di quelle per nodo. Ci si aspetta che non si
   muova mai.

**Ordine della pipeline, vincolante**: forma dell'envelope → migrazione → validazione contro il
registro (tipo, annidamento, props dichiarate) → sanitizzazione per `kind` → persistenza. La
sanitizzazione sta **dopo** la migrazione perché una migrazione può comporre stringhe nuove.

**Correzione T3 (2026-08-17).** La frase originaria di questo paragrafo — «i vincoli di ogni
prop si verificano sul valore sanitizzato» — non è soddisfacibile con l'ordine sopra: la
validazione contro il registro precede la sanitizzazione, quindi non può leggere un valore che
non esiste ancora. Vale solo dove la pulizia non muta la stringa (`url`: nessun passaggio da
`sanitize-html`, nessuna trasformazione in § 4): lì il validator resta autorità unica, prima
della sanitizzazione, perché il valore letto e il valore persistito coincidono. Per `richText`
(pulito da `sanitize-html`) e `plainText` (ripulito dai caratteri di controllo) la pulizia può
accorciare la stringa, quindi il loro `maxLength` si verifica **dentro il sanitizzatore, dopo la
pulizia**, sul valore che verrà effettivamente scritto — non nel validator. Il validator resta
autorità su tutto il resto (tipo, annidamento, props dichiarate, `required`, `empty`, `enum`,
`urlScheme`, `guidFormat`, `maxLength` di `url`).

### 4. Sanitizzazione dichiarata per prop, non per tipo

Ogni descrittore porta un `kind` da un insieme **chiuso**, e il `kind` è il contratto di
sanitizzazione (completa il posto che ADR-20 aveva riservato a F02; libreria e punto di
applicazione non cambiano):

| `kind` | Trattamento |
|---|---|
| `richText` | `sanitize-html` con un **profilo nominato** (`inline`, `basic`), scelto dalla prop |
| `plainText` | **Nessun HTML**: memorizzata verbatim, senza escaping, con limite di lunghezza e caratteri di controllo rimossi |
| `number`, `boolean`, `enum` | Validati per tipo/valore, mai trattati come HTML |
| `url` | Schemi `http`/`https`/`mailto`, nessun protocol-relative, nessuna `javascript:` |
| `mediaRef` | Forma di `guid`; la risoluzione è di F09 |

I profili sono un insieme piccolo e verificabile dichiarato una volta: un'allowlist ad hoc per
prop significa N configurazioni di sicurezza da revisionare una per una. La granularità resta
comunque **per prop** e non per tipo, perché un titolo (solo inline) e un corpo (blocchi) nello
stesso blocco hanno contratti diversi.

`plainText` chiude il limite noto di F01 (`"5 < 10"` → `"5 &lt; 10"`): il valore si conserva
com'è stato scritto e l'escaping è responsabilità dell'output — invariante che il registro rende
esplicito marcando la prop, così nessun consumer può confondere testo e markup. Il vincolo su
chi renderizza (**ogni renderer escapa `plainText`**) non vive qui: è registrato come vincolo
bloccante dell'ADR sul consumer HTML pubblico (`docs/TODO.md`, voce 1.9), perché una nota in
questa ADR non sarebbe letta da chi scrive quel renderer. `CLAUDE.md` § Divieti assoluti è
riformulato di conseguenza: la sanitizzazione alla persistenza vale per il rich text, il testo
semplice si conserva verbatim. Vale per
l'albero dei blocchi; `draftSeo` resta sotto il trattamento cieco di ADR-20 finché F07 non
dichiara i suoi campi. Estendere l'insieme dei `kind` è "nuovo schema di blocco" ai fini di
`CLAUDE.md` § Ask first: richiede firma.

### 5. Set minimo del primo rilascio: cinque tipi

`section` (unico contenitore, `children`), `heading` (`level` enum + `text` plainText),
`richText` (frammento HTML sanitizzato), `image` (`mediaRef` + `alt` obbligatorio), `button`
(label plainText + `url`).

`heading` è un tipo a sé e non testo dentro `richText` perché l'outline della pagina serve a
F07/F08: sepolto nel markup, estrarlo diventa parsing HTML. `section` non contiene `section`
nel primo rilascio — la profondità è 1 per costruzione. I limiti di profondità, numero di nodi
e dimensione del payload restano comunque nell'envelope: sono una difesa dalle risorse, non un
vincolo di modellazione, e i loro valori appartengono alla spec.

**Fuori, deliberatamente**: colonne e griglie, tabs, accordion, carousel, gallery, video,
icon-box, testimonial, counter, pricing table, spacer, divider. Il blocco form è di F10, il
riferimento a Sezione globale di F06, e il blocco **HTML/embed non c'è**: la regola 7 delle
business rules lo tiene disabilitato finché non esiste la sua ADR. Il layout a due colonne si
aggiunge poi come prop opzionale con default — cioè con la migrazione totale più banale che
esista, che è il modo in cui il meccanismo del § 3 si ripaga.

I cinque tipi sono approvati **uno per uno** con questa ADR. Un sesto tipo è "nuovo tipo di
blocco" ai fini di `CLAUDE.md` § Ask first: entra solo con una nuova firma, mai perché sembra
naturale accanto agli altri cinque.

## Alternative scartate

- **Solo `version` globale d'albero** — un tipo che cambia obbliga a riscrivere tutti gli
  alberi, anche quelli che non lo contengono.
- **Solo `v` per nodo, senza versione d'envelope** — un cambio delle chiavi dell'envelope non
  avrebbe alcun gradino su cui appoggiarsi.
- **Registro condiviso in `app/blocks`** — cinque file di infrastruttura, un job CI e un
  symlink pendente in produzione; si ripaga al terzo consumer, non al secondo.
- **Zod / JSON Schema per le props** — una dipendenza nuova per un problema che un interprete
  di descrittori risolve con path d'errore migliori.
- **`class-validator` per tipo di blocco** — errori per classe dove il contratto pretende path.
- **Solo migrazione batch** — non è applicabile a `page_revisions`, che è immutabile: lascerebbe
  scoperta l'unica lettura che conta.
- **Solo migrazione in lettura, senza normalizzazione in scrittura** — la catena cresce e non si
  accorcia mai.
- **Migrazioni fallibili** — trasformano un cambio di schema in un rischio di perdita di
  contenuto; se non è una funzione totale, è un tipo nuovo.
- **Allowlist libera per prop** — N configurazioni di sicurezza indipendenti da revisionare.
- **Nessuna distinzione `plainText`/`richText`** — è la scorciatoia che ha prodotto il limite
  `"5 < 10"` e obbligherebbe a indovinare se una stringa "sembra markup" dentro un percorso di
  sicurezza.

## Conseguenza

Ogni nodo porta un intero in più: costo nullo in `jsonb`, e in cambio la migrazione di un tipo
non tocca i nodi degli altri. Il contratto dei blocchi diventa un artefatto generato con il suo
gate di drift, come già l'OpenAPI. La catena di migrazioni è codice che non si cancella: cresce
di un gradino a ogni cambio di schema e si potrà ridurre solo dopo la decisione sulla potatura
delle Revisioni — è il debito che ADR-19 ha creato e che questa ADR rende visibile invece di
distribuirlo nel codice. Il primo rilascio ha cinque tipi: se ne mancherà uno lo si aggiungerà,
mentre un tipo di troppo va mantenuto e migrato per sempre. Il registro non dice nulla su come
un blocco si renderizza: quel campo resta vuoto per scelta, in attesa della decisione sul
consumer HTML pubblico.
