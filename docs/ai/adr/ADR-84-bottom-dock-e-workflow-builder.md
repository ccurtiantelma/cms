# ADR-84 — Bottom Dock 40px: breadcrumb ad albero, responsive switcher esteso, revisioni in-builder con diff visuale

## Status
[x] **In discussione** · [ ] Approvato · [ ] Rifiutato · [ ] Superseded da ADR-XXX

## Data approvazione
_In attesa di firma umana — vedi "Decisione umana" in fondo a questo documento._

## RFC di riferimento
Nessuna RFC dedicata nuova: round **R3 — UX del builder** di `docs/PLAN-parita-elementor-pro.md`
§ T1 (bottom dock, breadcrumb, responsive switcher), § T3 (revisioni in-builder con diff), § T9
(breakpoint custom, UI di gestione). Riferimento sostanziale:
`docs/ELEMENTOR_PRO_GAP_ANALYSIS_v2.md` § 2 righe 71–73.

## Numerazione
Vedi `ADR-83-tabella-templates-e-api-libreria.md` § "Numerazione": round R3, primo numero libero
dopo ADR-83.

## ADR di riferimento (non superate, non modificate)
- `ADR-54-editor-isolato-rotta-studio.md` — `FullScreenEditorLayout.tsx` come chrome di una rotta
  dedicata (`/studio/:guid`), non un overlay: il Bottom Dock è un componente aggiunto a questa
  stessa chrome, non una nuova rotta né un nuovo pattern di montaggio.
- `ADR-72-canvas-iframe-portal-bridge.md` — il canvas centrale resta un `<iframe>` same-origin
  (`IframeCanvas.tsx`); il Bottom Dock vive **fuori** dall'iframe, nel documento padre, come la
  Topbar (`Toolbar.tsx`) esistente — nessuna modifica al ponte di misura cross-frame.
- `ADR-19-revisioni-immutabili.md` — semantica di Revisione e ripristino invariata: "il ripristino
  di una Revisione non riscrive la storia, crea una nuova bozza... che va poi ripubblicata"
  (`docs/business-rules.md` § Revisioni regola 3). Questa ADR sposta **dove** l'utente accede a
  quella stessa funzionalità, non **cosa** fa.
- `ADR-76-breakpoints-configurabili.md` — `app_settings.breakpoints` e
  `GET/PUT app/settings/breakpoints` sono decisioni già chiuse da quella ADR; questa ADR ne è il
  **consumer** frontend nel dock, non introduce alcun endpoint o schema nuovo per i breakpoint.
- `ADR-32-navigator-editor-fullscreen.md` — `EditorStructureNavigator.tsx`/`BlockTreeNavigator.tsx`
  esistenti restano il pannello Navigator invariato; il dock aggiunge solo un pulsante di apertura,
  non una riscrittura del pannello.

---

## Contesto

`docs/ELEMENTOR_PRO_GAP_ANALYSIS_v2.md` § 2 riga 71 descrive lo stato attuale della chrome
dell'editor come "topbar 48px + sidebar" (`Toolbar.tsx`, 48px, verificato in
`Toolbar.module.css`) e il gap P1 richiesto come "**Bottom dock**: breadcrumb, responsive switcher,
history, revisioni, page settings, keyboard shortcuts". Tre capacità specifiche mancano oggi
dentro l'editor stesso:

1. **Nessun percorso di antenati visibile e cliccabile.** Il Navigator (`ADR-32`) mostra l'intero
   albero, ma non un percorso sintetico dalla radice al nodo selezionato — l'unico modo di
   "risalire" oggi è la maniglia "seleziona genitore" prevista da un task separato
   (`PLAN` § R3 T2, handle bar, **non** oggetto di questa ADR) o la navigazione manuale nel
   Navigator stesso.
2. **Responsive switcher chiuso a 3 viewport fissi** (100%/768/375, `activeViewport` di
   `useBlockEditorStore`) — `ADR-76` ha già deciso lo schema a 7 breakpoint configurabili, ma
   nessun componente frontend lo consuma ancora.
3. **Revisioni fuori dal builder.** `gap analysis` riga 73: *"Revisioni **dentro** il builder con
   anteprima/restore | `RevisionDiffModal`, restore fuori | ◐"* — `RevisionDiffModal.tsx` e le
   quattro rotte `GET/POST :guid/revisions*` (`pages.controller.ts`, già in produzione) esistono
   già, ma sono raggiungibili solo da una superficie **fuori** dalla rotta `/studio/:guid`
   (verosimilmente la lista Pagine): l'autore deve uscire dall'editor per consultare/ripristinare
   una Revisione.

Questa ADR fissa l'architettura di un nuovo componente di chrome — il **Bottom Dock**, 40px,
fissato al fondo del viewport dell'editor, **accanto** alla Topbar esistente (che resta, invariata,
per titolo/undo/redo/salva/pubblica — `PLAN` § R3 T1: *"Topbar resta per titolo/undo/salva/
pubblica"*) — che chiude questi tre gap senza toccare il modello dati sottostante: nessuno dei tre
punti richiede un endpoint nuovo (i quattro di `pages.controller.ts` esistono già,
`app/settings/breakpoints` è già deciso da `ADR-76`) o una modifica allo schema PostgreSQL. È
un'ADR di **architettura frontend**, non di dominio.

---

## Decisione

### 1. Il Bottom Dock è un quarto elemento di chrome, non una sostituzione

`FullScreenEditorLayout.tsx` guadagna una nuova fascia orizzontale fissa, **40px di altezza**
(`flex: 0 0 40px`, stesso pattern CSS già in uso per `.root` della Topbar a 48px,
`Toolbar.module.css` riga 15-17), ancorata al fondo del viewport dell'editor, **sotto** l'area a tre
colonne (sidebar/canvas/pannello struttura) e **non sovrapposta** a nessuna di esse — l'altezza
disponibile per il canvas si riduce di 40px, nessun overlay che copra temporaneamente il contenuto.
Convive con la Topbar (48px, in cima) senza sostituirla: le due fasce hanno competenze disgiunte
(Topbar: identità/documento — titolo, stato di salvataggio, undo/redo, pubblica; Dock: struttura/
contesto — dove sono, quale breakpoint, storia del contenuto).

Il dock ospita, da sinistra a destra: **breadcrumb** (§ 2, spazio elastico, si restringe per primo),
**responsive switcher** (§ 3), un separatore verticale, e un gruppo di pulsanti icona a larghezza
fissa. Di questo gruppo, questa ADR decide l'architettura di **Navigator** e **Revisioni** (§ 4);
gli slot per **Impostazioni pagina**, **Finder** (`PLAN` § R3 T7) e **Shortcuts** (`?`) sono
riservati nel layout (spazio e ordine fissati) ma il loro comportamento non cambia rispetto a oggi
— sono **rilocazioni meccaniche** di controlli/pannelli già esistenti altrove nella chrome, non una
decisione architetturale nuova, e restano fuori dal perimetro vincolante di questa ADR. Allo stesso
modo, la maniglia "seleziona genitore" (freccia ↑ nella handle bar del blocco selezionato,
`PLAN` § R3 T2) è un meccanismo **complementare** al breadcrumb del dock (un passo indietro dal
punto di editing, contro un percorso completo sempre visibile) ma **non è oggetto di questa ADR**.

### 2. Breadcrumb ad albero cliccabile

`resolveAncestorPath(tree: BlockNode[], selectedId: string | null): BlockNode[]` (nuova funzione
pura in `block-tree.utils.ts`, accanto a `duplicateSubtree`/il generatore di `id`): percorre
l'albero e restituisce la sequenza di nodi dalla radice al nodo selezionato incluso, `[]` se nessun
nodo è selezionato (il dock mostra allora solo il nome della Pagina come unico crumb, radice
implicita). Ogni elemento del percorso è reso come un `<button>` (mai un `<a>`: non è navigazione fra
rotte) con l'etichetta `meta.title` del nodo se presente (`ADR-84`... — rinominazione del Navigator,
`PLAN` § R3 T6, non ancora decisa da alcuna ADR firmata: finché non esiste, l'etichetta ricade sul
`type` del blocco, es. "Container", "Heading") o il `type` capitalizzato altrimenti; il click
seleziona quel nodo nello store (`selectNodeAction`, azione già esistente, nessuna azione nuova) e
lo evidenzia nel canvas — stesso effetto di un click diretto sul nodo, il breadcrumb è un
acceleratore, non un percorso di navigazione con stato proprio.

**Restringimento responsivo del breadcrumb**: un percorso più lungo della larghezza disponibile del
dock collassa i segmenti centrali dietro un singolo `…` cliccabile (Mantine `Breadcrumbs` con
override, o composizione equivalente) che apre un menu con i soli segmenti nascosti — mai un
troncamento che nasconde silenziosamente un livello senza modo di raggiungerlo. Il dock stesso è a
`overflow: hidden` orizzontale sulla sola fascia del breadcrumb (`flex: 1 1 auto`, `min-width: 0`),
mai sul gruppo di pulsanti a destra (`flex: 0 0 auto`, sempre completamente visibile).

### 3. Responsive switcher esteso ai breakpoint configurabili

Il controllo sostituisce l'attuale selettore chiuso a 3 viewport (`activeViewport` con tre valori
cablati) con un rendering derivato da `resolveActiveBreakpoints()` (`ADR-76` § "Conseguenze": "una
nuova funzione... usata sia dal validator sia dal worker di export", qui **anche** dal frontend,
terzo consumer della stessa funzione — nessuna quarta implementazione della logica di attivazione).
Il dock effettua `GET app/settings/breakpoints` al montaggio dell'editor (una sola volta per
sessione, non a ogni render — stesso principio di cache di processo già adottato da
`SPEC-GLOBAL-KIT.md` § 3 per il worker di export, qui applicato al client) e rende un'icona per
ciascuna chiave con `active: true`, nell'ordine fisso di `ADR-76` § "Decisione" punto 1
(`default, widescreen, laptop, tabletExtra, tablet, mobileExtra, mobile`) — mai l'ordine di
attivazione o un ordine alfabetico. Un'ultima icona, sempre presente, "Gestisci breakpoint" apre le
Impostazioni di sito alla sezione breakpoint (`PLAN` § R1 T7/R3 T9) — la UI di attivazione/
disattivazione stessa **non** è decisa da questa ADR (è la superficie di Site Settings, già
attribuita a `ADR-76`), il dock si limita a collegarvisi.

`activeViewport` (stato del canvas, `useBlockEditorStore`) resta lo stesso concetto — quale
breakpoint il canvas sta simulando — ma il suo dominio di valori passa da 3 chiavi fisse alle chiavi
attive correnti, invariato per tutto il resto (il frame dell'iframe si ridimensiona secondo la
soglia della chiave scelta, meccanismo già esistente, non toccato da questa ADR).

### 4. Revisioni in-builder: drawer, anteprima read-only, diff visuale riusato

**Nuovo componente `RevisionsDrawer.tsx`**, aperto dal pulsante "Revisioni" del dock (Mantine
`Drawer`, stesso pattern di apertura non-modale già in uso per pannelli laterali dell'editor — non
un secondo `Modal` a piena finestra come `TemplateLibraryModal`, perché l'utente deve poter
continuare a vedere il canvas mentre lo consulta).

1. **Lista**: `GET app/pages/:guid/revisions` (esistente, `pages.controller.ts` riga 236,
   invariato) — nessuna nuova rotta. Ogni riga: numero di revisione, autore, data di pubblicazione.
2. **Anteprima read-only nel canvas**: selezionare una riga imposta
   `previewRevisionId: string | null` in `useBlockEditorStore` (nuovo campo di stato di chrome,
   stesso principio già dichiarato per `activeViewport`/`isStructurePanelOpen`: stato dell'editor,
   non stato della Pagina). Quando `previewRevisionId` è valorizzato:
   - `IframeCanvas.tsx` riceve il contenuto di `GET app/pages/:guid/revisions/:revisionGuid`
     (esistente, riga 281) al posto della bozza corrente — **mai scritto** nello store della bozza
     (`draftContent` non è toccato, nessun rischio di sovrascrittura accidentale del lavoro in
     corso).
   - Un banner fisso in cima al canvas ("Stai visualizzando la Revisione #N del ‹data›" + pulsante
     "Torna alla bozza") rende impossibile confondere l'anteprima con lo stato editabile.
   - `EditorBlockWrapper.tsx` monta in modalità non interattiva quando `previewRevisionId` è
     presente: nessuna selezione, nessun drag, nessuna Floating Toolbar — stesso principio "un
     contenuto non editabile non deve sembrare editabile" già rispettato per i nodi dentro
     `globalRef` (sola-lettura strutturale, `ADR-59`).
3. **Ripristino**: il pulsante "Ripristina" della riga selezionata chiama
   `POST app/pages/:guid/revisions/:revisionGuid/restore` (esistente, riga 299, **invariato** —
   nessuna modifica al contratto o alla semantica). Coerente con `business-rules.md` § Revisioni
   regola 3, il ripristino **non pubblica**: crea una nuova bozza, il drawer si chiude,
   `previewRevisionId` torna `null`, l'editor ricarica la bozza appena creata (stesso ciclo di
   `PATCH`→ricarica già in uso altrove), e l'autore vede lo stato "non salvato/non pubblicato"
   della Topbar esattamente come dopo qualunque altra modifica — nessuna scorciatoia che pubblichi
   automaticamente.
4. **Diff visuale: riuso integrale di `RevisionDiffModal.tsx`**, componente già esistente e già
   approvato (`gap analysis` § 0, "Chiuso dal 26/08": "History panel click-to-restore... Global
   Tokens drawer... preset salvabili, copia/incolla stile, menu contestuale, sezioni globali" —
   `RevisionDiffModal` ne fa parte). Questa ADR **non introduce alcuna nuova logica di diff**: il
   drawer aggiunge un'azione "Confronta con..." su ogni riga che apre lo stesso
   `RevisionDiffModal.tsx` già in produzione, alimentato dallo stesso
   `GET app/pages/:guid/revisions/diff` (esistente, riga 263) — l'unico cambiamento è il **punto di
   apertura** (dentro il dock dell'editor, invece che dalla lista Pagine esterna), mai il contratto,
   l'algoritmo o il componente di rendering del diff.

### 5. Nessuna nuova rotta backend, nessuna modifica allo schema

Punto riassuntivo: i quattro endpoint di revisione (`pages.controller.ts`), l'endpoint di
breakpoint (`ADR-76`) e lo store del blocco editor esistente coprono per intero il fabbisogno dati
di questa ADR. Nessuna riga di `schema.ts` cambia. `meta.breakpoints` sull'envelope di
Pagina/Revisione (già deciso da `ADR-76` § "Decisione" punto 6) resta invariato — il dock lo legge
solo indirettamente tramite `resolveActiveBreakpoints()`, non lo scrive.

---

## Alternative valutate

| Opzione | Pro | Contro | Motivo scarto |
|---|---|---|---|
| Sostituire la Topbar con il Bottom Dock (un'unica fascia di chrome) | Meno superficie totale, un solo componente da manutenere | `PLAN` § R3 T1 fissa esplicitamente "Topbar resta"; unire le due fasce mescolerebbe competenze disgiunte (identità/documento vs struttura/contesto) in un solo controllo sovraccarico | Contraddice il piano commissionato, peggiora la leggibilità della chrome |
| Breadcrumb come parte del pannello Navigator invece che nel dock | Un solo posto per "dove sono nell'albero" | Il Navigator è un pannello apribile/richiudibile (`isStructurePanelOpen`); un breadcrumb ha valore solo se **sempre visibile**, indipendentemente dallo stato di quel pannello | Perderebbe l'utilità principale (visibilità costante) se legato alla visibilità di un pannello opzionale |
| Anteprima di Revisione in un `Modal` a piena finestra invece che nel canvas stesso | Isolamento visivo netto fra bozza e revisione | Richiederebbe un secondo `IframeCanvas` (costo di montaggio doppio) o una rappresentazione statica non interattiva (perde lo zoom/scroll del canvas reale) | Il banner + modalità non interattiva sullo stesso `IframeCanvas` ottiene lo stesso isolamento percettivo a costo di montaggio zero |
| Nuova implementazione di diff dedicata al drawer in-builder | Massima libertà di presentazione nel nuovo contesto | Duplica un componente già approvato e funzionante (`RevisionDiffModal.tsx`), introduce due fonti di verità per lo stesso algoritmo di confronto | Violazione diretta di "Single Source of Truth"; nessun requisito lo giustifica |
| Responsive switcher che continua a leggere 3 viewport fissi, ADR-76 collegata solo a Site Settings | Nessuna modifica al componente esistente | Lascia il gap "responsive switcher esteso" esplicitamente richiesto da questa stessa ADR completamente aperto | Non soddisfa il compito commissionato |
| Ripristino che pubblica automaticamente la Revisione ripristinata | Un click in meno per l'autore | Viola direttamente `business-rules.md` § Revisioni regola 3 ("il ripristino... crea una nuova bozza... che va poi ripubblicata") | Rottura di una regola di dominio già approvata, senza un fatto nuovo che la giustifichi |

---

## Conseguenze

- Nuovo componente `BottomDock.tsx` (e sotto-componenti `DockBreadcrumb.tsx`,
  `DockResponsiveSwitcher.tsx`, `RevisionsDrawer.tsx`) in `app/frontend/src/pages/pages/editor/`,
  montato da `FullScreenEditorLayout.tsx` accanto alla Topbar esistente.
- `useBlockEditorStore` guadagna due campi di stato di chrome: `previewRevisionId: string | null`
  (§ 4 punto 2) e la proiezione derivata delle chiavi di breakpoint attive (letta una volta da
  `GET app/settings/breakpoints`, non ririchiesta a ogni cambio di viewport).
- `IframeCanvas.tsx` guadagna un ramo di rendering "sorgente contenuto" (bozza corrente vs
  Revisione in anteprima) e `EditorBlockWrapper.tsx` un flag di sola-lettura strutturale derivato da
  `previewRevisionId !== null` — nessuna modifica al ponte di misura cross-frame di `ADR-72`.
- L'altezza utile del canvas nell'editor si riduce di 40px rispetto a oggi (fascia dock aggiunta in
  fondo) — impatto puramente di layout, nessun impatto sui limiti di contenuto (`MAX_DEPTH`/
  `MAX_NODES`, invariati).
- Nessuna modifica allo schema PostgreSQL, nessun endpoint nuovo, nessun aggiornamento OpenAPI
  richiesto da questa ADR (i quattro endpoint di revisione e quello di breakpoint sono invariati
  nel contratto).
- Il debito dichiarato: Navigator/Impostazioni pagina/Finder/Shortcuts occupano slot riservati nel
  dock ma restano, per questa ADR, wiring meccanico di pannelli/scorciatoie già esistenti o
  esplicitamente rinviati (`PLAN` § R3 T6/T7) — una futura ADR che tocchi il loro comportamento
  interno non è vincolata da questa, che ne fissa solo la posizione nel layout.

## Conformità

- Test e2e: selezionare un nodo profondo nel canvas popola il breadcrumb con l'intero percorso
  dalla radice; cliccare un crumb intermedio seleziona quel nodo e lo evidenzia nel canvas.
- Test e2e: con più chiavi di breakpoint attivate in Site Settings, il responsive switcher del dock
  mostra esattamente quelle chiavi, nell'ordine fisso di `ADR-76`; disattivarne una la rimuove dallo
  switcher senza richiedere il reload dell'editor.
- Test e2e: aprire il drawer Revisioni, selezionare una riga → il canvas mostra il banner di sola
  lettura e il contenuto di quella Revisione; tentare un drag/drop su un blocco non produce alcun
  effetto; "Torna alla bozza" ripristina l'editabilità e il contenuto della bozza corrente
  invariato.
- Test e2e: "Ripristina" su una Revisione crea una nuova bozza (verificabile dal cambio di
  `version`/dallo stato "non pubblicato" della Topbar) senza pubblicare — nessuna chiamata a un
  endpoint di pubblicazione osservata nella rete durante l'operazione.
- Test e2e: "Confronta con..." apre `RevisionDiffModal` con lo stesso contenuto che produce oggi
  se aperto dalla lista Pagine (stesso componente, stesso endpoint, snapshot equivalente).
- Test di regressione: nessuna modifica al ponte di misura cross-frame di `ADR-72` — la suite
  esistente di `iframe-canvas-measuring.utils.ts` resta verde senza modifiche.

---

## Decisione umana

**Esito**: [ ] Approvato così com'è · [ ] Approvato con modifiche (vedi note) · [ ] Rifiutato ·
[ ] Rinviato

**Approvato da**: _______________ · **Data**: _______________

**Note**:
