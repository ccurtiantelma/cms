# ADR-37 — Scheda "Avanzato": `styleLayer` e visibilità per breakpoint

## Status
[ ] In discussione · [x] **Approvata** · [ ] Rifiutata · [ ] Superseded da ADR-XXX

## Data approvazione
2026-08-26 — approvato da: marketing@antelmagroup.net

## RFC di riferimento
`docs/ai/rfc/RFC-37-proprieta-avanzate-blocchi.md`

---

## Decisione

1. **Nessun namespace `styles.advanced`/`styles.responsive`**: ogni prop nuova resta una voce
   piatta di `props`, prefissata `style` (`styleLayer`, `styleHideDesktop`, `styleHideTablet`,
   `styleHideMobile`), mai un oggetto annidato. Stessa convenzione di ADR-29/ADR-30/ADR-33.

2. **`styleLayer`**: `kind: 'enum'`, valori chiusi `base | raised | overlay | top`, default
   `base`, mappati a z-index reali nel foglio dei token CSS. Non responsive in questo round
   (apribile in un round successivo col solo modificatore `responsive: true` di ADR-29 § 3, se
   un caso d'uso reale lo richiede). Nessun `NumberPropSpec` libero (ADR-29 § 1: token, mai una
   misura).

3. **Visibilità per breakpoint**: tre props scalari indipendenti, non responsive —
   `styleHideDesktop`, `styleHideTablet`, `styleHideMobile`, `kind: 'boolean'`, default `false`
   ciascuna. Impostarne una non tocca le altre due né `styleLayer`.

4. **`customCss`**: non implementato in questo round. Resta disabilitato finché non esiste
   un'ADR dedicata che tratti da sola la scelta del parser CSS, il profilo di scoping/
   sanitizzazione e l'eventuale dipendenza npm nuova — stesso trattamento riservato al blocco
   HTML/embed da ADR-21 § 5.

5. **Terza scheda "Avanzato"**: l'unione `tab?: 'content' | 'style'` di `BlockEditorPropMeta`
   (`block-definition.types.ts`, ADR-30 § 1) si estende a `'content' | 'style' | 'advanced'`.
   Stesso meccanismo di raggruppamento per `meta.props[...].tab` di ADR-30 § 5 (mai per
   `prop.type`). Un tipo senza props avanzate non mostra la scheda vuota, come già per "Stile".

6. **`v` invariato**: props nuove, opzionali, con default → nessun incremento di `v`, nessuna
   migrazione (stesso ragionamento di ADR-29 § 5).

7. **Sanitizzazione**: nessun `kind` nuovo nella tabella di ADR-21 § 4. `styleLayer` valida per
   appartenenza a lista (enum), `styleHideDesktop/Tablet/Mobile` per tipo (boolean). Nessuna
   delle due passa da `sanitize-html`.

## Alternative scartate

- `styles.advanced`/`styles.responsive` come contenitore annidato — contraddice la forma già
  firmata in ADR-29 § 2, introdurrebbe una seconda convenzione di stile nello stesso registro.
- `customCss` con sanitizzazione regex/allowlist "leggera" — una regex non è un parser: non
  garantisce lo scoping né blocca in modo affidabile `@import`/`expression()`/selettori fuori
  scope. Falsa sicurezza.
- `styleLayer` come `NumberPropSpec` libero — nessun vincolo di intervallo nello schema attuale,
  un valore libero romperebbe lo stacking di Mantine senza difesa.
- `responsive: true` su `BooleanPropSpec` per la visibilità — introdurrebbe un meccanismo nuovo
  per una cascata che semanticamente non esiste fra tre interruttori indipendenti.

## Conseguenza

Ogni `*.block.ts` che vuole le props avanzate aggiunge `styleLayer` (`EnumPropSpec`) e le tre
`styleHideDesktop/Tablet/Mobile` (`BooleanPropSpec`) con `tab: 'advanced'` in `meta.props`.
Nessuna migrazione DB, nessun incremento di `v`. Rigenerazione obbligatoria `blocks:export` +
`blocks:types` (gate CI `blocks-sync`); il test di invariante del registro (ADR-30 § 4) deve
restare verde. Il foglio dei token CSS cresce delle classi `styleLayer`/visibilità (per
breakpoint via media query, come già ADR-29). Nessun endpoint nuovo o modificato: nessun impatto
su `openapi.yaml` o `bruno/`. `customCss` resta fuori scope: nessuna riga di codice per quella
parte finché non esiste un'ADR dedicata.
