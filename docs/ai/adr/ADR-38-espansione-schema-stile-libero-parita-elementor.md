# ADR-38 — Espansione schema blocchi: stile libero vincolato, bordo, ombra, CSS custom

## Status
[ ] In discussione · [x] **Approvata** · [ ] Rifiutata · [ ] Superseded da ADR-XXX

## Data approvazione
2026-08-26 — approvato da: marketing@antelmagroup.net

## RFC di riferimento
`docs/ai/rfc/RFC-38-block-schema-expansion-elementor-parity.md`

---

## Decisione

1. **`color` non è un `kind` nuovo**: esiste da ADR-33. Si riusa (`HEX_COLOR_PATTERN`
   invariato) su `heading.styleTextColor` e `richText.styleTextColor`, oltre al
   `section.styleBackgroundColor` già esistente.

2. **`unitValue`**: nuovo `kind`, valore oggetto `{ value: number; unit: LengthUnit }`
   (`LengthUnit = 'px'|'%'|'em'|'rem'|'vw'|'vh'`). `units` (elenco chiuso ammesso) e
   `min`/`max` sono dichiarati **dalla prop**, mai liberi — nessun supersede di
   `ADR-29-proprieta-di-stile-per-breakpoint.md` § 1 ("token, mai una misura"): il valore
   resta un numero dentro un intervallo dichiarato, l'unità un enum chiuso per prop.

3. **`border`**: nuovo `kind`, oggetto fisso a 4 campi — `width` (0–12, fisso, non
   configurabile per prop), `style` (`solid|dashed|dotted|none`), `color` (stesso
   `HEX_COLOR_PATTERN` di `color`), `radius` (0–48, fisso). Nessuna forma libera.

4. **`shadow`**: nuovo `kind`, oggetto fisso a 5 campi — `x`/`y` (±48), `blur` (0–64),
   `spread` (±24), `color` (stesso pattern). Come `border`, intervalli fissi nel validator,
   non configurabili dal registro.

5. **`cssClassName`/`htmlId`**: due `kind` nuovi, non un campo `pattern` generico su
   `plainText`. `cssClassName`: 1–3 token spazio-separati, ciascuno
   `^[a-zA-Z_-][a-zA-Z0-9_-]{0,49}$`, somma ≤ 100 char. `htmlId`: un solo token, stesso
   pattern, ≤ 50 char. Stesso principio già in vigore per `color` (pattern fisso e stretto,
   non riusabile/configurabile).

6. **Props avanzate universali**: `customCssClass` (`cssClassName`) e `customElementId`
   (`htmlId`), opzionali, `tab: 'advanced'`, aggiunte a tutti e 5 i tipi di blocco
   (`section`, `heading`, `richText`, `image`, `button`).

7. **Sanitizzazione (ADR-21 § 4)**: `unitValue`/`border`/`shadow`/`cssClassName`/`htmlId`
   sono validati per forma/intervallo/pattern nel validator, come `color`; nessuno passa da
   `sanitize-html`. La guardia `typeof value !== 'string'` in `BlockPropSanitizerService`
   resta corretta per questi `kind` **solo se** il validator ha già respinto ogni forma
   non conforme a monte — il validator resta l'unica riga di difesa per i `kind` oggetto,
   non il sanitizer.

8. **`v` invariato**: tutte le props nuove sono opzionali, nessun default obbligatorio →
   nessun incremento di `v` per nessuno dei 5 tipi (stesso ragionamento di ADR-29 § 5 /
   ADR-37 § 6).

9. **Un solo round**: a differenza della raccomandazione della RFC (fasare in 3 round), qui
   si consegnano tutti e 5 i `kind` insieme — rischio di concentrazione accettato
   consapevolmente dall'umano (RFC-38, Decisione umana).

## Alternative scartate

- `unitValue` con `value`/`unit` davvero liberi, senza `min`/`max` — avrebbe richiesto il
  supersede esplicito di ADR-29 § 1; scartato, nessuna RFC di supersede è stata aperta.
- `customCssClass` come `PlainTextPropSpec` esteso con un campo `pattern?: string`
  configurabile — introdurrebbe una superficie di configurazione (regex arbitraria nel
  registro) mai vista negli altri `kind`, essa stessa da validare come sicura.
- `border`/`shadow` come stringa CSS libera validata da regex — stessa famiglia di rischio
  di `customCss`, già respinta in RFC-37: una regex non è un parser, non garantisce
  l'assenza di CSS iniettabile oltre la forma attesa.
- Fasare in 3 round (raccomandazione della RFC) — scartata dall'umano in sede di
  approvazione a favore di un round unico.

## Conseguenza

`prop-spec.types.ts` passa da 8 a 13 `kind` (`+unitValue, border, shadow, cssClassName,
htmlId`). `BlockTreeValidatorService` guadagna la prima capacità di validare valori-oggetto
a forma fissa (non solo scalari) — nuova infrastruttura, non solo nuove righe in una
tabella. `BlockPropSanitizerService` non cambia comportamento per questi `kind` (nessuna
riga di sanitizzazione HTML), ma la sua correttezza per i `kind` oggetto dipende ora
interamente dal validator a monte: un buco nel validator per `border`/`shadow`/`unitValue`
non verrebbe intercettato dal sanitizer. Ogni `*.block.ts` dei 5 tipi aggiunge
`customCssClass`/`customElementId` più le props di stile pertinenti. Nessuna migrazione
DB, nessun incremento di `v`. Rigenerazione obbligatoria `blocks:export` + `blocks:types`
(gate CI `blocks-sync`); il test di invariante del registro (ADR-30 § 4) deve restare
verde. Frontend: nuovi controlli Mantine per `unitValue`/`border`/`shadow` (nessun editor
esistente per un valore-oggetto) — fuori scope di questa ADR, materia di spec/plan
successivi lato Frontend Developer.
