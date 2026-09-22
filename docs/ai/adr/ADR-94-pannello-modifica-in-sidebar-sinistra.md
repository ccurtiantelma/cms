# ADR-94 — Pannello di modifica nella sidebar sinistra (3ª scheda), palette a 3 colonne monocromatica, controlli inattivi "In costruzione"

## Status
[ ] In discussione · [x] **Approvata** · [ ] Rifiutata · [ ] Superseded da ADR-XXX

## Data approvazione
2026-09-21 — approvato da: marketing@antelmagroup.net, conferma esplicita in sede di task
(scelta "Nuova ADR-94 poi applica" alla domanda posta in questa sessione, stesso pattern di
autorizzazione di ADR-91/92).

## Contesto

Il task chiede di spostare il pannello di modifica (`PropertyInspector`) dalla colonna destra
alla sidebar sinistra, riallineare la palette widget e disabilitare i controlli senza logica.
Tre punti contraddicono ADR approvate: ADR-91 § 1-2 (Inspector in colonna destra fissa, nessuna
scheda "Proprietà" a sinistra) e ADR-92 § 4 (palette a 2 colonne, icone colorate per categoria).

Verifica sul codice prima di procedere:

- `selectNode` (`useBlockEditorStore`) scrive già `activeSidebarTab: 'properties'` (ADR-91 § 3
  l'aveva lasciato invariato): il passaggio automatico alla scheda alla selezione di un blocco
  non richiede modifiche allo store.
- Il compilatore stile del canvas (`components/blocks/generateCanvasCss.ts`) ignora i `kind`
  `border`, `shadow` e `background` (ADR-82 § "Conseguenze"; commento di testa di
  `Container.tsx`): i relativi controlli scrivono nello store ma nessun renderer li legge.

## Decisione

1. **`EditorSidebar.tsx` guadagna la scheda "Modifica"** (`value: 'properties'`, icona
   `IconAdjustmentsHorizontal`), 3ª nell'ordine Widgets · Struttura · Modifica · Cronologia ·
   Pagina, che monta `PropertyInspector`. Supera ADR-91 § 2.
2. **La colonna destra `.inspectorPanel` e `EditorInspectorShell` sono rimossi**: il layout
   torna a due colonne (sidebar 300px + canvas). Supera ADR-91 § 1. Con la colonna destra
   scompare anche la sede che mostrava le Impostazioni Pagina a nessuna selezione: la scheda
   "Pagina" è di nuovo sempre visibile a sinistra.
3. **Selezione ⇒ scheda "Modifica"** tramite il comportamento già esistente di `selectNode`;
   nessuna logica nuova.
4. **Palette Widget a 3 colonne** (`repeat(3, 1fr)`, gap 8px) **con icone monocromatiche**
   (`#4a5568` in chiaro, `#e5e7eb` in scuro), anche nella griglia preset
   (`WidgetPaletteGrid`). Supera ADR-92 § 4 (2 colonne, accento per categoria).
5. **Controlli inattivi**: `UnderConstruction.tsx` (`editor/components/`) avvolge il controllo in
   un `Tooltip` Mantine "In costruzione", con contenuto `inert`, `opacity: 0.5`,
   `pointer-events: none`. L'elenco dei `kind` inattivi è `UNIMPLEMENTED_PROP_KINDS`
   (`inspector/inspector.utils.ts`) = `border`, `shadow`, `background`, applicato in
   `StyleTab.tsx`. Va svuotato per `kind` quando il compilatore lo implementa.
   **`background` rimosso da questo elenco da `ADR-96`** (2026-09-22): il compilatore lo
   implementa ora per `none`/`color`/`gradient`. `border`/`shadow` restano inattivi, invariati.

## Alternative scartate

- **Mantenere la colonna destra e duplicare l'Inspector a sinistra** — due punti di montaggio
  dello stesso stato di form (`draft`), rischio di divergenza.
- **`disabled` sul singolo controllo** — un elemento disabilitato non emette eventi di
  puntatore: il tooltip non comparirebbe. Il tooltip sta sul wrapper.
- **Disabilitare per nome di prop** invece che per `kind` — fragile; il criterio reale è
  "il compilatore non implementa quel `kind`".

## Conseguenze

**Positive**
- Canvas a piena larghezza residua; un solo punto di montaggio per `PropertyInspector`.
- Wrapper e insieme dei `kind` riusabili per ogni futuro controllo inattivo.

**Negative / costi**
- Larghezza dell'Inspector da 320px a 300px.
- Il set `UNIMPLEMENTED_PROP_KINDS` copre solo i controlli dell'Inspector verificati inerti
  sul renderer; altri pulsanti fuori dall'Inspector non sono stati mappati (vedi sotto).
- `ADR-91` § 1-2 e `ADR-92` § 4 restano testualmente inalterate (Documentation Policy).

## Conformità

1. `FullScreenEditorLayout.tsx` non monta più un Inspector; `EditorSidebar.tsx` espone la
   scheda "Modifica" come 3ª (`sidebar/WidgetPalette.test.tsx`).
2. Selezionare un blocco attiva la scheda "Modifica" (stesso test).
3. `WidgetPalette.module.css` `.grid` a `repeat(3, 1fr)`, nessuna classe d'accento per categoria.
4. `UnderConstruction.test.tsx`; `npx tsc --noEmit` e `npx vitest run src/pages` verdi.
