# ADR-75 — Modificatore d'envelope `stateful`: nidificazione vincolata stato → breakpoint → valore

## Status
[x] **In discussione** · [ ] Approvato · [ ] Rifiutato · [ ] Superseded da ADR-XXX

## Data approvazione
_In attesa di firma umana — vedi "Decisione umana" in fondo a questo documento._

## RFC di riferimento
Nessuna RFC dedicata (round R0, vedi ADR-74 § "RFC di riferimento" per la motivazione).
Riferimento sostanziale: `docs/SPEC-propkind-v2.md` § 2 "Modificatori di envelope".

## Numerazione
Vedi ADR-74 § "Numerazione": questo round occupa ADR-74–ADR-80 (non 73–79 come nel piano
originale, per collisione con `ADR-73-rimozione-maniglie-resize-widget-foglia.md`).

## ADR di riferimento (non superate, non modificate)
`ADR-29-proprieta-di-stile-per-breakpoint.md` — introduce il modificatore `responsive` su
`EnumPropSpec` e la cascata `default → tablet → mobile`. Questa ADR **non la supera**: la estende
con un secondo modificatore ortogonale, applicabile a più `kind` di quanto ADR-29 previi.

---

## Contesto

`ELEMENTOR_PRO_GAP_ANALYSIS_v2.md` § 1.1 apre con il gap più votato P0: "nessuna prop ha stato" —
Elementor Pro applica Normal/Hover (e, per alcuni controlli, Focus/Active) a colore, sfondo,
bordo, ombra e trasformazione, con una transizione temporizzata fra i due. Il registro attuale
(`prop-spec.types.ts`) non ha alcuna nozione di stato: ogni valore è statico per l'intera vita
della pagina pubblicata.

`SPEC-propkind-v2.md` § 2 propone `stateful?: boolean` su `BasePropSpec`, simmetrico al
`responsive?: boolean` di ADR-29, con un vincolo che ADR-29 non aveva dovuto affrontare: **due
modificatori indipendenti sullo stesso valore devono comporsi in un ordine deterministico**, non
in due ordini equivalenti. `{ hover: { tablet: X } }` e `{ tablet: { hover: X } }` sono
sintatticamente diversi ma semanticamente equivalenti se non si fissa un ordine — un validator che
accettasse entrambi raddoppierebbe i casi da testare per ogni combinazione (kind × stato ×
breakpoint) senza alcun beneficio, e un renderer che assumesse l'ordine sbagliato produrrebbe CSS
silenziosamente non applicato (stesso rischio già descritto in ADR-29 § "Conseguenza" per la
forma responsive da sola, qui aggravato dalla seconda dimensione).

La domanda che questa ADR chiude prima di R1: **quale dei due modificatori è il livello esterno
dell'envelope?**

---

## Decisione

1. **Ordine di nidificazione fisso e chiuso: stato → breakpoint → valore.** Un valore `stateful`
   (con o senza `responsive`) ha sempre questa forma:
   ```json
   {
     "normal": { "default": <valore>, "tablet"?: <valore>, "mobile"?: <valore> },
     "hover"?: { "default": <valore>, "tablet"?: <valore>, "mobile"?: <valore> },
     "focus"?: { ... },
     "active"?: { ... }
   }
   ```
   `normal` è **sempre obbligatoria** quando `stateful: true` (simmetrica a `default` obbligatoria
   dentro ogni ramo, ADR-29 § 2). Se la prop non è anche `responsive`, ogni ramo di stato è il
   valore nudo del `kind`, non un oggetto `{default,...}` — i due modificatori restano
   indipendenti nella propria dimensione, si compongono solo quando **entrambi** sono dichiarati
   sulla stessa `PropSpec`.

2. **Perché stato fuori e breakpoint dentro, e non il contrario.** Tre motivi, in ordine di peso:
   - **Cardinalità e stabilità dell'insieme.** Gli stati ammessi sono un elenco chiuso di 4 valori
     fissi nel dominio CSS (`normal|hover|focus|active`) che non cambia mai per impostazione di
     sito. I breakpoint (ADR-76) sono invece **configurabili per sito**: un breakpoint disattivato
     o rinominato deve poter "sparire" da ogni valore esistente senza toccare la dimensione stato.
     Mettere il breakpoint fuori renderebbe ogni operazione di manutenzione sui breakpoint
     un'operazione su 4 sotto-alberi diversi per ogni prop `stateful`, invece che su 1.
   - **Costo dell'editor.** Il pannello Stile mostra uno *state switcher* (Normal/Hover) in testa
     alla sezione (PLAN R1 T6) e, dentro lo stato attivo, i controlli responsive esistenti
     (icona breakpoint, già presenti dall'introduzione di ADR-29). Con stato fuori, cambiare stato
     è sostituire l'intero sotto-albero che l'inspector mostra; con breakpoint fuori, cambiare
     stato richiederebbe leggere/scrivere un campo dentro ciascuno dei fino a 7 rami di breakpoint
     (ADR-76) per lo stesso controllo — quattro volte il lavoro per un'interazione più frequente
     (uno switch di stato per sessione di editing tipica, contro un solo breakpoint attivo alla
     volta nel canvas).
   - **Coerenza con l'ordine già fissato per `responsive` da solo.** ADR-29 § 2 ha già stabilito
     che `default` è l'unica chiave obbligatoria e le altre sono opzionali con cascata verso il
     basso; questa ADR non tocca quella cascata (rimane `mobile → tablet → default`, invariata,
     dentro ciascun ramo di stato), la applica identica dentro `normal` e dentro ogni stato
     opzionale presente.

3. **Stati ammessi: elenco chiuso a 4, `normal|hover|focus|active`.** Nessun quinto stato
   (`visited`, `disabled`, …) in questa firma: Elementor Pro stesso limita gli editor di stato a
   Normal/Hover per la maggioranza dei controlli e aggiunge Focus/Active solo su prop testuali di
   form — coerente con `SPEC-propkind-v2.md` § 2, che li dichiara "chiuso" senza motivarne
   l'estensione. Un quinto stato è una firma futura, non un'estensione silenziosa dell'enum.

4. **`transitionMs` è una prop separata per blocco, non un campo dentro l'envelope stateful.**
   Ogni transizione fra stati (es. 200ms fra Normal e Hover del colore di sfondo di un bottone) è
   un'unica prop `kind: 'number'`, intervallo `0–2000`, dichiarata una volta per blocco (o nel
   mixin "Avanzato", ADR-79/`SPEC-propkind-v2.md` § 4.2), non replicata per ogni prop `stateful`
   del blocco. Motivo: Elementor applica una sola transizione coerente a tutte le proprietà che
   cambiano insieme sullo stesso hover (bordo + sfondo + testo), mai transizioni indipendenti per
   campo — replicarla per prop introdurrebbe una libertà (transizioni sfalsate) che nessun
   requisito del gap analysis chiede e che complicherebbe il `toCss()` unico di
   `SPEC-propkind-v2.md` § 7 con un secondo asse di combinazione.

5. **Il validator tratta `stateful` come un ramo aggiuntivo dello switch esistente, non un nuovo
   `kind`.** Analogo al ramo `responsive` di `case 'enum'` in `block-tree-validator.service.ts`
   (righe 300-309, 391-433): la funzione di validazione del `kind` sottostante resta la stessa,
   invocata una volta per combinazione stato×breakpoint presente. Un valore `stateful` malformato
   alla radice (non oggetto, `normal` mancante, chiave fuori dai 4 stati) produce
   `reason: 'type'` sul path della prop; un valore non valido dentro un ramo interno produce
   l'errore proprio del `kind` (es. `reason: 'format'` per `colorRef`) sul path completo
   (`…props.styleBackground.hover.tablet`). Nessun `reason` nuovo nell'insieme chiuso di
   `BLOCK_PROP_INVALID` (stesso principio di ADR-29 § "Decisione" punto 4): il `path` porta
   l'informazione, non un nuovo codice.

6. **`stateful` e `responsive` sono indipendenti e combinabili su qualunque `kind` che li
   dichiari**, non solo `enum`: `colorRef`, `typography`, `background`, `border`, `shadow`,
   `transform`, `filter` dichiarano `stateful: true` dove Elementor lo prevede
   (`SPEC-propkind-v2.md` § 3.7/3.9), `spacing`/`radius`/`gradient` non lo dichiarano mai (uno
   stato "hover" del padding non ha senso in Elementor né altrove). La combinazione è una proprietà
   del descrittore (`BlockDefinition`), non del `kind`: lo stesso `kind: 'colorRef'` è `stateful`
   sul colore di sfondo del bottone e non lo è sul colore di un testo semplice, a discrezione del
   blocco che lo dichiara.

---

## Alternative valutate

| Opzione | Pro | Contro | Motivo scarto |
|---|---|---|---|
| Breakpoint fuori, stato dentro (`{default:{normal,hover}, tablet:{...}}`) | Simmetrico a "il breakpoint è il contesto, lo stato è il dettaglio" | Un cambio di stato nell'editor tocca N rami di breakpoint invece di uno; i breakpoint configurabili di ADR-76 diventerebbero la chiave meno stabile a essere quella più esterna | Costo di manutenzione e di editor più alto, nessun beneficio compensativo |
| Prop separate `*Hover` (`styleBackgroundHover`, `styleBorderHover`, …) | Nessuna nidificazione, validator invariato | Raddoppia (o quadruplica con Focus/Active) il numero di prop dichiarate per blocco, esplode il registro — esattamente l'alternativa che `PLAN-parita-elementor-pro.md` § R0 scarta esplicitamente per ADR-75 | Duplicazione strutturale, nessuna scalabilità verso Focus/Active |
| Un `kind` nuovo per ogni combinazione stateful (es. `colorRefStateful`) | Nessun modificatore, un solo campo `kind` da leggere | Moltiplica i `kind` per ogni combinazione stato-compatibile, viola il principio di ADR-29 § 3 ("il `kind` resta lo stesso, cambia un booleano") che aveva già scartato la stessa idea per `responsive` | Ripete un errore già corretto da ADR-29 |
| `transitionMs` per singola prop `stateful` | Massima libertà di transizioni indipendenti | Nessun requisito del gap analysis la chiede; complica `toCss()` unico con un asse di combinazione in più | Over-engineering rispetto alla parità richiesta |
| Quinto stato immediato (`visited`, `disabled`) | Copertura teorica più ampia | Nessun blocco del round R1-R6 lo richiede; amplia l'enum chiuso senza un consumer | Rinviato a firma futura se e quando servirà |

---

## Conseguenze

- `BasePropSpec` guadagna `stateful?: boolean`, accanto a `responsive?: boolean` già esistente
  (ADR-29): nessuna rottura dei descrittori esistenti, che restano privi del campo e quindi non
  stateful per default.
- Ogni `kind` che dichiara `stateful: true` in almeno un blocco deve avere una funzione di
  validazione **pura rispetto al livello di nidificazione**: la stessa funzione già scritta per il
  valore scalare viene invocata su ogni combinazione stato×breakpoint presente, mai riscritta per
  la forma annidata (stesso principio di riuso di ADR-29 § 4 per `isEnumTokenAllowed`).
- `toCss()` unico (`SPEC-propkind-v2.md` § 7) emette, per ogni combinazione stato×breakpoint
  presente nel valore, una dichiarazione sotto il selettore composito
  `[data-block="<id>"]<:stato> { @media <breakpoint> { ... } }` — l'ordine di emissione segue lo
  stesso ordine di nidificazione del dato (stato esterno, breakpoint interno), non un ordine
  scelto dal renderer.
- L'inspector (PLAN R1 T6) introduce lo *state switcher* come componente condiviso da ogni sezione
  Stile che dichiara almeno una prop `stateful`; il controllo responsive esistente (icona
  breakpoint) resta identico dentro ciascuno stato.
- Stesso rischio di ADR-29 § "Conseguenza" (perdita silenziosa di rami non riscritti da un
  inspector che sovrascrive l'intero oggetto invece di `{...valore, hover: nuovo}`), qui raddoppiato
  dalla dimensione in più: richiede un test dedicato analogo (salva un valore con tutti gli stati e
  tutti i breakpoint popolati, rilegge identico, verifica che il CSS prodotto contenga ogni
  combinazione).
- Nessuna modifica allo schema PostgreSQL: il modificatore vive nella forma del `jsonb` già
  esistente, non in colonne nuove.

## Conformità

- Ogni `kind` con almeno un uso `stateful: true` nel registro ha una suite di test che verifica: (a)
  valore scalare/legacy senza `stateful` continua a validare (nessuna rottura additiva); (b) valore
  con solo `normal` valida; (c) valore con `normal` + uno o più stati opzionali valida; (d) `normal`
  mancante produce `reason: 'type'`; (e) uno stato fuori dall'elenco chiuso produce `reason: 'type'`
  sul path della prop, non un nuovo `reason`.
- Test dedicato "nessuna perdita silenziosa" (vedi § Conseguenze) per almeno un `kind` combinato
  `stateful + responsive` (`background` su `container`, `SPEC-propkind-v2.md` § 4.1).
- `toCss()` ha test snapshot che copre almeno una combinazione a 4 stati × 3 breakpoint per
  verificare l'ordine di emissione dichiarato al punto 2.

---

## Decisione umana

**Esito**: [ ] Approvato così com'è · [ ] Approvato con modifiche (vedi note) · [ ] Rifiutato ·
[ ] Rinviato

**Approvato da**: _______________ · **Data**: _______________

**Note**:
