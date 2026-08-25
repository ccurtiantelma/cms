# ADR-34 — Subtree Insertion Engine e libreria di preset di Sezione statici

## Status
[ ] In discussione · [x] **Approvata** · [ ] Rifiutata · [ ] Superseded da ADR-XXX

## Data approvazione
2026-08-25 — approvato da: marketing@antelmagroup.net

---

## Decisione

1. **Fonte dei preset: registro JSON statico bundlato nel frontend.** Nuovo file
   `app/frontend/src/pages/pages/editor/static-section-presets.json` (accanto a
   `block-registry.utils.ts`), importato staticamente (`resolveJsonModule` già attivo in
   `tsconfig.json`) — nessuna chiamata di rete, nessuna tabella nuova, nessuna scrittura
   server-side arbitraria. Ogni preset è un sottoalbero composto **solo** da tipi/prop già
   nel registro (`section`, `heading`, `richText`, `image`, `button` — ADR-21): zero nuovi
   tipi di blocco, zero nuovi `kind`, quindi nessuna firma aggiuntiva sullo schema blocchi.
   Tre preset iniziali con props valorizzate a contenuto reale (non i default vuoti delle
   prop obbligatorie): **Hero Section** (`section` con `heading` + `richText` + `button`),
   **Features Grid 3 colonne** (`section` con `columns: '3'` e tre coppie `heading`+`richText`
   come figli diretti — `section` non può contenere `section`, `childrenAllow` del registro,
   quindi una griglia a colonne è sempre piatta, mai annidata), **Call to Action** (`section`
   con `styleBackground` non-`none` + `heading` + `button`).

2. **`insertSubtreeAction(parentId, index, subtree)` generalizza `duplicateSubtree`, non la
   duplica.** `duplicateSubtree` (`block-tree.utils.ts`) già rigenera ricorsivamente l'id di
   radice e di ogni discendente per un nodo **già nell'albero** (usata da
   `duplicateNodeAction`); la nuova azione applica la stessa funzione pura a un sottoalbero
   **esterno** (il preset), poi inserisce con lo stesso `addBlockAtExact` già usato da
   `duplicateNodeAction`/`removeBlockAction` per costruire il comando undo/redo invertibile.
   Un solo punto di rigenerazione UUID ricorsiva nel codebase, non due.

3. **Validazione: si estende il pattern già in vigore, non si importa il validatore
   backend.** `block-tree-validator.service.ts` è un `@Injectable` NestJS — codice backend,
   fuori dal bundle frontend, il cui import violerebbe il confine di ruolo (CLAUDE.md §
   Frontend Developer, "mai server-side"). Il frontend anticipa già il verdetto del server
   senza sostituirlo (commento in testa a `block-registry.utils.ts`: "l'autorità resta il
   validatore server-side, qui si anticipa il suo verdetto"). `insertSubtreeAction` applica
   lo stesso principio con le stesse funzioni già esistenti: `canContainType(parentType,
   subtree.type)` nel punto di inserimento (identica a quella usata da palette/drag&drop) e
   `countNodes` proiettato contro `CONTENT_TREE_LIMITS.maxNodes` **prima** di inserire (stesso
   schema già scritto in `duplicateNodeAction`, notification di rifiuto se eccede, nessun
   inserimento parziale). La validazione **autoritativa e completa** resta quella server-side
   esistente, invocata al salvataggio della bozza (endpoint già in produzione, invariato da
   questa ADR): i preset non la bypassano, la incontrano al primo save come ogni altro
   contenuto.

4. **Punto di innesto:** conseguenza diretta del punto 3, nessun caso speciale — un preset è
   inseribile solo dove `canContainType` lo ammette (radice o dentro `section`, secondo
   `childrenAllow`); un tentativo altrove (es. dentro `heading`) è respinto dallo stesso
   controllo.

5. **`TemplateLibraryModal.tsx`**: componente frontend puro nella cartella
   `pages/pages/editor/` (stesso principio di `WidgetPalette`/`SectionStructureModal`, ADR-32
   § 4 / ADR-33 § 7), tab singola "Sezioni Predefinite" — le altre tab restano fuori scope,
   nessun placeholder per tab future. Due punti di apertura: il pulsante "+" del Canvas
   (`EditorCanvas.tsx`, stesso trigger già cablato per `SectionStructureModal` — le due modal
   sono **alternative non annidate**: l'utente sceglie fra struttura vuota o sezione
   preimpostata, mai le due in sequenza) e un nuovo `ActionIcon` nell'header di
   `FullScreenEditorLayout.tsx`, accanto agli altri controlli esistenti (struttura, anteprima,
   undo/redo). Selezione preset → `insertSubtreeAction(parentId, index, subtree)` con
   `parentId`/`index` presi dal contesto di apertura (radice, in coda, se aperta dall'header;
   punto del click se aperta dal Canvas) — stesso schema già in uso per `addBlockAction` dalla
   palette.

6. **Zero incremento di `v`, zero migrazione, zero invalidazione cache pubblica (ADR-23):**
   i preset producono solo nodi di tipi/versioni già registrati e già validi.

## Alternative scartate

- **Libreria di preset persistita nel backend** (nuova tabella, CRUD admin) — richiederebbe
  una migrazione DB e una propria ADR di schema, sproporzionato per 3 layout statici; riapre
  anche ownership/RBAC su chi può creare/editare preset, oggi non specificato in nessun
  documento.
- **Persistenza client (localStorage/IndexedDB, "salva come preset" dal canvas corrente)** —
  esplicitamente esclusa dal task (nessun mock storage); comunque non condivisibile fra
  utenti/browser, romperebbe la garanzia "stesso contenuto per tutti" che la fonte statica
  bundlata offre gratis.
- **Import/porting di `block-tree-validator.service.ts` lato client** — violerebbe il confine
  di ruolo Frontend Developer e duplicherebbe la fonte di verità della validazione; il pattern
  già stabilito (`canContainType`/`countNodes` come anticipazione, server come autorità) copre
  lo stesso bisogno senza una seconda implementazione del validatore.
- **Endpoint dedicato `GET public/section-presets`** — i preset sono dati statici di prodotto,
  non contenuto di Pagina: nessuno stato, nessuna variazione per tenant/lingua, nessuna
  necessità di cache/invalidazione (ADR-23); un endpoint aggiungerebbe superficie di rete per
  zero beneficio su un JSON già nel bundle.

## Conseguenza

Nessuna dipendenza npm nuova, nessuna migrazione DB, nessun endpoint nuovo, nessun
aggiornamento OpenAPI. `static-section-presets.json` è manutenuto a mano: un preset con un
tipo/prop non più nel registro (dopo una futura evoluzione dello schema, ADR-21) supererebbe
comunque i controlli client di questa ADR (`canContainType`/`countNodes` non validano i valori
delle prop) e fallirebbe solo al salvataggio server-side, con un'esperienza utente povera — il
Test Engineer copre questo rischio con un test che ogni preset del file rispetta i vincoli
`required`/`values` correnti del registro (round-trip contro `BLOCK_TYPES`), non lasciato alla
sola validazione server a runtime. I tre preset iniziali sono espandibili in futuro senza nuova
ADR finché restano sottoalberi di tipi/`kind` già registrati; un preset che richiedesse un tipo
o `kind` nuovo torna sotto "Schema dei blocchi e versionamento" (ADR-21) e la sua firma.
