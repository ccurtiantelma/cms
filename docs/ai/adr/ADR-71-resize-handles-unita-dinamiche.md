# ADR-71 — Maniglie di resize a valore dinamico (px/%), estensione del `kind: 'unitValue'`

## Status
[ ] In discussione · [x] **Approvata** · [ ] Rifiutata · [ ] Superseded da ADR-XXX

## Data approvazione
2026-09-14 — approvato da: marketing@antelmagroup.net

> **Nota (2026-09-16)**: `ADR-73-rimozione-maniglie-resize-widget-foglia.md` supera
> parzialmente il punto 3 di questa ADR — la maniglia trascinabile sul canvas non si monta più
> per `heading`/`richText`/`image`/`button` (nessuna modifica allo schema delle props, vedi
> ADR-73 per i dettagli). Resta invariata per `container`.

## RFC di riferimento
`docs/ai/rfc/RFC-F04e-super-elementor.md` — Decisione 4 (Overlays & Controls), esito firmato
nella sezione "Decisione umana".

---

## Contesto

RFC-F04e ha rilevato che l'unica maniglia di ridimensionamento oggi esistente
(`container.styleFlexBasis`) usa `kind: 'unitValue'` con range `0-100%`. La richiesta di
"maniglie di resize a valore libero" letta alla lettera (nessun vincolo di intervallo)
riaprirebbe una porta che **ADR-38 § 2 ha esplicitamente chiuso**: `unitValue` richiede
`min`/`max` e una lista `units` dichiarati **per prop**, mai un valore davvero libero —
l'alternativa "valore/unit davvero liberi, senza min/max" è registrata in ADR-38 §
"Alternative scartate" come scartata perché avrebbe richiesto un supersede esplicito di
`ADR-29-proprieta-di-stile-per-breakpoint.md` § 1 ("token, mai una misura"), mai aperto.

Questa ADR **non riapre quel supersede**. "Valore libero" nella firma umana di RFC-F04e si
legge come: libertà dal token discreto di un `enum` chiuso (es. `sm`/`md`/`lg`), non libertà
dal range numerico — che resta una garanzia di integrità dello schema, non un dettaglio di UI.

## Decisione

1. **Nessun `kind` nuovo.** Le maniglie di resize scrivono su props dichiarate con
   `kind: 'unitValue'`, l'infrastruttura già approvata da ADR-38 § 2
   (`{ value: number; unit: LengthUnit }`). Questa ADR **estende l'uso** di quel `kind` a nuove
   props di dimensionamento oltre `container.styleFlexBasis` — non introduce una tredicesima
   forma di validazione.

2. **`min`/`max` e `units` restano obbligatori e dichiarati per prop**, invariato rispetto ad
   ADR-38 § 2. Per le props pilotate da una maniglia di resize, la lista `units` ammessa si
   restringe a `['px', '%']` (sottoinsieme di `LengthUnit`, nessuna estensione dell'enum
   `LengthUnit` stesso): sono le due unità che una maniglia trascinabile può rappresentare in
   modo diretto (pixel dello schermo, percentuale del contenitore). `em`/`rem`/`vw`/`vh` restano
   disponibili dove già lo sono (es. via input numerico nell'ispettore), ma non sono pilotabili
   da una maniglia trascinata col mouse in questo round.

3. **Le props candidate a questo round** sono le dimensioni dichiarate come necessarie
   dall'RFC per parità con gli overlay esistenti: `styleWidth`/`styleHeight` (nuove, su
   `container` e `image`) e `styleMarginTop`/`styleMarginBottom`/`styleMarginLeft`/
   `styleMarginRight` (nuove, su tutti i tipi che già hanno `styleSpaceBefore/After`). Ogni
   prop dichiara il proprio `min`/`max` (es. `styleWidth`: `min: 0, max: 4000` in `px`, `min: 0,
   max: 100` in `%`, secondo l'unità attiva) — stesso principio di ADR-38 § 2, applicato a props
   nuove, non un'apertura del range stesso.

4. **`responsive: true` non si applica a `unitValue`**, invariato rispetto al vincolo tecnico
   già dichiarato in ADR-39 § 3: `EnumPropSpec` è l'unico `kind` con `responsive?: boolean`
   (ADR-29 § 3), `BlockTreeValidatorService.validateResponsiveEnumValue` è scritto contro la
   forma dell'`enum`. Le props di questa ADR restano **scalari, senza variante per
   breakpoint** in questo round — coerente con ADR-39 § 3 che dichiara questa la stessa
   limitazione già accettata per `container.gap`. Un valore responsive per `unitValue` resta
   materia di un'ADR futura dedicata (nuova capacità di validazione), non di questa.

5. **Meccanica della maniglia: linguaggio visivo dell'editor, non dello schema.** La maniglia
   trascinabile calcola un delta in pixel dal movimento del puntatore, lo converte nell'unità
   attiva della prop (`px` diretto, `%` relativo al `getBoundingClientRect()` del contenitore
   padre), e scrive il valore tramite l'azione di update prop già esistente
   (`updatePropAction`, invariata) — stessa regola di ADR-28 § 2: nessuna azione nuova nello
   store per un meccanismo di input aggiuntivo. Lo stato del trascinamento della maniglia (delta
   corrente, non ancora commit) vive fuori dallo store Zustand durante il drag, stesso vincolo
   di ADR-28 § 3 per lo stato di drag-and-drop — si scrive nello store solo al rilascio.

6. **Sanitizzazione**: nessuna riga nuova in `BlockPropSanitizerService`. `unitValue` è già
   validato per forma/intervallo dal validator (ADR-38 § 7); le props nuove di questa ADR
   passano dallo stesso ramo, non da `sanitize-html`.

7. **`v` invariato per i tipi esistenti** che guadagnano le nuove props opzionali (stesso
   ragionamento di ADR-38 § 8 / ADR-29 § 5): nessun default obbligatorio, nessuna migrazione.

## Alternative valutate

| Opzione | Pro | Contro | Motivo scarto |
|---|---|---|---|
| `unitValue` senza `min`/`max` (valore davvero libero) | Massima flessibilità, più vicino a un editor CSS | Riapre il supersede di ADR-29 § 1 mai aperto; nessun vincolo impedirebbe valori assurdi (`margin-top: 9999px`) | Respinta esplicitamente da ADR-38 § "Alternative scartate", non riaperta da questa ADR |
| Nuovo `kind: 'freeValue'` dedicato al resize | Semanticamente distinto da `unitValue` | Aggiunge un quattordicesimo `kind` per una forma già coperta da `unitValue`; costo sul contratto di sanitizzazione (ADR-21 § 4) senza beneficio | `unitValue` già copre la forma `{value, unit}`; un `kind` gemello sarebbe duplicazione |
| `responsive: true` su `unitValue` fin da subito | Coerenza con le altre props di stile responsive | Richiede riscrivere il validatore per una forma oggetto (ADR-39 § 3 lo dichiara già "capacità che non esiste oggi") | Fuori scope di questa firma, non richiesto dalla Decisione 4 dell'RFC |
| Unità aggiuntive (`em`/`rem`/`vw`/`vh`) pilotabili da maniglia | Parità completa con l'input numerico esistente | Una maniglia trascinata a schermo non ha un modo diretto e non ambiguo di rappresentare `em`/`vw` durante il drag | Limitata a `px`/`%`, le due unità con mappatura diretta al gesto di trascinamento |

## Conseguenze

**Positive**
- Nessuna estensione dell'insieme chiuso di `PropKind` (resta 13, come dopo ADR-38).
- Riuso totale dell'infrastruttura di validazione, sanitizzazione e azione di update già
  esistenti — zero superficie di rischio nuova sul contratto di sicurezza (ADR-21 § 4).
- Le maniglie di resize sono un componente di editor, non uno schema nuovo: portabili a
  qualunque prop `unitValue` futura senza ADR aggiuntiva, purché resti dentro `min`/`max`
  dichiarati.

**Negative / costi**
- Nuovo componente Mantine/React per la maniglia trascinabile (fuori scope backend, materia di
  spec/plan Frontend Developer come già per ADR-38 § "Conseguenza" e ADR-39 § "Conseguenza").
- Ogni prop nuova (`styleWidth`, `styleHeight`, margini per lato) richiede la propria voce
  `meta.props` (ADR-30 § 4, test di invariante) — costo di registrazione, non di schema.
- Rigenerazione obbligatoria `blocks:export` + `blocks:types` (gate CI `blocks-sync`), come per
  ogni prop nuova sui tipi esistenti.

## Conformità

1. **Nessun `kind` nuovo**: `prop-spec.types.ts` resta a 13 `kind` dopo questa ADR.
2. **`min`/`max` e `units` dichiarati su ogni prop nuova**: un test di schema deve rifiutare una
   definizione `unitValue` priva di uno dei due campi (stesso principio di ADR-38 § 2).
3. **Units limitate a `['px', '%']`** sulle props pilotate da maniglia — verificabile per
   ispezione delle definizioni in `app/backend/src/blocks/types/*.block.ts`.
4. **Nessuna prop di questa ADR è `responsive: true`**: `grep` delle nuove definizioni non deve
   mostrare quel campo.
5. **`meta.props` popolato per ognuna** delle nuove props (ADR-30 § 4, test di invariante del
   registro resta verde).
