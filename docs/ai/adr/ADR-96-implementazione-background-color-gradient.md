# ADR-96 — Implementazione `kind: 'background'` (solo `none`/`color`/`gradient`) per Contenitore/Sezione, riabilitazione del controllo Inspector

## Status
[ ] In discussione · [x] **Approvata** · [ ] Rifiutata · [ ] Superseded da ADR-XXX

## Data approvazione
2026-09-22 — approvato da: marketing@antelmagroup.net, conferma esplicita in sede di task
(scelta "Sì, scope limitato + scrivi tu la ADR" alla domanda posta in questa sessione, stesso
pattern di autorizzazione di ADR-91/92/94).

## Contesto

Il task chiede di sbloccare e abilitare il controllo "Colore di sfondo" nell'Inspector per i nodi
Contenitore/Grid (badge Sezione incluso), con applicazione in tempo reale sul canvas e
persistenza corretta nello schema del blocco.

Verifica sul codice prima di procedere:

- `ADR-94` § "Decisione" punto 5 disabilita deliberatamente il controllo `background`
  nell'Inspector (insieme a `border`/`shadow`) tramite `UnderConstruction.tsx` +
  `UNIMPLEMENTED_PROP_KINDS` (`inspector/inspector.utils.ts`), perché **nessun compilatore CSS
  implementa quel `kind`**: né il compilatore autorevole server-side
  (`app/backend/src/blocks/compiler/to-css.ts` + `value-to-declarations.ts`), né il suo mirror
  frontend-only per l'anteprima live nel canvas iframe (`components/blocks/generateCanvasCss.ts`,
  che lo ignora silenziosamente insieme a `link`/`animation`/`motion`/`attributes`/`css`/
  `hideOn`/`shapeDivider` — debito dichiarato in `ADR-82` § "Conseguenze").
- Lo schema `kind: 'background'` approvato da `ADR-82`/`SPEC-PROPKIND-V2-DETAILS.md` § 3.7 è più
  ampio di "colore di sfondo": prevede anche `type: 'image'|'video'|'slideshow'` con `mediaRef`,
  overlay e Ken Burns. Implementarlo per intero ora eccede la richiesta esplicita ("colore di
  sfondo" per Contenitore/Grid) e introdurrebbe dipendenze non ancora pronte (overlay/blend mode
  non compilati per nessun kind). `ADR-82` § "Decisione" punto 1 applica già lo stesso principio
  di rinvio parziale per `link`/`animation`/`motion` ("accettate dallo schema ma non renderizzate
  finché R5/R6"): questa ADR estende lo stesso principio a `background`.

## Decisione

1. **Supera `ADR-94` § "Decisione" punto 5 limitatamente al `kind: 'background'`**: rimosso da
   `UNIMPLEMENTED_PROP_KINDS` (`inspector/inspector.utils.ts`). `border` e `shadow` restano
   inattivi, invariati. Il controllo Mantine (palette/color picker/hex) in `StyleTab.tsx` torna
   interattivo e scrive nello store per la prop `background` di nodi `container` (incluso il caso
   con `props.tag === 'section'`, badge viola — vedi nota separata sulla migrazione
   section→container, che non richiede una nuova ADR in quanto usa un campo già nello schema
   approvato da `ADR-82`).
2. **Completa parzialmente il debito `ADR-82` § "Conseguenze" per `kind: 'background'`, scope
   limitato a `type: 'none' | 'color' | 'gradient'`**: nuova `backgroundToDeclarations()` in
   `value-to-declarations.ts` (riusa `colorRefValueToCss`/i letterali già usati da
   `gradientToDeclarations` per i rami `color`/`gradient`; nessuna dichiarazione per `type:
   'none'`), nuovo `case 'background'` nel dispatcher `to-css.ts`, stesso envelope
   stato→breakpoint (`normal, hover, focus, active` × breakpoint) di ogni altro kind stateful.
   `type: 'image' | 'video' | 'slideshow'` restano validi per lo schema ma non compilati in
   questo round (nessuna eccezione lanciata, branch esplicitamente non implementato) — stesso
   trattamento già riservato da `ADR-82` a `link`/`animation`/`motion`.
3. **Mirror identico in `generateCanvasCss.ts`**: `background` esce dall'elenco dei `kind`
   ignorati silenziosamente, stesso scope `none`/`color`/`gradient` del punto 2, per l'anteprima
   live nel canvas iframe (nessun redeploy/reload necessario per vedere il colore applicato).

## Alternative scartate

- **Implementare lo schema `background` per intero (image/video/slideshow/overlay)** — fuori
  scope della richiesta, richiede pianificazione a sé per `mediaRef`/overlay/blend mode non
  ancora compilati per nessun kind esistente.
- **Sbloccare solo il controllo UI senza il compilatore** — la prop verrebbe scritta nello store
  senza alcun effetto visivo reale, contraddicendo la diagnosi che ha motivato `ADR-94` § 5.

## Conseguenze

**Positive**
- Colore/gradiente di sfondo applicabile e persistito per Contenitore/Sezione, in tempo reale sul
  canvas.
- Pattern riusabile: quando `image`/`video`/`slideshow` saranno pronti, si estende
  `backgroundToDeclarations()` senza toccare il dispatcher.

**Negative / costi**
- `background.type: 'image'|'video'|'slideshow'` resta accettato dallo schema ma senza alcun
  effetto visivo finché non implementato in un round successivo (debito residuo, non introdotto
  da questa ADR — preesistente in `ADR-82`).
- `ADR-94` resta testualmente inalterata (Documentation Policy); questa ADR ne supera solo la
  parte di `background` nel punto 5.

## Conformità

1. `inspector.utils.ts` — `UNIMPLEMENTED_PROP_KINDS` non contiene più `'background'`; test
   aggiornato.
2. `to-css.ts`/`value-to-declarations.ts` — unit test per `backgroundToDeclarations()` (rami
   `none`/`color` letterale/`color` `{ref}`/`gradient` linear/radial, stato `hover`, breakpoint
   `tablet`).
3. `generateCanvasCss.ts` — stessa matrice di test, verifica che il CSS generato lato client
   coincida con quello del compilatore backend per gli stessi input.
4. Test e2e salvataggio→reload di un `container`/`section` con `background.color` impostato:
   valore persistito e CSS compilato coerenti dopo il reload.
