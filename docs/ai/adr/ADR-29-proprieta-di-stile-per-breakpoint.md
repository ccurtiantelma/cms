# ADR-29 — Proprietà di stile dei blocchi, per breakpoint dalla nascita

## Status
[ ] In discussione · [x] **Approvata** · [ ] Rifiutata · [ ] Superseded da ADR-XXX

## Data approvazione
2026-08-20

---

## Decisione

1. **Sette props di stile opzionali, su scale di token chiuse, dichiarate nel registro.**
   `styleSpaceBefore` / `styleSpaceAfter` (`none xs sm md lg xl`, tutti e cinque i tipi);
   `stylePadding` (`none sm md lg`) e `styleBackground` (`none subtle accent inverse`), solo
   `section`; `styleTextColor` (`default muted accent inverse`), `styleFontSize`
   (`sm md lg xl`), `styleFontWeight` (`regular medium bold`), su `heading` `richText`
   `button`. Ogni valore è un **token**, mai una misura: il numero di pixel vive nel CSS, non
   nel contenuto. È anche l'unica difesa disponibile, perché `PropSpec` non ha un campo
   `pattern` con cui vincolare la forma di un valore libero — un colore in esadecimale non è
   validabile con lo schema attuale.

2. **La forma del valore è per breakpoint dal primo giorno**, anche se l'interfaccia di questo
   round scrive solo il controllo desktop:
   `"styleSpaceBefore": { "default": "md", "tablet": "sm", "mobile": "xs" }`.
   `default` è obbligatoria dentro l'oggetto, `tablet` e `mobile` sono opzionali. I tre nomi
   sono un elenco chiuso dichiarato una volta nel backend. Il primo si chiama `default` e non
   `desktop` perché è **il valore che vale ovunque non sia sovrascritto**: chiamarlo `desktop`
   inviterebbe un quarto nome `wide` che non avrebbe alcuna regola di cascata. La cascata è in
   una sola direzione — `mobile` assente ricade su `tablet`, `tablet` assente ricade su
   `default` — ed è implementata in un punto solo, le media query `max-width` del foglio dei
   token. **Le soglie in pixel stanno nel CSS**, mai nel contenuto e mai nel registro: il
   registro dichiara i nomi.

3. **Un modificatore `responsive?: boolean` su `EnumPropSpec`, non un `kind` nuovo.** Il
   `kind` resta `enum`, quindi il contratto di sanitizzazione di ADR-21 § 4 non cambia di una
   riga: un `enum` è validato per appartenenza a una lista e non passa da `sanitize-html`
   perché non è testo — e resta vero per ogni voce dell'oggetto. Un `kind` nuovo avrebbe
   richiesto una riga nuova in quel contratto, cioè la firma più costosa di questo repository.

4. **Nessun `reason` nuovo nell'insieme chiuso di `BLOCK_PROP_INVALID`, quindi nessuna
   revisione di `SPEC-F02-blocchi.md`**: è il `path` a portare l'informazione nuova. Valore
   non oggetto, `default` mancante, o chiave fuori dai tre nomi → `reason: 'type'` sul path
   della prop; token fuori dalla lista → `reason: 'enum'` sul path **della singola voce**
   (`…props.styleSpaceBefore.tablet`). Lo `switch` esaustivo del validatore resta esaustivo:
   il ramo `enum` si sdoppia **al proprio interno** fra scalare e per breakpoint, con la
   verifica del token in una funzione sola usata da entrambi i percorsi.

5. **Nessun incremento di `v`, nessuna migrazione.** Il validatore accetta una prop opzionale
   dichiarata e assente: tutto il contenuto già salvato resta valido così com'è, e il token
   del registro (hash di `type:v:migrations.length`) non cambia, quindi la cache pubblica di
   ADR-23 non richiede alcuna invalidazione. **È anche l'intero motivo per cui la forma va
   scelta bene ora**: la forma per breakpoint costa oggi una struttura dati di tre chiavi,
   mentre aggiungerla dopo su props scalari già salvate sarebbe per ADR-21 § 1 un `v: 2` con
   migrazione, cioè un deploy a senso unico in cui il rollback del backend esige il rollback
   dei contenuti. Le due cose non sono paragonabili.

6. **Classi CSS, mai `style` inline.** I token si dichiarano una volta come variabili CSS in
   `components/blocks/`, che l'alias `@blocks` porta identiche in admin e sul sito pubblico
   (ADR-22). Una variabile CSS è anche il solo innesto su cui il tema di F09 potrà agire senza
   riscrivere il contenuto già salvato.

7. **Scostamento consapevole da ADR-21 § 2, dichiarato qui e non in nota.** ADR-21 § 2 afferma
   che il registro non porta alcun contratto di rendering. Props di stile lette dal renderer
   sono un contratto di rendering **parziale** che entra nel registro dalla porta delle props.
   La forma scelta è la più difendibile — il registro dichiara un *vocabolario*, il CSS decide
   cosa significhi — ma resta uno scostamento, ed è ciò che questa firma autorizza.

## Alternative scartate

- **Token scalari ora, responsive dopo** — è la forma che cambia dopo la nascita: `v: 2` e
  migrazione su tutto il contenuto salvato per risparmiare oggi tre chiavi.
- **Responsive solo dove "serve davvero"** — due convenzioni nello stesso pannello, e la prima
  richiesta di uno sfondo diverso su mobile riapre esattamente quella migrazione.
- **Un `kind: 'responsiveEnum'`** — estende l'insieme chiuso dei `kind`, cioè il contratto di
  sanitizzazione, per ottenere ciò che un booleano su un `kind` esistente già dà.
- **Props separate per breakpoint** (`styleSpaceBeforeMobile`, …) — triplica le props
  dichiarate, rende la cascata implicita e non verificabile, e l'ispettore la eredita.
- **Una stringa CSS libera per blocco** — superficie di iniezione nell'attributo `style`, non
  vincolabile con lo schema attuale, e deriva di design senza ritorno.
- **Valori numerici liberi per le spaziature** — `NumberPropSpec` non ha vincoli di
  intervallo: niente impedirebbe `margin-top: 9999`.
- **Stile fuori dal blocco, in un foglio per Pagina** — il blocco smette di essere portabile e
  la regola 2 del modello di contenuto perde di significato.
- **Rimandare tutto al tema di F09** — il tema decide i default, non l'istanza: sono due
  livelli, e questa decisione costruisce quello che manca fra i due.

## Conseguenza

**Il renderer emette le classi di ogni breakpoint presente nel valore salvato, anche quando la
UI di questo round ne scrive uno solo.** È la conseguenza principale di questa decisione e il
suo rischio principale: un renderer che emette solo `default`, o un ispettore che sovrascrive
l'oggetto con uno scalare invece di scrivere `{ ...valore, default: nuovo }`, produce **perdita
silenziosa di contenuto già salvato** — un guasto peggiore di qualunque regola CSS
inutilizzata, perché non dà errore. Non è coperto dal fatto che il salvataggio non fallisca:
serve un **test dedicato (T8)** che salvi un valore con tutti e tre i breakpoint, lo rilegga
identico, e verifichi sull'HTML prodotto che le classi di tutti e tre ci siano; più il test
frontend che modifica il controllo desktop e asserisce che `tablet` e `mobile` restino intatti.

Il resto del conto, dichiarato in anticipo: il foglio dei token cresce di circa un centinaio di
regole — una classe per ogni combinazione (prop, breakpoint, token) — ed è il motivo per cui le
scale restano corte, perché ogni valore in più si moltiplica per tre. Il moltiplicatore ×3 è
anche il freno naturale contro lo scivolamento verso un editor di CSS: finché ogni valore è un
token di un `enum` chiuso, l'unico modo di allargare è una firma. Infine, questo round produce
**dati responsive corretti senza una superficie che li mostri**: l'anteprima responsive non
esiste e resta fuori (è scope di F04 uscito dal radar, segnalato nell'RFC § A.5). È accettabile
solo perché la superficie è additiva e i dati non lo sono — ma va tracciato, non lasciato al
radar.
