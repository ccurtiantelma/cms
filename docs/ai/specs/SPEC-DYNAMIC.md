# SPEC — Motore Dynamic Tags: contratto del risolutore nel worker `static-export`, schema `DynamicValue`, algoritmo di risoluzione a build-time

## Status
[x] Bozza — round R7 di `docs/PLAN-parita-elementor-pro.md` · [ ] Approvata · [ ] Superseded da SPEC-XXX

## Dominio
`docs/ai/INDEX.md` § "Parità Elementor Pro — R0 Decisioni fondative" (la riga copre anche i round
che ne dipendono, R7 incluso, finché l'INDEX non viene aggiornato con una riga propria — stessa
convenzione già usata da `docs/ai/specs/SPEC-PROPKIND-V2-DETAILS.md`, `SPEC-GLOBAL-KIT.md`,
`SPEC-RUNTIME.md` e `SPEC-POPUP.md`).

## Relazione con gli altri documenti
Questo documento **non è una firma**: è il dettaglio implementativo di `docs/SPEC-propkind-v2.md`
§ 3.17 (`dynamic`, wrapper già dichiarato "risolto nel worker di export con il contesto pagina;
`fallback` obbligatorio per prop `required`") e di `docs/ai/adr/ADR-79-modello-collezioni-content-types.md`
§ "Decisione" punto 4 (contesto `{page, site, item, loop}`, scoping di `loop.item.<key>`). Fissa il
contratto TypeScript del risolutore, l'elenco chiuso dei tag con i rispettivi argomenti e fonti, e
l'algoritmo di risoluzione a build-time — allo stesso livello di dettaglio con cui `SPEC-GLOBAL-KIT.md`
ha fissato l'algoritmo di compilazione già deciso in linea di principio da `ADR-77`.

Le due decisioni di schema che questo documento presuppone come già prese (il modificatore
`dynamic?: boolean` su `BasePropSpec`, la colonna `pages.customFields`, la riga `app_settings.
site_identity`, il `kind: 'query'` e il blocco `loop`) sono fissate da
`docs/ai/adr/ADR-87-dynamic-tags-e-query-loop-builder.md`, non da questo documento: questa SPEC non
riapre nessuna di quelle decisioni, le consuma. Il popover UI dell'icona ⚡ e lo schema di `kind:
'query'` per il Loop Builder restano interamente nel dominio di quella ADR — non ripetuti qui.

## ADR applicabili
- `ADR-87-dynamic-tags-e-query-loop-builder.md` — introduce il modificatore `dynamic`, `pages.
  customFields`, `app_settings.site_identity`, e il blocco `loop` che produce il contesto `loop.item`
  consumato da questo risolutore.
- `ADR-79-modello-collezioni-content-types.md` § "Decisione" punto 4 — scoping di `loop.item.<key>`
  al solo interno di un blocco `loop`; un `loop.item.<key>` risolto fuori da quel contesto produce
  "un warning di build, mai un'eccezione che interrompe l'intero export" — principio che questo
  documento applica letteralmente (§ 3 punto 5).
- `ADR-53-air-gapped-ssg-zero-db.md` — il worker `static-export` resta l'unico punto in cui il
  contenuto attraversa il confine gestione→pubblico; il risolutore di questo documento è uno stadio
  di quel worker, mai un meccanismo a runtime pubblico (nessuna isola JS, nessuna chiamata di rete:
  ogni tag è risolto una volta, a build-time, con i dati disponibili nel piano di gestione).
- `ADR-77-global-kit-schema.md` / `docs/ai/specs/SPEC-GLOBAL-KIT.md` § 3 "Risoluzione dei riferimenti"
  — precedente diretto per il principio "mai un crash, mai un valore mancante: risoluzione fallita →
  fallback esplicito + warning nel report di build", applicato qui a un wrapper di prop invece che a
  un riferimento token.
- `ADR-21-schema-blocchi-versionamento.md` § 3.6/§ 3.7 — pipeline di validazione (`reason`/`path`) e
  principio "mai persistere un valore diverso da quello validato", applicato al controllo di forma di
  `DynamicValue` al salvataggio della bozza.
- `ADR-48-seo-graph-generation.md` — aveva lasciato esplicitamente aperto *"un futuro campo... 'identità
  del sito' (`publisher`/`og:site_name`) richiede una propria decisione (schema/`app_settings`), non
  assunta qui"*: `ADR-87` chiude quel debito con `app_settings.site_identity`, la cui lettura da parte
  di questo risolutore per i tag `site.*` è descritta al § 2.

---

## 1. Forma del valore: `DynamicValue<T>`

```ts
// app/backend/src/blocks/dynamic/dynamic.types.ts

/** Aggiunta a BasePropSpec da ADR-87 — non ridichiarata qui, solo consumata. */
interface BasePropSpec {
  required: boolean;
  default?: unknown;
  responsive?: boolean; // ADR-29
  stateful?: boolean;   // ADR-75
  dynamic?: boolean;    // ADR-87 — mai combinato con stateful/responsive sulla stessa prop (ADR-87 § 3)
}

type DynamicValue<T> =
  | T
  | {
      $tag: DynamicTagId;
      args?: Record<string, string | number>;
      fallback?: T;      // obbligatorio se la prop che lo ospita è `required: true` (§ 4)
      before?: string;   // ≤ 50 char, concatenato solo per kind testuali (§ 5 punto 6)
      after?: string;    // ≤ 50 char, idem
    };
```

Una prop il cui `PropSpec` dichiara `dynamic: true` accetta **sempre** entrambe le forme: il valore
letterale del proprio `kind` (comportamento invariato, l'autore non ha mai usato un tag) o l'oggetto
`{$tag, ...}` sopra. Il validatore distingue le due forme per la sola presenza della chiave `$tag`
(stesso principio di discriminazione già usato per `colorRef`/`fontRef` fra stringa e `{ref}`,
`SPEC-PROPKIND-V2-DETAILS.md` § 1 punto 2) — nessuna terza forma è ammessa.

### 1.1 Perché `dynamic` non si combina con `stateful`/`responsive`

`ADR-87` § 3 fissa questa incompatibilità a livello di descrittore (una `PropSpec` non può dichiarare
`dynamic: true` insieme a `stateful: true` o `responsive: true`): un tag dinamico risolve un **unico**
valore per l'intera vita della pagina esportata, lo stesso per ogni stato/breakpoint — nessun
requisito del gap analysis chiede un tag diverso per Hover o per Mobile, e ammetterlo raddoppierebbe
la combinatoria di questo risolutore (stato × breakpoint × dynamic) senza un caso d'uso reale a
giustificarla, lo stesso ragionamento già applicato da `SPEC-PROPKIND-V2-DETAILS.md` § 5 punto 3 per
escludere `stateful`/`responsive` da `radius`. Questo documento assume quindi che ogni `DynamicValue`
incontrato sia già al livello "valore nudo" della prop (mai annidato dentro un ramo di stato o
breakpoint).

---

## 2. Elenco chiuso dei tag (`DynamicTagId`)

```ts
type DynamicTagId =
  | 'page.title' | 'page.excerpt' | 'page.featuredImage' | 'page.url' | 'page.publishedAt'
  | 'page.author.name' | `page.field.${string}`
  | 'site.name' | 'site.logo' | 'site.url' | 'site.tagline'
  | 'nav.parentTitle'
  | 'date.now'
  | `loop.item.${string}`;
```

| Tag | Contesto richiesto | Argomenti (`args`) | Tipo di valore prodotto | Fonte |
|---|---|---|---|---|
| `page.title` | sempre | — | string | `pageRevision.title`/`draftContent` corrente (lo snapshot che il worker sta compilando) |
| `page.excerpt` | sempre | — | string | `page.seo.metaDescription` (nessun campo `excerpt` dedicato: stesso fallback già usato da `SeoGraphService`, `ADR-48`, per `ogDescription`) |
| `page.featuredImage` | sempre | — | mediaRef | `pages.coverImageMediaId` — colonna nuova introdotta da `ADR-87` § 5, chiude il gap esplicitamente segnalato da `ADR-48` ("nessun campo 'immagine di copertina' sullo schema `pages`") |
| `page.url` | sempre | — | url | URL pubblico assoluto della pagina corrente, calcolato dal worker con la stessa risoluzione di slug/locale già in uso per i link interni (`ADR-24`), combinato con `site_identity.url` (§ 2.1) |
| `page.publishedAt` | sempre (fallback su assente per una pagina mai pubblicata, es. anteprima) | `format` (§ 2.2) | string | `pageRevision.publishedAt` |
| `page.author.name` | sempre | — | string | `users.name` risolto da `pages.createdBy` — l'autore è chi ha creato la Pagina, non l'ultimo che l'ha pubblicata (nessuna colonna "autore editoriale" distinta esiste oggi, coerente con "niente scaffolding anticipato" già applicato da `ADR-79` § "Decisione" punto 5 per `page_fields`) |
| `page.field.<key>` | sempre (risolve vuoto se `<key>` non esiste in `customFields`) | — | string | `pages.customFields` (`ADR-87` § 5), cerca la entry con `key === <key>` |
| `site.name` | sempre | — | string | `app_settings.site_identity.name` (`ADR-87` § 6) |
| `site.logo` | sempre | — | mediaRef | `app_settings.site_identity.logoMediaId` |
| `site.url` | sempre | — | url | `app_settings.site_identity.url` |
| `site.tagline` | sempre | — | string | `app_settings.site_identity.tagline` |
| `nav.parentTitle` | sempre (risolve vuoto per una pagina radice, `parentId: null`) | — | string | Titolo della Pagina referenziata da `pages.parentId` (`ADR-24`), stesso snapshot risolto per `page.title` |
| `date.now` | sempre | `format` (§ 2.2, obbligatorio) | string | Timestamp del **build** corrente (§ 2.3 — non l'orologio del visitatore) |
| `loop.item.<key>` | **solo** dentro il sotto-albero item-template di un blocco `loop` (`ADR-87` § 7) | — | dipende dal `type` del campo `<key>` nello schema della Collezione (`ADR-79` § 1: `text/richText/number/boolean/date/media/ref/select`) | `collection_items.data[<key>]` dell'item corrente dell'iterazione |

Un `$tag` non presente in questa unione chiusa (es. un valore scritto da una versione futura del CMS
e poi letto da una più vecchia, o un refuso corretto manualmente nel database) è trattato come
risoluzione fallita: si applica l'algoritmo del § 4 (fallback + warning), mai un'eccezione che
interrompe l'export dell'intera pagina — stesso principio già stabilito da `ADR-76` § "Decisione"
punto 5 per una chiave di breakpoint sconosciuta e da `ADR-77` § "Conformità" per un `colorRef`
verso un id inesistente.

### 2.1 `page.url`/`site.url` e il calcolo di un URL assoluto

Nessun altro tag di questo elenco produce un URL assoluto oggi (i link interni fra Pagine restano
relativi, `ADR-24`): `page.url`/`site.url` sono i primi due casi che richiedono un dominio pubblico
noto al momento del build. `site_identity.url` (`ADR-87` § 6) è quindi l'unica fonte del dominio
assoluto usata da questo risolutore — nessuna doppia fonte (es. una variabile d'ambiente distinta):
se `site_identity.url` non è stato configurato, `page.url`/`site.url` risolvono al proprio `fallback`
se presente, altrimenti a una stringa vuota con un warning esplicito ("dominio di sito non
configurato, impostare Site Identity") nel report di build — mai un URL relativo spacciato per
assoluto in un contesto (es. JSON-LD, condiviso via `shareButtons`) che richiede un valore assoluto
per costruzione.

### 2.2 `format` — elenco chiuso, mai una stringa `strftime` libera

`date.now` e `page.publishedAt` accettano un argomento `format` da un **elenco chiuso** (whitelist,
stesso principio "elenco chiuso, mai libero" già applicato a ogni altro campo discriminante del
progetto — network allowlist di `ADR-80`, `google_allowlist` di `ADR-77`): `'YYYY-MM-DD'` |
`'DD/MM/YYYY'` | `'DD MMMM YYYY'` | `'MMMM YYYY'` | `'YYYY'`. Una stringa di formato libera (es. una
sintassi `strftime`/ICU arbitraria) non è mai ammessa: un formato non riconosciuto produce lo stesso
trattamento di un `$tag` sconosciuto (§ 4), non un errore di parsing propagato al report di build in
una forma diversa dalle altre. `format` assente su `date.now` è un errore di **validazione a
scrittura** (`400`, `reason: 'required'` sul path dell'argomento — a differenza della risoluzione
fallita a export-time, qui l'autore può correggere prima di salvare), coerente con il fatto che
`date.now` senza formato non ha un default sensato dichiarabile una volta per tutte (a differenza di
`gradient.angle`, `SPEC-PROPKIND-V2-DETAILS.md` § 6 punto 2, dove un default `180` è universalmente
accettabile).

### 2.3 `date.now` è la data del build, non la data del visitatore

Punto architetturale non negoziabile per la compatibilità con l'esportazione statica (`ADR-53`):
`date.now` **non** è "la data di oggi per chi guarda la pagina" — nessun meccanismo di questo CMS
puo aggiornare un file HTML già scritto sul disco pubblico senza una nuova build. `date.now` risolve
al timestamp dell'esecuzione corrente del worker `static-export` (lo stesso istante usato per il
nonce CSP di `SPEC-RUNTIME.md` § 6 e per il fingerprint dei file), **una sola volta per build**,
riusato identico per ogni pagina compilata nella stessa esecuzione (stesso principio di cache di
processo già in uso per `global_kit`, `SPEC-GLOBAL-KIT.md` § 3 punto "Risoluzione dei riferimenti").
Una pagina che dichiara `date.now` mostrerà quindi la data dell'ultima pubblicazione che ha
rigenerato quel file, non la data corrente del browser — questo va documentato nell'inspector (badge
"risolto al momento della pubblicazione") accanto al campo, per lo stesso motivo per cui `SPEC-RUNTIME.md`
§ 4.4 documenta esplicitamente che `countdown` "evergreen" non è un countdown lato server: evitare un
falso senso di dinamicità che l'architettura air-gapped non può offrire senza JS.

---

## 3. Algoritmo di risoluzione (worker `static-export`)

Eseguito una volta per ogni nodo dell'albero che porta un `DynamicValue` non letterale, durante la
stessa passata di render già usata da `toCss()`/dai renderer di blocco (`SPEC-PROPKIND-V2-DETAILS.md`
§ 10) — nessuna passata separata sull'albero.

1. **Normalizzazione**: se il valore non ha la forma `{$tag, ...}` (§ 1), è un letterale: nessuna
   risoluzione, procede al render come qualunque altro valore del proprio `kind` — stesso principio
   "normalizzazione senza `if` separato per ciascuna combinazione" già usato da `toCss()`
   (`SPEC-PROPKIND-V2-DETAILS.md` § 10 punto 1).
2. **Verifica del tag**: se `$tag` non è nell'unione chiusa del § 2, vai al punto 6 (fallback +
   warning `'unknown-tag'`).
3. **Verifica del contesto**: se `$tag` è `loop.item.<key>` e il nodo corrente **non** è un
   discendente del sotto-albero item-template di un blocco `loop` (verifica identica per meccanismo a
   `insideGlobalSection`, un contesto opzionale passato a valle durante la visita dell'albero, non
   uno stato globale mutabile — `ADR-79` § "Decisione" punto 4), vai al punto 6 (fallback + warning
   `'out-of-scope'`). Questo è il caso esplicitamente previsto da `ADR-79`: *"un `loop.item.<key>`
   incontrato fuori da un blocco `loop` è un errore di risoluzione (fallback obbligatorio applicato,
   warning di build), mai un'eccezione che blocca l'intero export"*.
4. **Risoluzione della fonte**: applica la riga corrispondente della tabella § 2 col contesto
   disponibile (`page`, `site`, `item` quando dentro un `loop`). Se la fonte esiste ma il valore è
   assente/vuoto (es. `page.field.<key>` con una chiave non presente in `customFields`, o
   `page.featuredImage` con `coverImageMediaId: null`), tratta come risoluzione riuscita con valore
   vuoto — non è un errore, procede al punto 5 con quel valore vuoto (un campo custom non compilato è
   un caso normale, non un guasto).
5. **Validazione del valore risolto contro il `kind` ospite**: il valore prodotto dal punto 4 (o dal
   fallback del punto 6) attraversa la **stessa** funzione di validazione del `kind` sottostante già
   invocata per un valore letterale (es. un `page.field.<key>` risolto in un campo `link` deve
   comunque avere la forma di `LinkValue`, `SPEC-propkind-v2.md` § 3.12) — un valore che non supera
   questa verifica (es. un campo custom di tipo testo libero usato in una prop `mediaRef`) è trattato
   come risoluzione fallita, vai al punto 6 con warning `'type-mismatch'`. Questa è difesa in
   profondità: un `fallback` è già stato validato contro il `kind` al momento del salvataggio (§ 4),
   ma un valore proveniente da `customFields`/`collection_items.data` è dato editoriale libero che
   può cambiare forma dopo che la prop dinamica è stata configurata (stesso principio "il contenuto
   può divergere dallo schema atteso dopo la scrittura" già alla base delle migrazioni difensive di
   `ADR-21` § 3.6).
6. **Fallback**: se un qualunque passaggio precedente ha fallito, il valore emesso è `fallback` se
   presente nella `DynamicValue`, altrimenti il `default` dichiarato dal `PropSpec` ospite (lo stesso
   default che si applicherebbe a una prop non valorizzata) — **mai** un crash, **mai** un buco nel
   markup prodotto. Ogni fallback applicato produce una riga nel report di build (`{path, tag,
   reason: 'unknown-tag'|'out-of-scope'|'type-mismatch', usedFallback: true|false}`) — stesso formato
   di riga già usato dal report di `ADR-77` § "Conformità" per un `colorRef` non risolvibile.
7. **`before`/`after`**: applicati **solo** quando il `kind` ospite produce testo (`plainText`,
   `richText` come testo semplice, `url` come stringa visibile — mai `mediaRef`/`link`, dove
   concatenare un prefisso a un guid o a un oggetto non ha senso): il valore finale è
   `${before ?? ''}${valoreRisolto}${after ?? ''}`, applicato **dopo** il punto 5 (mai prima — un
   `before`/`after` non deve poter far fallire la validazione di forma del `kind` sottostante, che si
   applica al solo valore risolto nudo).
8. **Nessuna seconda lettura per pagina**: `site_identity`, l'elenco tag e le funzioni di risoluzione
   sono caricati una sola volta per l'intera esecuzione del worker (stesso principio di cache di
   processo di `SPEC-GLOBAL-KIT.md` § 3); solo `page`/`item`/`loop` cambiano per ogni nodo/pagina
   visitata, letti dal contesto già disponibile alla passata di render corrente (nessuna query
   aggiuntiva rispetto a quelle già eseguite da `PagesService`/`CollectionsService` per produrre
   quella pagina).

---

## 4. Validazione a scrittura (`BlockTreeValidatorService`)

Distinta dall'algoritmo di risoluzione (§ 3, che gira **solo** nel worker di export): al salvataggio
di una bozza, un valore `DynamicValue` non letterale è validato in **forma**, mai in risolvibilità
(stesso principio "nessuna verifica di esistenza a scrittura" già stabilito per `mediaRef`/`colorRef`/
`pageRef` — un `page.field.customkey` verso una chiave non ancora presente in `customFields` è
accettato in scrittura, la sua risoluzione vuota a export-time è governata dal § 3 punto 4, non da
qui):

1. `$tag` deve appartenere all'unione chiusa del § 2 — un valore fuori enum produce `400`,
   `reason: 'enum'` sul path `<propPath>.$tag` (stesso `reason` già in uso per ogni altro enum chiuso
   del registro).
2. **`fallback` è obbligatorio se e solo se la prop ospite è `required: true`** — questo è il vincolo
   esplicitamente richiesto dal titolo di questo documento ("gestione obbligatoria del campo
   fallback"): una prop opzionale con un `DynamicValue` senza `fallback` è valida (il punto 6 del § 3
   ricadrà sul `default` del `PropSpec`), una prop `required: true` con un `DynamicValue` senza
   `fallback` produce `400`, `reason: 'required'` sul path `<propPath>.fallback` — un contenuto
   obbligatorio non può dipendere interamente da una risoluzione che potrebbe fallire a build-time
   senza avere un valore di ripiego già pronto.
3. Se `fallback` è presente, attraversa la **stessa** validazione del `kind` ospite di un valore
   letterale ordinario (stesso principio del § 3 punto 5, qui a scrittura invece che a export): un
   `fallback` malformato produce lo stesso `reason` che produrrebbe se fosse il valore diretto della
   prop, sul path `<propPath>.fallback`.
4. `args` è validato per forma contro gli argomenti noti del `$tag` dichiarato (§ 2.2 per `format`):
   un argomento sconosciuto o di tipo errato per quel tag produce `400`, `reason: 'type'` sul path
   `<propPath>.args.<nome>`.
5. `before`/`after`: `plainText` ≤ 50 caratteri ciascuno, stessa sanitizzazione server-side di ogni
   altro campo `plainText` del registro (`ADR-20`).
6. `dynamic: true` su una `PropSpec` che dichiara anche `stateful: true` o `responsive: true` è un
   **errore di registro** (rilevato a livello di tipo TypeScript in fase di build del backend, non a
   runtime su un contenuto specifico — § 1.1): nessun `BlockDefinition` di questo round dichiara
   questa combinazione, un test di registro (§ "Criteri di verifica") verifica che nessuna futura
   dichiarazione la introduca per errore.

---

## Criteri di verifica

- Test per ciascuno dei 13 tag: risoluzione riuscita con contesto completo produce il valore atteso;
  contesto assente/parziale (es. `nav.parentTitle` su una pagina radice) risolve a stringa vuota senza
  errore.
- Test `loop.item.<key>` fuori scope: un nodo con questo tag **fuori** da un blocco `loop` risolve al
  `fallback`/default con un warning `'out-of-scope'` nel report — mai un'eccezione che interrompe
  l'export dell'intera pagina (stesso criterio già richiesto da `ADR-79` § "Conformità").
- Test `fallback` obbligatorio: un `PATCH` che salva una prop `required: true` con `DynamicValue`
  privo di `fallback` è respinto `400` con `reason: 'required'` sul path corretto; la stessa prop
  `required: false` senza `fallback` è accettata.
- Test di non regressione tipo: un valore risolto (da `customFields`/`collection_items.data`) che non
  rispetta la forma del `kind` ospite ricade sul `fallback`/default con warning `'type-mismatch'`, mai
  un valore malformato emesso nell'HTML esportato.
- Test `date.now`: due pagine della stessa esecuzione di build portano lo stesso timestamp risolto,
  anche se compilate in istanti (di processo) diversi entro la stessa build; un `format` fuori
  dall'elenco chiuso del § 2.2 produce `400` a scrittura.
- Test `page.url`/`site.url` senza `site_identity.url` configurato: risolve a `fallback` (se presente)
  o stringa vuota, con un warning esplicito nel report — mai un URL malformato o relativo presentato
  come assoluto.
- Test di registro: nessuna `PropSpec` esistente dichiara contemporaneamente `dynamic: true` e
  (`stateful: true` o `responsive: true`) — verificato con un test che itera l'intero registro dei
  tipi di blocco.
- Test `before`/`after`: applicati solo per `kind` testuali; ignorati (nessun errore, nessuna
  concatenazione) per `mediaRef`/`link`, verificato per entrambi i casi.
