# RFC-F04d — Libreria di preset di Sezione: quarto preset "Text & Media"

## Status
[x] In discussione · [ ] Approvato → genera ADR-[N] · [ ] Rifiutato

## Proposto da
AI Orchestrator · Data: 2026-08-25

---

## Problema

Un task esterno ha richiesto, in sostanza, di costruire da zero una "libreria di
Template" per l'editor: DTO per "Block Presets" e "Global Templates" salvati
dall'utente, un modale apribile dal pulsante Cartella dell'Empty Canvas Dropzone e
dalla Sidebar, persistenza backend per i blocchi salvati.

Controllo documentale preliminare (`CLAUDE.md` § Anti-hallucination): **la libreria di
preset di Sezione statici esiste già**, approvata e implementata oggi stesso via
**ADR-34** (`docs/ai/adr/ADR-34-subtree-insertion-engine-preset-statici.md`), a sua
volta figlia dell'audit già svolto in **RFC-F06**
(`docs/ai/rfc/RFC-F06-template-sezioni.md`) sullo stesso pattern di richiesta esterna.
Sono già in produzione, a `HEAD` (`44c86a0`):

- `static-section-presets.json` — 3 preset (Hero Section, Features Grid 3 colonne,
  Call to Action), sottoalberi di soli tipi/prop già nel registro (`section`,
  `heading`, `richText`, `image`, `button` — ADR-21).
- `block-registry.utils.ts` → `SectionPresetNode`, `SectionPreset`,
  `resolvePresetSubtree`.
- `useBlockEditorStore.ts` → `insertSubtreeAction(parentId, index, subtree)`,
  rigenera gli `id` ricorsivamente (`duplicateSubtree`), guardia `canContainType` +
  `CONTENT_TREE_LIMITS.maxNodes`, comando undo/redo invertibile.
- `TemplateLibraryModal.tsx` — modale "Libreria Sezioni", tab singola "Sezioni
  Predefinite", legge `PRESETS.map(...)` dal JSON: **rendering dinamico**, nessuna
  card è cablata a mano.
- `EditorCanvas.tsx` — il secondo `ActionIcon` circolare dell'Empty Dropzone
  (`IconFolder`) è già cablato all'apertura di `TemplateLibraryModal`.
- `FullScreenEditorLayout.tsx` — secondo punto di apertura, header editor.
- `static-section-presets.test.ts` — round-trip generico contro `BLOCK_TYPES`: itera
  su `PRESETS`, non su preset nominati singolarmente.

Quindi non c'è "da costruire" un pulsante, un modale o un DTO: quel lavoro è già
fatto. L'unico scostamento reale fra quanto già esiste e la richiesta esterna è un
**quarto layout mancante**, "Text & Media" (1 colonna `richText`, 1 colonna `image`),
non presente fra i tre preset iniziali di ADR-34.

La parte restante della richiesta esterna — "Global Templates" salvati dall'utente,
persistenza backend — è la stessa cosa che RFC-F06 chiama "I miei Template"
(Opzione B) e segnala come **esplicitamente fuori scope**: introduce un'entità di
dominio non in `docs/glossary.md`/`docs/business-rules.md`, richiede ownership/RBAC
non mappato e una migrazione DB, tutte cose che `CLAUDE.md` § Ask first riserva
all'approvazione umana esplicita per ciascun punto. Il committente di questa RFC ha
confermato (turno umano, 2026-08-25) di lasciarla fuori scope per questo giro.

## Soluzione proposta

Estendere `static-section-presets.json` con un quarto oggetto `SectionPreset`,
**"Text & Media"**: `section` con `columns: '2'` e due figli diretti, `richText` +
`image` (stesso pattern piatto di "Features Grid 3 colonne" — `section` non contiene
`section`, `childrenAllow` del registro lo impedisce comunque).

Nessun altro file cambia: `TemplateLibraryModal.tsx` renderizza la nuova card
automaticamente (itera l'array), `EditorCanvas.tsx`/`FullScreenEditorLayout.tsx` non
richiedono modifiche (già cablati ad aprire lo stesso modale), `insertSubtreeAction`
non richiede modifiche (già generico su qualunque sottoalbero valido). Questo è
esattamente il percorso che ADR-34 § Conseguenza pre-autorizza: *"I tre preset
iniziali sono espandibili in futuro senza nuova ADR finché restano sottoalberi di
tipi/`kind` già registrati"* — `richText` e `image` sono tipi già nel registro
(ADR-21), zero nuovo `kind`, quindi nessuna firma aggiuntiva richiesta.

## Alternative valutate

- **Nuovo tab "I miei Template" nel modale esistente** — scartata: riapre la
  domanda di persistenza/ownership che RFC-F06 lascia esplicitamente aperta;
  aggiungere un tab vuoto o mock violerebbe il divieto di placeholder non pianificati.
- **Nuova ADR per il quarto preset** — scartata: ADR-34 § Conseguenza autorizza già
  l'espansione del catalogo quando non introduce tipi/`kind` nuovi; scriverne una
  sarebbe burocrazia senza contenuto decisionale.
- **DTO "Block Presets" / "Global Templates" come da task esterno** — scartata:
  duplica in altro nome ciò che `SectionPreset`/`BlockNode` già coprono per la parte
  statica, e per la parte "Global" (salvata dall'utente) è la stessa persistenza non
  autorizzata che RFC-F06 § Alternative valutate respinge esplicitamente
  ("Backend mock temporaneo").

## Impatto

- **Frontend**: un oggetto in più in `static-section-presets.json`. Nessuna nuova
  dipendenza, nessun nuovo componente.
- **Backend**: nessuno — nessun endpoint, nessuna migrazione, nessun aggiornamento
  OpenAPI (stesso principio di ADR-34 § Conseguenza).
- **Roadmap**: non sblocca F06 nella sua interezza — "I miei Template" resta in
  attesa della decisione umana su Opzione A/B/C di RFC-F06.

## Rischi

- **Preset disallineato dal registro** (stesso rischio già identificato in ADR-34):
  mitigato dal test round-trip esistente, che copre genericamente ogni voce
  dell'array — il quarto preset eredita la copertura senza codice di test aggiuntivo
  dedicato.
- **Deriva verso "Global Templates" per inerzia**: la vicinanza del nome
  ("TemplateLibraryModal") al concetto non approvato di RFC-F06 rischia di far
  sembrare naturale aggiungere lì un secondo tab. Mitigazione: questa RFC dichiara
  esplicitamente il confine, il PLAN-F04d che ne deriva non contiene alcun task di
  persistenza.

---

## Decisione umana

**Esito**: [x] Approvato

**Note**: Confermato in sessione (2026-08-25): procedere come estensione additiva di
ADR-34 (quarto preset "Text & Media"), nessuna persistenza/"Global Templates" in
questo giro — resta bloccata su RFC-F06 T0.

**Approvato da**: marketing@antelmagroup.net · **Data**: 2026-08-25

**Azione successiva**: [x] Archivio (nessuna nuova ADR richiesta — copertura già
in ADR-34 § Conseguenza) · [ ] Genera ADR-[N]
