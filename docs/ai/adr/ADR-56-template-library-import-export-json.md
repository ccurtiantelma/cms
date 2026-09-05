# ADR-56 — Import/Export JSON di sottoalberi ed estensione catalogo preset statici

## Status
[ ] In discussione · [x] **Approvata** · [ ] Rifiutata · [ ] Superseded da ADR-XXX

## Data approvazione
2026-09-05 — approvato da: marketing@antelmagroup.net

## RFC di riferimento
`docs/ai/rfc/RFC-56-template-library-import-export-json.md` (Opzione B)

---

## Decisione

1. **Nessuna nuova azione store.** `template-io.utils.ts` (nuovo file, `app/frontend/src/pages/pages/editor/utils/`)
   riusa letteralmente `insertSubtreeAction` (`useBlockEditorStore.ts`) e `duplicateSubtree`
   (`block-tree.utils.ts`) per rigenerazione GUID e inserimento invertibile in un solo step
   Undo/Redo. Costruire un'azione dedicata (es. `insertTemplateTreeAction`) è vietato: violerebbe
   il punto unico di rigenerazione UUID che ADR-34 § 2 protegge esplicitamente.
2. **`exportSubtreeToJson(node)`**: serializza il sottoalbero selezionato spogliando `id` (unico
   metadato di istanza locale nell'albero persistito), genera `Blob`/download client-side.
   **`importJsonFile(raw)`**: `JSON.parse` in try/catch, validazione euristica ricorsiva contro i
   tipi noti del registro frontend (stesso principio anticipatorio già in vigore per
   `canContainType`), profondità con `CONTENT_TREE_LIMITS.maxDepth` (riuso della costante già
   generata dal backend — nessuna nuova fonte del numero `5`) e nodi con
   `CONTENT_TREE_LIMITS.maxNodes`. Rigetto per intero se non conforme, mai inserimento parziale
   (stesso principio del validator server-side, qui applicato come euristica client, non come
   autorità — l'autorità resta il validatore server-side invocato al salvataggio, invariato).
3. **UI import/export fuori dal `TemplateLibraryModal`**: due `ActionIcon` ("Esporta JSON" /
   "Importa JSON") nel layout principale dell'editor, più export dalla Floating Toolbar di
   `EditorBlockWrapper.tsx` per il sottoalbero selezionato (stesso punto di innesto di
   `duplicateNodeAction`). Nominata esplicitamente "Importa/Esporta JSON" (utilità di migrazione
   contenuto), mai "I miei Template", per non far percepire una libreria personale non approvata.
4. **Estensione additiva di `static-section-presets.json`**: ogni preset guadagna `tags: string[]`,
   `category` (enum chiuso `hero | feature-grid | cta | altro` — **mai** `pagina-intera`) e
   `thumbnail` (asset SVG statico bundlato, non upload). `TemplateLibraryModal.tsx` resta sulla
   **stessa tab singola** "Sezioni Predefinite" fissata da ADR-34 § 5: chip di filtro categoria e
   campo ricerca filtrano client-side l'array `PRESETS` già in memoria, nessuna seconda tab.
5. **Nessuna categoria "Pagine Intere".** Collide con un concetto di dominio (`docs/glossary.md`,
   Template a livello Pagina) mai costruito e con due decisioni umane ancora aperte altrove
   (`RFC-F06-template-sezioni.md`, "Decisione umana" in bianco di `RFC-40` Opzione B citata da
   `RFC-43`). Resta fuori scope finché quelle due decisioni non sono chiuse per iscritto.
6. **Zero incremento di `v`, zero migrazione, zero invalidazione cache pubblica (ADR-23):** import
   ed export producono solo nodi di tipi/versioni già registrati; un file importato che referenzia
   un tipo/`kind` non registrato è respinto per intero da (2), mai persistito.

## Alternative scartate

- **Azione store dedicata `insertTemplateTreeAction`** — duplicherebbe il punto unico di
  rigenerazione UUID/inserimento invertibile che ADR-34 § 2 dichiara di voler evitare
  permanentemente; `insertSubtreeAction` fa già esattamente questo.
- **Validare l'import solo lato server, nessun controllo client** — un file profondo 10 livelli
  arriverebbe fino al salvataggio prima di fallire: peggiore UX, nessun guadagno di sicurezza
  (l'autorità resta comunque server-side in entrambi i casi).
- **Categoria "Pagine Intere" ora, anche come Opzione C** — richiede prima la chiusura di due
  processi di decisione già aperti e non creati da questa ADR (RFC-F06, RFC-40 § Decisione
  umana); costruirci sopra ora violerebbe il divieto di fondare una feature su decisioni aperte
  bloccanti.
- **Voce "Pagine Intere" disabilitata/"prossimamente" nel modale** — `CLAUDE.md` vieta
  placeholder/TODO non pianificati.
- **Import/porting di `block-tree-validator.service.ts` lato client** — violerebbe il confine di
  ruolo Frontend Developer (mai server-side) e duplicherebbe la fonte di verità della validazione;
  già scartata da ADR-34 § 3 per lo stesso motivo, vale identicamente qui.

## Conseguenza

Nessuna dipendenza npm nuova, nessuna migrazione DB, nessun endpoint nuovo, nessun aggiornamento
OpenAPI, nessuna modifica allo schema blocchi (ADR-21). L'import di JSON arbitrario è una
superficie nuova rispetto ad ADR-34 (fonte non curata, non più solo il file statico bundlato a
build-time): mitigata dalla validazione euristica anticipata di (2), mentre la sanitizzazione
rich-text (ADR-20/21) resta invariata lato server al salvataggio — l'import non la bypassa e non
la sostituisce. `static-section-presets.json` resta manutenuto a mano: un preset con `category`
fuori dall'enum chiuso o con tipo/prop non più nel registro fallisce solo al salvataggio
server-side (stesso rischio residuo già accettato da ADR-34, invariato da questa estensione). Un
sesto valore di `category`, e in particolare "Pagina intera", richiede una nuova ADR — non è
coperto da un aggiornamento additivo dei dati.

## Conformità

Test Engineer verifica: `template-io.utils.test.ts` copre round-trip export→import, rigetto di
JSON malformato/profondità `> CONTENT_TREE_LIMITS.maxDepth`/nodi oltre `maxNodes`/tipo non
registrato, rigenerazione GUID (nessun id importato sopravvive), inserimento in un solo step
Undo/Redo. Nessun test verifica una categoria `pagina-intera` nell'enum `SectionPreset.category`
— la sua sola presenza nei tipi è una regressione di questa ADR.
