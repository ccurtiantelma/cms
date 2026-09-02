# Roadmap — CMS

> Mappa dei 7 pilastri funzionali sulle feature di sviluppo, ordinate per dipendenze.
> Non è un impegno di date: è l'ordine in cui le cose possono essere costruite senza
> doverle rifare. Lo stato reale di avanzamento vive in `docs/ai/progress-tracker.md`.
>
> Ultima revisione: 2026-08-13.

---

## Principio di ordinamento

Ogni pilastro dipende dal modello di contenuto. Costruire l'editor visivo, il SEO o il
chatbot prima di aver fissato **come è fatta una Pagina** significa doverli riscrivere.
Da qui la sequenza: prima il dominio, poi la superficie pubblica, poi l'esperienza di
editing, poi i moduli che vi si appoggiano.

```
F01 Pagine ──┬── F02 Blocchi ──┬── F04 Editor visivo
             │                 └── F06 Sezioni globali e Template
             ├── F03 Superficie pubblica ──┬── F07 SEO
             │                             ├── F08 GEO
             │                             └── F11 Chatbot
             ├── F05 Multilingua
             ├── F09 Media editoriali
             ├── F10 Moduli di contatto
             └── F12 Dashboard editoriale
```

---

## Le feature

### F01 — Gestione Pagine (fondativa)

**Pilastro**: prerequisito di tutti · **Stato**: 📝 Feature redatta, spec in bozza

Modello dati della Pagina, stati e transizioni, slug e gerarchia, revisioni, CRUD
amministrativo sotto `app/pages`. Nessun editor visivo: il contenuto si salva come
albero JSON via API.

**Perché prima**: fissa l'entità centrale. Ogni altra feature vi si aggancia.
**Riferimenti**: `docs/ai/features/F01-gestione-pagine.md`, `docs/ai/specs/SPEC-F01-gestione-pagine.md`

---

### F02 — Registro e validazione dei Blocchi

**Pilastro**: 1 (editor visivo) · **Stato**: ⏳ Da avviare · **Dipende da**: F01

Registro dei tipi di blocco condiviso backend/frontend, schema di validazione per tipo,
regole di annidamento, sanitizzazione server-side del rich text, versionamento degli
schemi e migrazione dei contenuti esistenti.

**Richiede ADR**: formato e versionamento dello schema dei blocchi.

---

### F03 — Superficie pubblica di lettura

**Pilastro**: prerequisito di 2 e 7 · **Stato**: ⏳ Da avviare · **Dipende da**: F01, F02

Endpoint `api/v1/public/*`: risoluzione di una Pagina per `(locale, percorso)`, sola
lettura, solo `published`, rate limiting proprio, cache Redis con invalidazione per evento.

**Richiede ADR**: strategia di caching e invalidazione del contenuto pubblico.

**Decisione ratificata (2026-09-01)**: `docs/ai/rfc/RFC-44-static-site-export-engine.md` —
**Approvato** dal Project Owner (N1–N7 firmati). Il servizio pubblico si disaccoppia da
Node/Database con un motore di export statico (SSG) sopra la SSR a richiesta già costruita
(ADR-22/23/24), con `app/public-site` ridotto a server di sola anteprima per i redattori.
Decisione conseguente registrata in `docs/ai/adr/ADR-45-ssg-export-architecture.md`
(Approvata, riconcilia ADR-22 e ADR-23 in un'unica ADR, ADR-24 resta valida a tempo di
build). Implementazione (`StaticExportModule`, adapter locale, tombstone, media) da
pianificare.

---

### F04 — Editor visivo (page builder)

**Pilastro**: 1 · **Stato**: ⏳ Da avviare · **Dipende da**: F02

Canvas di editing, albero dei blocchi, pannello proprietà, drag & drop, anteprima
responsive, salvataggio con controllo ottimistico, error boundary per singolo blocco,
presenza di altri editor via Socket.io.

**Richiede ADR**: eventuale libreria drag & drop (vincolo Mantine v7 esclusivo).
**Rischio principale**: è la feature con il maggior potenziale di over-engineering.
Va costruita per incrementi, partendo da un set minimo di blocchi.

**Decisione aperta**: `docs/ai/rfc/RFC-45-wysiwyg-canvas-editing.md` — se estendere la
formattazione ricca (Grassetto/Corsivo/Link) del Canvas a `heading`/`button`, oggi
`plainText` per ADR-21 § 5. L'editing in-place di base (digitazione diretta nel Canvas,
sync debounced, toolbar fluttuante su `richText`) è già costruito — vedi
`docs/ai/progress-tracker.md` (voce F04) per lo stato reale, non riportato qui.

---

### F05 — Multilingua

**Pilastro**: 4 · **Stato**: ⏳ Da avviare · **Dipende da**: F01

Locale attivi, lingua di default, gruppi di traduzione, creazione di una traduzione da
Pagina esistente, `hreflang`, menu per lingua.

**Richiede ADR**: modello multilingua (righe autonome vs. campi affiancati).
**Perché presto**: aggiungere le lingue dopo aver popolato il sito costringe a
migrare contenuti già pubblicati.

---

### F06 — Template e Sezioni globali

**Pilastro**: 1 · **Stato**: ⏳ Da avviare · **Dipende da**: F02

Template come punto di partenza copiato; Sezioni globali come riferimento condiviso, con
invalidazione a cascata della cache delle Pagine che le usano.

---

### F07 — SEO per pagina

**Pilastro**: 2 · **Stato**: ⏳ Da avviare · **Dipende da**: F03, F05

Metadati per Pagina, canonical, `robots`, Open Graph, JSON-LD, sitemap XML con
`hreflang`, `robots.txt`, redirect e compattazione delle catene, checklist consultiva
in editor.

---

### F08 — GEO per pagina

**Pilastro**: 2 · **Stato**: ⏳ Da avviare · **Dipende da**: F07

`aiSummary`, `keyFacts`, `faq` (con JSON-LD `FAQPage`), `entities`, `aiPolicy`,
generazione di `llms.txt`, direttive per crawler AI.

> **Confermata** (assunzione A1, 2026-08-13): GEO = *Generative Engine Optimization*.
> L'obiettivo è la visibilità del contenuto presso i motori di risposta AI, affiancata —
> non sostituita — alla SEO tradizionale di F07. Le due feature condividono lo stesso
> blocco di metadati sulla Pagina e vanno progettate insieme.

---

### F09 — Media editoriali

**Pilastro**: 6 · **Stato**: ⏳ Da avviare · **Dipende da**: F02

Metadati editoriali sopra il `FilesModule` esistente (alt, didascalia, crediti),
libreria media navigabile, varianti dimensionali asincrone, protezione dei media
referenziati, verifica MIME reale.

**Richiede ADR**: pipeline di trasformazione media e trattamento SVG.

---

### F10 — Moduli di contatto

**Pilastro**: 3 · **Stato**: ⏳ Da avviare · **Dipende da**: F02, F03

Definizione dei campi, blocco form, validazione server-side, persistenza degli Invii
prima della notifica, notifiche via coda BullMQ, anti-spam (rate limit + honeypot +
marca temporale), consultazione ed export degli Invii.

**Decisione aperta (2026-09-01)**: `docs/ai/rfc/RFC-46-dynamic-form-builder.md` — in
discussione. Propone tre nuovi tipi di blocco (`form`/`form-field`/`form-submit`, ADR-21 §
5 aveva già nominato "il blocco form è di F10"), destinatari/notifica in `app_settings`
anziché in una nuova tabella "Modulo", `form_submissions` come unica tabella nuova,
endpoint pubblico disaccoppiato compatibile con l'export statico di ADR-45 (CORS scoped
alla sola rotta, honeypot a nome derivato + firma HMAC in luogo di CSRF/sessione). Segnala
un conflitto non risolto in autonomia: la "marca temporale minima di compilazione" delle
business rules presuppone un render per-visita che una pagina esportata staticamente non
ha (ADR-22 § Conseguenza, "il sito pubblico non ha JavaScript" — il form è la prima
"isola" che quella nota anticipava) — tre opzioni proposte, nessuna scelta senza firma
umana.

---

### F11 — Chatbot integrato

**Pilastro**: 7 · **Stato**: ⏳ Da avviare · **Dipende da**: F03, F08

Base di conoscenza costruita dalle sole Pagine pubblicate (riusando `keyFacts` e `faq`),
endpoint pubblico con rate limiting, chiavi e prompt di sistema solo server-side, difese
contro prompt injection.

**Richiede ADR**: scelta del provider, costi, trattamento e ritenzione dei dati
conversazionali. Resta opt-in e disattivato di default.

---

### F12 — Dashboard editoriale

**Pilastro**: 5 · **Stato**: ⏳ Da avviare · **Dipende da**: F01, F10

Estensione della dashboard esistente al dominio: contenuti in bozza e in revisione,
pubblicazioni programmate, ultimi Invii ricevuti, media senza testo alternativo,
redirect rotti, Pagine senza metadati SEO.

**Perché in fondo**: una dashboard è una vista su dati che devono esistere prima.

---

## Fuori scope dichiarato

Elementi volutamente **non** previsti, per non ereditare i problemi del modello WordPress:

| Elemento | Perché no |
|---|---|
| Plugin di terze parti caricati a runtime | Esecuzione di codice arbitrario: il rischio di sicurezza è strutturale, non mitigabile |
| Template engine con espressioni valutate a runtime | Stessa ragione: nessuna esecuzione di codice fornito dall'utente |
| Editing collaborativo carattere-per-carattere (CRDT/OT) | Over-engineering per l'MVP; il controllo ottimistico con `409` copre il caso reale |
| Multi-sito nella stessa installazione | Assunzione A5. Se cambierà, `scopeId` è già l'aggancio pronto |
| E-commerce, membership, commenti | Domini a sé, fuori dall'identità "CMS a pagine" |
| Generazione automatica di contenuto via LLM | Richiede ADR su costi e trattamento dati prima di qualsiasi implementazione |
