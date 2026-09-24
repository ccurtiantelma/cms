# INDEX.md — JIT Context Map

Istruzione vincolante per ogni agente AI: per il task corrente, apri **solo** gli SPEC/ADR/tipi mappati al dominio pertinente in questa tabella (più `docs/constitution.md` e `docs/business-rules.md` se il task tocca regole di dominio). Non leggere l'intero albero `docs/ai/`. Se il dominio del task non compare qui, o un file mappato manca, STOP e chiedi — non inventare.

| Dominio | File |
|---|---|
| Editor Visivo & Canvas | `docs/ai/plans/PLAN-F04-editor-visivo.md` · `docs/ai/specs/SPEC-F04-grid-responsive-engine.md` · `docs/ai/specs/SPEC-F04-super-elementor.md` · `docs/ai/rfc/RFC-F04e-super-elementor.md` · `docs/ai/rfc/RFC-F04e-bis-esito-spike-iframe.md` · `docs/ai/plans/PLAN-F04-dnd-iframe-spike.md` · `docs/ai/plans/PLAN-F04-dnd-iframe-portal-spike.md` · `docs/ai/adr/ADR-72-canvas-iframe-portal-bridge.md` · `docs/ai/adr/ADR-70-canvas-iframe-isolation-zustand-sync.md` · `docs/ai/adr/ADR-71-resize-handles-unita-dinamiche.md` · `docs/ai/adr/ADR-73-rimozione-maniglie-resize-widget-foglia.md` · `docs/ai/adr/ADR-91-editor-fullscreen-3-colonne-fisse.md` · `docs/ai/adr/ADR-92-overlay-in-canvas-e-palette-widget-2-colonne.md` · `docs/ai/adr/ADR-93-in-canvas-theme-frame-e-breadcrumb.md` · `docs/ai/adr/ADR-94-pannello-modifica-in-sidebar-sinistra.md` · `docs/ai/adr/ADR-95-overlay-compatto-colori-per-livello-senza-maniglie-resize.md` · `docs/ai/adr/ADR-82-container-unificato-grid-flex.md` · `docs/ai/adr/ADR-96-implementazione-background-color-gradient.md` · `docs/ai/adr/ADR-28-libreria-drag-and-drop.md` · `docs/ai/adr/ADR-29-proprieta-di-stile-per-breakpoint.md` · `docs/ai/adr/ADR-30-metadati-editor-registro.md` · `docs/ai/adr/ADR-32-navigator-editor-fullscreen.md` · `docs/ai/adr/ADR-54-editor-isolato-rotta-studio.md` |
| Schema & Migrazione Blocchi JSON | `docs/ai/specs/SPEC-F02-blocchi.md` · `docs/ai/adr/ADR-21-schema-blocchi-versionamento.md` · `app/frontend/src/types/blocks.types.ts` |
| Rendering & Caching Pubblico | `docs/ai/specs/SPEC-F03-superficie-pubblica.md` · `docs/ai/adr/ADR-53-air-gapped-ssg-zero-db.md` · `docs/ai/adr/ADR-63-consegna-statica-volume-nginx-isolato.md` · `docs/ai/adr/ADR-65-layout-export-su-url-pubblico.md` · `docs/ai/adr/ADR-67-eventi-di-export-e-render-riservato.md` · `docs/ai/adr/ADR-96-implementazione-background-color-gradient.md` · `docs/ai/adr/ADR-97-css-dinamico-per-nodo-sul-sito-pubblico.md` |
| Gestione Pagine | `docs/ai/specs/SPEC-F01-gestione-pagine.md` · `docs/ai/adr/ADR-19-revisioni-immutabili.md` · `docs/ai/adr/ADR-53-air-gapped-ssg-zero-db.md` (routing/slug, succede ad ADR-24) · `docs/ai/adr/ADR-61-retention-revisioni.md` |
| Auth, Ruoli & Permessi | `docs/ai/adr/ADR-99-rbac-dinamico-ruoli-e-permessi-granulari.md` · `docs/ai/specs/SPEC-RBAC-F1-schema-seed-cache-guard.md` · `docs/ai/plans/PLAN-RBAC-F1-schema-seed-cache-guard.md` · `docs/ai/adr/ADR-18-ownership-per-riga.md` · `docs/ai/adr/ADR-13-gestione-sessioni-dispositivi.md` · `docs/ai/adr/ADR-90-custom-fonts-code-e-role-manager.md` (§ 3, in discussione) · `app/backend/src/permissions/permissions.registry.ts` · `docs/business-rules.md` (A4 e § Permessi editoriali) |
| Parità Elementor Pro — R0 Decisioni fondative | `docs/ELEMENTOR_PRO_GAP_ANALYSIS_v2.md` · `docs/PLAN-parita-elementor-pro.md` · `docs/SPEC-propkind-v2.md` · `docs/ai/adr/ADR-74-isole-js-pubbliche.md` · `docs/ai/adr/ADR-75-involucro-stateful-e-stati-hover.md` · `docs/ai/adr/ADR-76-breakpoints-configurabili.md` · `docs/ai/adr/ADR-77-global-kit-schema.md` · `docs/ai/adr/ADR-78-sanitizzazione-css-e-sandbox-html.md` · `docs/ai/adr/ADR-79-modello-collezioni-content-types.md` · `docs/ai/adr/ADR-80-provider-media-e-mappe.md` · `docs/ai/specs/SPEC-IFRAME-PROTOCOL.md` · `docs/ai/specs/SPEC-BENCHMARK-VALIDATOR.md` — **ADR-74/75/76/77 approvate il 2026-09-17 (marketing@antelmagroup.net), contestualmente a `SPEC-PROPKIND-V2-DETAILS.md`; ADR-78 approvata il 2026-09-18 (marketing@antelmagroup.net) a supporto del Sub-Task S5.1 — vedi "Decisione umana" in coda al documento; ADR-79/80 restano "In discussione", nessuna firmata**: vedi nota di allineamento sotto per la rinumerazione 73→74-80 |

## Nota di allineamento

- ADR-22 (consumer HTML pubblico) e ADR-23 (caching/invalidazione pubblica) sono **superseded** da ADR-45/ADR-53 (vedi CLAUDE.md § Decisioni aperte); ADR-24 (routing/slug) è chiusa a livello di record ma la forma URL è ereditata in ADR-53/ADR-65. Per questi tre domini la riga sopra punta direttamente alle ADR correnti, non a quelle superate.
- Attenzione alla numerazione ADR duplicata per nome simile ma dominio diverso: `ADR-31-layout-colonne-section.md`/`ADR-32-navigator-editor-fullscreen.md` (approvate, 2026-08-23/08-24) non hanno relazione con `ADR-70`/`ADR-71` (2026-09-14, canvas iframe e resize handle) — i numeri 31/32 erano già occupati al momento della firma di RFC-F04e, da cui la numerazione 70/71 per le ADR di quel round.
- `RFC-F04e-bis-esito-spike-iframe.md` (2026-09-14) è un addendum a `RFC-F04e-super-elementor.md`: riporta l'esito negativo della spike imposta da `ADR-70` § "Decisione" punto 4 (`PLAN-F04-dnd-iframe-spike.md`) e riapre solo la Decisione 1/2 di quella RFC per una nuova firma umana. `ADR-70`/`ADR-71` restano storiche e non modificate: l'esito eventuale di questo addendum produrrà, se del caso, una nuova ADR di superamento (non ancora esistente al momento di questa nota).
- **`ADR-72-canvas-iframe-portal-bridge.md` (approvata 2026-09-14) supera `ADR-70` § "Decisione" punti 1 e 3** (canvas via `ReactDOM.createPortal` nello stesso albero React del padre, nessun secondo `createRoot`/entry point, nessun `IframeBridgeSensor`; misura cross-frame via `measuring.*.measure` di `DndContext` al suo posto). `ADR-70` resta storica e non modificata (`docs/constitution.md` § Documentation Policy): i suoi punti 2 (store Zustand), 5 (isolamento CSS) e 6 (nessuna nuova dipendenza npm) restano vincolanti identici, non riaperti da `ADR-72`. Stesso meccanismo di annotazione già usato sopra per ADR-22/ADR-23 superseded da ADR-45/ADR-53: per il dominio "Editor Visivo & Canvas", `ADR-72` è l'ADR corrente per l'architettura del canvas in iframe; `ADR-70` va letta solo per i punti 2/5/6 e per il contesto storico. `docs/ai/specs/SPEC-F04-super-elementor.md` § 1 e § 3.3/3.5 sono stati aggiornati di conseguenza in pari data.
- **`ADR-73-rimozione-maniglie-resize-widget-foglia.md` (approvata 2026-09-16) supera parzialmente `ADR-71` § "Decisione" punto 3**: la maniglia di resize trascinabile sul canvas non si monta più per `heading`/`richText`/`image`/`button` (parità Elementor Pro, nessun widget foglia ha maniglie di resize sul canvas), restando invariata per `container`. Nessuna modifica allo schema/registro backend — solo alla logica di rendering frontend (`resolveResizePropSpec`). `ADR-71` resta storica e non riscritta per il resto (punti 1-2, 4-7 invariati).
- **`ADR-91-editor-fullscreen-3-colonne-fisse.md` (approvata 2026-09-18) supera `ADR-32` §
  "Decisione" punto 1** (sidebar unica a schede Widgets/Struttura/Proprietà/Cronologia/Pagina,
  340px) **e la descrizione a 3 colonne ereditata invariata da `ADR-54`**: la shell fullscreen
  monta ora 3 colonne fisse sempre visibili simultaneamente — Palette Widget (sinistra, 300px,
  schede Widgets/Struttura/Cronologia/Pagina, "Proprietà" non più fra queste), Canvas (centro,
  invariato, iframe ADR-72), Property Inspector (destra, 320px, nuova, sempre montata). `ADR-32`
  resta storica e non riscritta per il resto (punti 2-7 invariati); `ADR-54` resta storica e non
  riscritta (rotta isolata `/studio/:guid` invariata, tocca solo la disposizione interna delle
  colonne). Autorizzazione raccolta in sede di task (stesso pattern di ADR-54/72/73), non da una
  dichiarazione di "autorizzazione" nel solo prompt ricevuto — vedi ADR-91 § "Contesto" per la
  verifica che ha preceduto la domanda.
- **`ADR-92-overlay-in-canvas-e-palette-widget-2-colonne.md` (approvata 2026-09-18) supera
  parzialmente lo schema colore bordo di `T-editor-refinement`/`RE-2`** (entrambi documentati
  solo a commento in `EditorBlockWrapper.tsx`, mai una loro ADR dedicata): il bordo di
  hover/selezione passa dal magenta fisso `#e0007b` (Sezioni/Container) e dal blu a tre
  livelli (`blockLevelColor`, widget foglia) a due colori fissi per categoria — `#2271b1`
  Container/Sezione, `#a435c0` Widget foglia — e l'ancoraggio della toolbar di selezione
  (`BlockHoverOverlay.tsx`) passa da centrato a in alto a sinistra. `blockLevelColor` resta
  calcolato invariato (tre livelli) come custom property, solo non più consumato dal bordo.
  Stesso prompt esterno "RESTYLING VISIVO 1:1" già annotato sopra per ADR-91, terza recidiva
  della stessa giornata — vedi ADR-92 § "Contesto" per la verifica sul codice che ha preceduto
  la domanda esplicita all'umano.
- **`ADR-94-pannello-modifica-in-sidebar-sinistra.md` (approvata 2026-09-21) supera `ADR-91` §
  "Decisione" punti 1-2 e `ADR-92` § 4**: il Property Inspector non è più la colonna destra ma la
  3ª scheda "Modifica" della sidebar sinistra (layout a 2 colonne), la palette widget torna a 3
  colonne con icone monocromatiche, i controlli `border`/`shadow`/`background` (ignorati dal
  compilatore stile) sono disabilitati con tooltip "In costruzione". `ADR-91`/`ADR-92` restano
  storiche per il resto (topbar, overlay in-canvas, colori bordo). Autorizzazione raccolta con
  domanda esplicita in sede di task.
- **`ADR-93-in-canvas-theme-frame-e-breadcrumb.md` (2026-09-19, stato "In discussione", in attesa di
  firma umana) documenta a posteriori** i badge fissi `THEME - HEADER`/`THEME - FOOTER` e la barra
  breadcrumb sticky a 28px già presenti in `CanvasThemeFrame.tsx`, montati da `EditorCanvas.tsx`
  nel documento iframe di `ADR-72`. Non supera nessuna ADR precedente: estende `ADR-72`/`ADR-91`/
  `ADR-92` senza toccarne le decisioni. Finché non è firmata, va letta come descrittiva, non
  vincolante.
- **Round "R0 — Decisioni fondative" (`PLAN-parita-elementor-pro.md`) rinumerato 73–79 → 74–80.** Il piano, redatto 2026-09-16 assumendo "ultima firmata: ADR-72", assegnava a questo round i numeri 73–79. Lo stesso giorno è stata però approvata `ADR-73-rimozione-maniglie-resize-widget-foglia.md` (dominio Editor Visivo/Canvas, indipendente da questo round). Stesso principio già applicato da `ADR-53` § "Numerazione" (una ADR approvata non si riscrive, la decisione prende il primo numero libero): il round R0 occupa quindi **ADR-74–ADR-80**, tutte ancora in stato "In discussione" (nessuna ha ricevuto firma umana al momento di questa nota). `docs/PLAN-parita-elementor-pro.md` § "Riepilogo" riporta ancora la numerazione originale 73–79 e va letto con questo scarto di +1 finché non viene aggiornato in una sede propria (un piano non richiede una ADR per essere corretto, ma non si riscrive di iniziativa AI senza segnalarlo qui).
- **`ADR-97-css-dinamico-per-nodo-sul-sito-pubblico.md` (approvata 2026-09-22) completa il
  collegamento lasciato aperto da `ADR-96`**: quest'ultima limitava il proprio § "Decisione" punto
  3 al mirror `generateCanvasCss.ts` per l'anteprima Canvas, senza toccare la pagina pubblica.
  `ADR-97` estende lo stesso `generateCanvasCss.ts` all'SSR di `app/public-site` (nuovo endpoint
  pubblico `GET settings/breakpoints`, nuovo modulo `block-dynamic-css.ts`, `<style
  data-block-dynamic-css>` iniettato dopo il `<link>` esterno) — senza toccare
  `export.processor.ts` (copia già l'HTML SSR così com'è) né il compilatore backend `to-css.ts`
  (resta l'algoritmo di riferimento, non wired a nessun consumer reale, debito dichiarato in
  `ADR-97` § "Conseguenze"). `ADR-96` resta storica e non riscritta.
- **`ADR-81`/`ADR-82`/`ADR-83`/`ADR-85`–`ADR-88` e `docs/ai/specs/SPEC-PROPKIND-V2-DETAILS.md`
  mancavano da questa tabella** (rilevato 2026-09-22 durante un task sul dominio "Editor Visivo &
  Canvas" che ha rischiato di contraddire `ADR-82-container-unificato-grid-flex.md`, approvata e
  non mappata, prima che la verifica sul codice la intercettasse). `ADR-82` è stata aggiunta sopra
  alla riga "Editor Visivo & Canvas" insieme alla nuova `ADR-96`. `ADR-81`/`ADR-83`/`ADR-85`–`88` e
  `SPEC-PROPKIND-V2-DETAILS.md` (autorevole per il codice, non `docs/SPEC-propkind-v2.md` che è la
  bozza propedeutica) restano da mappare correttamente ai rispettivi domini in una sessione
  dedicata — non fatto qui per restare nello scope del task che l'ha rilevato.
- **`ADR-99-rbac-dinamico-ruoli-e-permessi-granulari.md` (approvata 2026-09-24) supera
  parzialmente l'assunzione A4 di `docs/business-rules.md` e `ADR-18` § "Alternative valutate"**
  (riga "Nuovi ruoli editoriali", scartata *per A4*). A4 è emendata sul file (§ "Emendamento di
  A4"): le 4 soglie restano e diventano i ruoli di sistema, e sopra si aggiungono ruoli
  personalizzati additivi. Le decisioni D1–D5 di `ADR-18` (ownership per riga, `hasElevatedRowAccess`)
  restano vigenti e `ADR-18` resta storica e non riscritta. La F1 (schema, seed, cache, guard,
  `RolesService` senza controller) è implementata su `feature/rbac-f1-permessi`. Le API, la UI e la
  migrazione delle rotte arrivano con F2/F3. Restano da riallineare `docs/glossary.md` e
  `docs/system-architecture.md` (ADR-99 § "Documenti da aggiornare"), non ancora richiesto.
