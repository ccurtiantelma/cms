# ADR-27 — Lettura pubblica dei media (risoluzione di `mediaRef`)

## Status
[ ] In discussione · [x] **Approvata** · [ ] Rifiutata · [ ] Superseded da ADR-XXX

## Data approvazione
2026-08-20

---

## Decisione

1. **Una rotta anonima, per `guid`, di sola lettura.**
   `GET api/v1/public/media/:guid` — prefisso `public/` perché è la superficie che il
   middleware JWT già esclude e a cui si applica il rate limit pubblico. Risponde con il
   blob in streaming (stesso driver di storage di ADR-8, nessun secondo meccanismo), e
   **404 uniforme** per tutto il resto: `guid` inesistente, file soft-eliminato, tipo non
   ammesso. Mai `403`, mai un messaggio che distingua i casi — è la regola già in vigore
   sulla superficie pubblica (ADR-24 § 3).

2. **Non ogni file diventa pubblico perché è un'immagine.** `files` è uno storage documenti
   generico (ADR-8): vi finiscono anche allegati che non hanno nulla a che fare con il sito.
   Un criterio basato sul solo tipo renderebbe leggibile a chiunque abbia il `guid` un
   JPEG caricato come allegato privato. La rotta serve quindi **solo** le righe marcate come
   media editoriale sulla colonna `entity` già esistente (`entity = 'page-media'`, valorizzata
   all'upload dall'editor): opt-in esplicito, nessuna colonna nuova, nessuna migrazione.

3. **Il `Content-Type` viene dal contenuto reale, mai da ciò che il client ha dichiarato**
   (business rules § Media 5, `CLAUDE.md` § Security). I byte iniziali si confrontano con una
   tabella chiusa di firme e l'allowlist è **raster**: `image/jpeg`, `image/png`, `image/gif`,
   `image/webp`, `image/avif`. Nessuna corrispondenza → 404. La verifica sta **in lettura**,
   non solo all'upload: `files.mimeType` oggi conserva il valore dichiarato dal client
   (`files.service.ts`), quindi fidarsene lascerebbe aperta esattamente la strada che questa
   regola chiude — e le righe già caricate non sono riverificabili a posteriori in altro modo.
   Tabella di firme scritta in casa, nessuna dipendenza nuova: cinque formati sono cinque
   confronti di prefisso. La risposta porta sempre `X-Content-Type-Options: nosniff` e
   `Content-Disposition: inline`.

4. **SVG è rifiutato da questa rotta, senza eccezioni configurabili.** È contenuto attivo
   (business rules § Media 5): servito dall'origine del sito pubblico eseguirebbe script in
   quell'origine. Non è un rinvio implicito né una dimenticanza: il trattamento dell'SVG è la
   **voce 1.6 di `docs/TODO.md`** (pipeline di trasformazione media e trattamento SVG), che
   resta aperta e appartiene a F09. Finché quella decisione non esiste, un SVG caricato resta
   invisibile al pubblico — un upload accettato e mai servito, che è il modo di sbagliare che
   preferiamo.

5. **Nessuna cache Redis per i media, e nessuna TTL introdotta di straforo.** La cache di
   ADR-23 non cambia: la sua chiave contiene il payload pubblico della pagina, che porta il
   `mediaRef` (un `guid`), non i byte — quindi nessuna invalidazione nuova, nessun evento
   nuovo. La rotta media non scrive né legge Redis: streaming dallo storage, punto.
   Sul piano HTTP la risposta `200` porta `Cache-Control: public, max-age=31536000, immutable`,
   e **non** è la TTL che ADR-23 § 3 vieta: là il divieto nasce perché il contenuto sotto una
   chiave cambia mentre la chiave resta la stessa; qui il legame `guid` → byte è immutabile
   (lo `storageKey` è generato all'upload e nessuna operazione riscrive il blob di una riga
   esistente). Se un giorno esistesse un "sostituisci file" a parità di `guid`, questo
   paragrafo cadrebbe: quella funzione richiede una nuova firma proprio per questo.
   Nessun caching della `404`, coerente con "nessun negative caching" di ADR-23.

6. **Una sola risoluzione del `src`, identica in admin e sul sito pubblico.** Il componente
   `Image` di `components/blocks/` è condiviso fra `app/frontend` e `app/public-site` per
   alias di build (ADR-22): comporre l'URL dentro di lui con una costante letta in modo
   diverso nei due workspace significherebbe due risoluzioni che possono divergere. La
   composizione vive quindi in un solo modulo, e la base è una variabile d'ambiente
   **rivolta al browser** — `PUBLIC_MEDIA_BASE_URL`, esposta all'admin come
   `VITE_PUBLIC_MEDIA_BASE_URL` con lo stesso valore — distinta da `PUBLIC_API_BASE_URL`, che
   il sito pubblico usa server-side e che in produzione può essere un host di rete interna
   irraggiungibile da un `<img>`.

## Alternative scartate

- **Servire i media dal prefisso `app/` con JWT** — nel browser un `<img>` non porta l'header
  di autorizzazione: si finirebbe a URL firmati o a token in query string.
- **Servirli da `preview/`** — quella superficie è per la bozza (ADR-25), non per le risorse.
- **Fidarsi di `files.mimeType`** — è il valore dichiarato dal client all'upload: è la
  premessa sbagliata che la regola sul MIME reale esiste per rifiutare.
- **Allowlist aperta a `image/*`** — `image/svg+xml` rientra in `image/*`, ed è il caso che
  va escluso.
- **Sanificare l'SVG e servirlo** — è la voce 1.6, con la sua ADR: non si decide di sfuggita
  dentro una feature d'editor.
- **Un endpoint pubblico che elenca i media** — espone al mondo l'inventario delle risorse
  caricate, che non serve a nessun renderer.
- **Cache Redis dei byte** — duplica in memoria ciò che lo storage già serve, e introduce
  un'invalidazione che oggi non ha eventi.
- **Un `siteId`/scope sulle risorse** — A5 è mono-sito (`CLAUDE.md`), l'innesto è
  `Utils.applyScopeFilter` il giorno che servisse.

## Conseguenza

`mediaRef` smette di essere un placeholder: `Image` produce un `src` vero e il blocco immagine
diventa utilizzabile end-to-end. Nasce una terza rotta pubblica accanto a pagine e anteprima,
con la stessa regola d'errore e senza cache Redis. Il prezzo dichiarato del § 5 è che una risorsa
resa privata (soft delete del file) può restare nelle cache dei browser fino alla scadenza:
accettabile perché l'unico modo di ottenere l'URL è che il `guid` fosse già in una pagina
pubblicata, e il rimedio, quando servirà, è la protezione dalla cancellazione dei media
referenziati — che è di F09.

**Resta fuori, esplicitamente**: le varianti dimensionali generate in coda (business rules
§ Media 3), una libreria media in navigazione, cartelle e tag, i metadati editoriali del Media
(didascalia e crediti — l'`alt` vive già nel blocco, ADR-21 § 5), e la protezione da
cancellazione di un Media referenziato (business rules § Media 4). Sono F09, e questa ADR non
li anticipa: decide la sola lettura pubblica per `guid`, cioè il minimo che rende vero il
blocco `image` senza costruire la media library.
