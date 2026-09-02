# RFC-F04d — Estensioni blocchi per landing ad alta fedeltà

## Status
[ ] In discussione · [x] Approvato → genera ADR-47 · [ ] Rifiutato

## Proposto da
AI Orchestrator · Data: 2026-09-02

## Problema
Le landing ad alta fedeltà (es. `/contatti-antelma`) richiedono controlli di stile che lo schema
blocchi attuale non copre: allineamento del testo in `heading`, uno sfondo media con overlay
colorato in `section`, e colori personalizzati sul pulsante di invio dei form. Senza queste
proprietà, editor e agenzie ricadono su CSS custom fuori registro — esattamente ciò che il
modello di blocchi (regola 2, CLAUDE.md) vieta: contenuto opaco non validato server-side.

## Soluzione proposta
Estendere tre blocchi esistenti con proprietà di stile dichiarate nel registro, ciascuna con un
`kind` di sanitizzazione esplicito:

- `SectionBlock`: `styleBackgroundImageRef` (`kind: mediaRef`, già nell'insieme chiuso di ADR-21),
  `styleOverlayColor` (nuovo `kind: color`), `styleOverlayOpacity` (`kind: number`, già esistente,
  range `[0,1]`).
- `HeadingBlock`: `styleTextAlign` (`kind: enum`, già esistente, valori `left|center|right|justify`).
- `FormSubmitBlock`: `styleBackgroundColor`, `styleTextColor` (nuovo `kind: color`).

Il punto tecnico che questa RFC isola: `mediaRef`, `number` ed `enum` sono già kind approvati da
ADR-21 e non richiedono nuova firma — solo `color` è un kind nuovo. Un valore colore non è HTML e
non è `plainText` libero: deve essere vincolato a un formato chiuso (`^#[0-9a-fA-F]{6}$`) per
escludere iniezione CSS (es. `background: url(javascript:...)`, `expression()`, breakout con
`;}</style><script>` se il valore finisce mai in un `<style>` inline invece che in un attributo
`style` React). Applicato solo via `style` inline React (mai concatenato in una stringa CSS/HTML),
il rischio di injection è strutturalmente nullo se il regex è rispettato server-side e mai
rilassato lato client.

## Alternative valutate
- **Riusare `plainText` per i colori**: scartata — `plainText` non ha vincolo di formato, apre a
  qualunque stringa finita in `style=`.
- **Campo `styleCss` libero per blocco**: scartata — esattamente il CSS opaco che la regola 2 del
  modello di contenuto vieta; superficie di injection enorme, ownership del CSS del tema
  disintegrata.
- **`kind: enum` con palette fissa invece di esadecimale libero**: valutata più sicura ma respinta
  per questo RFC — il brief chiede colori arbitrari (`#d90000`); resta un'opzione futura se si
  vuole restringere ulteriormente.

## Impatto
- Nuovo `kind: color` nel registro sanitizzazione (ADR-21 §4) → richiede ADR propria (questo
  documento genera ADR-47), non modifica ADR-21 (approvata, non si tocca).
- Backend: aggiornamento dei descrittori dei tre blocchi in `app/backend/src/blocks/`, validator
  per `color` (regex, rifiuto 400 su path colpevole, coerente con la pipeline di ADR-21 §3).
  Retrocompatibile: proprietà opzionali, nodi esistenti restano validi senza `v` bump se il
  descrittore le tratta come opzionali con default assente (da confermare in ADR-47 se serve
  incremento `v`).
- Frontend/Public Site: `Section.tsx` risolve `styleBackgroundImageRef` via Media Engine pubblico
  e applica overlay; `Heading.tsx` applica `styleTextAlign`; `FormSubmit.tsx` applica i due colori.
  Tutto in `style` inline React, mai stringhe HTML/CSS costruite a mano.
- Seed Antelma (`/contatti-antelma`) aggiornato per usare le nuove proprietà una volta approvata.

## Rischi
- **CSS injection** se il valore `color` finisce mai in markup HTML letterale (SSR string
  concatenation) invece che in un attributo `style` gestito da React/CSS-in-JS con escaping
  nativo — va vincolato in ADR e verificato nel renderer pubblico (`app/public-site`).
- **Over-engineering**: rischio di proliferazione di `styleXxx` ad hoc per blocco invece di un
  sotto-schema di stile condiviso; fuori scope qui, segnalato come nota per un futuro RFC se il
  pattern si ripete oltre ai tre casi richiesti.
- **Incremento `v`**: se il descrittore aggiunge campi obbligatori invece che opzionali non serve
  bump; se in futuro diventano obbligatori, ADR-21 §1 impone che sia un deploy a senso unico —
  da decidere esplicitamente in ADR-47, non implicitamente in codice.

## Decisione umana
**Esito**: [x] Approvato · [ ] Rifiutato · [ ] Modificato

**Note**: Approvato come scritto.

**Approvato da**: marketing@antelmagroup.net · **Data**: 2026-09-02

**Azione successiva**: [x] Genera ADR-47 · [ ] Archivio
