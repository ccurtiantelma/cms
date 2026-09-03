# ADR-51 — Form Field: `colSpan` per il layout a griglia 12 colonne del Form Builder

## Status
[ ] In discussione · [x] **Approvata** · [ ] Rifiutata · [ ] Superseded da ADR-XXX

## Data approvazione
2026-09-03 — approvata da: marketing@antelmagroup.net (autorizzazione diretta in sede di task, stesso pattern di ADR-38/47/50)

---

## Decisione

Una prop opzionale aggiunta a `form-field` (ADR-46), additiva con `default` dichiarato →
**nessun bump di `v`**, stesso ragionamento di ADR-33 §5/ADR-38 §8/ADR-47/ADR-50:

| Prop | `kind` | Vincolo | Default |
|---|---|---|---|
| `colSpan` | `enum`, `responsive: true` (riuso ADR-29 §2/§3, nessun `kind` nuovo) | `6 \| 12` | `{ default: '12' }` |

`FormBlock.tsx` cambia il contenitore `.fields` da `flex column` a `display: grid;
grid-template-columns: repeat(12, 1fr)`. `FormFieldBlock.tsx` applica a `.field` la classe
`colSpan_<breakpoint>_<valore>` risolta da `resolveResponsiveClassNames` (stesso helper già
usato da `Container.tsx`/`Section.tsx`) — `grid-column: span 6` o `span 12` — con fallback a
`span 12` quando la prop è assente (contenuto pre-esistente, comportamento identico a oggi: un
campo per riga). Nessun campo dichiara `tablet`/`mobile`: la cascata di ADR-29 §2 fa già
ricadere ogni breakpoint non sovrascritto sul valore superiore, quindi due campi affiancati a
`colSpan: 6` restano affiancati anche sotto ai 768px finché l'autore non sceglie esplicitamente
`mobile: '12'` per impilarli — nessuna soglia di stacking automatico "gratis" oltre a quella già
prevista dal sistema responsive esistente.

## Alternative scartate

- **Nuovo `kind: 'gridSpan'` numerico dedicato** — scartato: un `kind` in più è un `kind` per
  sempre (ADR-21 §4); `enum` con `responsive: true` copre già il caso a due soli valori (6/12)
  senza nuova infrastruttura di validator/sanitizer.
- **Flexbox con `flex-basis` calcolato lato client dal conteggio dei campi** — scartato: fragile
  con numero dispari di campi o campi condizionalmente nascosti, nessun controllo esplicito
  dell'autore sull'affiancamento.
- **Wrapping in un blocco `container` (`flexDirection: row`) attorno a coppie di `form-field`** —
  scartato: costringerebbe l'autore a un secondo livello di annidamento manuale invece di una
  prop dichiarativa sul campo stesso, e va contro `children.allow: ['form-field', 'form-submit']`
  piatto di `form` (RFC-46 D1).

## Conseguenza

`form-field.block.ts` passa da 6 a 7 prop (nessuna voce nuova nel registro dei `kind`, ADR-21 §4
invariato). `FormFieldBlock.tsx`/`FormBlock.module.css`/`FormFieldBlock.module.css` cambiano
layout ma non markup semantico (resta senza import Mantine, condiviso col sito pubblico via
`BlockRenderer`, ADR-22 §5). `style-tokens.module.css` guadagna il vocabolario `colSpan_*`
(6/12, tre breakpoint) accanto a `columns_*` già esistente per `section`. `PropertyInspector`
riceve il nuovo campo tramite `PropField` generico (nessun nuovo `case` nello switch) con
etichetta "Larghezza campo" (50%/100%) mappata sui valori enum `6`/`12`. `blocks:export` +
`blocks:types` da rieseguire (gate `blocks-sync`). Nessuna migrazione, nessuna invalidazione
cache pubblica oltre quella ordinaria di pubblicazione, nessun impatto sui form già pubblicati
(default `12` = un campo per riga, comportamento identico a oggi).
