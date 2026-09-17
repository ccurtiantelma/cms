# ADR-81 — Migrazione PropKind v1→v2 per i widget legacy: strategia difensiva senza breaking change

## Status
[x] **In discussione** · [ ] Approvato · [ ] Rifiutato · [ ] Superseded da ADR-XXX

## Data approvazione
_In attesa di firma umana — vedi "Decisione umana" in fondo a questo documento._

## RFC di riferimento
Nessuna RFC dedicata: round **R1 — Stile completo** di `docs/PLAN-parita-elementor-pro.md`, § T2.
Riferimenti sostanziali: `docs/SPEC-propkind-v2.md` § 6, `docs/ai/specs/SPEC-PROPKIND-V2-DETAILS.md`.

## Numerazione
`PLAN-parita-elementor-pro.md` § "Riepilogo" assegnava a R1 il numero **80** ("migrazione v2
widget"), in continuità con "R0 = 73–79". `ADR-74-isole-js-pubbliche.md` § "Numerazione" ha già
corretto R0 a **74–80** per collisione con `ADR-73-rimozione-maniglie-resize-widget-foglia.md`.
Questa ADR occupa quindi il primo numero libero dopo R0: **ADR-81**. Lo stesso scarto di +1 vale
per `ADR-82-container-unificato-grid-flex.md` (round R2), che nel piano originale era numerata 81.

## ADR di riferimento (non superate, non modificate)
- `ADR-21-schema-blocchi-versionamento.md` § 3 — meccanica di migrazione: funzioni pure e totali
  per `(type, v→v+1)`, migrazione in lettura come norma, normalizzazione in scrittura, nessuna
  cancellazione degli schemi storici, ordine di pipeline `envelope → migrazione → validazione →
  sanitizzazione → persistenza`. Questa ADR **applica** quel meccanismo a quattro tipi concreti,
  non lo modifica.
- `ADR-29-proprieta-di-stile-per-breakpoint.md` — cascata `default → tablet → mobile`, che ogni
  prop migrata a `spacing`/`typography` deve preservare invariata al proprio interno.
- `ADR-75-involucro-stateful-e-stati-hover.md` — ordine stato → breakpoint → valore, applicabile
  solo dove questa ADR introduce `stateful: true` (§ "Decisione" punto 2 sotto).
- `ADR-76-breakpoints-configurabili.md` — le chiavi di breakpoint prodotte dalla migrazione di
  `styleHide*` (§ "Decisione" punto 5) sono le 3 storiche (`default`/`tablet`/`mobile`), un
  sottoinsieme sempre attivo delle 7 correnti: nessuna incompatibilità.
- `ADR-77-global-kit-schema.md` — risoluzione dei `colorRef`/`fontRef` prodotti dalla migrazione di
  `styleTextColor`/`styleFontFamily`.

## Assunzione di dominio coinvolta
Nessuna modifica a `docs/business-rules.md`. Questa ADR tocca `docs/ai/adr/ADR-21-schema-blocchi-
versionamento.md` § 5 solo nel senso operativo previsto da quella stessa ADR ("un sesto tipo... entra
solo con una nuova firma"): qui non si introduce un tipo nuovo, si porta `v: 1 → v: 2` su quattro dei
cinque tipi del primo rilascio (`section` è escluso, ADR-82 lo tratta come cambio di `type`, non di
`v`).

---

## Contesto

`ELEMENTOR_PRO_GAP_ANALYSIS_v2.md` § 1.1/§ 1.2 elenca come gap P0 l'assenza di stato Hover, di
colori/font globali bindabili e di una tipografia composita su `heading`, `richText`, `image`,
`button` — i quattro tipi foglia del registro (`app/backend/src/blocks/types/heading.block.ts`,
`rich-text.block.ts`, `image.block.ts`, `button.block.ts`). Oggi ciascuno dichiara indipendentemente
lo stesso blocco di prop scalari ripetute: `styleTextColor` (enum a 4 token,
`responsive: true`), `styleFontSize`/`styleFontWeight`/`styleFontFamily` (tre enum separati,
`responsive: true` ciascuno) più `styleFontSizeCustom` (`unitValue`, priorità dichiarata su
`styleFontSize` nel testo di `help` dell'inspector), quattro `styleMargin{Top,Right,Bottom,Left}`
(`unitValue` indipendenti), tre `styleHide{Desktop,Tablet,Mobile}` (booleani scalari). `button`
aggiunge `href` (`url`) come prop di link non wrappata.

`SPEC-propkind-v2.md` § 6 e `docs/ai/specs/SPEC-PROPKIND-V2-DETAILS.md` definiscono le forme di
arrivo (`colorRef`, `typography`, `spacing`, `hideOn[]`, `link`), ma nessuno dei due documenti fissa
**come** il contenuto già scritto (`page_revisions` immutabili, `pages.draftContent` mutabile)
attraversa il salto senza rompersi. È esattamente il problema che `ADR-21` § 3 ha già risolto in
generale; questa ADR ne è l'istanza concreta per questi quattro tipi, con le tabelle di
corrispondenza campo-per-campo che una funzione di migrazione pura deve implementare.

Il vincolo "senza breaking change" del titolo del task non significa "nessun bump di `v`" — significa
che nessun contenuto esistente smette di essere leggibile o richiede un intervento manuale: il
meccanismo che lo garantisce è proprio quello di `ADR-21` § 3 (migrazione in lettura come norma),
non l'assenza di un cambio di schema.

---

## Decisione

1. **`v: 1 → v: 2` indipendente per ciascuno dei quattro tipi** (`heading`, `richText`, `image`,
   `button`), mai un bump unico condiviso: coerente con `ADR-21` § 1 ("con `v` per nodo, la
   migrazione è una funzione locale al nodo... migrare `accordion` non tocca gli altri tipi").
   Un albero che contiene `heading` `v:2` e `richText` `v:1` è pienamente valido: la migrazione di
   `richText` avviene alla lettura di quel singolo nodo, indipendentemente dallo stato degli altri.

2. **Tabella di corrispondenza, comune ai quattro tipi dove la prop esiste identica**:

   | Prop v1 | Tipi che la dichiarano | Prop v2 | Mappatura |
   |---|---|---|---|
   | `styleTextColor` (enum `default/muted/accent/inverse`, responsive) + `styleTextColorCustom` (color) | heading, richText, button | `color: colorRef` | `styleTextColorCustom` presente ha priorità (stesso ordine di priorità già dichiarato nell'`help` dell'inspector v1): migra a valore hex letterale invariato. Altrimenti, mappa il token: `default → {ref:'text'}`, `accent → {ref:'accent'}`, `muted → '#6b7280'` (hex letterale, non un id system: nessun id Global Kit corrisponde a "muted" — vedi § Alternative), `inverse → '#ffffff'` (stessa ragione). `responsive` preservato: ogni ramo breakpoint migra con la stessa regola. Non `stateful` in questa migrazione (nessun valore Hover esisteva in v1 da cui derivarlo: `hover` resta assente, l'autore lo aggiunge da zero nell'editor v2). |
   | `styleFontSize`/`styleFontWeight`/`styleFontFamily` (tre enum responsive) + `styleFontSizeCustom` (unitValue) | heading, richText, button | `typography: typography` | Un solo oggetto `TypographyValue` (`SPEC-PROPKIND-V2-DETAILS.md` § 3) con tre campi popolati: `fontSize` (da `styleFontSizeCustom` se presente — priorità identica a v1 — altrimenti dalla tabella `sm→14px, md→16px, lg→20px, xl→28px`), `fontWeight` (`regular→'400', medium→'500', bold→'700'`), `fontFamily` (`{family: <nome enum>, source:'system'}`, `default` mappato a `{family:'inter', source:'system'}` — la famiglia di sistema oggi cablata nel foglio dei token). `responsive` migra **per campo** (`SPEC-PROPKIND-V2-DETAILS.md` § 3 punto 3): ogni ramo breakpoint del `fontSize`/`fontWeight`/`fontFamily` originale produce lo stesso ramo dentro il campo corrispondente di `typography`, mai un unico envelope a livello dell'intero oggetto. |
   | `styleMarginTop`/`...Right`/`...Bottom`/`...Left` (quattro `unitValue` indipendenti, `px`\|`%`) | heading, richText, image, button | `margin: spacing` | Se i quattro lati condividono lo stesso `unit`: `{top,right,bottom,left,unit,linked: <true se i 4 valori sono uguali>}`. Se `unit` differisce fra lati (caso raro, nessun controllo v1 lo impediva): la migrazione forza `unit:'px'`, converte 1:1 i lati già in `px`, e applica il default dichiarato dallo schema di arrivo (`0`) ai lati in `%` — con un `warning` nel `MigrationResult` (`ADR-21` § 3.6: "valore non mappabile → default + warning, mai 500"), perché convertire `%` in `px` richiederebbe conoscere la dimensione del contenitore, un dato non disponibile a una funzione pura senza I/O. |
   | `styleHideDesktop`/`styleHideTablet`/`styleHideMobile` (tre booleani) | heading, richText, image, button | `hideOn: BreakpointKey[]` | Un array che contiene `'default'` se `styleHideDesktop`, `'tablet'` se `styleHideTablet`, `'mobile'` se `styleHideMobile` — nessuna delle tre chiavi se tutti falsi (comportamento invariato). |
   | `href` (url) | button | `link: link` | `{ href: <valore invariato>, target: '_self', rel: [] }` — nessun campo v1 da cui derivare `target`/`rel`, quindi i default dichiarati dallo schema di arrivo (`SPEC-propkind-v2.md` § 3.12). |

   Prop **non toccate** da questa ADR: `styleSpaceBefore`/`styleSpaceAfter` (restano `enum`
   responsive, nessun gap analysis le segnala), `styleLayer` (resta scalare, sostituito da
   `position.zIndex` solo per `container`/`section` in `ADR-82`, non per i quattro tipi qui), `alt`
   (`image`, invariata), `label`/`text`/`html` (contenuto, invariati), `styleBorder`/`styleShadow`
   (restano `border`/`shadow` — `SPEC-PROPKIND-V2-DETAILS.md` § 5 li rende `stateful`-compatibili
   solo per `container`/mixin "Avanzato" di `ADR-82`, non qui), `styleSizePreset`/`styleObjectFit`/
   `styleAlign` (`image`, invariate), `customCssClass`/`customElementId` (invariate).

3. **Le prop v1 elencate al punto 2 spariscono dal registro v2**: lo schema di arrivo (`v: 2`) non
   dichiara più `styleTextColor`, `styleFontSize`, ecc. — sono sostituite, non affiancate. Un valore
   v1 letto passa **sempre** dalla funzione di migrazione prima di raggiungere il validatore v2
   (`ADR-21` § 3, ordine di pipeline), quindi non è mai valutato contro uno schema che non lo
   conosce più. Questo è il punto su cui il titolo "senza breaking changes" si applica: la rottura è
   nello schema (che cambia), non nel contenuto (che resta leggibile per sempre attraverso la
   catena).

4. **Ogni funzione di migrazione è pura, totale e difensiva** (`ADR-21` § 3.6): riceve `props`
   arbitrarie (mai la forma v1 esatta, per costruzione — il registro non conserva schemi storici),
   tratta ogni campo atteso come possibilmente assente o malformato, e produce sempre un nodo v2
   valido — al peggio con i default dichiarati dallo schema di arrivo più un `warning`. Le quattro
   funzioni (`migrateHeadingV1ToV2`, `migrateRichTextV1ToV2`, `migrateImageV1ToV2`,
   `migrateButtonV1ToV2`) vivono in `app/backend/src/blocks/migrations/`, una per file, coerenti con
   `ADR-21` § 3.5 ("codice permanente, non si cancella finché esiste una revisione che lo richiede").

5. **Nessuna migrazione batch in questo round**: la migrazione in lettura (`pages`/`page_revisions`)
   e la normalizzazione in scrittura (ogni `PATCH` su una bozza porta i nodi toccati a `v: 2`) sono
   sufficienti — stessa scelta già fatta da `ADR-21` § 3.3 per il primo rilascio, per lo stesso
   motivo (nessun volume che giustifichi il costo di un job dedicato oggi).

---

## Alternative valutate

| Opzione | Pro | Contro | Motivo scarto |
|---|---|---|---|
| Nuovo `type` (`headingV2`) invece di `v: 2` sullo stesso `type` | Nessuna funzione di migrazione da scrivere, il vecchio resta intatto per sempre | Contraddice `ADR-21` § 5 ("un tipo nuovo solo se la migrazione non è totale/pura"): qui lo è, quindi la via corretta è il bump di `v`. Raddoppierebbe il registro e la palette per un contenuto semanticamente identico | Viola un principio già firmato senza un fatto nuovo che lo giustifichi |
| Affiancare le prop v2 alle v1 senza rimuoverle (nessuna migrazione, doppio schema) | Zero rischio di migrazione difettosa | Duplica per sempre ogni prop di stile (`styleTextColor` **e** `color`), raddoppia il lavoro di `toCss()` e dell'inspector, contraddice l'obiettivo dichiarato di "clone Elementor Pro" con un pannello Stile coerente | Nessun beneficio che pareggi il costo di manutenzione perpetuo |
| Mappare `muted`/`inverse` a due nuovi id system nel Global Kit invece di hex letterali | Ogni colore migrato resta un riferimento vivo, non un letterale "morto" | Aggiungerebbe 2 id riservati non previsti da `ADR-77` § "Decisione" punto 2 (fissati a 4: `primary/secondary/text/accent`) — una modifica allo schema del Global Kit, fuori scopo di questa ADR e non richiesta da alcun requisito del gap analysis | Fuori scopo, richiederebbe una firma propria su ADR-77 |
| Convertire `%` in `px` durante la migrazione di `margin`/`spacing` stimando una larghezza media | Nessun `warning`, migrazione "silenziosamente riuscita" | Richiederebbe un'assunzione arbitraria (quale larghezza?) che potrebbe produrre un valore visivamente sbagliato senza segnalarlo — peggiore di un default esplicito con warning | `ADR-21` § 3.6 preferisce sempre "default + warning, mai un valore inventato silenziosamente" |
| Job batch di migrazione fin da subito | Contenuto sempre alla versione più recente, catena di migrazione più corta prima | Nessun volume oggi lo giustifica (stesso ragionamento di `ADR-21` § 3.3); costruirlo ora è ottimizzare un costo non misurato | Rinviato, stessa policy del primo rilascio |

---

## Conseguenze

- Quattro funzioni di migrazione nuove in `app/backend/src/blocks/migrations/`, ciascuna con la
  propria suite di test (§ "Conformità"), permanenti per `ADR-21` § 3.5.
- I quattro `BlockDefinition` (`heading.block.ts`, `rich-text.block.ts`, `image.block.ts`,
  `button.block.ts`) passano a `v: 2`, con le prop del § "Decisione" punto 2 rimosse dallo schema
  corrente e sostituite dalle nuove (`color`, `typography`, `margin`, `hideOn`, `link` per `button`).
  `migrations: []` diventa `migrations: [migrateXV1ToV2]`.
- Ogni `BlockDefinition` aggiornato dichiara `stateful: true` solo dove un requisito concreto lo
  richiede: `color` su `button`/`heading`/`richText` (Hover è un caso reale su testo e pulsanti),
  non obbligatoriamente su tutti — la scelta puntuale per blocco è demandata all'implementazione di
  R1 T1, questa ADR fissa solo che la migrazione non popola mai un ramo `hover` (nessun dato v1 da
  cui derivarlo).
- `toCss()` (`SPEC-PROPKIND-V2-DETAILS.md` § 10) diventa l'unico renderer per questi quattro tipi:
  il codice di rendering che oggi legge le prop scalari v1 va aggiornato in coppia con il bump di
  `v`, altrimenti un nodo migrato in memoria non produce più CSS (stesso rischio già segnalato da
  `ADR-29` § "Conseguenza" per un renderer disallineato dal validatore).
- Un rollback del backend dopo il deploy di questo bump segue la policy generale di `ADR-21` § 1:
  richiede il rollback dei contenuti (ripristino DB o ripubblicazione pre-incremento), non un
  automatismo di declassamento.
- Nessuna modifica allo schema PostgreSQL: la migrazione vive nel `jsonb` esistente.

## Conformità

- Per ciascuno dei quattro tipi: test che salva un albero `v: 1` con ogni prop del § "Decisione"
  punto 2 popolata (incluse le forme responsive a 3 breakpoint) e verifica che, letta, produca
  esattamente la forma v2 attesa, incluso `styleFontSizeCustom`/`styleTextColorCustom` con priorità
  sul token enum corrispondente.
- Test dedicato "margini a unità miste": quattro lati con `unit` diversi produce `unit:'px'` più
  `warning`, mai un `500` o una perdita silenziosa dei lati convertiti.
- Test di idempotenza: un nodo già `v: 2` passato di nuovo alla funzione di migrazione (percorso mai
  invocato in produzione, ma verificato per difesa) non altera il valore — non applicabile per
  costruzione (la migrazione si applica solo a `v < 2`), verificato comunque a livello di pipeline.
- Test "nessuna prop v1 sopravvive": un nodo migrato non contiene più alcuna delle chiavi elencate
  al punto 2 della Decisione, verificato sull'output JSON del nodo migrato.
- Test di non regressione sul rendering: un contenuto v1 esistente (fixture del DB demo) migrato e
  renderizzato con `toCss()` produce un CSS visivamente equivalente (stesso colore, stessa
  dimensione carattere, stesso margine) al CSS v1 precedente, verificato con snapshot Playwright a
  schermo intero su almeno una pagina per tipo.

---

## Decisione umana

**Esito**: [ ] Approvato così com'è · [ ] Approvato con modifiche (vedi note) · [ ] Rifiutato ·
[ ] Rinviato

**Approvato da**: _______________ · **Data**: _______________

**Note**:
