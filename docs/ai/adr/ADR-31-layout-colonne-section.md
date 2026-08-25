# ADR-31 — Layout Engine a colonne responsive per il blocco `Section`

## Status
[ ] In discussione · [x] **Approvata** · [ ] Rifiutata · [ ] Superseded da ADR-XXX

## Data approvazione
2026-08-23 — approvato da: marketing@antelmagroup.net

---

## Decisione

1. **Tre props di stile opzionali su `section`**, stesso registro delle quattro di ADR-29:
   `columns` (`1 2 3 4`, default `1`), `gap` (`none sm md lg`, default `none`), `alignItems`
   (`stretch flex-start center flex-end`, default `stretch`). Tab `style`, non `content`: sono
   scelte presentazionali sullo stesso registro di `stylePadding`/`styleBackground`, nessun
   figlio viene assegnato a una colonna specifica.

2. **Forma per breakpoint dalla nascita** (Opzione A di RFC-31), stessa struttura di ADR-29 § 2 —
   `{ default, tablet?, mobile? }`, cascata `mobile` → `tablet` → `default`. Il wrap a 1 colonna
   sotto 768px è il comportamento del default quando l'editor non sovrascrive `mobile`/`tablet`,
   **non una regola CSS incondizionata**: resta sovrascrivibile (es. 2 colonne anche su mobile).
   L'interfaccia di questo round scrive solo il controllo `default`.

3. **`kind: 'enum'`** su tutte e tre, coerente con ADR-21 § 4: nessun `NumberPropSpec` (nessun
   vincolo di intervallo dichiarabile con lo schema attuale).

4. **Zero incremento di `v`, nessuna migrazione**: props opzionali con `default` dichiarato,
   token del registro (`type:v:migrations.length`) invariato, nessuna invalidazione della cache
   pubblica di ADR-23.

5. **Metadati d'editor obbligatori** in `meta.props` (ADR-30 § 4): `order` 5–7 dopo le quattro
   props di ADR-29, etichette in italiano.

6. **Nessun selettore visivo a icone in questo round.** Le tre props si rendono con il
   `<Select>` Mantine già usato per ogni altra prop `enum` del registro — nessuna estensione di
   `BlockEditorPropMeta` oltre a quella di ADR-30.

7. **CSS Grid, classi generate da token, mai `style` inline** (ADR-29 § 6): `Section.tsx` passa
   da `flex` a `grid`, `grid-template-columns` deriva da `style-tokens.module.css` con lo stesso
   schema a tre parti (variabili, soglie di breakpoint esistenti, classe per combinazione
   prop/breakpoint/token). Nessun figlio riceve un indice di colonna: l'ordine nella griglia
   segue l'ordine dei figli nell'albero.

8. **Override esplicito della sequenza di RFC-F04c § Decisione 4.** Colonne, annidamento di
   `section`, navigator e schermo intero erano stati rinviati in blocco a un round F04d,
   subordinato alla firma di ADR-26 (ancora in discussione) e a un `RFC-F04d`/`PLAN-F04d`
   formale che non esiste. Questa ADR autorizza le sole colonne a procedere ora, disgiunte dal
   resto del pacchetto F04d — annidamento, navigator come superficie compiuta e schermo intero
   restano debito di governance non richiuso da questa firma.

## Alternative scartate

- **Props scalari ora, responsive dopo** — `v: 2` con migrazione su tutto il contenuto salvato
  per risparmiare oggi tre chiavi (stesso errore che ADR-29 § 5 documenta).
- **`kind: 'number'` per `columns`** — nessun vincolo di intervallo dichiarabile, accetterebbe
  valori fuori dall'insieme voluto.
- **Tab `content`** — scartata a favore di `style` per coerenza con ADR-29 (props di
  disposizione/spaziatura → stile).
- **Wrap a 768px come regola CSS incondizionata (Opzione B)** — riapre il problema che ADR-29
  § 5 ha chiuso: un futuro controllo per breakpoint su `columns` sarebbe un `v: 2` con
  migrazione.
- **Selettori visivi a icone in questo round** — richiede un secondo campo nuovo in
  `BlockEditorPropMeta` senza benefici funzionali sopra il `<Select>` già esistente.
- **Assegnazione esplicita di un figlio a una colonna** — trasforma `section` da contenitore a
  griglia con celle indirizzabili, fuori perimetro, riapre l'annidamento già rinviato a F04d.
- **Attendere la formalizzazione di RFC-F04d prima di procedere** — valutata e non scelta: il
  rischio di sequenza è stato accettato esplicitamente (Decisione 8) invece di bloccare le
  colonne su un pacchetto più ampio non ancora formalizzato.

## Conseguenza

Il renderer emette le classi di ogni breakpoint presente nel valore salvato, anche quando la UI
di questo round ne scrive uno solo (`default`): un renderer che emette solo `default` produce
perdita silenziosa di contenuto responsive già salvato, stesso rischio di ADR-29 Conseguenza —
richiede un test dedicato sul modello di ADR-29 T8. Il foglio dei token cresce di un blocco
comparabile a quello di ADR-29 (3 props × fino a 4 valori × fino a 3 breakpoint). Il debito di
governance della Decisione 8 resta aperto: annidamento di `section`, navigator come superficie
compiuta e schermo intero non hanno ancora un `RFC-F04d`/`PLAN-F04d` che ne dichiari perimetro —
va formalizzato prima che quel lavoro (già in corso, file non committati) venga esteso oltre le
sole colonne.
