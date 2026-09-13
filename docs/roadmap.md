# Roadmap — CMS

> Mappa dei 7 pilastri funzionali sulle feature di sviluppo, ordinate per dipendenze.
> Non è un impegno di date: è l'ordine in cui le cose possono essere costruite senza
> doverle rifare. Lo stato reale di avanzamento vive in `docs/ai/progress-tracker.md`.
>
> Ultima revisione: 2026-09-13 — **F03 e F09 chiuse**, residuo di F07/F08/F12 verificato sul
> codice e scritto per esteso, su richiesta umana esplicita.
> Precedente: 2026-09-11 — **riconciliazione con lo stato reale del repository**, su
> richiesta umana esplicita. Le righe «Stato» erano ferme al 2026-08-13 e dichiaravano
> `⏳ Da avviare` otto feature su dodici, fra cui cinque già consegnate. Sono state allineate a
> `docs/ai/progress-tracker.md` e al codice verificato. Corrette anche tre voci
> «Richiede ADR» che annunciavano decisioni in realtà già firmate (ADR-36, ADR-48, ADR-49):
> restava aperto solo il provider del chatbot (F11).
> Precedente: 2026-08-13.

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

**Pilastro**: prerequisito di tutti · **Stato**: ✅ Done (2026-08-17)

Modello dati della Pagina, stati e transizioni, slug e gerarchia, revisioni, CRUD
amministrativo sotto `app/pages`. Nessun editor visivo: il contenuto si salva come
albero JSON via API.

**Perché prima**: fissa l'entità centrale. Ogni altra feature vi si aggancia.
**Riferimenti**: `docs/ai/features/F01-gestione-pagine.md`, `docs/ai/specs/SPEC-F01-gestione-pagine.md`

---

### F02 — Registro e validazione dei Blocchi

**Pilastro**: 1 (editor visivo) · **Stato**: ✅ Done · **Dipende da**: F01

Registro dei tipi di blocco condiviso backend/frontend, schema di validazione per tipo,
regole di annidamento, sanitizzazione server-side del rich text, versionamento degli
schemi e migrazione dei contenuti esistenti.

**Richiede ADR**: formato e versionamento dello schema dei blocchi.

---

### F03 — Superficie pubblica di lettura

**Pilastro**: prerequisito di 2 e 7 · **Stato**: ✅ Done (2026-09-13) · **Dipende da**: F01, F02

Il contenuto pubblicato è compilato asincronamente in HTML5 statico (worker BullMQ
`static-export`) e consegnato in push a uno storage edge isolato (CDN/S3/volume Nginx),
senza alcun canale di rete PULL dalla superficie pubblica verso PostgreSQL, Redis o il
backend NestJS. `api/v1/public/*` resta il contratto di lettura usato internamente dal
worker di export e dalla rotta di anteprima (ADR-25), non più il percorso del traffico
anonimo di produzione.

**Decisione corrente**: `docs/ai/adr/ADR-53-air-gapped-ssg-zero-db.md` — **Approvata**
(2026-09-04). Supera ADR-22/ADR-23/ADR-24; completa (non supera) ADR-45. Fissa Build-on-
Publish, zero-JS/CSS critico inline, media CLS = 0 (AVIF/WebP + `srcset`/dimensioni
intrinseche), consegna edge air-gapped, SEO/JSON-LD/OpenGraph pre-compilati nel file
statico. Spec e piano operativo riscritti in `docs/ai/specs/SPEC-F03-superficie-pubblica.md`
e `docs/ai/plans/PLAN-F03-superficie-pubblica.md` (2026-09-04).

**Baseline già implementata** (non da ricostruire): coda `static-export` e worker di
compilazione/tombstone (ADR-45), generazione dati SEO (`SeoGraphService`, ADR-48), pipeline
media `sharp` con preset/focal point (ADR-49), token di anteprima dedicato (ADR-25).

**Chiusura (2026-09-13)**: consegna su volume Nginx isolato (ADR-63), file esportati
sull'URL pubblico (ADR-65), air-gap verificato in CI da `check-air-gap.js`.

**Delta che era da costruire per la piena conformità ad ADR-53** (piano § Task): CSS critico
inline nel documento esportato, output AVIF oltre a WebP con dimensioni intrinseche/
`srcset` per CLS = 0, assemblaggio di JSON-LD/OpenGraph nel file statico + rigenerazione
`sitemap.xml`/`robots.txt`, adapter di consegna edge dietro un'interfaccia esplicita
(`LocalFolderDeployer` unica implementazione attiva).

**Storico**: decisione originaria ratificata il 2026-09-01 in
`docs/ai/rfc/RFC-44-static-site-export-engine.md` (Approvato, N1–N7 firmati), che ha
prodotto `ADR-45-ssg-export-architecture.md` — resta valida e non riscritta; ADR-53 ne è
il completamento sull'air-gap di consegna, non una sua sostituzione.

---

### F04 — Editor visivo (page builder)

**Pilastro**: 1 · **Stato**: ✅ Done (2026-08-19; round F04b/F04c/F04d successivi) · **Dipende da**: F02

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

**Pilastro**: 4 · **Stato**: ✅ Done (2026-09-11) · **Dipende da**: F01

Locale attivi, lingua di default, gruppi di traduzione, creazione di una traduzione da
Pagina esistente, `hreflang`, menu per lingua.

**ADR**: `ADR-36-modello-multilingua-righe-autonome.md`, approvata il 2026-08-25 — righe
autonome. La decisione **non è più aperta**.
**Perché presto**: aggiungere le lingue dopo aver popolato il sito costringe a
migrare contenuti già pubblicati.

---

### F06 — Template e Sezioni globali

**Pilastro**: 1 · **Stato**: ✅ Done (2026-09-03) · **Dipende da**: F02

Template come punto di partenza copiato; Sezioni globali come riferimento condiviso, con
invalidazione a cascata della cache delle Pagine che le usano.

---

### F07 — SEO per pagina

**Pilastro**: 2 · **Stato**: 🔄 In progress · **Dipende da**: F03, F05

Metadati per Pagina, canonical, `robots`, Open Graph, JSON-LD, sitemap XML con
`hreflang`, `robots.txt`, redirect e compattazione delle catene, checklist consultiva
in editor.

**ADR**: `ADR-48-seo-graph-generation.md`, approvata il 2026-09-02 — generazione
JSON-LD/OpenGraph a publish-time. La decisione **non è più aperta**.

**Consegnato**: metadati, canonical, `robots`, Open Graph e JSON-LD a publish-time,
`sitemap.xml` e `robots.txt` dall'export. **Residuo**: `hreflang` dentro `sitemap.xml`;
redirect con compattazione delle catene (tabella `redirects` prevista ma non approvata:
serve una ADR con modifica di schema); verifica della checklist consultiva in editor.

---

### F08 — GEO per pagina

**Pilastro**: 2 · **Stato**: 🔄 In progress (parziale) · **Dipende da**: F07

`aiSummary`, `keyFacts`, `faq` (con JSON-LD `FAQPage`), `entities`, `aiPolicy`,
generazione di `llms.txt`, direttive per crawler AI.

> **Confermata** (assunzione A1, 2026-08-13): GEO = *Generative Engine Optimization*.
> L'obiettivo è la visibilità del contenuto presso i motori di risposta AI, affiancata —
> non sostituita — alla SEO tradizionale di F07. Le due feature condividono lo stesso
> blocco di metadati sulla Pagina e vanno progettate insieme.

**Consegnato**: campi `aiSummary`, `keyFacts`, `faq`, `entities`, `aiPolicyAllowed` nel
contratto SEO della Pagina, JSON-LD `FAQPage`. **Residuo**: generazione di `llms.txt` e
direttive per crawler AI in `robots.txt` dal job di export.

---

### F09 — Media editoriali

**Pilastro**: 6 · **Stato**: ✅ Done (2026-09-13) · **Dipende da**: F02

Metadati editoriali sopra il `FilesModule` esistente (alt, didascalia, crediti),
libreria media navigabile, varianti dimensionali asincrone, protezione dei media
referenziati, verifica MIME reale.

**ADR**: `ADR-49-media-processing-pipeline.md`, approvata il 2026-09-02 — worker `sharp`,
preset finiti, SVG fuori pipeline. La decisione **non è più aperta**.

---

### F10 — Moduli di contatto

**Pilastro**: 3 · **Stato**: ✅ Done (2026-09-03) · **Dipende da**: F02, F03

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

**Pilastro**: 5 · **Stato**: 🔄 In progress (parziale) · **Dipende da**: F01, F10

Estensione della dashboard esistente al dominio: contenuti in bozza e in revisione,
pubblicazioni programmate, ultimi Invii ricevuti, media senza testo alternativo,
redirect rotti, Pagine senza metadati SEO.

**Perché in fondo**: una dashboard è una vista su dati che devono esistere prima.

**Consegnato**: dashboard con analytics di traffico. **Residuo**: i widget editoriali
elencati sopra (bozze e revisioni, programmate, ultimi Invii, media senza alt, Pagine
senza metadati SEO); «redirect rotti» dipende dai redirect di F07.

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
