# RFC-F09 — Media Library e gestione integrata degli asset immagine

## Status
[ ] In discussione · [x] Approvato (parziale — N1/N3/N5/N7) → genera ADR-35 · [ ] Rifiutato

## Proposto da
AI Solution Architect · Data: 2026-08-25

---

## ⚠️ Nota di numerazione — da sciogliere prima dell'approvazione

Questo documento è stato richiesto con la sigla **F05**, ma `docs/roadmap.md` assegna:

| Sigla | Feature secondo `docs/roadmap.md` |
|---|---|
| **F05** | **Multilingua** (righe 24, 84) |
| **F09** | **Media editoriali** — *"metadati editoriali sopra il `FilesModule` esistente (alt, didascalia, crediti), libreria media navigabile, varianti dimensionali asincrone, protezione dei media referenziati, verifica MIME reale"* (righe 25, 130-138) |

Il contenuto di questa RFC è, senza ambiguità, **F09**. La sigla F09 è già citata come
riferimento nel codice sorgente (`PropertyInspector.tsx`, ramo `kind: 'mediaRef'`:
*"Nessuna scorciatoia che finga una libreria media: F09 non è costruita"*) e in
`ADR-27 § 4` (*"il trattamento dell'SVG … appartiene a F09"*).

**Decisione richiesta all'umano**: rinominare questa RFC in `RFC-F09-media-library.md`
(raccomandato — allinea documento, roadmap e codice) oppure rinumerare la roadmap.
Nessuna delle due è una scelta che un ruolo AI possa auto-approvare
(`CLAUDE.md` § Ask first). Finché non è sciolta, i riferimenti incrociati nel codice
useranno **F09**, che è la sigla già presente nei sorgenti.

---

## Problema

Il blocco `image` (ADR-21, cinque tipi approvati) dichiara la prop `mediaRef` di
`kind: 'mediaRef'`: un `guid` di 16 esadecimali che punta a una riga di `files`.
Oggi quel campo **non è compilabile dall'editor**. `PropertyInspector.tsx` lo rende come
un `TextInput` esplicitamente `disabled`, con il placeholder *"Libreria media non
disponibile"*: una scelta deliberata, perché un campo libero inviterebbe a incollare un
riferimento che il server rifiuta.

La conseguenza pratica è che **un blocco `image` non è oggi inseribile in una pagina
pubblicabile**: `mediaRef` è `required`, quindi la validazione dell'albero server-side
rifiuta con `400` qualunque `image` priva di riferimento. Il pilastro editoriale del CMS
ha un tipo di blocco approvato, implementato, renderizzato — e inutilizzabile.

Tre lacune concrete separano lo stato attuale da un blocco `image` usabile:

1. **Nessun endpoint di elenco.** `FilesController` (`api/v1/app/files`) espone
   `POST` (upload), `GET :guid` (download in streaming) e `DELETE :guid` (soft-delete).
   **Non esiste un `GET` paginato**: nulla può enumerare i file caricati, quindi nessuna
   UI può proporre una scelta.
2. **Nessuna superficie di selezione.** Non esiste in `app/frontend` un componente che
   mostri i media disponibili e restituisca il `guid` scelto.
3. **Nessun metadato dimensionale.** La tabella `files` non conserva larghezza e altezza
   dell'immagine. Sono richiesti dalla UI (miniature senza salto di layout) e sono il
   prerequisito delle varianti dimensionali che la roadmap assegna a questa feature.

---

## Soluzione proposta

### 1. Superficie API — estendere `FilesModule`, non affiancarlo

La richiesta iniziale parlava di due rotte, `/files` e `/files/upload`. **Si propone di
non introdurre `/files/upload`**: l'upload esiste già come `POST api/v1/app/files` ed è
in servizio (usato dallo storage documenti di ADR-8). Una seconda rotta con la stessa
semantica sarebbe un doppione da mantenere allineato, con due punti di applicazione
della validazione MIME e del limite di dimensione.

Superficie risultante — **una sola rotta nuova**, il resto già esistente:

| Metodo | Percorso | Stato | Note |
|---|---|---|---|
| `GET` | `api/v1/app/files` | 🆕 **da costruire** | Elenco paginato, ricerca, filtro |
| `POST` | `api/v1/app/files` | ✅ esistente | Upload multipart, campo `file` |
| `GET` | `api/v1/app/files/:guid` | ✅ esistente | Download in streaming (allegato) |
| `GET` | `api/v1/app/files/:guid/metadata` | 🆕 **da costruire** | Ispezione metadati, nessun blob |
| `DELETE` | `api/v1/app/files/:guid` | ✅ esistente | Soft-delete, autore o Admin+ |
| `GET` | `api/v1/public/media/:guid` | ✅ esistente | Lettura pubblica anonima (ADR-27) |

#### `GET api/v1/app/files` — elenco paginato

Paginazione standard del progetto (`CLAUDE.md` § Superfici API): `?p=&i=&q=&o=&d=`,
risposta `Pagination<FileMetadataDto>`. Due filtri aggiuntivi:

- `entity` — filtra per dominio di appartenenza. La Media Library dell'editor passa
  sempre `entity=page-media`, il marcatore di opt-in editoriale già definito da
  **ADR-27 § 2**. Senza questo filtro la libreria mostrerebbe anche gli allegati privati
  dello storage documenti generico: esattamente ciò che ADR-27 § 2 impedisce sulla
  superficie pubblica, che non va riaperto su quella admin.
- `mimePrefix` — filtro di prefisso, es. `image/`. La libreria dell'editor lo usa per
  non offrire un PDF dove serve un'immagine.

`q` cerca su `originalName` (`ILIKE %q%`). Ordinamento di default `createdAt DESC`.

**Ownership.** ADR-18 regola l'ownership per riga sulle Pagine. I media editoriali sono
una risorsa condivisa — un'immagine caricata da un autore deve essere riutilizzabile da
un altro, altrimenti la libreria produce duplicati a ogni autore. **Si propone quindi:
elenco leggibile da ogni ruolo autenticato, senza predicato di ownership**, mentre la
cancellazione resta quella già in vigore (autore o Admin+, `files.service.ts`). È una
decisione che va firmata esplicitamente, perché è una deroga consapevole al riflesso
"ownership ovunque" di ADR-18.

#### `GET api/v1/app/files/:guid/metadata` — ispezione

Ritorna `FileMetadataDto` senza toccare lo storage. Serve alla `PropertyInspector` per
mostrare nome e anteprima del media già referenziato da un blocco salvato, senza
scaricare il blob e senza enumerare l'intera libreria. `404` se inesistente o
soft-eliminato.

Il suffisso `/metadata` è necessario: `GET :guid` è già occupato dal download in
streaming, e cambiarne la semantica romperebbe lo storage documenti esistente.

### 2. DTO del file

La richiesta iniziale nominava i campi `id`, `url`, `filename`, `mimeType`, `size`,
`dimensions`, `createdAt`. Tre di questi nomi confliggono con vincoli in vigore. La
proposta li mappa invece di rinominare ciò che esiste:

| Campo richiesto | Campo proposto | Motivo |
|---|---|---|
| `id` | **`guid`** | `CLAUDE.md` § Divieti assoluti: *"`id` numerico in URL (solo `guid`/`slug`)"*. `FileMetadataDto` espone già `guid` e mai `id`. |
| `url` | **`url`** (derivato) | ✅ nome mantenuto, ma **non è una colonna**: è composto server-side come `api/v1/public/media/:guid` (ADR-27 § 1). Valorizzato solo per i media raster serviti pubblicamente; `null` altrimenti. |
| `filename` | **`originalName`** | Nome già in schema e in `FileMetadataDto`. Rinominarlo è un breaking change del contratto dello storage documenti, senza guadagno. |
| `mimeType` | **`mimeType`** | ✅ già presente. |
| `size` | **`sizeBytes`** | ✅ già presente; il suffisso dichiara l'unità, che `size` da solo non fa. |
| `dimensions` | **`width` / `height`** | Due interi nullable invece di un oggetto annidato: indicizzabili, filtrabili, e privi del caso "oggetto presente con campi vuoti". ⚠️ **richiede migrazione**, vedi § 3. |
| `createdAt` | **`createdAt`** | ✅ già presente. |

`FileMetadataDto` conserva inoltre `entity` / `entityId` già esposti. Restano **mai
esposti** `storageKey` e `checksumSha256`, dettagli interni del driver (ADR-8).

```
FileMetadataDto {
  guid:         string        // 16 hex, identificatore pubblico
  originalName: string        // solo display, mai path fisico
  mimeType:     string        // dichiarato dal client all'upload
  sizeBytes:    number
  width:        number | null // 🆕 solo immagini raster riconosciute
  height:       number | null // 🆕 solo immagini raster riconosciute
  url:          string | null // 🆕 derivato: api/v1/public/media/:guid se entity='page-media'
  entity:       string | null
  entityId:     string | null
  createdAt:    Date
}
```

### 3. Metadati dimensionali — l'unico punto che tocca il DB

`width` e `height` non esistono in `files`. Servono due colonne nullable:

```
width  integer  -- null per non-immagini e per le righe caricate prima di questa feature
height integer
```

Nullable **non** per comodità: le righe già caricate non hanno queste informazioni e non
sono ricalcolabili senza rileggere ogni blob dallo storage. Un default `0` mentirebbe;
`null` dice "non misurato", che è il fatto vero.

L'estrazione avviene all'upload, dagli **header** del file (non decodificando l'immagine
intera): le firme raster già riconosciute da `raster-mime-sniffer.ts` portano le
dimensioni a offset fissi per PNG, GIF, JPEG (SOF), WebP e AVIF. Si propone di estendere
quel modulo con `readRasterDimensions(buffer)` — **nessuna dipendenza nuova**, coerente
con la scelta già presa in ADR-27 § 3 di scrivere in casa la tabella delle firme.

> ⚠️ **Bloccante.** `CLAUDE.md` § Ask first e § Divieti assoluti: schema DB e migrazioni
> richiedono approvazione umana esplicita. Nessun task di implementazione tocca
> `app/backend/src/db/schema.ts` prima della firma su questa RFC.

**Se l'approvazione delle colonne fosse negata**, la feature resta costruibile: la UI
degrada su miniature a proporzione fissa (`aspect-ratio: 4/3`, `object-fit: cover`) e le
varianti dimensionali della roadmap restano fuori scope. Il degrado è progettato, non
subito — vedi PLAN, T1 e T4.

### 4. Verifica MIME all'upload

ADR-27 § 3 verifica la firma raster **in lettura**, perché `files.mimeType` conserva il
valore dichiarato dal client. Si propone di verificarla **anche in scrittura** quando
`entity = 'page-media'`: un upload che non corrisponde a nessuna firma raster viene
rifiutato con `400` invece di essere accettato e reso poi invisibile al pubblico.

Questo **non sostituisce** il controllo in lettura di ADR-27 § 3, che resta necessario
per le righe caricate prima di questa feature. Sono due controlli sullo stesso invariante
in due momenti diversi, entrambi voluti.

SVG resta rifiutato senza eccezioni (ADR-27 § 4): la sua pipeline è la voce 1.6 di
`docs/TODO.md` e **non viene sciolta qui**.

### 5. Superficie frontend

`app/frontend/src/components/media/MediaLibraryModal.tsx` — modal Mantine di selezione,
riusabile ovunque serva un media, non solo nell'editor. Tre zone: drop zone con
anteprima, griglia di miniature paginata con ricerca, azione di conferma.

**Drop zone senza `@mantine/dropzone`.** Il pacchetto non è installato e una dipendenza
nuova richiede approvazione umana (`CLAUDE.md` § Ask first). Il drag-and-drop di file è
un'API nativa del browser (`dragover`/`drop`/`DataTransfer`): quattro handler, nessun
pacchetto. La regola Mantine non è violata — riguarda i *componenti* di UI (che qui sono
`Modal`, `TextInput`, `SimpleGrid`, `Button`, `Pagination`), non gli eventi DOM.

**Integrazione con l'ispettore.** Il ramo `kind: 'mediaRef'` di `PropertyInspector.tsx`
smette di essere `disabled` e affianca al campo un pulsante "Sfoglia Media Library".
Alla conferma, il `guid` selezionato viene scritto con `updateBlockPropsAction`, la
stessa azione usata da ogni altro `kind` — quindi undo/redo, dirty-tracking e
`treeGeneration` funzionano senza codice dedicato.

> ⚠️ **La prop scritta è `mediaRef`, non `url`.** La richiesta iniziale parlava di
> aggiornare *"la prop `url` dell'AST JSON"*: il blocco `image` non ha una prop `url`.
> Ha `mediaRef` (`kind: 'mediaRef'`, `required: true`) e conserva un `guid`, mai un URL —
> `resolveMediaSrc()` compone l'URL in fase di rendering, in un solo punto condiviso fra
> `app/frontend` e `app/public-site` (ADR-27 § 6). Introdurre una prop `url` sul blocco
> `image` significherebbe **modificare lo schema di un blocco esistente**, che richiede
> una nuova firma (ADR-21) e romperebbe l'invariante di ADR-27 § 6. Non è proposto.

L'ispettore resta **un solo componente per tutti i tipi di blocco**, indicizzato per
`kind` e mai per `type`: il pulsante compare su ogni prop `kind: 'mediaRef'`, presente
o futura, senza che il file sappia che esiste un blocco `image`.

---

## Alternative valutate

**Campo di testo libero per il `guid`, senza libreria.** Un `TextInput` abilitato dove
incollare a mano il riferimento. Scartata: nessuno conosce a memoria un `guid` di 16
esadecimali, e il campo produrrebbe solo `400` a catena. È la ragione per cui il campo
è oggi `disabled` invece che libero — la scelta attuale è già l'esito di questo confronto.

**Upload inline nel blocco, senza libreria.** Trascinare il file direttamente sul blocco
`image` nel canvas. Scartata come *unica* via: rende impossibile riusare un'immagine già
caricata, quindi ogni uso della stessa immagine è un blob nuovo in storage. Resta una
possibile aggiunta futura sopra la libreria, non un suo sostituto.

**URL esterni come alternativa a `mediaRef`.** Consentire al blocco `image` di puntare a
un `https://` di terze parti. Scartata: aggiunge una prop al blocco (nuova firma ADR-21),
espone il sito pubblico a hotlink che si rompono, e apre una superficie SSRF sul renderer.

**`GET api/v1/app/files` con predicato di ownership per riga.** Ogni autore vede solo i
propri media. Scartata: i media editoriali sono materiale condiviso di un sito
mono-tenant (A5), e l'ownership produrrebbe un duplicato dello stesso logo per ogni
autore. La cancellazione resta invece protetta da ownership, dove ha senso.

**Oggetto `dimensions: { width, height }` nel DTO.** Come da richiesta iniziale.
Scartata a favore di due colonne piatte: annidare un oggetto in un DTO per due interi
introduce lo stato ambiguo "oggetto presente, campi nulli" e non è indicizzabile a DB.

**Libreria di image processing (`sharp`, `image-size`) per le dimensioni.** Scartata:
dipendenza nuova (approvazione umana) e `sharp` porta binari nativi che complicano il
`Dockerfile`. Gli header raster bastano, e la tabella delle firme è già in casa (ADR-27 § 3).

**Rotta `POST api/v1/app/files/upload` dedicata.** Come da richiesta iniziale. Scartata:
duplica `POST api/v1/app/files` già in servizio, con due punti di applicazione dello
stesso limite di dimensione e della stessa validazione MIME.

---

## Impatto

**Backend.** Un metodo di elenco e uno di metadata in `FilesService`, due rotte in
`FilesController`, un `ListFilesDto` di query. Due colonne su `files` (⚠️ approvazione).
Estensione di `raster-mime-sniffer.ts` con la lettura delle dimensioni. Un `index` su
`files(entity, created_at DESC)` per l'ordinamento di default dell'elenco.

**Frontend.** Una cartella nuova `components/media/`, un service `media.service.ts`, un
file di tipi `media.types.ts`. Un ramo modificato in `PropertyInspector.tsx`. Nessun
impatto sui componenti di blocco (`components/blocks/`), che continuano a ricevere un
`mediaRef` e a risolverlo con `resolveMediaSrc()`.

**Contratti.** `npm run openapi:export` + `openapi:types` dopo le rotte nuove.
Nessun rigenerato di `blocks:types`: **il registro dei blocchi non cambia**.

**Sito pubblico.** Nessun impatto. `app/public-site` legge `mediaRef` e chiama la rotta
pubblica di ADR-27, entrambe invariate.

**Decisioni aperte.** Questa RFC **non** scioglie: il trattamento dell'SVG né la pipeline
di trasformazione media (voce 1.6 di `docs/TODO.md`, esplicitamente fuori scope), né la
potatura delle revisioni (ADR-19), né A6.

---

## Rischi

| Rischio | Probabilità | Impatto | Mitigazione |
|---|---|---|---|
| Le colonne `width`/`height` non vengono approvate | Media | Basso | Degrado progettato: miniature ad `aspect-ratio` fisso, varianti dimensionali fuori scope. La feature resta utilizzabile. |
| Media referenziato da una pagina pubblicata viene soft-eliminato | Media | **Alto** | Non risolto qui. Il `DELETE` esistente non sa nulla dei blocchi che puntano al file: il blocco continua a puntare a un `guid` che la rotta pubblica serve con `404`, quindi immagine rotta in produzione. La *"protezione dei media referenziati"* è nominata dalla roadmap per questa feature ma **richiede una decisione a sé** (rifiuto con `409` vs. cancellazione consentita con avviso): va aperta come voce separata, non decisa di straforo qui. |
| L'elenco senza ownership espone allegati privati | Bassa | Alto | Il filtro `entity=page-media` è applicato dal client, quindi non è una garanzia. **Mitigazione richiesta**: il default della rotta deve escludere le righe con `entity` non editoriale per i ruoli non-Admin, non affidarsi al parametro. Da fissare in fase di implementazione (PLAN T1). |
| Griglia lenta con molte immagini | Bassa | Medio | Paginazione server-side (pagina di default di `usePaginatedList`, 20 elementi) e `loading="lazy"` sulle miniature. Nessuna miniatura ridimensionata: si serve il blob originale, accettabile finché non esistono le varianti dimensionali. |
| Doppio upload dello stesso file | Alta | Basso | `checksumSha256` è già calcolato e salvato all'upload, ma non è vincolato: la deduplica è possibile in futuro senza migrazione. Non implementata ora. |
| La sigla F05/F09 resta ambigua | Alta | Medio | Sciolta dalla decisione umana in testa a questo documento, prima di qualunque implementazione. |

---

## Decisione umana

**Esito**: [ ] Approvato · [ ] Rifiutato · [x] Modificato (approvazione parziale)

**Punti che richiedono una firma esplicita, singolarmente:**

- [x] **N1** — Numerazione: `F05` → **`F09`** (raccomandato) o rinumerazione della roadmap
- [ ] **N2** — Migrazione `files`: colonne `width` / `height` nullable + indice `(entity, created_at)` — **non firmata, fuori scope di questo giro**
- [x] **N3** — Elenco `GET app/files` **senza** predicato di ownership (deroga consapevole al riflesso di ADR-18)
- [ ] **N4** — Verifica firma raster **in scrittura** per `entity = 'page-media'` (`400` all'upload) — **non firmata, fuori scope di questo giro**
- [x] **N5** — Rinuncia alla rotta `/files/upload` a favore del `POST api/v1/app/files` esistente
- [ ] **N6** — Conferma che la prop del blocco `image` resta **`mediaRef`** (nessuna prop `url`, nessuna modifica al registro) — **non toccata da questo giro, nessuna modifica al blocco `image` implementata**
- [x] **N7** — Protezione dei media referenziati: **risolta come rifiuto `409 Conflict`** su `DELETE` di un file referenziato da un blocco `mediaRef` di una pagina `published` (non la cancellazione-con-avviso, l'altra opzione valutata dalla RFC)

**Note**: Approvazione parziale — solo i punti necessari a `GET api/v1/app/files` (elenco) e
alla protezione referenziale su `DELETE`. Le colonne dimensionali (N2/N4) e l'integrazione
frontend (T3–T6 del Plan) restano fuori da questo giro e vanno firmate a parte quando
affrontate.

**Approvato da**: marketing@antelmagroup.net · **Data**: 2026-08-25

**Azione successiva**: [x] Genera ADR-35 · [ ] Archivio
