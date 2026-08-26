# Plan — F09 Media Library e gestione integrata degli asset immagine

## Spec di riferimento
`docs/ai/rfc/RFC-F09-media-library.md` (approvata parzialmente il 2026-08-25 — N1/N3/N5/N7
firmati, N2/N4/N6 restano aperti e fuori scope di questo giro: nessuna colonna `width`/
`height`, nessuna verifica MIME in scrittura)

> ⚠️ **Numerazione — risolta.** `docs/roadmap.md` assegna F05 a *Multilingua* e **F09 a
> *Media editoriali***. Il contenuto di questo piano è F09. Rinominato da F05 a F09 il
> 2026-08-25 (firma **N1**), file e riferimenti incrociati allineati.

---

## Audit strategico

### Falle logiche / Contraddizioni rilevate

- **Dove**: richiesta iniziale, "prop `url` dell'AST JSON"
  **Problema**: il blocco `image` non ha una prop `url`. Ha `mediaRef` (`kind: 'mediaRef'`,
  `required: true`), che conserva un `guid` — l'URL è composto in rendering da
  `resolveMediaSrc()`, unico punto condiviso fra admin e sito pubblico (ADR-27 § 6).
  **Impatto**: implementare la richiesta alla lettera significherebbe modificare lo schema
  di un blocco approvato (nuova firma ADR-21) e duplicare la composizione dell'URL,
  scavalcando ADR-27 § 6. **Risolto**: si scrive `mediaRef`. Firma **N6**.

- **Dove**: richiesta iniziale, DTO `id` e rotta `/files/upload`
  **Problema**: `id` numerico in URL è un divieto assoluto (`CLAUDE.md`); `POST
  api/v1/app/files` esiste già ed è in servizio.
  **Impatto**: un `id` esposto violerebbe il divieto; `/files/upload` sarebbe un doppione
  con due punti di applicazione dello stesso limite di dimensione. **Risolto**: `guid`, e
  nessuna rotta di upload nuova. Firma **N5**.

- **Dove**: `docs/roadmap.md` § F09, *"protezione dei media referenziati"*
  **Problema**: il `DELETE api/v1/app/files/:guid` esistente non sa nulla dei blocchi che
  puntano al file. Un media soft-eliminato mentre una pagina pubblicata lo referenzia
  produce un'immagine rotta in produzione, senza alcun avviso.
  **Impatto**: difetto reale e già presente, che questa feature **rende più probabile**
  (dà per la prima volta una UI per cancellare media). **Non risolto qui**: la scelta fra
  `409` di rifiuto e cancellazione con avviso è una decisione a sé. Firma **N7**.

- **Dove**: RFC § 1, filtro `entity=page-media` sull'elenco
  **Problema**: un filtro passato dal client non è un controllo di sicurezza. `files` è
  storage documenti generico (ADR-8): vi finiscono allegati privati.
  **Impatto**: un chiamante che omette il parametro enumera nomi di allegati che non
  dovrebbe vedere. **Risolto in T1**: l'esclusione è il *default server-side*, non il
  parametro.

### Rischi architetturali / Over-engineering

- **Componente**: varianti dimensionali asincrone (job BullMQ di resize, nominate dalla
  roadmap § F09).
  **Rimedio**: **fuori scope**. Sono utili solo quando esiste contenuto in volume e una
  metrica che dica che le immagini pesano. Costruirle ora significa un processore, una
  coda, una tabella di varianti e una strategia di invalidazione al servizio di zero
  immagini. Si serve il blob originale con `loading="lazy"`; le colonne `width`/`height`
  di T1 sono il prerequisito che le rende aggiungibili dopo, senza migrazione ulteriore.

- **Componente**: deduplica per `checksumSha256`.
  **Rimedio**: fuori scope. Il checksum è **già calcolato e salvato** da
  `files.service.ts`: la deduplica resta aggiungibile in qualsiasi momento senza
  migrazione. Introdurre ora un vincolo di unicità significherebbe decidere il
  comportamento del secondo upload (errore? riuso silenzioso? nuovo `guid`, stesso blob?)
  senza un caso reale che la ponga.

- **Componente**: un inspector dedicato per il blocco `image`.
  **Rimedio**: vietato dall'invariante di `PropertyInspector.tsx` — un solo componente,
  mappa indicizzata per `kind` e mai per `type`. Il pulsante "Sfoglia" va sul ramo
  `kind: 'mediaRef'`, dove serve ogni prop mediaRef presente o futura.

- **Componente**: `@mantine/dropzone`.
  **Rimedio**: non installato, e una dipendenza nuova richiede approvazione
  (`CLAUDE.md` § Ask first). Il drag-and-drop di file è API nativa del browser:
  `dragover` / `dragleave` / `drop` su `DataTransfer.files`. Quattro handler.

---

## Roadmap di implementazione

Tre passi, nell'ordine dichiarato dalla richiesta. **Il passo 1 è prerequisito reale dei
passi 2 e 3**: senza `GET api/v1/app/files` la libreria non ha nulla da elencare.

```
Step 1 — Backend: upload, elenco, astrazione di storage   (T1, T2)   ⚠️ dipende da N2
   │      Il contratto che il frontend consuma. Nessuna UI funziona prima.
   ▼
Step 2 — Frontend: MediaLibraryModal                       (T3, T4)
   │      Selezione e upload. Costruibile in parallelo a Step 1 contro il
   │      contratto della RFC, ma verificabile end-to-end solo dopo.
   ▼
Step 3 — Integrazione blocchi Image / RichText             (T5, T6)
          Il punto in cui il blocco `image` diventa per la prima volta usabile.
```

---

## Task operativi (ordinati per dipendenze)

### T1 — Elenco paginato e metadati file (backend)
- **Output atteso**:
  `app/backend/src/files/dto/list-files.dto.ts` (nuovo) ·
  `app/backend/src/files/dto/file-metadata.dto.ts` (campi `width`/`height`/`url`) ·
  `app/backend/src/files/files.service.ts` (`list()`, `getMetadata()`) ·
  `app/backend/src/files/files.controller.ts` (`GET app/files`, `GET app/files/:guid/metadata`)
- **Dipendenze**: firma della RFC (**N3**, **N5** — firmate il 2026-08-25)
- **Criterio di Done**: `GET app/files?p=1&i=20&entity=page-media&mimePrefix=image/`
  restituisce `Pagination<FileMetadataDto>` ordinata `createdAt DESC`; le righe con
  `entity` non editoriale sono escluse **dal default server-side**, non dal parametro;
  `GET app/files/:guid/metadata` risponde `404` su riga inesistente o soft-eliminata e
  non tocca mai lo storage; `storageKey` e `checksumSha256` non compaiono in nessuna
  risposta; `npm run openapi:export` + `openapi:types` eseguiti.
- **Agente**: backend-developer

### T2 — Dimensioni raster all'upload e verifica in scrittura (backend)
- **Output atteso**:
  `app/backend/src/db/schema.ts` (⚠️ colonne `width`/`height` + indice `(entity, created_at)`) ·
  migrazione `drizzle-kit generate` ·
  `app/backend/src/files/public-media/raster-mime-sniffer.ts` (`readRasterDimensions`) ·
  `app/backend/src/files/files.service.ts` (popolamento all'upload, `400` su non-raster
  quando `entity = 'page-media'`)
- **Dipendenze**: T1 · **firma N2 e N4 — non firmate, task bloccato, fuori scope del giro 2026-08-25**
- **Criterio di Done**: un upload PNG/JPEG/GIF/WebP/AVIF con `entity=page-media` salva
  `width`/`height` corretti letti dai soli header (nessuna decodifica dell'immagine
  intera, nessuna dipendenza npm nuova); un upload non-raster con `entity=page-media`
  è rifiutato con `400`; un upload **senza** `entity=page-media` resta accettato come
  prima (lo storage documenti di ADR-8 non regredisce); le righe preesistenti restano
  valide con `width`/`height` a `null`.
- **Agente**: backend-developer

### T3 — `MediaLibraryModal` (frontend)
- **Output atteso**:
  `app/frontend/src/types/media.types.ts` ·
  `app/frontend/src/services/media.service.ts` ·
  `app/frontend/src/components/media/MediaLibraryModal.tsx` ·
  `app/frontend/src/components/media/MediaLibraryModal.module.css`
- **Dipendenze**: contratto di T1 (l'implementazione può procedere in parallelo)
- **Criterio di Done**: la modal mostra griglia paginata con ricerca per nome, drop zone
  nativa con anteprima pre-upload, e conferma che restituisce `FileRecord` completo al
  chiamante; nessun `@mantine/dropzone` e nessuna dipendenza nuova; ogni chiamata API in
  `try`/`catch` con `notifications.show`; la conferma è disabilitata finché nulla è
  selezionato; `entity: 'page-media'` è impostato su ogni upload fatto da questa modal.
- **Agente**: frontend-developer

### T4 — Degrado senza `width`/`height` (frontend)
- **Output atteso**: `MediaLibraryModal.module.css` (miniature ad `aspect-ratio` fisso)
- **Dipendenze**: T3
- **Criterio di Done**: la griglia non salta di layout né quando `width`/`height` sono
  valorizzati né quando sono `null` (righe preesistenti, o firma N2 negata); le miniature
  usano `loading="lazy"`.
- **Agente**: frontend-developer

### T5 — Integrazione in `PropertyInspector` (frontend)
- **Output atteso**: `app/frontend/src/pages/pages/editor/PropertyInspector.tsx`
  (ramo `case 'mediaRef'`)
- **Dipendenze**: T3
- **Criterio di Done**: il ramo `kind: 'mediaRef'` non è più `disabled` e affianca al
  campo un pulsante "Sfoglia Media Library"; la selezione scrive il `guid` via
  `updateBlockPropsAction`, quindi undo/redo e dirty-tracking funzionano senza codice
  dedicato; **la mappa resta indicizzata per `kind`** — nessun ramo per `type`, nessun
  `ImageInspector`; nessuna prop `url` introdotta sul blocco `image` (**N6**).
- **Agente**: frontend-developer

### T6 — Immagini in RichText
- **Output atteso**: nessuno — **task di chiusura, non di implementazione**
- **Dipendenze**: T5
- **Criterio di Done**: si prende atto che l'allowlist Tiptap
  (`RichTextFieldEditor.tiptap-allowlist.test.ts`) e il profilo di sanitizzazione
  server-side (ADR-20, ADR-21 § 4) **non ammettono `<img>` nel rich text**. Inserire
  un'immagine dentro `richText` richiede di estendere l'allowlist di sanitizzazione, che
  è una decisione di sicurezza da firmare (ADR-20), non un'aggiunta di UI. La strada
  supportata resta il blocco `image` accanto al blocco `richText`. Se l'immagine inline
  è davvero voluta, va aperta come RFC a sé.
- **Agente**: orchestrator (documentale)

### T7 — Suite di test
- **Output atteso**:
  `app/frontend/src/components/media/MediaLibraryModal.test.tsx` ·
  `app/frontend/src/pages/pages/editor/PropertyInspector.test.tsx` (casi `mediaRef`) ·
  `bruno/files/list-files.yml`, `bruno/files/file-metadata.yml` ·
  integration test Supertest su `GET app/files`
- **Dipendenze**: T1, T3, T5
- **Criterio di Done**: per ogni endpoint nuovo — happy path, un errore, un caso RBAC non
  autorizzato; la modal è coperta su griglia, ricerca, paginazione, upload via drop e
  conferma della selezione; la scrittura di `mediaRef` è verificata **sullo store
  Zustand**, non solo sul DOM; nessun `any` su mock o payload; nessun test placeholder.
- **Agente**: test-engineer

---

## Matrice dei rischi

| Rischio | Probabilità | Impatto | Mitigazione |
|---|---|---|---|
| Firma N2 negata (colonne `width`/`height`) | Media | Basso | T4 rende il degrado progettato: `aspect-ratio` fisso, varianti fuori scope. T2 decade, il resto no. |
| Media referenziato e poi soft-eliminato → immagine rotta in produzione | Media | **Alto** | **Non mitigato in questo piano.** Difetto preesistente che questa feature rende più raggiungibile. Firma **N7**: voce separata. |
| Elenco che espone allegati privati dello storage documenti | Bassa | Alto | Esclusione **server-side di default** (T1), mai affidata al parametro del client. |
| Deriva verso un `ImageInspector` dedicato | Media | Medio | Criterio di Done di T5 esplicito; il test di copertura dei `kind` in `PropertyInspector.test.tsx` fallisce se la mappa smette di essere indicizzata per `kind`. |
| Pressione ad aggiungere `@mantine/dropzone` | Media | Basso | Drag-and-drop nativo già scelto in T3; l'aggiunta resta possibile in futuro dietro approvazione, senza riscrivere la modal. |
| Pressione a introdurre `<img>` nel rich text | Media | **Alto** | T6 la ferma esplicitamente: tocca l'allowlist di sanitizzazione (ADR-20), quindi è sicurezza, non UI. |
| Griglia lenta con molte immagini | Bassa | Medio | Paginazione server-side (20/pagina, default di `usePaginatedList`) + `loading="lazy"`. |
| Sigla F05/F09 ambigua nei riferimenti incrociati | Alta | Medio | Sciolta da **N1** prima di qualunque implementazione. |

---

## Definition of Done — Checklist globale

### Prerequisiti di firma (bloccanti)
- [x] **N1** Numerazione F05 → F09 sciolta (2026-08-25)
- [ ] **N2** Migrazione `files` (`width`, `height`, indice) approvata — **non firmata, T2 resta bloccato**
- [x] **N3** Elenco senza ownership approvato (2026-08-25)
- [ ] **N4** Verifica firma raster in scrittura approvata — **non firmata, T2 resta bloccato**
- [x] **N5** Rinuncia a `/files/upload` approvata (2026-08-25)
- [ ] **N6** Prop del blocco `image` confermata come `mediaRef` — non toccata (T3/T5, fuori scope del giro 2026-08-25)
- [x] **N7** Protezione dei media referenziati: risolta come `409` su `DELETE` (2026-08-25)

### Implementazione
- [ ] Tutti i task implementati
- [ ] Nessun `any` TypeScript senza commento
- [ ] Nessun `console.log` rimasto
- [ ] Ogni funzione pubblica con JSDoc
- [ ] Nessuna dipendenza npm nuova
- [ ] `PropertyInspector` ancora indicizzato per `kind`, mai per `type`
- [ ] Registro dei blocchi **non** modificato (nessun `blocks:types` rigenerato)

### Test
- [ ] Unit test scritti e superati (Jest backend, Vitest frontend)
- [ ] Integration test Supertest per `GET app/files` e `GET app/files/:guid/metadata`
- [ ] Collezioni Bruno per ogni endpoint nuovo
- [ ] Mock per servizi esterni
- [ ] Nessun test placeholder

### Build e qualità
- [ ] `npm run build --workspace=app/backend` superata
- [ ] `npm run build --workspace=app/frontend` superata
- [ ] `npx tsc --noEmit` pulito su frontend
- [ ] Lint superato

### Contratti e documentazione
- [ ] `npm run openapi:export` eseguito
- [ ] `npm run openapi:types` eseguito
- [ ] `docs/ai/progress-tracker.md` aggiornato **su richiesta umana esplicita**

### Commit
- [ ] Commit atomico per task, Conventional Commits
- [ ] Branch `feature/F09-media-library` (o `F05`, secondo l'esito di **N1**)
