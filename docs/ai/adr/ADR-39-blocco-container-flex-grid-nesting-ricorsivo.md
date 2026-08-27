# ADR-39 — Sesto tipo di blocco: `container` (layout flex/grid, nesting ricorsivo)

## Status
[ ] In discussione · [x] Approvata · [ ] Rifiutata · [ ] Superseded da ADR-XXX

## Data approvazione
2026-08-27 (emendata in sede di approvazione: `display` limitato a `flex`, vedi punto 2 e Alternative scartate)

---

## Decisione

1. **Sesto tipo del registro: `container`, `v: 1`, `migrations: []`.** ADR-21 § 5 approva i
   cinque tipi del primo rilascio "uno per uno" e dichiara esplicitamente: *"Un sesto tipo è
   'nuovo tipo di blocco' ai fini di `CLAUDE.md` § Ask first: entra solo con una nuova firma,
   mai perché sembra naturale accanto agli altri cinque."* Questa è quella firma. Va anche
   detto, per onestà di contesto: ADR-21 § 5 elenca "colonne e griglie" fra ciò che resta
   **fuori deliberatamente** dal primo rilascio. `container` non è la stessa cosa (non è un
   layout a colonne fisso su `section`, è un contenitore generico a nesting libero), ma
   riapre la stessa famiglia di rischio che quella riga teneva volutamente chiusa — è la
   ragione per cui questa ADR è più lunga di una riga di registro.

2. **Sei props, tutte su `kind` già esistenti — nessuna estensione dell'insieme chiuso di
   `PropKind`.**
   - `display`: `enum`, `required: false`, `default: 'flex'`, `values: ['flex']`,
     **non `responsive`**. Solo `flex` in questo round (emendamento in sede di approvazione,
     2026-08-27): la specifica operativa F08 STEP 1 esclude esplicitamente CSS Grid, e senza
     `gridTemplateColumns`/`gridTemplateRows` un valore `grid` accettato dallo schema
     produrrebbe solo una griglia auto-flow a una colonna implicita — un'etichetta che
     promette una capacità assente, non un layout Grid reale. Un valore `grid` con le props
     di griglia a corredo è materia di una ADR successiva, non di un valore isolato oggi.
   - `flexDirection`: `enum`, `responsive: true`, `values: ['row', 'row-reverse', 'column',
     'column-reverse']`, `default: { default: 'row' }`.
   - `justifyContent`: `enum`, `responsive: true`, `values: ['flex-start', 'flex-end',
     'center', 'space-between', 'space-around', 'space-evenly']`, `default: { default:
     'flex-start' }`.
   - `alignItems`: `enum`, `responsive: true`, `values: ['stretch', 'flex-start', 'center',
     'flex-end']`, `default: { default: 'stretch' }` — stessa lista già in uso su
     `section.alignItems`, riusata per coerenza lessicale fra i due contenitori.
   - `wrap`: `enum`, `responsive: true`, `values: ['nowrap', 'wrap']`, `default: { default:
     'nowrap' }`.
   - `gap`: **`enum` su scala di token, non `unitValue`** — vedi punto 3. `responsive: true`,
     `values: ['none', 'sm', 'md', 'lg']`, `default: { default: 'none' }`: stessa scala,
     stessi valori di `section.gap`.
   - Più le due props avanzate universali di ADR-38 § 6 (`customCssClass`: `cssClassName`,
     `customElementId`: `htmlId`), per coerenza con gli altri tipi. **Deliberatamente escluse
     in questo round**: `styleSpaceBefore/After`, `styleBorder`, `styleShadow` e ogni altra
     prop di stile già disponibile sugli altri tipi — `container` in questo step è layout
     puro (flex/grid), non un settimo veicolo di stile; l'allineamento con ADR-38 § 6, se
     voluto, è materia di un secondo step, non di questa firma.

3. **`gap` è un `enum` a scala di token, non il `kind: 'unitValue'` che la specifica
   operativa indicava, perché renderlo `responsive` con `unitValue` non è una capacità che
   esiste oggi.** ADR-29 § 3 introduce `responsive?: boolean` **solo su `EnumPropSpec`**
   (`prop-spec.types.ts`, riga 102): `UnitValuePropSpec` (ADR-38 § 2) non ha quel campo, e
   `BlockTreeValidatorService.validateResponsiveEnumValue` è scritto contro la forma
   dell'`enum`, non generalizzabile a un valore oggetto `{value, unit}` senza scriverne una
   versione nuova. Estendere `responsive` a `unitValue` sarebbe essa stessa una decisione
   architetturale (nuova capacità di validazione, nuovo ramo del validator) che nessuna ADR
   vigente copre e che questa non apre, perché `section.gap` dimostra che un `enum` a scala
   già risolve lo stesso bisogno con zero rischio aggiuntivo. Contraddizione della specifica
   operativa dichiarata qui, non assunta in silenzio.

4. **`allowedChildren` diventa un sentinel `'*'`, capacità nuova nel validator — non
   un'enumerazione esplicita.** Oggi `BlockChildrenSpec.allow` (`block-definition.types.ts`)
   è sempre `readonly string[]`, e `BlockTreeValidatorService.validateNode` verifica
   l'appartenenza con `allowedHere.includes(node.type)` (riga 138). Per `container` questo
   tipo diventa `readonly string[] | '*'`: il valore `'*'` per `container.children.allow`
   si legge come "qualunque tipo presente in `registry.definitions` e risolto da
   `resolveDefinition`" (quindi già filtrato per `enabled`/`minRole`), incluso `container`
   stesso — annidamento di container-in-container ammesso. Il controllo in
   `block-tree-validator.service.ts` deve diventare consapevole del sentinel; è infrastruttura
   nuova nello stesso senso in cui ADR-38 § "Conseguenza" definisce nuova la prima capacità
   di validare valori-oggetto. `container` entra anche in `ROOT_ALLOWED`
   (`block-registry.ts`), coerente col fatto che oggi tutti e cinque i tipi esistenti sono
   già ammessi a radice (non solo `section`, per lo stesso motivo storico di F01 citato nel
   commento di `ROOT_ALLOWED`). **Conseguenza collaterale dichiarata qui**:
   `section.children.allow` guadagna `'container'` — senza questo, `container` sarebbe
   annidabile solo a radice o dentro sé stesso, il che vanificherebbe l'utilità del tipo.
   Non è un incremento di `v` per `section`: ADR-21 § 2 tratta `children.allow` come regola
   di annidamento del registro, distinta dallo schema delle props che `v` versiona.

5. **`maxDepth: 5` e `maxNodes: 500` restano invariati.** Il commento originario di
   `MAX_DEPTH` in `app/backend/src/pages/content-tree.ts` lo dichiara "margine per due
   generazioni future di contenitori, non derivato dal registro": `container` è esattamente
   quel caso già preventivato, non un evento che chiede una revisione. `MAX_NODES` è invece
   derivato senza margine da un NFR ("alzarlo non è un tuning, è una revisione dell'NFR"): il
   nesting ricorsivo di `container` non lo tocca, resta il tetto già in vigore. Nessuna
   revisione dell'NFR richiesta da questa ADR.

6. **Nessun `kind` nuovo: zero costo sul sanitizzatore.** Le sei props sono `enum` o (per le
   due avanzate) `cssClassName`/`htmlId` — tutti e tre già coperti dal contratto di
   sanitizzazione di ADR-21 § 4 e dalla guardia per-`kind` di ADR-38 § 7. Nessuna riga nuova
   in `BlockPropSanitizerService`.

7. **Nessun incremento di `ENVELOPE_VERSION`; il token della cache pubblica si aggiorna da
   solo.** La specifica operativa ipotizzava un incremento dell'`envelopeVersion` in
   `blocks-registry.json` per segnalare il nuovo tipo alla cache: è una lettura scorretta di
   due meccanismi distinti, corretta qui. `ENVELOPE_VERSION`
   (`src/blocks/migration/envelope-migration.engine.ts`) versiona la **forma
   dell'envelope** (le chiavi `id`/`type`/`v`/`props`/`children`), non il numero di tipi nel
   registro, ed è commentato esplicitamente "ci si aspetta che non si muova mai" — un
   incremento qui sarebbe un abuso della costante, non la sua funzione. Il meccanismo che
   *deve* e *fa già* il lavoro è il token del registro di ADR-23 § 2
   (`computeBlockRegistryToken`, `block-registry.ts`): hash di `type:v:migrations.length` per
   ogni definizione, ordinate per `type`. Aggiungere `container` a `BLOCK_DEFINITIONS`
   aggiunge `container:1:0` a quell'elenco e cambia l'hash **automaticamente**, al primo
   deploy — senza alcun intervento manuale su nessun contatore. ADR-23 § 2 lo enuncia già in
   generale ("un deploy che aggiunge un gradino di migrazione **o un tipo** cambia il
   token"): questa ADR non fa che confermarne l'applicazione al caso concreto. La cache
   pubblica riparte fredda a quel deploy, com'è voluto.

## Alternative scartate

- **`gap` come `kind: 'unitValue'` responsive** — richiederebbe di estendere `responsive` a
  un `kind` che ADR-29 § 3 non copre, una capacità di validazione nuova per un bisogno che
  un `enum` a scala di token (identico a `section.gap`) già soddisfa a costo zero.
- **`allowedChildren` come enumerazione esplicita di tutti i type correnti (+ se stesso)**
  invece del sentinel `'*'` — eviterebbe di toccare il validator, ma riapre la definizione di
  `container` a ogni settimo tipo futuro: un debito di manutenzione che il sentinel elimina
  strutturalmente, al prezzo di una capacità nuova nel validator invece che nei soli dati del
  registro.
- **Includere `grid` come valore accettato fin da subito** — versione originaria di questa
  ADR prima dell'emendamento in sede di approvazione (2026-08-27): il costo marginale
  sull'schema sarebbe stato nullo (nessuna prop dedicata, nessun `kind` nuovo), ma le props
  flex-oriented (`flexDirection`, `wrap`) non hanno alcun effetto con `display: 'grid'`, e
  senza `gridTemplateColumns`/`gridTemplateRows` un container a griglia produce solo una
  griglia auto-flow a una colonna implicita — un'etichetta "Griglia" che promette una
  capacità reale e non la mantiene. Scartata a favore di escludere `grid` per intero da
  questo round, coerente con la specifica operativa F08 STEP 1: un valore/tipo per la
  griglia si aggiunge quando è davvero configurabile, non prima.
- **Props di layout come stringa CSS libera** (`display`, `gap` liberi) — stessa famiglia di
  rischio già respinta in ADR-38 per `border`/`shadow`/`customCss`: superficie di iniezione
  nell'attributo `style`, non vincolabile con lo schema attuale.
- **Estendere `styleSpaceBefore/After`, `styleBorder`, `styleShadow` a `container` in questo
  stesso round** — coerenza cosmetica con gli altri tipi, ma fuori dallo scope dichiarato
  "F08 STEP 1"; rimandata a un secondo step per non far dipendere l'approvazione di un
  container funzionante da un allineamento di stile che nessuno ha ancora richiesto.

## Conseguenza

`prop-spec.types.ts` resta a 13 `kind`, invariato. `block-definition.types.ts` cambia:
`BlockChildrenSpec.allow` passa da `readonly string[]` a `readonly string[] | '*'` —
modifica di tipo condivisa da tutte le definizioni esistenti, ma le cinque già approvate
restano array e non cambiano comportamento. `block-tree-validator.service.ts` guadagna un
ramo nuovo nel controllo di annidamento (riga 134-145 circa) per interpretare il sentinel;
è la prima volta che il validator legge `allow` come "qualunque tipo", non come elenco
chiuso — va coperto da un test dedicato che verifichi sia il caso positivo (qualunque tipo
noto annidabile in `container`) sia che un tipo `disabled` o oltre `minRole` resti comunque
escluso (`resolveDefinition` a monte). `section.block.ts` guadagna `'container'` in
`children.allow`. `block-registry.ts` guadagna `containerBlock` in `BLOCK_DEFINITIONS` e
`'container'` in `ROOT_ALLOWED`. Il token di ADR-23 § 2 cambia al primo deploy per la sola
aggiunta della voce `container:1:0` all'hash: cache pubblica fredda a quel rilascio, nessun
intervento manuale altrove, nessun incremento di `ENVELOPE_VERSION`. Rigenerazione
obbligatoria `blocks:export` + `blocks:types` (gate CI `blocks-sync`, come ADR-38); il test
di invariante del registro (ADR-30 § 4, ogni prop dichiarata deve avere una voce
`meta.props`) si estende naturalmente a `container` e deve restare verde. Nessuna migrazione
DB, nessun incremento di `v` sui cinque tipi esistenti — la sola modifica a un tipo
approvato è `section.children.allow`, una regola di annidamento, non uno schema di props.

`display` accetta solo `flex` in questo round (emendamento in sede di approvazione,
2026-08-27): nessun rischio di un'etichetta "Griglia" che promette una capacità assente,
perché `grid` non è nello schema. Una griglia configurabile reale (con
`gridTemplateColumns`/`gridTemplateRows` e props dedicate) è materia di una ADR successiva,
non di un valore isolato in questa. Frontend:
nuovi controlli Mantine per `display`/`flexDirection`/`justifyContent`/`alignItems`/`wrap`
con overlay responsive tablet/mobile (pattern già esistente per gli `enum` responsive di
ADR-29) e riuso del controllo esistente per `gap` (stessa scala di `section.gap`) — fuori
scope di questa ADR, materia di spec/plan lato Frontend Developer. Il rendering effettivo
(classi CSS per `display`/`flexDirection`/ecc., cascata dei tre breakpoint) è materia del
consumer HTML pubblico (ADR-22) e del foglio dei token di ADR-29 § 6 — questa ADR dichiara il
vocabolario, non il CSS che gli dà significato.
