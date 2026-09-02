# ADR-47 — Estensione proprietà di stile su Section, Heading, FormSubmit (allineamento, overlay media, colori)

## Status
[ ] In discussione · [x] Approvato · [ ] Rifiutato · [ ] Superseded da ADR-XXX

## Data approvazione
2026-09-02 — approvato da: marketing@antelmagroup.net

## RFC di riferimento
`docs/ai/rfc/RFC-F04d-estensioni-blocchi-alta-fedelta.md`

## Contesto
Le landing ad alta fedeltà (`/contatti-antelma`) richiedono allineamento testo su `heading`,
sfondo media con overlay su `section`, e colori personalizzati sul pulsante `formSubmit`. Tre
delle proprietà usano kind già chiusi da ADR-21 (`mediaRef`, `number`, `enum`); due
(`styleOverlayColor`, `styleBackgroundColor`/`styleTextColor`) usano `color`.

**Correzione editoriale (2026-09-02, autorizzata dall'approvante in sede di implementazione)**:
al momento della stesura di questa ADR non era noto che il kind `color` fosse già stato introdotto
da ADR-33 §3/ADR-38, con validator condiviso a pattern `^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$` (3 o 6
cifre), già in uso da altre prop `color` in produzione (`border.color`, `shadow.color`, ecc.). Le
proprietà di questa ADR **riusano quel kind esistente**, non ne introducono uno nuovo — il
riferimento sotto a "nessuna altra forma" va letto come vincolo sul formato esadecimale (niente
`rgb()`, nomi CSS, `url()`, keyword), non come restrizione a sole 6 cifre. Un vincolo stretto a 6
cifre per queste tre prop specifiche, se mai necessario, richiederebbe una nuova ADR.

## Decisione
Si introduce il kind `color` nel registro di sanitizzazione (estensione dell'insieme chiuso di
ADR-21 §4, non sua riscrittura): valore vincolato a `^#[0-9a-fA-F]{6}$`, nessuna altra forma
(no `rgb()`, no nomi CSS, no keyword `inherit`/`currentColor`), validato dal validator (non da
`sanitize-html`, non è markup) e mai concatenato in stringhe HTML/CSS — applicato solo come
proprietà di un oggetto `style` React (`element.style.property` / JSX `style={{...}}`), che
rifiuta staticamente valori non stringa e non attraversa mai un parser HTML.

Proprietà aggiunte, tutte opzionali (assenza = comportamento attuale invariato, nessun bump di
`v`):

| Blocco | Prop | `kind` | Vincolo |
|---|---|---|---|
| `section` | `styleBackgroundImageRef` | `mediaRef` | forma `guid`, risoluzione via Media Engine pubblico |
| `section` | `styleOverlayColor` | `color` | `^#[0-9a-fA-F]{6}$` |
| `section` | `styleOverlayOpacity` | `number` | `0 ≤ x ≤ 1` |
| `heading` | `styleTextAlign` | `enum` | `left \| center \| right \| justify` |
| `formSubmit` | `styleBackgroundColor` | `color` | `^#[0-9a-fA-F]{6}$` |
| `formSubmit` | `styleTextColor` | `color` | `^#[0-9a-fA-F]{6}$` |

## Alternative valutate
| Opzione | Pro | Contro | Motivo scarto |
|---|---|---|---|
| Riusare `plainText` per i colori | zero nuovo kind | nessun vincolo di formato | apre a qualunque stringa in `style=`, injection CSS |
| Campo `styleCss` libero | massima flessibilità editor | CSS opaco non validato | viola modello di contenuto regola 2 |
| `color` come `enum` a palette fissa | superficie minima | non copre `#d90000` arbitrario del brief | fuori requisito, restrizione ulteriore rimandata |

## Conseguenze
- Il registro dei kind di sanitizzazione (ADR-21 §4) guadagna una sesta voce (`color`); ADR-21
  resta testo storico non modificato, questa ADR la estende senza sovrascriverla.
- Ogni futura prop colore su qualunque blocco riusa `kind: color` senza nuova firma; un formato
  colore diverso (`rgba()`, palette a token) richiede una nuova ADR.
- Il vincolo "mai concatenare in stringa HTML/CSS, solo `style` inline React" è permanente e si
  verifica sul renderer pubblico (`app/public-site`) allo stesso modo in cui ADR-22 verifica
  l'escaping di `plainText`: gate di CI, non solo convenzione.
- Nessun incremento di `v` per i tre blocchi: le proprietà sono opzionali e additive. Se in
  futuro una di esse diventa obbligatoria, si applica ADR-21 §1 (deploy a senso unico, rollback
  backend richiede rollback contenuti) e va dichiarato in una nuova ADR, non assunto in codice.

## Conformità
- Descrittori `section.block.ts`, `heading.block.ts`, `form-submit.block.ts` dichiarano le nuove
  prop con `kind` esatto da questa tabella; validator del kind `color` regex-based, 400 con path
  colpevole su mismatch (coerente con la pipeline ADR-21 §3).
- Test dominio: valore colore fuori formato → 400 sull'intero albero (mai salvataggio parziale,
  come da regola generale ADR-21); valore con tentativo di injection (`"red;}</style>"`,
  `"url(javascript:...)"`) → respinto dal regex, mai persistito.
- Renderer pubblico: nessuna concatenazione di stringa che includa `styleOverlayColor` /
  `styleBackgroundColor` / `styleTextColor` in HTML letterale — solo oggetti `style` React /
  attributo `style` con valori assegnati per proprietà, mai per interpolazione di stringa.
