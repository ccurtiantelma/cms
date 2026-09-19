# ADR-91 — Editor Fullscreen a 3 colonne fisse (Palette/Canvas/Inspector), supera ADR-32 § 1

## Status
[ ] In discussione · [x] **Approvata** · [ ] Rifiutata · [ ] Superseded da ADR-XXX

## Data approvazione
2026-09-18 — approvato da: marketing@antelmagroup.net, conferma esplicita in sede di task
("Riscrittura completa a 3 colonne fisse", alla domanda posta in questa sessione se procedere
nonostante ADR-32/ADR-54 non fossero segnalate come superate in nessun documento) — stesso
pattern di autorizzazione di ADR-38/47/50/51/52/54.

## Contesto

Il task ricevuto ("RESTYLING VISIVO 1:1 — Page Builder EAIDOS", stesso prompt già intercettato
con premessa falsa il 2026-09-18 — vedi nota di allineamento sotto) chiedeva di "creare" una
shell fullscreen a 3 colonne fisse (Topbar 52px, Palette Widget 300px, Canvas, Property
Inspector 320px) dichiarando **AUTORIZZATO** il superamento di `ADR-32-navigator-editor-
fullscreen.md` e `ADR-54-editor-isolato-rotta-studio.md`. Verifica sui documenti prima di
procedere: nessuna nota in `docs/ai/INDEX.md` registrava un superamento di ADR-32/54 (a
differenza di ADR-70→72, ADR-71→73, tutte tracciate lì con firma umana esplicita) — la sola
riga del prompt non costituisce, da sola, l'autorizzazione tracciata che la gerarchia di
`CLAUDE.md` richiede per un'ADR approvata.

Verifica sul codice: l'architettura reale (`FullScreenEditorLayout.tsx`, `EditorSidebar.tsx`)
era già molto più avanzata di quanto il prompt presupponesse — rotta isolata `/studio/:guid`
(ADR-54, già implementata), sidebar sinistra **unica** a 340px con 5 schede (Widgets/Struttura/
Proprietà/Cronologia/Pagina, ADR-32 § "Decisione" punto 1: "sidebar widget/proprietà, canvas,
pannello struttura"), non le 3 colonne simultanee richieste dal task. Topbar già a 52px
(modifica non committata, sessione precedente). Ambiente Vitest già `jsdom` funzionante, 449
test verdi — la "bonifica" richiesta dal task non aveva materia: falsa anche quella premessa.

Posta la domanda esplicita all'umano (nessuna decisione unilaterale sulla sola dichiarazione
del prompt), la risposta è stata di procedere con la riscrittura completa, accettando
esplicitamente il superamento di ADR-32/54 su questo punto.

## Decisione

1. **`FullScreenEditorLayout.tsx` monta 3 colonne sempre simultaneamente visibili**, non più
   una sidebar unica a schede: Palette Widget (sinistra, `EditorSidebar.tsx`, 300px — supera i
   340px di ADR-32), Canvas (centro, `flex: 1`, invariato — iframe same-origin, ADR-72, non
   toccato da questa ADR), Property Inspector (destra, nuova colonna `.inspectorPanel`, 320px,
   sempre montata).
2. **La scheda "Proprietà" esce da `EditorSidebar.tsx`**: `PropertyInspector` si monta ora
   incondizionatamente nella colonna destra (`selectedId === null` mostra lo stesso stato vuoto
   che prima viveva nella scheda). Le altre 4 schede (Widgets/Struttura/Cronologia/Pagina)
   restano nella colonna sinistra, ora a 300px.
3. **`useBlockEditorStore` non cambia**: `selectNode` continua a scrivere
   `activeSidebarTab: 'properties'` come prima — quel valore è condiviso con
   `BuilderSidebar.tsx` (Template Editor dei Template di Sito, dominio separato, mai toccato da
   questa ADR, CLAUDE.md § zero refactoring fuori scope), che lo consuma davvero per la propria
   scheda "Ispettore". In `EditorSidebar.tsx` quel valore non ha più una scheda dedicata: il
   ramo di rendering lo tratta come `'widgets'`, così selezionare un blocco non lascia la
   colonna sinistra su una scheda inesistente.
4. **Il pannello destro "Struttura/Navigator" toggleabile (`structurePanel`, mai apribile da
   quando il suo trigger in topbar fu rimosso in un round precedente) è rimosso**, non lasciato
   come codice morto: prop `structurePanel` tolta da `FullScreenEditorLayoutProps`, entrambi i
   chiamanti (`BlockEditorPanel.tsx`, `PageGlobalSectionBuilder.tsx`) aggiornati,
   `isStructurePanelOpen`/`.structurePanel` CSS non più letti da questo componente (restano
   nello store per compatibilità con altri eventuali consumer, non rimossi dallo store in
   questa ADR — fuori scope).
5. **Topbar (`Toolbar.module.css`) resta a sfondo azzurrino tenue del tema primario**, non
   `#ffffff`/`#e9ecef` come letteralmente richiesto dal prompt: quel colore è una correzione di
   contrasto deliberata e già documentata (segnalazione diretta dell'utente in un round
   precedente) — riportarlo a un grigio/bianco fisso reintrodurrebbe il problema di contrasto
   già risolto. Punto non coperto dall'autorizzazione esplicita raccolta (che riguardava la
   sola architettura a 3 colonne), quindi non applicato silenziosamente.
6. **Pulizia contestuale**: rimosse le classi CSS morte `.topbar`/`.topbarSection`/
   `.pageTitle`/`.viewportSwitcher` in `FullScreenEditorLayout.module.css` (residuo pre-
   estrazione di `Toolbar.tsx`, mai più referenziate), trovate durante la riscrittura di questo
   stesso file.

## Alternative scartate

- **Applicare il prompt alla lettera senza verificare i documenti/il codice** — avrebbe
  duplicato l'incidente già registrato in memoria di progetto per lo stesso identico prompt
  ricevuto in precedenza nella stessa giornata (premessa falsa: "crea X" quando X esiste già,
  solo con un'architettura diversa).
- **Silenziosamente NON eseguire la riscrittura**, limitandosi a segnalare il conflitto con
  ADR-32/54 senza chiedere — avrebbe bloccato un task per cui l'umano poteva legittimamente
  autorizzare il superamento (stesso pattern già usato per ADR-54 stessa).
- **Rimuovere `isStructurePanelOpen` dallo store** insieme al resto — allargherebbe la
  superficie della modifica oltre l'architettura di layout richiesta; lasciato per un task
  dedicato.

## Conseguenze

**Positive**
- Parità visiva 1:1 con il Design Elementor Pro sulle 3 colonne (obiettivo del task).
- Nessuna duplicazione di `PropertyInspector` (prima annidato nella scheda "Proprietà" di
  `EditorSidebar`, ora un solo punto di montaggio nella colonna destra).
- Rimozione di codice morto (`structurePanel`, classi CSS orfane) invece di lasciarlo
  accumularsi.

**Negative / costi**
- `ADR-32` § "Decisione" punto 1 resta testualmente inalterato (non riscritto, `docs/
  constitution.md` § Documentation Policy) ma la sua applicazione pratica per il layout è ora
  superseded da questa ADR — chi legge ADR-32 isolatamente va rimandato qui.
- La colonna sinistra perde 40px (340→300) e la scheda "Proprietà" come destinazione
  esplicita: chi la cercava lì la trova ora sempre visibile a destra.
- `BuilderSidebar.tsx` (Template Editor) resta sulla vecchia architettura a sidebar unica a
  schede — nessuna parità richiesta né applicata lì, fuori dal dominio "Editor Visivo & Canvas"
  di questo task.

## Conformità

1. `FullScreenEditorLayout.tsx` monta contemporaneamente `.sidebar` (300px), `.canvasArea`
   (`flex: 1`), `.inspectorPanel` (320px) — verificabile per ispezione del DOM, nessuno dei tre
   condizionato da uno stato di apertura/chiusura diverso da `isSidebarOpen` (solo la sinistra,
   collassabile come già in ADR-32 punto 6).
2. Nessuna scheda "Proprietà" in `EditorSidebar.tsx` (`WidgetPalette.test.tsx`,
   `BlockEditorPanel.test.tsx` verificano l'assenza).
3. `npx tsc --noEmit` e `npx vitest run src/pages/pages/editor src/pages/global-sections
   src/pages/site-templates` (`app/frontend/`) verdi: 449/449 test, 0 errori di tipo.
