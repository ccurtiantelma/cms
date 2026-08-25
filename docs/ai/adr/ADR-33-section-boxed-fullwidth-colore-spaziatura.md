# ADR-33 — Section: contentWidth, colore di sfondo, spaziatura per lato; preset di struttura

## Status
[ ] In discussione · [x] **Approvata** · [ ] Rifiutata · [ ] Superseded da ADR-XXX

## Data approvazione
2026-08-24

---

## Decisione

1. **`contentWidth`** (`enum`, non responsive): `boxed | full-width`, default `boxed`. **`maxWidth`**
   (`enum`, non responsive): `sm md lg xl` → `960px 1140px 1320px 1600px` (token nel CSS, mai un
   numero nel contenuto — stesso vincolo di ADR-29 § 1), default `md` (1140px, coerente con la
   richiesta). `maxWidth` è ignorato dal renderer quando `contentWidth = full-width`; resta comunque
   dichiarato e validato — nessuna prop condizionalmente assente nello schema. L'ispettore nasconde
   il controllo `maxWidth` quando `contentWidth = full-width`: logica di presentazione, non di
   validazione, nessuna estensione di `BlockEditorPropMeta`.

2. **`columnRatio`** (`enum`, non responsive): `equal | 33-66 | 66-33`, default `equal`,
   significativo solo quando `columns = '2'` (ADR-31). Prop separata da `columns`, non un nuovo
   valore dentro `columns`: `columns` resta l'insieme chiuso `1 2 3 4` già approvato da ADR-31, una
   seconda prop cooperante evita di redefinirne la semantica per il contenuto già salvato.

3. **`styleBackgroundColor`**: **sesto `kind` messo in uso**, `color` — già presente e inerte
   nell'unione `PropKind` (`prop-spec.types.ts`), mai istanziato da nessun tipo di blocco finora.
   `ColorPropSpec { kind: 'color', required: false, default?: string }`, validato da un pattern
   **fisso e stretto**, non un campo `pattern` generico riusabile altrove: `^#([0-9a-fA-F]{3}|
   [0-9a-fA-F]{6})$`. Solo esadecimale — niente `rgb()`/`hsl()`/`url()`/parole chiave CSS: la
   superficie di validazione resta un letterale di colore, mai una forma che assomigli a CSS
   eseguibile. Nuovo `reason: 'format'` in `BLOCK_PROP_INVALID` per il valore che non rispetta il
   pattern. Non responsive in questo round (ambito ridotto rispetto a `styleBackground` di ADR-29,
   che resta il fondo a token ed è affiancato, non sostituito, da questo colore libero).

4. **Padding/margin per lato, quattro lati × due proprietà, `enum` non un nuovo `kind`**:
   `stylePaddingTop/Right/Bottom/Left`, `styleMarginTop/Right/Bottom/Left`. Ognuna `kind: 'enum'`,
   `responsive: true` (forma per breakpoint di ADR-29 § 2), valori da una scala chiusa di stringhe
   numeriche: `0 4 8 12 16 24 32 48 64 96` (px, token nel foglio CSS come ADR-29 § 1), default `0`.
   "Controlli numerici" nel senso della UI (uno slider/stepper Mantine con questi step, non un
   `<Select>`), non nel senso dello schema: il valore resta un token da un insieme chiuso, non un
   numero libero. Vedi Alternative scartate per il perché `NumberPropSpec` non è la scelta.

5. **Zero incremento di `v`, nessuna migrazione**, stesso ragionamento di ADR-29 § 5/ADR-31 § 4:
   tutte le prop nuove sono opzionali con `default` dichiarato, token del registro invariato,
   nessuna invalidazione della cache pubblica di ADR-23.

6. **CSS Grid/classi da token per tutto tranne `styleBackgroundColor`** (ADR-29 § 6, ADR-31 § 7):
   `contentWidth`/`maxWidth`/`columnRatio`/le otto prop di spaziatura restano classi generate,
   `style` mai inline. **`styleBackgroundColor` è l'eccezione esplicita**: un valore validato da
   pattern ma non enumerabile (è pur sempre "un colore a scelta", non un token da 6-10 valori) non
   si pre-compila in classi. Si applica con **una sola custom property CSS inline**,
   `style={{ '--section-bg': value }}`, consumata da una regola statica del foglio dei token
   (`background-color: var(--section-bg)`). Non è `style` libero: è un'unica variabile scoped che
   può contenere solo un valore già passato dal pattern del punto 3. Questa ADR non riapre la Regola
   6 in generale — qualunque altra prop `style`-like che volesse lo stesso trattamento richiede una
   propria firma.

7. **Modal "Seleziona la tua struttura"**: componente frontend puro nella palette (stesso principio
   di `WidgetPalette`, ADR-32 § 4), attivato dal pulsante "+" Aggiungi Sezione. Cinque preset (1
   colonna, 2/2 uguali, 3/3/3 uguali, 33/66, 66/33) come box tratteggiati con anteprima proporzionale
   — puro CSS, nessuna libreria nuova. La selezione chiama la `addBlockAction` già esistente con un
   nodo `section` pre-popolato (`columns` + `columnRatio` impostati dal preset): nessuna azione nuova
   nello store, stesso pattern di riuso già stabilito da ADR-32 § 4 per il drag & drop dalla palette.
   **Supera esplicitamente ADR-31 Decisione 6** ("Nessun selettore visivo a icone in questo round"):
   quel rinvio era condizionato all'assenza di dati per pilotarlo (`columns` da solo non basta per un
   box tratteggiato asimmetrico); `columnRatio` (punto 2) fornisce quel dato, quindi il rinvio è
   sciolto qui, non riaperto per discussione — ADR-31 resta valida per tutto il resto che dichiara.

8. **Metadati d'editor obbligatori** (ADR-30 § 4) per tutte le prop nuove: `tab: 'style'`,
   etichette in italiano, `order` in coda a quelle di ADR-29/31 (8 in su).

## Alternative scartate

- **Numero libero (`kind: 'number'`, senza vincoli) per padding/margin** — stesso motivo di ADR-29
  § "Valori numerici liberi per le spaziature": nessun vincolo di intervallo dichiarabile con lo
  schema attuale (`NumberPropSpec` non ha `min`/`max`, vedi commento in `prop-spec.types.ts`), e
  senza un insieme chiuso di valori un range continuo o si pre-compila in centinaia di classi
  inutili o costringe a `style` inline — riapre la Regola 6 in generale, non solo per un colore.
- **Estendere `NumberPropSpec` con `min`/`max` invece dell'`enum` a scala** — tecnicamente
  possibile ma richiede un `reason: 'range'` nuovo in `BLOCK_PROP_INVALID` e quindi una revisione di
  `SPEC-F02-blocchi.md` (lo dice lo stesso commento del tipo), per ottenere un risultato — spaziatura
  a step discreti — che una scala `enum` dà già senza toccare la spec di validazione.
- **`rgb()`/`hsl()`/colore CSS libero** — superficie di validazione che assomiglia a CSS eseguibile;
  il pattern esadecimale stretto del punto 3 è la versione più stretta che soddisfi comunque "colore
  a scelta con applicazione live".
- **Palette chiusa di swatch (`enum`) invece di un `kind: 'color'`** — più coerente con la filosofia
  a token del registro, ma non è ciò che il task chiede (un selettore colore libero con anteprima
  live); una palette di brand è lavoro di tema (F09), non di questa Sezione — stessa alternativa
  scartata già in ADR-29.
- **`columnRatio` come nuovo valore dentro `columns`** (es. `'2-33-66'`) — ridefinirebbe la semantica
  già approvata di `columns` per il contenuto già salvato con `columns: '2'`, candidato a un `v: 2`
  con migrazione che le altre otto prop di questa ADR evitano tutte.
- **Rimandare di nuovo il selettore visivo** — la ADR-31 lo aveva scartato per assenza di dati
  (nessuna ratio da mostrare); punto 2 di questa ADR risolve esattamente quel vincolo, rimandarlo
  ancora non avrebbe più motivazione tecnica, solo di sequenza.

## Conseguenza

Il foglio dei token cresce ancora: fino a 240 regole per le sole otto prop di spaziatura (10 valori
× 8 prop × fino a 3 breakpoint, ordine di grandezza comparabile ad ADR-29/31), più le combinazioni
di `contentWidth`/`maxWidth`/`columnRatio`. `styleBackgroundColor` è il **primo uso reale** del
`kind: 'color'` già dichiarato ma inerte in `PropKind`: `block-tree-validator.service.ts` (nuovo
ramo nello `switch` esaustivo + `reason: 'format'`), `block-prop-sanitizer.service.ts` (nuovo ramo:
validato da pattern, nessun passaggio da `sanitize-html`, stessa famiglia di `enum`/`url`) e
`generate-blocks-types.js` vanno tutti aggiornati — è il costo reale di questa firma, non solo una
voce di registro. La custom property CSS inline del punto 6 è un'eccezione stretta e dichiarata alla
Regola 6, non un precedente generale. Nessuna dipendenza npm nuova (Mantine espone già
`ColorPicker`/`ColorSwatch`/`Slider`). Dopo l'approvazione: `openapi:export` + `openapi:types` per il
contratto Pagine (invariato nella forma, ma la pipeline va comunque rieseguita per coerenza), e un
test di round-trip responsive sulle otto prop di spaziatura sul modello di ADR-29 T8.
