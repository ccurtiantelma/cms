# RFC-58 — "Flexbox Container Engine" per `section`: estendere o rispettare ADR-31/33?

## Status
[ ] In discussione · [x] Approvato → genera ADR-59 · [ ] Rifiutato

## Proposto da
AI Orchestrator · Data: 2026-09-05

## Problema

La richiesta originaria ("REFACTORING CORE / PROMPT RE-3: Flexbox Container Engine, Visual
Structure Picker & Allineamenti Enterprise") chiede tre cose per il blocco `section`:

1. Un **Visual Structure Picker** con preset a icone: 1/2/3/4 colonne, asimmetrico 30/70 e
   70/30.
2. **Controlli flexbox enterprise nel Property Inspector di `section`**: `flex-direction`,
   `justify-content`, `align-items`, `gap` come input numerico libero con unità (px/rem),
   `flex-wrap`.
3. Un **fix del reset CSS** per contenitori full-width e colonne vuote che si schiacciano.

Il compito indicava anche di sostituire `app/frontend/src/components/ColumnSelector.tsx` —
**verificato e confermato sbagliato**: quel file (`app/frontend/src/components/
ColumnSelector.tsx`, righe 1–40 lette) è il menu Mantine `Menu`/`Checkbox` di visibilità
colonne delle tabelle admin (`data-tour="column-selector"`, prop `columns: ResponsiveTable
Column<T>[]`), montato da `useColumnVisibility` sulle liste paginate. Nessuna relazione col
blocco `section`. **Nessuna implementazione deve toccare questo file per questo compito.**

Le tre richieste, però, non arrivano su una lavagna vuota. Prima di proporre qualunque
soluzione, questa RFC ha verificato lo stato reale del codice e delle ADR esistenti — e il
risultato cambia sostanzialmente la natura del problema.

### Cosa esiste già, verificato leggendo il codice

**Punto 1 (Visual Structure Picker) risulta già costruito, e più ampio della richiesta.**
`app/frontend/src/pages/pages/editor/SectionStructureModal.tsx` (letto per intero, 490
righe) non ha 5 preset piatti come lo stato descritto nel compito di partenza: ha un
selettore **a due passi** — "Flexbox" (7 tessere: Colonna, Riga, 2 colonne uguali, **2
colonne 33/67**, **2 colonne 67/33**, **4 colonne**, 3 colonne) e "Griglia" (6 tessere che
compongono `section` + `container` annidati: 2×2, 2 sopra/1 sotto, 1 sx/2 dx, 3×2, 3
sopra/2 sotto, struttura sfalsata). Il preset a 4 colonne e il mirror asimmetrico **esistono
già** — il commento di testa del file li attribuisce a un giro precedente ("gap-analysis
T-editor-refinement: il `66-33` di `SectionColumnRatioValue` era un valore di tipo già
valido ma orfano di preset"). L'unico scarto reale dalla lettera della richiesta: i preset
asimmetrici usano i token `columnRatio` di ADR-33 (`33-66`/`66-33`, resi in UI come "33/67"
e "67/33"), non un token `30-70`/`70-30` esatto — vedi § "Punto 1" sotto per la decisione
puntuale che resta aperta.

**Punto 2 (controlli flessibili nel Property Inspector) esiste già — ma su un tipo di
blocco diverso da `section`.** `ADR-39-blocco-container-flex-grid-nesting-ricorsivo.md`
(approvata 2026-08-27) e `ADR-41-container-spaziatura-per-lato.md` (approvata 2026-08-27)
hanno introdotto il sesto tipo `container` (`app/backend/src/blocks/types/container.block.ts`,
letto per intero) con **esattamente** il vocabolario richiesto: `flexDirection` (`row |
row-reverse | column | column-reverse`), `justifyContent` (le 6 keyword CSS complete,
incluse `space-around`/`space-evenly`), `alignItems` (`stretch | flex-start | center |
flex-end`), `wrap` (`nowrap | wrap`), `gap` (scala a token, non numero libero — vedi
sotto), più `styleFlexBasis` (`kind: 'unitValue'`, `%`, 0–100) e le otto prop di spaziatura
per lato di ADR-41. `container` ha nesting ricorsivo libero (`children.allow: '*'`, ADR-39
§ 4) ed è già annidabile dentro `section` (`section.children.allow` include `'container'`
dalla stessa ADR-39 § 4). `SectionStructureModal.tsx` lo dimostra in produzione: ogni
tessera "Griglia" del modal **compone** `section` (una colonna) + `container`* annidati con
`flexDirection`/`gap`/`styleFlexBasis` — è già, letteralmente, il "Flexbox Container
Engine" della richiesta, solo che vive nel tipo `container`, non nelle props dirette di
`section`.

`section` stesso, invece, resta **CSS Grid per decisione esplicita**:
`ADR-31-layout-colonne-section.md` (approvata 2026-08-23) ha scelto `columns`/`gap`/
`alignItems` a token enum su `display: grid` (`Section.tsx` riga 18 del CSS: `display:
grid`), e le sue "Alternative scartate" respingono nominalmente sia `kind: 'number'` per
`columns` sia (implicitamente, via RFC-31 § 6) qualunque estensione del vocabolario oltre
i tre enum a token. `ADR-33-section-boxed-fullwidth-colore-spaziatura.md` (approvata
2026-08-24) aggiunge `columnRatio` come **seconda prop cooperante**, esplicitamente per non
"ridefinire la semantica già approvata di `columns`" — lo stesso principio guida-decisione
che questa RFC deve rispettare o superare esplicitamente.

**Punto 2, sotto-questione "gap come numero libero con unità" — già affrontata e già
respinta due volte, con un terzo strumento nel frattempo disponibile.** `ADR-31`
(alternative scartate) e `ADR-33` (alternative scartate) respingono entrambe `kind:
'number'`/valori liberi per spaziature, con la stessa motivazione: "nessun vincolo di
intervallo dichiarabile con lo schema attuale". Da allora, `ADR-38-espansione-schema-blocchi
-stile-libero-parita-elementor.md` (approvata 2026-08-26) ha introdotto `kind: 'unitValue'`
— un valore `{ value, unit }` **vincolato** da `min`/`max`/`units` dichiarati dalla prop, non
un numero davvero libero (`app/backend/src/blocks/prop-spec.types.ts` righe 178–195, letto).
`container.styleFlexBasis` lo usa già per una percentuale (0–100, solo `%`). Ma
`ADR-39 § 3` (letta per intero) ha **deliberatamente scartato** `unitValue` per `container.
gap`, con una motivazione tecnica precisa, non stilistica: `responsive?: boolean`
(`EnumPropSpec`, ADR-29 § 3) esiste solo su `EnumPropSpec`, e
`BlockTreeValidatorService.validateResponsiveEnumValue` è scritto contro la forma
dell'enum — renderlo `responsive` per `unitValue` sarebbe "una capacità di validazione
nuova che nessuna ADR vigente copre". Quindi oggi esistono **due** vocabolari di gap
possibili, entrambi già passati da una decisione firmata, con esiti opposti sullo stesso
`kind`: la scala a token (in uso su `section.gap` e `container.gap`) e il valore vincolato
non-responsive (in uso su `container.styleFlexBasis`). "Numero libero con unità (px/rem)"
della richiesta originale non corrisponde a nessuno dei due: è una terza cosa, più vicina
al `NumberPropSpec` già respinto due volte che a `unitValue`. Questa RFC non decide da sola
di riaprire quella linea — lo dichiara come opzione esplicita, vedi § "Soluzione proposta".

**Punto 3 (reset CSS full-width) — verificato: non è un bug, è già corretto.**
`Section.tsx` (letto per intero) riga 176: `isFullWidth ? '' :
resolveScalarClassName(tokenStyles, 'maxWidth', maxWidth)` — la classe `maxWidth_*` non
viene mai emessa quando `contentWidth === 'full-width'`, esattamente come `ADR-33 § 1`
dichiara ("`maxWidth` è ignorato dal renderer quando `contentWidth = full-width`"). Il
comportamento descritto nel prompt originale (max-width applicato erroneamente in
full-width) **non è riproducibile nel codice attuale**: non è un bug da correggere, è già
chiuso da ADR-33. **Non è materia di questa RFC** — non richiede né una decisione
architetturale né un task di fix; al più un test di regressione esplicito che oggi manca
(vedi piano, T6).

**Punto 3, seconda metà — "colonne vuote che si schiacciano" — non è un bug applicativo,
è un comportamento CSS atteso, già mitigato dove serve (editor).** `Section.module.css`
(letto per intero) non applica alcun `min-height` alle celle della griglia — corretto: sul
sito pubblico un `container` figlio vuoto (nessun contenuto) collassando a altezza zero è
il comportamento CSS Grid/Flexbox standard, lo stesso di Elementor stesso quando una
colonna non ha widget. Dove serve davvero un segnaposto (in editor, per restare
trascinabile/cliccabile su un `container` vuoto), esiste già: `EditorBlockWrapper.module.css`
riga 144–150, classe `.emptyContainer` con `min-height: 120px`, montata dal placeholder
interattivo che `SectionStructureModal.tsx` stesso descrive nel commento di
`buildCellNode`. **Nessuna azione richiesta**: non un'assenza, un comportamento corretto per
due contesti diversi (editor vs. pubblico) già distinti nel codice.

### La vera decisione architetturale

Il problema non è "mancano i controlli flexbox" — esistono, su `container`, da ADR-39/41,
approvate e già in produzione (compresa una UI che li compone via `SectionStructureModal`).
Il problema è che la richiesta originaria li vuole **sulle props dirette di `section`**, il
tipo che ADR-31 ha deliberatamente ancorato a CSS Grid respingendo il vocabolario flexbox
nello stesso round. Riproporli oggi su `section` significa, letteralmente, riaprire
un'alternativa che ADR-31 ha già scartato per iscritto — non un'estensione additiva
innocua come le tre ADR successive (33/38/50) che hanno tutte aggiunto prop nuove senza
toccare la scelta di fondo. Questa RFC tratta la domanda per quello che è: **se e come
superare (non solo estendere) ADR-31**, con le tre opzioni oneste sotto.

## Soluzione proposta

### Punto 1 — Visual Structure Picker: scorporabile, quasi tutto già fatto

Indipendente dalla decisione grid-vs-flex sotto: `SectionStructureModal.tsx` già copre
1/2/3/4 colonne e l'asimmetria 33/67-67/33. Resta un solo scarto puntuale, se l'umano lo
giudica necessario: un token `columnRatio` esatto `30-70`/`70-30` (oggi l'insieme chiuso è
`equal | 33-66 | 66-33`, `section.block.ts` riga 79-84) al posto di — o accanto a —
`33-66`/`66-33`. È un'estensione enum additiva, stesso pattern già usato tre volte
(ADR-31 → ADR-33 → nessun bump di `v`, nessuna migrazione, solo un nuovo valore
nell'insieme chiuso più un preset nel modal). **Non richiede attendere l'esito di
Opzione A/B/C** — è ortogonale alla domanda grid-vs-flex, tocca solo `columnRatio`,
non introduce props di layout nuove. Va deciso solo **se** il rapporto esatto "30/70"
serve per un motivo specifico (fedeltà a un mockup, richiesta di brand) o se "33/67" già
spedito è considerato equivalente e la voce si chiude senza codice. **Decisione umana
richiesta solo su questo punto puntuale**, non sull'impianto.

### Punto 2 — Le tre opzioni per i controlli flessibili

**Opzione A — Non toccare lo schema di `section`. `container` resta l'unico veicolo
flessibile, composto dentro `section` (raccomandata).**

`section` mantiene CSS Grid (ADR-31 invariata), `container` mantiene flex (ADR-39/41
invariate). La richiesta "controlli flexbox enterprise" è già soddisfatta — non nelle
props dirette di `section`, ma nel tipo che ADR-39 ha creato apposta per quello scopo, già
componibile dentro `section` e già esposto in UI da `SectionStructureModal.tsx`. Il
divario reale fra "quello che il compito chiede" e "quello che esiste" non è tecnico: è
di *scoperta* — un editor che apre l'Inspector di una `section` non trova `flex-direction`
lì, deve sapere di aggiungere un `container` figlio e aprire l'Inspector di quello. Non è
un bug, è una scelta di modello a due contenitori distinti (Elementor stesso separa
"Sezione"/riga da "Colonna"/contenitore interno — non è un'invenzione di questo CMS).

- **`v`/migrazione**: nessuno, zero righe di schema toccate.
- **Cache pubblica (ADR-23)**: nessuna invalidazione, nessun deploy di schema.
- **Coerenza `kind: 'enum'`**: invariata, nessuna riapertura di `NumberPropSpec` per `gap`.
- **Costo**: al più una nota di navigazione/documentazione (non richiede necessariamente
  un ADR nuovo, essendo zero modifica di schema — vedi § "Impatto").

**Opzione B — `section` guadagna un vocabolario flex proprio, dietro una prop esplicita
`layoutMode: grid | flex`, senza sostituire il vocabolario grid esistente.**

Nuova prop enum non-responsive `layoutMode` (`grid | flex`, default `grid` — zero
regressione per ogni nodo salvato, stesso principio del default di ADR-31 § 3). Quando
`flex`, `section` espone un secondo pacchetto di prop — mirror lessicale di
`container.flexDirection`/`justifyContent`/`alignItems`/`wrap`/`gap` (stessi valori
enumerati, per coerenza col vocabolario già approvato da ADR-39, non un'invenzione
parallela) — che il renderer onora al posto di `columns`/`gap`/`alignItems`/`columnRatio`
quando attivo. Queste ultime restano dichiarate e validate anche sotto `layoutMode: flex`
(stesso principio "presentazione, non validazione" di `maxWidth` sotto `full-width`,
ADR-33 § 1) per non introdurre props condizionalmente assenti nello schema.

- **`v`/migrazione**: zero, se ogni prop nuova resta opzionale con default — stesso
  pattern di ADR-29 § 5 / ADR-31 § 4 / ADR-33 § 5. Nessun bump di `v` su `section`.
- **Cache pubblica**: il token del registro (ADR-23 § 2) cambia comunque al primo deploy
  perché la *forma* di `props` cambia anche a `v` invariato (stesso caso già osservato e
  accettato in ADR-41 § 3) — cache pubblica fredda a quel rilascio, atteso, non un
  problema.
- **Coerenza `kind: 'enum'`**: `gap` di `section` in modalità flex resterebbe scala a
  token (`none|sm|md|lg`, stessa di `container.gap`), **non** un `unitValue`/numero libero
  — questa RFC non propone di riaprire quella linea nemmeno in Opzione B, per lo stesso
  motivo tecnico di ADR-39 § 3 (nessuna capacità di validazione `responsive` su
  `unitValue` oggi). Se l'umano vuole comunque "gap in px/rem libero" alla lettera del
  compito originale, è una **quarta** decisione separata — estendere `responsive` a
  `unitValue` nel validator — che nessuna opzione di questa RFC assume implicitamente:
  va dichiarata a parte se voluta, con la propria ADR (tocca
  `BlockTreeValidatorService`, infrastruttura condivisa da ogni prop `unitValue`
  presente e futura, non solo da `section`/`container`).
- **Costo reale**: duplica quasi integralmente il vocabolario di `container` dentro
  `section` — due posti che dichiarano lo stesso enum di `flexDirection`, con il rischio
  di drift che ADR-39 non ha (perché è l'unico posto oggi). Riapre esplicitamente
  l'alternativa che ADR-31 aveva scartato ("controlli flexbox nel round di `section`"),
  quindi **supera ADR-31 su questo punto specifico**, non la estende — l'ADR conseguente
  deve dirlo esplicitamente (`Superseded da ADR-59` su ADR-31 limitatamente alla
  Decisione 1, oppure — a scelta del firmatario — un'estensione dichiarata "ADR-31 resta
  valida, ADR-59 la affianca senza sostituirla" se il grid resta il default e nessuna
  riga di ADR-31 viene contraddetta nel merito).

**Opzione C — Superare ADR-31/33 con un modello ibrido unico, fondendo `section` e
`container` (o ridisegnando `section` da zero sul vocabolario di `container`).**

Non raccomandata, riportata per completezza perché il compito originale la evoca
implicitamente ("Container Engine" come nome). Comporterebbe ritirare/ridefinire
`columns`/`columnRatio`/`gap`/`alignItems` di `section` (contenuto già persistito con
questi valori, per ogni `section` salvata dal 2026-08-23 in poi) a favore del vocabolario
di `container`, o viceversa fondere i due tipi in uno. Questo **è** un breaking change
allo schema di un blocco esistente ai sensi della Constitution ("vietato... senza
migrazione dei contenuti esistenti"): richiederebbe `v: 2` su `section` con una
migrazione difensiva (ADR-21 § "migrazioni difensive") che traduca ogni combinazione
`columns`/`columnRatio` salvata nel nuovo vocabolario, invalidazione totale della cache
pubblica (token di registro cambia comunque, ma qui cambierebbe perché la *semantica*
cambia, non solo la forma), e toccherebbe ogni superficie che oggi assume la coppia
`section`(grid)/`container`(flex): `SectionStructureModal.tsx` (l'intero modello a due
step "Flexbox"/"Griglia" perderebbe senso), `style-tokens.module.css`,
`block-tree-validator.service.ts`, il consumer SSR pubblico (ADR-22/53). Costo e rischio
sproporzionati rispetto al compito ("parità enterprise" non implica fondere due tipi che
oggi funzionano insieme correttamente): **scartata**, salvo che l'umano indichi un motivo
specifico non coperto da A/B.

### Raccomandazione

**Opzione A.** `container` già fa quello che il compito chiede, con lo stesso vocabolario,
già componibile dentro `section`, già approvato con due ADR dedicate (39/41) e già esposto
in UI (`SectionStructureModal.tsx` § "Griglia"). Il gap reale è di scoperta/UX
(un editor non sa che deve aggiungere un `container` per avere flex), non di capacità
mancante — e questo si risolve con lavoro di frontend leggero (es. un CTA nell'Inspector di
`section` "Serve un layout flessibile? Aggiungi un Contenitore" o un preset di default che
inserisce già un `container` vuoto), non con una nuova firma sullo schema dei blocchi.
Opzione B è legittima se l'umano vuole letteralmente i controlli flex **nelle props dirette
di `section`** per motivi di UX/aspettativa (un solo Inspector, non due tipi da capire),
ma va scelta sapendo che duplica un vocabolario già esistente e supera esplicitamente
ADR-31 su un punto che quell'ADR aveva chiuso con motivazione scritta, non per
dimenticanza.

## Alternative valutate

- **Reintrodurre `NumberPropSpec` libero per `gap` (px/rem)** — la lettera esatta del
  punto 2 del compito. Scartata: è l'alternativa già respinta due volte (ADR-31, ADR-33),
  per lo stesso identico motivo entrambe le volte ("nessun vincolo di intervallo
  dichiarabile"). Questa RFC non la ripropone; se l'umano la vuole comunque, deve
  dichiararlo esplicitamente come riapertura di una decisione già presa due volte, non
  come parte implicita di A/B/C.
- **Estendere `responsive` a `unitValue` per usare `gap: unitValue` responsive** —
  tecnicamente più vicino allo spirito "numero con unità" del compito, ma è essa stessa
  una capacità di validazione nuova (ADR-39 § 3 lo dichiara esplicitamente come fuori
  scope della sua stessa ADR). Non assunta in nessuna delle tre opzioni sopra; riportata
  come quarta decisione a sé se l'umano la vuole.
- **Fondere subito `section` e `container` in un unico tipo (Opzione C)** — valutata e
  scartata, vedi sopra: breaking change allo schema con contenuto già persistito, senza
  un beneficio che Opzione A/B non offrano già a costo minore.
- **Implementare il picker con token `30-70`/`70-30` esatti indipendentemente
  dall'esito di A/B/C** — non scartata, isolata come decisione a sé nel Punto 1: non
  richiede di aspettare la scelta grid-vs-flex.
- **Toccare `ColumnSelector.tsx`** — scartata con certezza: nessuna relazione col
  dominio Blocchi, è il selettore di colonne visibili delle tabelle admin
  (`app/frontend/src/components/ColumnSelector.tsx`, verificato).

## Impatto

**Se Opzione A (raccomandata) è confermata**: nessun impatto su schema, `v`, cache
pubblica, `openapi.yaml`, `bruno/`. Impatto solo UX/frontend (discoverability di
`container` dentro `section`), materia di un task minimo, non di un'ADR — l'unico
artefatto di governance necessario è, se l'umano lo vuole, un'ADR "di chiarimento" breve
che dichiari esplicitamente "container resta il solo veicolo flex, nessuna estensione a
section" per chiudere formalmente la voce RE-3 e impedire che risalga come richiesta
"dimenticata" in un round futuro (una riga, stesso principio di `Constitution` § "Una ADR
sta in una pagina").

**Se Opzione B è scelta**: `section.block.ts` guadagna 1 prop enum (`layoutMode`) + un
pacchetto di ~5-6 prop flex (mirror lessicale di `container`), tutte opzionali/default
→ zero bump di `v`, ma il token di registro (ADR-23 § 2) cambia comunque al primo deploy
(cache pubblica fredda, atteso). `Section.tsx`/`Section.module.css` guadagnano un ramo
condizionale (`layoutMode === 'flex'` → classi flex invece che grid, stesso pattern di
`style-tokens.module.css` già in uso per `container`). `PropertyInspector`/`StyleTab`
guadagnano una visibilità condizionale dei controlli (mostra le prop grid o le prop flex
in base a `layoutMode`, stesso principio già in uso per `contentWidth`/`maxWidth`,
ADR-33 § 1). Rigenerazione obbligatoria `blocks:export`+`blocks:types` (gate CI
`blocks-sync`). Nessuna migrazione DB. Supera ADR-31 limitatamente alla propria Decisione
1 ("nessun controllo flexbox su `section` in questo round") — l'ADR conseguente deve
dichiararlo esplicitamente.

**Se Opzione C è scelta**: impatto pieno di un breaking change di schema — `v: 2` su
`section`, migrazione difensiva, invalidazione totale della cache pubblica per
cambio di semantica (non solo di token), revisione di `SectionStructureModal.tsx`,
`style-tokens.module.css`, `block-tree-validator.service.ts`, consumer SSR pubblico.
Non stimato in dettaglio qui: se l'umano la sceglie, questa RFC va rifatta con
un'analisi di migrazione dedicata, non è materia di un'estensione delle opzioni A/B.

**In ogni opzione**: nessun impatto su `ColumnSelector.tsx` (confermato fuori perimetro),
nessuna nuova dipendenza npm, nessun endpoint nuovo o modificato (`openapi.yaml`/`bruno/`
invariati — questa è materia di schema Blocchi, non di contratto HTTP).

## Rischi

1. **Duplicazione di vocabolario (Opzione B)**: due dichiarazioni indipendenti dello
   stesso enum `flexDirection`/`justifyContent`/`alignItems`/`wrap` su `container` e su
   `section` — un domani che cambia i valori ammessi su uno dei due senza specchiare
   l'altro produce un'incoerenza lessicale silenziosa fra i due contenitori, niente che il
   validator intercetti (sono due tipi distinti, ciascuno internamente coerente).
2. **Scoperta debole (Opzione A)**: se non si aggiunge un minimo di guida in UI, un
   editor che cerca "flex-direction" nell'Inspector di `section` non lo trova e potrebbe
   concludere (a torto) che la capacità non esiste — rischio di percezione, non tecnico,
   ma reale per l'esperienza "parità Elementor" richiesta dal compito.
3. **Malinteso sulla quarta decisione (`unitValue` responsive)**: se l'ADR conseguente
   approva A o B senza notare esplicitamente che "gap in px/rem libero" resta fuori
   perimetro, un round futuro potrebbe implementarlo per errore come se fosse già
   incluso nel vocabolario approvato qui — va scritto a chiare lettere nella firma.
4. **Token `30-70`/`70-30` vs. `33-66`/`66-33` (Punto 1)**: se l'umano conferma di voler
   procedere col token esatto senza specificare se sostituisce o affianca `33-66`/
   `66-33`, un'implementazione affrettata potrebbe rimuovere valori già usati da preset
   esistenti (`2-33-67`/`2-67-33` in `SectionStructureModal.tsx`) — va trattato come
   aggiunta, mai sostituzione, per non rompere contenuto già composto da quei preset.
5. **Punto 3 già chiuso ma non testato**: l'assenza di un bug non equivale all'assenza di
   un test che lo garantisca nel tempo — un refactor futuro di `Section.tsx` potrebbe
   reintrodurre l'errore senza che nessuna suite lo segnali (vedi T6 del piano).

## Decisione umana
**Esito**: [x] Approvato · [ ] Rifiutato · [ ] Modificato

**Note**: Opzione A confermata (nessuna modifica allo schema/props di `section`; `container`
resta l'unico veicolo flex, ADR-31 invariata). Punto 1: sì, aggiungere i token esatti
`30-70`/`70-30` a `columnRatio`, in modo additivo — `33-66`/`66-33` restano invariati, nessun
preset esistente rimosso. Quarta decisione (`unitValue` responsive per `gap` libero in
px/rem) non richiesta, resta fuori perimetro come dichiarato in RFC-58 § "Alternative
valutate". Decisione raccolta in sessione interattiva (AskUserQuestion) contestualmente al
task che riapre questa RFC.

**Approvato da**: marketing@antelmagroup.net · **Data**: 2026-09-05

**Azione successiva**: [ ] Genera ADR-59 · [x] Archivio (Opzione A non richiede ADR-59 per
sé — zero modifica di schema, vedi § "Impatto"; il Punto 1 è un'estensione enum additiva
già coperta dal pattern ADR-31→ADR-33, non richiede una propria ADR dedicata)

---

## Piano operativo (condizionato — non eseguibile finché la firma sopra non arriva)

Il piano ramifica in base all'esito di T1. Nessun task da T2 in poi parte prima che T1 sia
chiuso con un esito scritto (Opzione A / B / C, più le due decisioni puntuali: token
`30-70`/`70-30` sì/no, quarta decisione `unitValue` responsive sì/no).

### T1 — Firma di RFC-58 e generazione di ADR-59
- Output atteso: RFC-58 con `## Decisione umana` compilata; se l'esito lo richiede,
  `docs/ai/adr/ADR-59-<slug-coerente-con-esito>.md` generata dall'Orchestrator su
  richiesta esplicita post-firma.
- Dipendenze: nessuna.
- Criterio di Done: sezione "Decisione umana" di questa RFC compilata con Opzione scelta
  (A/B/C), esito sul token `30-70`/`70-30`, esito sulla quarta decisione
  `unitValue`-responsive; se Opzione B o C, ADR-59 approvata prima di T3.
- Agente: Orchestrator (produce l'ADR su richiesta, dopo la firma) — nessun ruolo di
  sviluppo coinvolto in questo task.

### T2 — [Solo se Punto 1 richiede il token esatto] Estensione `columnRatio` + preset
- Output atteso: `app/backend/src/blocks/types/section.block.ts` (`columnRatio.values`
  `+= '30-70' | '70-30'`, additivo, `33-66`/`66-33` invariati), `blocks-registry.json`
  rigenerato (`blocks:export`), `SectionStructureModal.tsx` (+2 tessere Flexbox).
- Dipendenze: T1 (esito positivo sul token esatto).
- Criterio di Done: `blocks:types` rieseguito senza errori, test di invarianza del
  registro (ADR-30 § 4) verde, i due nuovi preset inseriscono un nodo `section` valido
  (verifica manuale in editor).
- Agente: frontend-developer (schema + UI in un solo task, stesso pattern già usato per
  ADR-33 § 7 — nessun endpoint coinvolto, nessuna logica server oltre al registro).

### T3 — [Solo se Opzione B] Schema: `layoutMode` + vocabolario flex su `section`
- Output atteso: `app/backend/src/blocks/types/section.block.ts` aggiornato (+1 prop
  `layoutMode`, + prop flex mirror di `container`), `meta.props` con etichette italiane
  (ADR-30 § 4), `blocks-registry.json` rigenerato.
- Dipendenze: T1 (ADR-59 Opzione B approvata).
- Criterio di Done: `blocks:export`+`blocks:types` verdi, test di invarianza del registro
  esteso e verde, nessun bump di `v`, `block-tree-validator.service.spec.ts` esteso con un
  nodo `section` `layoutMode: 'flex'` che valida correttamente.
- Agente: backend-developer.

### T4 — [Solo se Opzione B] Renderer e Inspector condizionali
- Output atteso: `Section.tsx`/`Section.module.css` (ramo `layoutMode === 'flex'`),
  `style-tokens.module.css` (classi flex, riuso dove possibile dei token già emessi per
  `container`), `PropertyInspector`/`StyleTab` (visibilità condizionale grid vs. flex).
- Dipendenze: T3.
- Criterio di Done: un nodo `section` con `layoutMode: 'flex'` renderizza con
  `display: flex` e le classi corrette in editor e nel consumer pubblico (ADR-22/53);
  un nodo `section` pre-esistente senza `layoutMode` renderizza identico a prima (nessuna
  regressione grid).
- Agente: frontend-developer.

### T5 — [Solo se Opzione B] Copertura round-trip responsive
- Output atteso: test unit/integration sul modello di ADR-29 T8: salva un nodo `section`
  `layoutMode: 'flex'` con `flexDirection`/`gap`/`justifyContent` su tutti e tre i
  breakpoint, rilegge identico, verifica sull'HTML prodotto che tutte e tre le classi di
  breakpoint siano presenti (nessuna perdita silenziosa, stesso rischio dichiarato in
  ADR-29/31 Conseguenza).
- Dipendenze: T4.
- Criterio di Done: suite verde, nessun breakpoint dimenticato dal renderer.
- Agente: test-engineer.

### T6 — Test di regressione sul Punto 3 (indipendente, eseguibile subito)
- Output atteso: test che verifica `maxWidth` non applicato quando
  `contentWidth = 'full-width'` (comportamento già corretto in `Section.tsx` riga 176, oggi
  non coperto da un'asserzione esplicita) e test che verifica che un `container` figlio
  vuoto non riceva alcun vincolo di altezza minima nel consumer pubblico (comportamento CSS
  atteso, da fissare come contratto esplicito, non solo osservazione).
- Dipendenze: nessuna — non attende l'esito di T1, non tocca schema né decisione
  architetturale.
- Criterio di Done: entrambi i test verdi, nessuna modifica al codice applicativo.
- Agente: test-engineer.

### T7 — [Solo se Opzione A] Discoverability minima di `container` dentro `section`
- Output atteso: piccola estensione UI (es. suggerimento nell'Inspector di `section` o
  voce dedicata nella palette che inserisce già un `container` figlio con preset flex) —
  nessuna modifica di schema.
- Dipendenze: T1 (Opzione A confermata).
- Criterio di Done: verifica manuale che un editor senza conoscenza pregressa trovi la via
  per un layout flessibile senza dover leggere questa RFC.
- Agente: frontend-developer.

### T8 — Aggiornamento `docs/TODO.md`/`docs/roadmap.md` (solo su richiesta umana esplicita)
- Output atteso: chiusura della voce RE-3 in `docs/TODO.md`, con l'esito effettivo
  (Opzione scelta, cosa resta fuori — es. la quarta decisione `unitValue` responsive se non
  affrontata).
- Dipendenze: T1 (+ T2/T3-T5/T7 completati secondo il ramo scelto).
- Criterio di Done: voce presente, coerente con lo stato reale del repository — solo se
  l'umano lo richiede esplicitamente per questi file (Documentation Policy,
  `CLAUDE.md`).
- Agente: Orchestrator, su richiesta esplicita e circostanziata.

### CHECKLIST DONE GLOBALE
- [ ] T1 firmato, ramo scelto (A/B/C) e le due decisioni puntuali esplicite
- [ ] Se A: T7 completato, nessuna modifica di schema
- [ ] Se B: T3–T5 completati, ADR-59 dichiara esplicitamente il superamento parziale di
      ADR-31 (Decisione 1), zero bump di `v`, token di registro aggiornato
- [ ] Se C: RFC-58 rifatta con analisi di migrazione dedicata prima di procedere
- [ ] T2 completato solo se richiesto (token `30-70`/`70-30`), additivo, preset esistenti
      invariati
- [ ] T6 completato indipendentemente dal ramo
- [ ] `blocks:export`+`blocks:types` rieseguiti per ogni modifica di schema, gate CI
      `blocks-sync` verde
- [ ] Nessuna modifica a `ColumnSelector.tsx`
- [ ] `docs/TODO.md`/`docs/roadmap.md` aggiornati solo su richiesta esplicita (T8)
