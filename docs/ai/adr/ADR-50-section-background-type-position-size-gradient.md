# ADR-50 — Section: `styleBackgroundType` (color/image/gradient), posizione e dimensione sfondo

## Status
[ ] In discussione · [x] **Approvata** · [ ] Rifiutata · [ ] Superseded da ADR-XXX

## Data approvazione
2026-09-03 — approvata da: marketing@antelmagroup.net (autorizzazione diretta in sede di task, stesso pattern di ADR-38/47)

---

## Decisione

Cinque prop opzionali aggiunte a `section`, tutte additive con `default` dichiarato → **nessun
bump di `v`**, stesso ragionamento di ADR-33 §5/ADR-38 §8/ADR-47:

| Prop | `kind` | Vincolo | Default |
|---|---|---|---|
| `styleBackgroundType` | `enum` | `color \| image \| gradient` | `color` |
| `styleBackgroundPosition` | `enum` | 9 preset (`top left`…`bottom right`, griglia 3×3) | `center center` |
| `styleBackgroundSize` | `enum` | `cover \| contain \| auto` | `cover` |
| `styleGradientStart` | `color` (riuso ADR-33 §3/ADR-38/ADR-47, nessun kind nuovo) | `^#[0-9a-fA-F]{6}$` | assente |
| `styleGradientEnd` | `color` | `^#[0-9a-fA-F]{6}$` | assente |

`styleBackgroundType` è **presentazione, non validazione**: come `maxWidth` sotto
`contentWidth = full-width` (ADR-33 §1), tutte le prop di sfondo restano dichiarate e validate
indipendentemente da quale `styleBackgroundType` è attivo — il renderer sceglie quale onorare, il
registro non introduce props condizionali. `styleBackgroundColor` (esistente),
`styleBackgroundImageRef`/`styleOverlayColor`/`styleOverlayOpacity` (esistenti, ADR-47) restano
invariate e si riusano così come sono per i tipi `color`/`image`; `image` guadagna posizione e
dimensione configurabili al posto dei valori fissi (`center`/`cover`) attuali del renderer.

`paddingTop`/`paddingBottom`/`contentWidth` (`full|wide|boxed`) richiesti dal brief **non**
diventano nuove prop: duplicherebbero `stylePaddingTop`/`stylePaddingBottom` (ADR-33, scala
0–96px già granulare) e `contentWidth` (`boxed|full-width`, già esistente) sullo stesso nodo con
semantica diversa — due scale per lo stesso concetto sullo stesso blocco possono contraddirsi.
Si riusano le prop esistenti, già cablate in renderer e inspector.

## Alternative scartate

- **Nuovo `kind: 'gradient'` oggetto** (`{start, end, angle}`) — scartato: due prop `color`
  riusate coprono il caso a due tinte del brief senza nuova infrastruttura di validator/
  sanitizer (il costo che ADR-38 ha pagato per `border`/`shadow`); nessun controllo d'angolo è
  richiesto dal brief.
- **`styleBackgroundPosition` come coppia di prop x/y continue** — scartato: 9 preset coprono il
  caso d'uso (stesso terreno di `object-position`); un asse continuo richiederebbe `unitValue`
  (ADR-38) per un controllo che il brief non chiede.
- **Nuove prop `paddingTop`/`paddingBottom`/`contentWidth` come da brief letterale** — scartate:
  duplicano prop esistenti con scala/valori diversi sullo stesso blocco, vedi sopra.

## Conseguenza

`section.block.ts` passa da 3 a 6 usi del `kind: 'color'` (nessuna voce nuova nel registro dei
`kind`, ADR-21 §4 invariato). `Section.tsx` guadagna la logica di scelta sorgente sfondo
(`styleBackgroundType`) mantenendo il comportamento attuale invariato per ogni nodo pre-esistente
(prop assente → default `color`, stesso risultato di oggi). `PropertyInspector` riceve i tre
nuovi campi `enum`/due `color` tramite `PropField` generico (nessun nuovo `case` nello switch);
la sola logica aggiunta è la visibilità condizionale (mostra `bgImage`/posizione/dimensione solo
per `type=image`, gli stop colore solo per `type=gradient`) — presentazione, stesso pattern di
ADR-33 §1, non validazione. `blocks:export` + `blocks:types` da rieseguire (gate `blocks-sync`).
Nessuna migrazione, nessuna invalidazione cache pubblica (ADR-23) oltre quella ordinaria di
pubblicazione.
