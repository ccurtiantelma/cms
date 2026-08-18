# Spec — F02 Registro e validazione dei Blocchi

## Status

[x] Bozza — **in attesa di approvazione umana** · [ ] Approvata · [ ] Superseded

> Generata dall'Orchestrator il 2026-08-17 su richiesta esplicita dell'umano (unica deroga
> al divieto di scrittura in `docs/`, `CLAUDE.md` § Documentation Policy; vale per questo
> file e si esaurisce con il task). Nessun codice scritto, nessuna dipendenza proposta,
> nessuna modifica a `schema.ts`.
>
> Questa spec **non introduce un sesto tipo di blocco** e non modifica ADR-21: fissa
> soltanto i valori che ADR-21 ha deliberatamente lasciato alla spec. Tre valori sono
> **arbitrari e dichiarati tali** (§ 1.4): profondità massima e `maxLength` delle prop di
> testo. Ogni altro valore è derivato da un documento esistente, con il riferimento accanto.

## Feature di riferimento

**Non esiste** `docs/ai/features/F02-*.md`: F02 nasce da `docs/roadmap.md` § F02 e dal piano
`docs/ai/plans/PLAN-F02-blocchi.md` (T1–T8). Questa spec copre l'output documentale di T1 ed
è il presupposto di T2–T8. Il piano resta la fonte per la scomposizione in task: qui non si
duplica.

## ADR applicabili

- `ADR-21-schema-blocchi-versionamento.md` — **approvata 2026-08-17**: envelope, `v` per
  nodo, registro nel backend, migrazioni, `kind` di sanitizzazione, cinque tipi. Vincolante
  per intero; questa spec ne è la parte quantitativa.
- `ADR-20-sanitizzazione-html-server-side.md` — `sanitize-html`, allowlist-first,
  `allowedStyles: {}` (correzione T3 del 2026-08-17): il code path di `postcss` **resta
  morto per costruzione** in entrambi i profili.
- `ADR-19-revisioni-immutabili.md` — nessun percorso scrive su `page_revisions`; le
  migrazioni sono proiezioni in lettura, non `UPDATE`.
- `ADR-18-ownership-per-riga.md` — `minRole` nel registro non sostituisce le guard né
  l'ownership: è un filtro aggiuntivo, valutato server-side.
- `ADR-17-state-management-zustand.md` — vincola T8 (selettori mirati), non il registro.

## Outcomes tecnici

Al termine di F02 esistono, nel backend: `app/backend/src/blocks/` (registro, un file per
tipo, interprete di validazione, motore di migrazione), i due profili di sanitizzazione
nominati in `app/backend/src/common/sanitizer/`, e la pipeline di ADR-21 innestata su **ogni**
percorso di scrittura di `pages`. Nel frontend: `src/types/blocks.types.ts` generato con gate
CI di drift, e cinque componenti di sola lettura isolati. Nessun endpoint nuovo, nessuna
tabella nuova, nessuna colonna nuova.

## In scope

- Limiti dell'envelope: profondità, numero di nodi, dimensione del payload (§ 1).
- Contenuto esatto dei profili `inline` e `basic` (§ 2).
- Schema completo dei cinque tipi approvati, prop per prop, più `ROOT_ALLOWED` (§ 3).
- Elenco **chiuso** dei codici d'errore, con il contenuto di `details` (§ 4).
- Forma dell'artefatto generato per il frontend (§ 5).

## Out of scope

Tutto ciò che PLAN-F02 § "Fuori scope" dichiara, senza eccezioni: cache pubblica (F03),
risoluzione dei `mediaRef` e media library (F09), Sezioni globali (F06), blocco form (F10),
blocco HTML/embed (nessuna ADR), diff strutturale fra revisioni, potatura delle Revisioni,
job batch di migrazione (specificato in ADR-21 § 3.3, **non implementato**), e ogni UX di
editing (palette, drag & drop, pannelli di proprietà = F04).

**Fuori anche il contratto di rendering** (tag semantico, markup, contratto CSS): punto
fermo di ADR-21 § 2, dipende dalla decisione aperta sul consumer HTML pubblico
(`docs/TODO.md` 1.9). Il registro non lo dichiara e l'artefatto generato non lo contiene.

## Vincoli e assunzioni

1. **Nessuna dipendenza npm nuova.** L'interprete di descrittori è codice del progetto
   (ADR-21 § 2, alternative scartate: Zod / JSON Schema / `class-validator` per tipo).
2. **Ordine della pipeline, vincolante** (ADR-21 § 3): forma dell'envelope → migrazione →
   validazione contro il registro → sanitizzazione per `kind` → persistenza.
3. **Assunzione A-F02-1 — il limite HTTP del body deve superare il limite del payload.**
   `app/backend/src/main.ts` non configura oggi alcun limite per il body parser: vale il
   default di Express, **100 KB**. Con il limite di payload fissato a 512 KiB (§ 1.3), un
   albero legittimo verrebbe respinto da Express con un `413` generico prima che la pipeline
   possa produrre il suo `400` con il path. Il limite del body va quindi impostato
   esplicitamente a **1 MiB** (512 KiB di contenuto + metadati SEO + overhead JSON) dentro
   T5. Se questa assunzione non viene accettata, il limite di payload di § 1.3 va abbassato a
   64 KiB — che contraddice il dimensionamento NFR di 500 blocchi, e va quindi deciso
   dall'umano, non aggirato nel codice.
4. **Assunzione A-F02-2 — il profilo `inline` non ha consumatori nel primo rilascio.**
   Nessuna delle prop dei cinque tipi lo usa: `heading.text` e `button.label` sono
   `plainText`, `richText.html` è `basic`. ADR-21 § 4 nomina i profili come insieme chiuso e
   li richiede entrambi definiti; la conseguenza è che `inline` nasce come configurazione di
   sicurezza **senza consumatore**, cioè non esercitata dai test d'integrazione. Mitigazione
   obbligatoria, non facoltativa: T7 lo copre con unit test sul sanitizzatore e con il
   registro di test (lo stesso che porta un tipo a `v: 2`). Un profilo definito e mai
   verificato è peggio di un profilo assente.
5. Il contenuto già persistito da F01 non ha `v` per nodo: in lettura `v` assente vale `1`
   (ADR-21 § 1). È il caso reale di **tutte** le righe esistenti, non un ramo difensivo.

## Schema DB (Drizzle)

**Nessuna tabella nuova, nessuna colonna nuova, nessuna migrazione.** Il contenuto è già
`jsonb` su `pages.draftContent` / `pages.content` / `page_revisions.content`. F02 non tocca
`app/backend/src/db/schema.ts`: qualunque proposta di colonna (per esempio "versione
massima dei tipi contenuti", per accorciare la catena in lettura) è l'ottimizzazione
prematura che ADR-21 § 3.3 rinvia esplicitamente, e richiederebbe firma separata.

---

## 1. Limiti dell'envelope

Sono **difese dalle risorse**, non vincoli di modellazione (ADR-21 § 5). Vivono
nell'envelope e si verificano **prima** del registro, nello stesso gradino della forma
esterna (`assertValidContentTreeShape`, oggi in [content-tree.ts](../../../app/backend/src/pages/content-tree.ts)):
un albero ostile deve morire prima di aver pagato una migrazione e una validazione per nodo.
Per la stessa ragione **non si derivano dal registro**: girano prima che il registro sia
consultato, quindi sono costanti.

### 1.1 Numero massimo di nodi — 500 (derivato)

`MAX_NODES = 500`, contati **tutti i nodi a ogni profondità**, radice inclusa.

Derivato senza margine da `docs/non-functional-requirements.md` § Volumi di riferimento:
«Blocchi per Pagina — tipico 20–50, **limite 500**». Lo stesso documento dichiara che oltre
questi ordini di grandezza «serve una nuova valutazione architetturale (ADR), non un
aggiustamento incrementale»: alzare `MAX_NODES` non è un tuning, è una revisione dell'NFR.

### 1.2 Profondità massima — 5 (arbitrario, dichiarato)

`MAX_DEPTH = 5`. I nodi in `blocks[]` alla radice sono a profondità **1**.

**Questo numero è arbitrario** e va trattato come tale. Ciò che si può derivare è soltanto la
profondità *strutturalmente possibile* nel primo rilascio, che è **2** (`section` → foglia:
`section` non contiene `section`, ADR-21 § 5). Ma il limite non può essere 2: è la costante
che protegge la ricorsione dell'interprete e viene applicata **prima** che il registro sia
noto, quindi non può inseguire il grafo di annidamento del registro senza invertire l'ordine
della pipeline.

5 è scelto come margine per due generazioni future di contenitori (per esempio colonne dentro
`section`, e un contenitore dentro una colonna) senza toccare l'envelope — un valore
dell'envelope che si muove a ogni tipo nuovo è un valore che non protegge nulla.

**Criterio di revisione** (invece di far finta che sia derivato): si alza solo quando una
modifica *firmata* del registro porta la catena di contenitori legale più lunga a
`MAX_DEPTH − 1`. Non si abbassa mai senza un censimento dei contenuti già salvati, perché un
abbassamento rende illeggibili righe esistenti — incluse le Revisioni, che non si riscrivono
(ADR-19).

### 1.3 Dimensione massima del payload — 512 KiB (derivato con un'ipotesi dichiarata)

`MAX_PAYLOAD_BYTES = 524_288` (512 KiB), misurati sui **byte UTF-8 della serializzazione
JSON dell'envelope** (`{ version, blocks }`), non sull'intero body della richiesta.

Derivazione: 500 nodi (§ 1.1) × ~1 KiB medio per nodo. L'unica ipotesi è quel KiB medio, che
corrisponde a un nodo con una prop di testo di alcune centinaia di caratteri più le chiavi
dell'envelope — la forma tipica delle pagine dimensionate dall'NFR (20–50 blocchi ⇒ ~50 KiB
tipico, un decimo del limite).

**I due limiti non sono moltiplicativi, ed è voluto.** Un albero di 500 nodi ciascuno con
`richText.html` al suo `maxLength` di 20.000 caratteri (§ 3.4) pesa ~10 MB e viene respinto
dal limite di payload, non dal `maxLength`. Il payload è il vincolo globale che lega; il
`maxLength` per prop impedisce che un **singolo** valore assurdo passi. Vale la pena scriverlo
perché la lettura ingenua («500 × 20.000 = il limite vero») è quella che porta ad alzare il
payload per far tornare i conti.

**Doppia verifica, per due garanzie diverse:**

| Quando | Su cosa | Garantisce |
|---|---|---|
| Gradino "forma dell'envelope" | l'albero **in ingresso** | che nessuna risorsa sia spesa su un payload ostile |
| Dopo la sanitizzazione, prima della persistenza | l'albero **che sta per essere scritto** | che il limite valga su ciò che è **salvato** |

La seconda verifica non è ridondante: una migrazione può comporre stringhe nuove (ADR-21
§ 3.6), quindi l'albero in uscita non è necessariamente più piccolo di quello in ingresso.
È lo stesso motivo per cui ADR-21 mette la sanitizzazione dopo la migrazione e verifica i
vincoli di prop sul valore sanitizzato.

### 1.4 Riepilogo dei valori e criterio di revisione

| Valore | Costante | Natura | Fonte / criterio |
|---|---|---|---|
| Nodi per albero | `500` | **derivato** | NFR § Volumi di riferimento. Si cambia solo con una revisione dell'NFR |
| Profondità | `5` | **arbitrario** | Margine per 2 generazioni di contenitori. Si alza quando la catena legale più lunga raggiunge 4; non si abbassa senza censimento dei contenuti |
| Payload | `512 KiB` | derivato da 500 × ~1 KiB | Si rivede se il nodo medio misurato su contenuto reale supera 1 KiB, non su un singolo caso limite |
| `heading.text` | `200` cp | **arbitrario** | 3× la lunghezza consigliata di `metaTitle` (≤ 60, business-rules § SEO). Si rivede su contenuto reale |
| `image.alt` | `300` cp | **arbitrario** | Un alt oltre ~150 caratteri è già cattiva pratica; 300 è margine, non obiettivo |
| `button.label` | `80` cp | **arbitrario** | Un'etichetta di pulsante più lunga non è un'etichetta |
| `richText.html` | `20.000` cp | **arbitrario** | ~3.000 parole di HTML sanitizzato: oltre qualunque sezione di pagina legittima, e 25× sotto il payload |
| `button.href` | `2.048` cp | quasi-derivato | Limite pratico universalmente rispettato per le URL (implementazioni HTTP), non un'invenzione di progetto |

Tutte le lunghezze si contano in **code point Unicode**, non in unità UTF-16 e non in byte:
altrimenti un'emoji costa due caratteri e un accento composto ne costa due o uno a seconda
di come è stato digitato. Il payload, invece, si misura in **byte UTF-8**, perché è una difesa
dalla memoria.

Il `maxLength` di `richText` e `plainText` si verifica **nel sanitizzatore**, dopo la pulizia
(ADR-21 § 3, ordine della pipeline): il limite è una garanzia su ciò che è a database, non su
ciò che è arrivato. Il `maxLength` di `url` resta nel **validator**: la sanitizzazione non
tocca `url` (non è né `richText` né `plainText`), quindi il valore letto e quello persistito
coincidono — non c'è una seconda versione "dopo la pulizia" da verificare.

---

## 2. Profili di sanitizzazione

Due profili, insieme **chiuso** (ADR-21 § 4). Un terzo profilo, o un `kind` nuovo, è "nuovo
schema di blocco" ai fini di `CLAUDE.md` § Ask first: richiede firma.

Entrambi i profili sono `sanitize-html` in modalità allowlist-first (ADR-20). In **nessuno
dei due** compare `style`, in nessuna forma: `allowedStyles: {}` e `style` mai in
`allowedAttributes`. È la mitigazione di ADR-20 correzione T3 e non è una precauzione
ridondante — è ciò che tiene morto il code path di `postcss`, che come dipendenza runtime del
backend è superficie nuova spedita in produzione.

### 2.1 `basic` — struttura di paragrafo e formattazione inline

Coincide **esattamente** con l'allowlist di F01 già in codice
([sanitizer.config.ts](../../../app/backend/src/common/sanitizer/sanitizer.config.ts)): la
documentazione esistente dà già questo valore, quindi non se ne invita un altro.

| Voce | Valore |
|---|---|
| `allowedTags` | `p`, `br`, `strong`, `b`, `em`, `i`, `u`, `s`, `a`, `ul`, `ol`, `li` |
| `allowedAttributes` | `a`: `href`, `title`, `target`, `rel` — **nient'altro, su nessun tag** |
| `allowedSchemes` | `http`, `https`, `mailto` |
| `allowProtocolRelative` | `false` |
| `allowedStyles` | `{}` |
| `disallowedTagsMode` | `discard` |
| `nonTextTags` | default della libreria (`script`, `style`, `textarea`, `option`): il **testo** dentro questi tag si scarta, non si promuove a contenuto |

**Fuori da `basic`, deliberatamente**: `h1`–`h6` (l'outline della pagina è un tipo di blocco a
sé, ADR-21 § 5 — ammetterli nel rich text rimetterebbe l'outline dentro il markup, che è
esattamente ciò che `heading` evita), `img` (è il tipo `image`, con `alt` obbligatorio: un
`<img>` dentro il rich text aggirerebbe il requisito di accessibilità dell'NFR), `table`,
`blockquote`, `code`, `pre`, `hr`, `span`, `div`, `figure`, e ogni attributo `class`/`id`
(un contratto CSS implicito, cioè un contratto di rendering: fuori per ADR-21 § 2).

### 2.2 `inline` — nessun elemento di blocco

Sottoinsieme stretto di `basic`, ottenuto togliendo gli elementi di blocco e di lista.

| Voce | Valore |
|---|---|
| `allowedTags` | `a`, `b`, `br`, `em`, `i`, `s`, `strong`, `u` |
| `allowedAttributes` | `a`: `href`, `title`, `target`, `rel` |
| `allowedSchemes` | `http`, `https`, `mailto` |
| `allowProtocolRelative` | `false` |
| `allowedStyles` | `{}` |
| `disallowedTagsMode` | `discard` |
| `nonTextTags` | come `basic` |

Rispetto a `basic` mancano `p`, `ul`, `ol`, `li`: sono gli elementi di blocco, e `inline` non
li ammette per definizione. `br` resta perché è inline-level, non un elemento di blocco.

Vedi A-F02-2 (§ Vincoli): nel primo rilascio nessuna prop dichiara `inline`. Il profilo
esiste perché ADR-21 lo nomina nell'insieme chiuso, e T7 lo esercita con il registro di test.

### 2.3 Regole comuni a entrambi i profili

1. **`rel` normalizzato sui link esterni**: se un `<a>` sopravvissuto porta
   `target="_blank"`, il `rel` risultante contiene `noopener noreferrer`. Non è cosmetica:
   `target="_blank"` senza `noopener` è una capacità concessa alla pagina di destinazione.
2. **`target` ammette solo `_blank` e `_self`**; ogni altro valore si scarta (l'attributo,
   non il tag).
3. **Un albero non sanitizzabile è respinto per intero** (ADR-20): nessuna persistenza
   parziale, mai un albero mutilato del nodo problematico.
4. **Le prop non-stringa non passano da `sanitize-html`.** `number`, `boolean`, `enum`,
   `mediaRef` si validano per tipo/forma. Passare un numero attraverso un sanitizzatore HTML
   è una conversione a stringa mascherata da difesa.
5. **`plainText` non passa da `sanitize-html`, in nessun caso.** Trattamento completo:
   - conservata **verbatim**, nessun escaping alla persistenza (ADR-21 § 4: `"5 < 10"` resta
     `"5 < 10"` a database — è la chiusura del limite noto di F01);
   - rimozione dei caratteri di controllo C0 e `U+007F`, **eccetto** `U+0009` (tab) e
     `U+000A` (newline), che sono contenuto;
   - `maxLength` verificato **dopo** la rimozione;
   - nessuna normalizzazione Unicode, nessun `trim` implicito del contenuto interno: l'unico
     `trim` ammesso è quello dei whitespace ai bordi.
   L'escaping è responsabilità dell'output ed è un **vincolo bloccante** registrato su
   `docs/TODO.md` voce 1.9, non su questa spec: ogni renderer escapa `plainText`.
6. **`draftSeo` non cambia comportamento**: continua a passare dal `TreeSanitizerService`
   cieco di F01 finché F07 non dichiara i suoi campi (ADR-21 § 4).
7. `kind: url` (§ 3.6) non è HTML e non passa da `sanitize-html`: ha la sua validazione di
   schema.

---

## 3. Schema dei cinque tipi

I cinque tipi sono quelli approvati **uno per uno** da ADR-21 § 5. **Nessun sesto tipo**:
entra solo con una firma nuova.

Convenzioni valide per tutte le tabelle che seguono:

- **`obbl.`** significa «la chiave deve essere presente in `props`», non «il valore deve
  essere non vuoto». L'unico vincolo di non-vuoto è su `image.alt`, ed è l'NFR § Accessibilità
  a imporlo. Una prop obbligatoria non ha default: un default su una prop obbligatoria
  significa che non è obbligatoria.
- Una prop **non dichiarata** è respinta, non ignorata (`forbidNonWhitelisted` applicato al
  dominio, ADR-21 § 2).
- Tutti i tipi nascono a **`v: 1`** (PLAN-F02 T2), `enabled: true`, nessun `minRole`, nessuno
  `deprecated`.
- `children.allow` è dichiarato **in una sola direzione**: il genitore elenca i figli
  ammessi (ADR-21 § 2). Nessun elenco speculare "genitori ammessi".

### 3.1 `ROOT_ALLOWED`

```
ROOT_ALLOWED = ['section', 'heading', 'richText', 'image', 'button']
```

Dichiarato nel registro, mai dedotto nel codice (ADR-21 § 2).

**Perché tutti e cinque e non solo `section`.** Una radice ristretta a `section` darebbe una
forma d'albero uniforme, ma renderebbe **invalido in lettura** ogni albero già persistito che
ha una foglia alla radice — e questa non è un'ipotesi: `SPEC-F01` § Forma del contenuto
mostra proprio un `richText` in `blocks[0]`, e F01 accettava qualunque `type` in qualunque
posizione. La catena di migrazione non può ripararlo: avvolgere le foglie in una `section`
sintetica significa **inventare un nodo e il suo `id`**, cioè creare struttura che l'autore
non ha scritto — l'opposto di una proiezione. E nessuna regola di `business-rules.md` § Blocchi
chiede una radice uniforme.

Restringere `ROOT_ALLOWED` a `['section']` resta possibile in futuro, ma è una migrazione
d'envelope con firma umana e un censimento dei contenuti, non un aggiustamento.

### 3.2 `section` — l'unico contenitore

| Prop | `kind` | Obbl. | Default | Vincoli |
|---|---|---|---|---|
| — | — | — | — | **Nessuna prop dichiarata** |

```
v: 1
props: {}
children.allow: ['heading', 'richText', 'image', 'button']
```

`props` vuoto è la lettura letterale di ADR-21 § 5 («`section` (unico contenitore,
`children`)»): qualunque prop inviata su una `section` produce `BLOCK_PROP_NOT_DECLARED`.
Nessun `anchor`, nessun `background`, nessun `padding`: sarebbero contratti di rendering
(fuori per ADR-21 § 2) o modellazione che nessun documento chiede.

`section` **non contiene `section`**: la profondità è 1 per costruzione nel primo rilascio
(ADR-21 § 5). Il layout a due colonne arriverà come prop opzionale con default — la
migrazione totale più banale che esista, ed è il modo in cui il meccanismo di ADR-21 § 3 si
ripaga.

### 3.3 `heading`

| Prop | `kind` | Obbl. | Default | Vincoli |
|---|---|---|---|---|
| `level` | `enum` | **sì** | — | valori ammessi: `h2`, `h3`, `h4`, `h5`, `h6` |
| `text` | `plainText` | **sì** | — | `maxLength: 200` code point |

```
v: 1
children.allow: []   (foglia)
```

`level` obbligatoria e `enum` è fissato da ADR-21 § 5. I **valori** sono di questa spec:
`h1` è escluso perché il documento ha un solo `h1` — il titolo della Pagina, che appartiene al
template del consumer — e un tipo di blocco che può emettere `h1` rende impossibile
garantire quell'invariante di accessibilità dal lato del CMS. La coerenza della gerarchia
(NFR § Accessibilità: segnalare `h2` seguito da `h4`) è un **avviso d'editor**, non una
validazione: F02 non respinge un salto di livello, e l'avviso è materia di F04.

Questa esclusione è la parte contestabile: se l'ADR sul consumer HTML pubblico deciderà che
è il CMS a emettere l'`h1`, va rivista lì. `heading` è un tipo a sé e non testo dentro
`richText` perché l'outline serve a F07/F08: sepolto nel markup, estrarlo diventa parsing HTML.

### 3.4 `richText`

| Prop | `kind` | Obbl. | Default | Vincoli |
|---|---|---|---|---|
| `html` | `richText`, profilo **`basic`** | **sì** | — | `maxLength: 20.000` code point, verificato **nel sanitizzatore, dopo** la pulizia (§ 1.4) |

```
v: 1
children.allow: []   (foglia)
```

Stringa vuota ammessa (un blocco appena creato in bozza è legittimo). Il profilo è dichiarato
**dalla prop**, non dal tipo (ADR-21 § 4): è ciò che permetterà a un titolo e a un corpo nello
stesso blocco di avere contratti diversi, quando esisterà un blocco così.

### 3.5 `image`

| Prop | `kind` | Obbl. | Default | Vincoli |
|---|---|---|---|---|
| `mediaRef` | `mediaRef` | **sì** | — | forma di `guid`: 16 caratteri esadecimali. **Nessuna verifica di esistenza** |
| `alt` | `plainText` | **sì** | — | **non vuoto** dopo `trim`; `maxLength: 300` code point |

```
v: 1
children.allow: []   (foglia)
```

`alt` obbligatorio è fissato da ADR-21 § 5 e richiesto dall'NFR § Accessibilità («il testo
alternativo delle immagini è obbligatorio nei blocchi di contenuto»). È l'**unica** prop dei
cinque tipi con un vincolo di non-vuoto: un `alt` di stringa vuota è sintatticamente valido
in HTML e semanticamente significa "immagine decorativa", ma il CMS non ha modo di distinguere
quell'intenzione dalla dimenticanza, e la dimenticanza è il caso frequente. Se servirà una
via per le immagini decorative, sarà una prop `decorative: boolean` con default — cioè una
modifica di schema firmata, non un allentamento del vincolo.

La **risoluzione** del `mediaRef` (esistenza del file, varianti dimensionali, dimensioni
intrinseche) è di F09: F02 valida la forma e nient'altro. Il registro non dichiara `width`,
`height`, `caption` o `loading`: sono metadati di media (F09) o rendering (ADR-21 § 2).

### 3.6 `button`

| Prop | `kind` | Obbl. | Default | Vincoli |
|---|---|---|---|---|
| `label` | `plainText` | **sì** | — | `maxLength: 80` code point |
| `href` | `url` | **sì** | — | `maxLength: 2.048` code point; forme ammesse sotto |

```
v: 1
children.allow: []   (foglia)
```

Il nome `href` non è una scelta libera: è il nome che ADR-21 § 2 usa nell'esempio del path
d'errore (`blocks[0].children[2].props.href`), e il contratto d'errore è la cosa che non si
può rinominare a costo zero.

**Forme ammesse per `kind: url`** (elenco chiuso; tutto il resto è
`BLOCK_PROP_INVALID` / `reason: 'urlScheme'`):

| Forma | Esempio | Nota |
|---|---|---|
| Assoluta `http`/`https` | `https://esempio.it/pagina` | |
| `mailto:` | `mailto:info@esempio.it` | |
| Root-relative | `/servizi/consulenza` | **Una** sola barra iniziale. È la forma dei link interni: un CMS mono-sito (A5) non deve incorporare il proprio dominio nel contenuto, o il contenuto smette di essere portabile |

Respinti in modo esplicito: `javascript:`, `data:`, `vbscript:`, `file:`, ogni altro schema,
il protocol-relative `//host/path` (indistinguibile da un link interno a occhio, e cambia
host), e le relative senza barra iniziale (`pagina.html`, `../su`: la loro risoluzione
dipende dall'URL corrente, che il CMS non conosce).

Nessuna prop `variant`, `size` o `icon`: sono rendering (ADR-21 § 2).

### 3.7 Insieme chiuso dei `kind`

Da ADR-21 § 4, riportato per completezza e **non estendibile senza firma**: `richText`,
`plainText`, `number`, `boolean`, `enum`, `url`, `mediaRef`. I cinque tipi del primo rilascio
usano `plainText`, `richText`, `enum`, `url`, `mediaRef`: `number` e `boolean` sono dichiarati
nell'insieme ma senza consumatore, come `inline` (§ A-F02-2), e valgono per loro le stesse
unit test.

---

## 4. Codici d'errore

**Elenco chiuso.** Un codice nuovo richiede una revisione di questa spec: i `code` sono
contratto verso il frontend (interceptor Axios) e verso Bruno.

Tutti gli errori sono normalizzati da `AllExceptionsFilter` in
`{ statusCode, message, code, timestamp, path, details? }`. Attenzione a due `path` diversi
che convivono nella stessa risposta: `path` alla radice è il **path HTTP** (già così per
tutta l'applicazione), mentre il path del nodo colpevole vive in `details.path`. Non si
rinomina né si sovrappone.

`details` non sostituisce mai `message` e non è mai obbligatorio (`CLAUDE.md` § Error
handling): porta i dati strutturati di dominio. **`details` non contiene mai il valore
colpevole**, solo la sua misura: un valore può essere enorme, contenere HTML ostile o dati
personali, e finirebbe in un log e in una notification.

| `code` | HTTP | Quando | `details` | Path del nodo |
|---|---|---|---|---|
| `CONTENT_TREE_INVALID` | 400 | Forma esterna dell'envelope non conforme (già in codice da F01, **invariato**) | `{ path }` | sì, dove esiste un nodo |
| `CONTENT_TREE_TOO_MANY_NODES` | 400 | § 1.1 superato | `{ count, max }` | **no** — il colpevole è l'albero, non un nodo. Il contratto non lo promette |
| `CONTENT_TREE_TOO_DEEP` | 400 | § 1.2 superato | `{ path, depth, max }` | **sì** — path del primo nodo oltre il limite |
| `CONTENT_TREE_TOO_LARGE` | 400 | § 1.3 superato | `{ bytes, max, stage: 'input' \| 'persist' }` | **no**, come sopra |
| `CONTENT_ENVELOPE_VERSION_UNSUPPORTED` | 400 | `version` d'envelope superiore a quella corrente | `{ version, current }` | **no** — è la radice |
| `BLOCK_VERSION_REQUIRED` | 400 | `v` assente **in scrittura** (ADR-21 § 1: riempirlo stamperebbe "aggiornato" su props di forma vecchia) | `{ path, type }` | sì |
| `BLOCK_VERSION_UNSUPPORTED` | 400 | `v` del nodo superiore alla versione corrente del registro per quel `type` | `{ path, type, v, current }` | sì |
| `BLOCK_TYPE_UNKNOWN` | 400 | `type` non nel registro, o `enabled: false`, o `minRole` non soddisfatto | `{ path, type }` — **niente elenco dei tipi noti** | sì |
| `BLOCK_NESTING_NOT_ALLOWED` | 400 | Figlio non in `children.allow` del genitore, o nodo di radice non in `ROOT_ALLOWED` | `{ path, type, parentType \| null, allowed: string[] }` (`null` = radice) | sì |
| `BLOCK_PROP_NOT_DECLARED` | 400 | Prop presente e non dichiarata dallo schema del tipo | `{ path, type, prop, declared: string[] }` | sì, fino alla prop (`…props.<nome>`) |
| `BLOCK_PROP_INVALID` | 400 | Prop dichiarata ma non conforme | `{ path, type, prop, kind, reason, constraint?, actual? }` | sì, fino alla prop |
| `BLOCK_MIGRATION_FAILED` | **500** | Una funzione di migrazione ha sollevato | `{ path, type, fromV, toV }` | sì |
| `CONTENT_SANITIZATION_FAILED` | 400 | Sanitizzazione non completabile (già in codice da F01, **invariato**) | come oggi | come oggi |

### 4.1 `reason` di `BLOCK_PROP_INVALID` — insieme chiuso

`'required'` (chiave assente) · `'empty'` (vuota dove il non-vuoto è richiesto: solo
`image.alt`) · `'type'` (tipo JavaScript sbagliato per il `kind`) · `'maxLength'` ·
`'enum'` · `'urlScheme'` · `'guidFormat'`.

`constraint` e `actual` compaiono solo dove hanno senso e solo come **misure**: per
`maxLength`, `{ constraint: 200, actual: 240 }` (code point, sul valore sanitizzato); per
`enum`, `constraint` è l'elenco dei valori ammessi e `actual` è **assente** (il valore
ricevuto è input non fidato). Mai il valore stesso.

### 4.2 Perché `BLOCK_MIGRATION_FAILED` è 500 e non 400

ADR-21 § 3.6 stabilisce che una migrazione è una funzione **totale e pura**: non ha casi di
fallimento, e un cambiamento che non si esprime così non è un cambio di versione ma un tipo
nuovo. Ne segue che un fallimento di migrazione **non è un errore del client** — nessuna
correzione del payload lo risolve — ed è un difetto del codice di migrazione. Un `400`
scaricherebbe sull'editore la colpa di un bug del sistema. Si logga a livello `error` con lo
stack (solo nel log, mai in risposta) e `details` porta il path per rendere il difetto
individuabile su contenuto reale.

### 4.3 Esposizione in **lettura**, superficie amministrativa

ADR-21 § 3.7 richiede che un nodo che fallisce migrazione o validazione in lettura sia
«esposto con il suo path, mai scartato in silenzio». In lettura non c'è un errore da
sollevare — la richiesta è legittima e la riga esiste — quindi serve una forma nel corpo della
risposta, che questa spec fissa:

- Ogni risposta amministrativa che porta un albero (dettaglio Pagina, dettaglio Revisione)
  espone `contentIssues: Array<{ path, code, details }>`, **array vuoto** quando l'albero è
  integro. `code` e `details` sono gli stessi di § 4: nessun vocabolario parallelo.
- Il nodo problematico è restituito **come persistito**: non migrato a metà, non mutato, non
  rimosso. È l'Error Boundary per blocco del frontend a contenere il danno.
- La risposta resta `200`: la Pagina è leggibile, un suo blocco no.
- `contentIssues` entra in `docs/openapi.yaml` e in `api.types.ts` via `openapi:export` +
  `openapi:types` (T5): è un campo nuovo su endpoint esistenti, l'unico cambiamento di
  contratto che F02 introduce oltre ai `code`.

Sulla **superficie pubblica** nulla di tutto questo esiste: un albero che non si migra o non
si valida non si serve, `404`, mai un albero mutilato del nodo incompatibile (ADR-21 § 1). Se
quell'esito sia cacheabile appartiene all'ADR sul caching (`docs/TODO.md` 1.3), non a qui.

---

## 5. Forma dell'artefatto generato per il frontend

`app/frontend/src/types/blocks.types.ts`, prodotto da `blocks:export` → `blocks:types` sul
modello di `openapi:export`/`openapi:types`, con gate CI di drift sul modello di
`openapi-sync` (ADR-21 § 2, PLAN-F02 T6). File **generato**: lo dichiara nella prima riga e
non si modifica a mano; il job CI **fallisce** se è in drift rispetto al registro.

### 5.1 Cosa contiene

| Contenuto | Perché |
|---|---|
| `ENVELOPE_VERSION` corrente | Il client costruisce envelope validi |
| `ROOT_ALLOWED` | La palette di F04 sa cosa è inseribile alla radice senza dedurlo |
| Per ogni tipo: `type`, `v` corrente, `enabled`, `deprecated`, `minRole` (se presente) | Identità e stato; `minRole` serve a **nascondere** una voce di palette |
| Per ogni tipo: `children.allow` | Regole di annidamento, nella stessa direzione del registro |
| Per ogni prop: `name`, `kind`, `required`, `default`, `maxLength`, `values` (per `enum`), `profile` (per `richText`) | Descrittori: sono ciò che rende la validazione client possibile **come UX** |
| Metadati d'editor: `label`, `icon`, `category` | Opachi alla validazione (ADR-21 § 2); servono alla palette di F04 |
| I limiti dell'envelope: `MAX_DEPTH`, `MAX_NODES`, `MAX_PAYLOAD_BYTES` | Perché il client possa avvisare **prima** del `400`, non per applicarli |

Il `profile` di una prop `richText` è nell'artefatto come **nome** (`'basic'`), mai come
allowlist: il frontend deve sapere che due prop hanno contratti diversi, non quali tag passano.

### 5.2 Cosa **non** contiene

- **Nessun contratto di rendering**: tag semantico, markup, classi, contratto CSS. Punto fermo
  di ADR-21 § 2 — se un renderer server-side dovesse consumare il registro, quei campi
  diventerebbero obbligatori e la loro assenza un breaking change. Si decide nell'ADR sul
  consumer HTML pubblico (`docs/TODO.md` 1.9), non qui.
- **Nessuna allowlist di sanitizzazione.** Una copia client dei tag ammessi diventa, nel giro
  di una release, una sanitizzazione lato client che qualcuno considera una difesa. La
  sanitizzazione è server-side e pre-persistenza, senza deleghe (ADR-20).
- **Nessuna funzione di migrazione e nessuna catena.** Sono codice permanente del backend
  (ADR-21 § 3.5). Il client vede solo la `v` corrente.
- **Nessuno schema storico** dei tipi: il registro non li conserva (ADR-21 § 3.6), quindi
  l'artefatto non può contenerli.
- **Nessun codice d'errore**: quelli vivono nell'OpenAPI e in `api.types.ts`, che hanno già
  la loro pipeline generata. Due sorgenti per la stessa cosa divergono.
- **Nessun endpoint, nessun DTO, nessun tipo di API.** Restano di `openapi:types`.

### 5.3 Autorità

L'artefatto è per la **UX**. La validazione autorevole è il `400` del server (PLAN-F02
§ Rischi: doppia validazione che diverge). Il frontend non duplica l'interprete: consuma i
descrittori per avvisare, e accetta il `400` come verdetto.

---

## Endpoint API

**Nessun endpoint nuovo.** F02 cambia il comportamento di quelli di F01
(`@Controller('app/pages')`): nuovi `code` d'errore (§ 4) e il campo `contentIssues` sulle
risposte di lettura che portano un albero (§ 4.3). Conseguenze operative, non facoltative:

- `openapi:export` + `openapi:types` eseguiti e committati (T5).
- Collezioni Bruno di `bruno/pages/` aggiornate per gli endpoint toccati (T7).

## DTO

Nessun DTO nuovo. L'albero **non** si valida con `class-validator`: gli errori dell'albero
devono essere path, e `class-validator` produce errori per classe (ADR-21 § 2). I DTO di F01
restano come sono, con la loro validazione `class-validator` sui campi esterni.

## Task breakdown

In `docs/ai/plans/PLAN-F02-blocchi.md`, T2–T8. T1 (ADR firmata + questa spec) si chiude con
l'approvazione umana di questo documento. **Nessun task riportato qui**: due copie della
scomposizione divergono al primo aggiornamento.

## Criteri di verifica

Oltre a quanto già imposto da PLAN-F02 T7, questa spec aggiunge i criteri che discendono dai
suoi valori:

1. Albero con 501 nodi → `400` `CONTENT_TREE_TOO_MANY_NODES`; con 500 → accettato.
2. Albero a profondità 6 → `400` `CONTENT_TREE_TOO_DEEP` con `details.path` del primo nodo
   oltre il limite.
3. Envelope oltre 512 KiB → `400` `CONTENT_TREE_TOO_LARGE` con `stage: 'input'`; e un caso in
   cui il limite scatta **dopo** la sanitizzazione con `stage: 'persist'` (verificabile solo
   col registro di test, con una migrazione che allunga una stringa).
4. Il limite del body HTTP è configurato sopra il limite di payload: un albero di 400 KiB
   riceve un `400`/`201` dalla pipeline, **non** un `413` da Express (A-F02-1).
5. `heading` con `level: 'h1'` → `400` `BLOCK_PROP_INVALID` / `reason: 'enum'`; con `level`
   assente → `reason: 'required'`.
6. `image` con `alt: ''` o `alt: '   '` → `400` `BLOCK_PROP_INVALID` / `reason: 'empty'`.
7. `button.href` con `javascript:alert(1)`, `//evil.tld/x`, `pagina.html` → `400`
   `reason: 'urlScheme'`; con `/servizi/consulenza` e `mailto:` → accettati.
8. `section` con una qualunque prop → `400` `BLOCK_PROP_NOT_DECLARED`.
9. `section` dentro `section` → `400` `BLOCK_NESTING_NOT_ALLOWED` con `allowed` popolato;
   ognuno dei quattro tipi foglia alla radice → **accettato** (§ 3.1).
10. `richText.html` con `<script>`, `on*`, `<iframe>`, `style="…"`, `class="…"`, `<h2>`,
    `<img>` → tutti neutralizzati a database. Un `<a target="_blank">` esce con `rel` che
    contiene `noopener noreferrer`.
11. `plainText` con `"5 < 10"` → **integro** a database. Con caratteri di controllo → ripuliti,
    con `\n` e `\t` preservati.
12. Nessun profilo allowlista `style`: verifica per ispezione della configurazione, non solo
    per comportamento — la garanzia di ADR-20 T3 è che `postcss` non venga **mai invocato**.
13. `maxLength` verificato sul valore sanitizzato: un `richText.html` che supera il limite solo
    *prima* della sanitizzazione è accettato; uno che lo supera *dopo* è respinto.
14. Il profilo `inline`, `kind: number` e `kind: boolean` sono esercitati dalle unit test col
    registro di test (A-F02-2): nessuno dei tre nasce senza copertura.
15. In lettura: una Revisione con un nodo a `v` superiore al corrente → `200` con
    `contentIssues` popolato, path corretto, nodo restituito **come persistito**, e la riga a
    database **non modificata** (assert sulla riga, non solo sulla risposta).
16. `contentIssues` è `[]` — presente e vuoto, non assente — su un albero integro.
