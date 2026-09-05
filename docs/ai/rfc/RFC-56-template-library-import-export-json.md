# RFC-56 — Libreria Template (estensione modale) e motore Import/Export JSON: cosa si può costruire subito e cosa riapre debiti già aperti

## Status
[ ] In discussione · [x] Approvato → genera ADR-56 · [ ] Rifiutato

## Proposto da
AI Orchestrator · Data: 2026-09-05

---

## Problema

Un task esterno ("FASE 6 / PROMPT 14") chiede di implementare in `app/frontend`:

1. `TemplateLibraryModal.tsx` con filtro per categoria (**Pagine Intere**, Sezioni Hero,
   Feature Grids, Call to Action), ricerca testuale per nome/tag, anteprima
   grafica/thumbnail.
2. `utils/template-io.utils.ts`: esportazione dell'albero corrente (o di una
   Sezione/Container selezionato) in `.json` scaricabile, "ripulito da metadati di
   istanza locale"; importazione con parsing, validazione contro lo schema blocchi,
   rigetto di JSON malformati o con profondità `> 5` (citando "ADR-39"), rigenerazione
   di tutti i GUID.
3. `insertTemplateTreeAction(targetParentId, targetIndex, blockTree)` nuova azione dello
   store Zustand, un solo step di Undo/Redo.
4. Suite di test dedicata + `tsc --noEmit` pulito.

Il controllo documentale preliminare (obbligatorio per `CLAUDE.md` § Anti-hallucination,
eseguito anche contro il codice reale, non solo `docs/`) ha trovato quanto segue.

### 1. Buona parte dell'infrastruttura richiesta esiste già, sotto un'altra ADR

`TemplateLibraryModal.tsx`, `static-section-presets.json`, `insertSubtreeAction`
(`useBlockEditorStore.ts` riga 811), `duplicateSubtree` (`block-tree.utils.ts` riga 284,
rigenerazione GUID ricorsiva già esistente) e `canContainType`/`countNodes`
(`block-registry.utils.ts`) sono stati approvati da **ADR-34** (2026-08-25,
`docs/ai/adr/ADR-34-subtree-insertion-engine-preset-statici.md`) ed estesi da
`PLAN-F04d-template-library.md` (quarto preset). `insertSubtreeAction` fa **esattamente**
ciò che il task chiede a `insertTemplateTreeAction`: `parentId`/`index`/`subtree` →
rigenerazione GUID via `duplicateSubtree` → verifica `CONTENT_TREE_LIMITS.maxNodes` →
comando Undo/Redo invertibile, unico step. ADR-34 § 2 dichiara esplicitamente l'obiettivo
di **un solo punto di rigenerazione UUID ricorsiva nel codebase, non due**. Costruire
`insertTemplateTreeAction` come azione distinta violerebbe quel vincolo di design.

### 2. Il controllo di profondità lato client non esiste, ed è un'omissione dichiarata, non una dimenticanza

`block-registry.utils.ts` riga 102: *"Nessun controllo di `MAX_DEPTH`: fuori scope"* per
il percorso preset→inserimento, perché ADR-34 § 3 affida l'autorità completa al
validatore server-side al salvataggio. `CONTENT_TREE_LIMITS.maxDepth = 5`
(`types/blocks.types.ts` riga 96) **è già generato lato client** dal backend
(`content-tree.ts` riga 17, `MAX_DEPTH`), ma nessuna funzione frontend lo consulta oggi.
**ADR-39** (`docs/ai/adr/ADR-39-blocco-container-flex-grid-nesting-ricorsivo.md`, § 5)
esiste davvero — ma dichiara solo che `MAX_DEPTH: 5` resta invariato introducendo
`container`; non definisce alcun meccanismo di enforcement lato client. Citarla come
fonte del limite è corretto; citarla come fonte del *controllo client-side* non lo è —
quel controllo, se lo si vuole, è una funzione nuova (piccola: riuso di una costante già
generata), non un'estensione di ADR-39.

### 3. La categoria "Pagine Intere" collide con un concetto di dominio mai costruito e due RFC ancora aperte

`docs/glossary.md` riga 20 definisce **Template** come struttura a livello di **intera
Pagina**, copiata **alla creazione** — concetto mai implementato
(`docs/roadmap.md`, F06: "Da avviare"). L'unica RFC che tocca riuso di contenuto sotto
"Sezione Globale" e sopra "singolo Blocco", `RFC-F06-template-sezioni.md`, è ancora
**"In discussione"** (nessuna decisione umana registrata) e raccomandava (Opzione C) di
*non* costruire una libreria dinamica oltre al catalogo statico di sezioni — esattamente
ciò che è diventato ADR-34. `RFC-43-categorie-e-template-pagina.md` (2026-08-31) ha
inoltre verificato che `site_templates`/`TemplateResolverService` esistono già in
`app/backend/src/site-templates/` sotto "RFC-40 Opzione B", ma la sezione "Decisione
umana" di `RFC-40` risulta **ancora in bianco** — un processo di approvazione lasciato
aperto a metà, non una fondamenta stabile su cui appoggiare una categoria "Pagina intera"
nell'editor visivo. Aggiungere questa categoria ora significherebbe costruire sopra due
decisioni pregresse mai chiuse, nello stesso repository.

Da tenere distinto: la **Sezione Globale referenziata** (ADR-40, generalizzata da
**ADR-55** con il dodicesimo tipo `globalRef`, 2026-09-05, lavoro in corso non ancora
committato) è un concetto diverso e già approvato — riferimento condiviso con
invalidazione a cascata, non copia. Il task qui in esame chiede copia (GUID rigenerati),
non riferimento: non collide con ADR-40/55, ma nemmeno li riusa. Nessuna delle due ADR
copre "template di pagina intera".

### 4. L'import di JSON arbitrario è una superficie nuova rispetto ad ADR-34, non un'estensione gratuita

ADR-34 § 1 fonda l'intera approvazione su *"nessuna chiamata di rete, nessuna scrittura
server-side arbitraria"* e su una fonte **curata dagli sviluppatori** (il file statico
bundlato). Un file `.json` caricato dall'utente è una fonte **non curata**: stesso
percorso di validazione anticipata lato client (principio già approvato), ma un input
non fidato invece di uno bundlato a build-time. Non richiede schema DB, non richiede
nuovo tipo di blocco, non bypassa la sanitizzazione server-side (che resta invariata,
ADR-20/21, al salvataggio) — ma è comunque una capacità che nessuna ADR ha ancora
nominato esplicitamente, e va nominata prima di scriverla, non dopo.

---

## Soluzione proposta

Non decido al posto dell'umano quale perimetro costruire. Tre inquadramenti, a rischio
crescente.

### Opzione A — Import/Export JSON minimo, nessuna modifica al modale, nessuna categoria "Pagine Intere"

- `template-io.utils.ts`: `exportSubtreeToJson(node: BlockNode)` → serializza, spoglia il
  solo campo effimero esistente (l'`id`, che va comunque rigenerato in import — non c'è
  altro "metadato di istanza locale" nell'albero persistito da ripulire), genera
  `Blob`/download client-side. `importJsonFile(raw: string): BlockNode | ValidationError`:
  `JSON.parse` in try/catch, verifica ricorsiva forma minima (`type: string`, `props:
  object`, `children: array`) contro i tipi noti del registro frontend (stesso principio
  anticipatorio di `canContainType`), profondità con `CONTENT_TREE_LIMITS.maxDepth`
  (riuso della costante già generata, nessuna nuova fonte del numero `5`), nodi con
  `countNodes`/`CONTENT_TREE_LIMITS.maxNodes` (riuso letterale). Rigetto per intero se
  non conforme — mai inserimento parziale, stesso principio del validator backend
  (ADR-21 § 3.7) applicato qui come euristica client, non come autorità.
- Rigenerazione GUID: riuso letterale di `duplicateSubtree`. Inserimento: riuso letterale
  di `insertSubtreeAction` esistente. **Nessuna nuova azione `insertTemplateTreeAction`**
  nello store — costruirla duplicherebbe il punto unico che ADR-34 § 2 protegge.
- UI: due `ActionIcon` ("Esporta JSON" / "Importa JSON") in `FullScreenEditorLayout.tsx`,
  fuori dal `TemplateLibraryModal` — non tocca la superficie a tab-singola chiusa da
  ADR-34 § 5. Export anche dalla Floating Toolbar di `EditorBlockWrapper.tsx` per un
  sottoalbero selezionato (stesso punto di innesto di `duplicateNodeAction`).
- Nessuna categoria "Pagine Intere". Nessuna modifica a `TemplateLibraryModal.tsx`.
- **Impatto**: zero schema DB, zero nuovo tipo di blocco, un file nuovo + due azioni UI +
  test. Estende ADR-34 senza contraddirla.

### Opzione B — Come A, più estensione del catalogo statico esistente (categorie/ricerca/thumbnail), sempre senza "Pagine Intere"

- `static-section-presets.json` guadagna `tags: string[]`, `category` (enum chiuso:
  `hero | feature-grid | cta | altro` — **mai** `pagina-intera`) e `thumbnail` (asset SVG
  statico bundlato, non un upload).
- `TemplateLibraryModal.tsx`, **stessa tab singola** "Sezioni Predefinite" (non se ne
  aggiunge una seconda — resta dentro ADR-34 § 5): chip di filtro categoria + campo
  ricerca che filtrano client-side l'array `PRESETS` già in memoria, card con thumbnail.
- **Impatto aggiuntivo**: modifica additiva/retrocompatibile alla forma `SectionPreset` e
  al componente modale — tocca un'ADR approvata, quindi va coperta da un emendamento/ADR
  dedicato prima del codice (non la si può considerare "dati", è forma del contratto che
  ADR-34 ha già fissato).

### Opzione C — Full scope come da prompt esterno, incluso "Pagine Intere"

Richiede prima: (1) una decisione umana su `RFC-F06` (ancora in discussione da 11 giorni)
sul terzo concetto di dominio lì descritto; (2) la chiusura formale della "Decisione
umana" ancora in bianco di `RFC-40` Opzione B, che `RFC-43` ha segnalato come debito di
governance su `site_templates`. Nessuna categoria "Pagina intera" nell'editor visivo
prima che queste due decisioni — già aperte, non create da questa RFC — risultino chiuse
per iscritto. Sconsigliata come primo passo.

---

## Alternative valutate

- **Costruire `insertTemplateTreeAction` come da prompt, ignorando `insertSubtreeAction`
  esistente** — scartata: due punti di rigenerazione UUID/inserimento invertibile nello
  stesso store, il debito che ADR-34 § 2 dichiara di voler evitare permanentemente.
- **Validare l'import solo lato server, nessun controllo client** — scartata: un file da
  10 livelli di profondità arriverebbe fino al salvataggio prima di fallire, peggiore UX
  senza guadagno di sicurezza (l'autorità resta comunque server-side in entrambi i casi).
- **Categoria "Pagine Intere" come voce disabilitata/"prossimamente" nel modale** —
  scartata: `CLAUDE.md` vieta placeholder/TODO non pianificati.

## Impatto

Dipende dall'opzione scelta — A e B non toccano schema DB, backend, o tipi di blocco;
B tocca il contratto dati di un componente già approvato (ADR-34) e richiede quindi un
piccolo emendamento formale prima del codice. C dipende dall'esito di due processi di
decisione già aperti altrove nel repository.

## Rischi

- **Import di JSON arbitrario come nuova superficie**: mitigata da validazione anticipata
  (tipi noti, profondità, nodi) + invarianza dell'autorità server-side; la sanitizzazione
  rich-text (ADR-20/21) resta lato server al salvataggio, l'import non la bypassa.
- **Percezione di una "libreria personale" mai approvata**: mitigata tenendo l'UI di
  import/export fuori dal `TemplateLibraryModal` e nominandola esplicitamente
  "Importa/Esporta JSON" (utilità di migrazione contenuto), non "I miei Template".

## Decisione umana

**Esito**: [x] Approvato · [ ] Rifiutato · [ ] Modificato

**Opzione scelta**: [ ] A · [x] B · [ ] C · [ ] Altro (specificare)

**Note**: Confermato scope Opzione B: import/export JSON via riuso letterale di
`insertSubtreeAction`/`duplicateSubtree` esistenti (nessuna nuova azione store), estensione
additiva di `static-section-presets.json` (`tags`, `category` enum chiuso
`hero|feature-grid|cta|altro`, `thumbnail`) e filtri categoria/ricerca in
`TemplateLibraryModal.tsx` (stessa tab singola, nessuna seconda tab). Nessuna categoria
"Pagine Intere" — resta bloccata su RFC-F06/RFC-40 come da Opzione C.

**Approvato da**: marketing@antelmagroup.net · **Data**: 2026-09-05

**Azione successiva**: [x] Genera ADR-56 · [ ] Archivio
