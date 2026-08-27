# RFC-40 — Theme Builder: registro dei Template di tema e condizioni di visualizzazione

## Status
[x] In discussione · [ ] Approvato → genera ADR-40 · [ ] Rifiutato

## Proposto da
AI Orchestrator · Data: 2026-08-27

---

## Problema

Un task esterno ("SPECIFICA OPERATIVA F09 STEP 1: THEME BUILDER TEMPLATE REGISTRY & DISPLAY
CONDITIONS") ha chiesto di implementare direttamente in `app/backend`:

1. Tabella `theme_templates` (`id` uuid, `title`, `type` enum `header|footer|single|archive`,
   `content` jsonb, `displayConditions` jsonb, `isActive`, `createdAt`/`updatedAt`).
2. DTO e validazione per creazione/aggiornamento template + regole sui blocchi ammessi per
   `header`/`footer`.
3. `ThemeBuilderController` (`api/v1/app/theme-builder/templates`, CRUD completo) e
   `PublicThemeBuilderController` (`api/v1/public/theme-builder/active`, lettura anonima per
   rotta/slug, consumata da `app/public-site`).
4. Migrazione DB, sync `openapi.yaml`, suite di test verde al 100%.

Prima di scrivere schema o codice, il controllo documentale preliminare (obbligatorio per
`CLAUDE.md` § Anti-hallucination) ha trovato tre problemi, non uno solo di numerazione.

### 1. La sigla è sbagliata, e non di poco

`docs/roadmap.md` righe 130-138 assegna **F09** a *"Media editoriali"* — metadati sopra
`FilesModule` (alt, didascalia, crediti), libreria media, varianti dimensionali. È la feature
di `RFC-F09-media-library.md`, già in discussione/parzialmente approvata (→ ADR-35). Il Theme
Builder qui descritto non ha alcuna relazione con quel dominio: chiamarlo "F09" collide con
una sigla già occupata nei sorgenti e nei documenti, esattamente il rischio di deriva
terminologica di cui `RFC-F09-media-library.md` § "Nota di numerazione" e `RFC-F06 § Problema`
sono già precedenti diretti in questo stesso repository.

### 2. Il concetto più vicino esiste già, ha un nome, ed è fermo da prima di questa richiesta

`docs/glossary.md` riga 19 definisce **Sezione globale**: *"Gruppo di Blocchi riusabile e
referenziato (non copiato) da più Pagine: **header, footer, call to action**. Modificarla si
riflette ovunque sia usata."* Questo è, testualmente, ciò che i tipi `header`/`footer` del
task richiedono: un albero di blocchi condiviso, con invalidazione a cascata della cache
(`docs/business-rules.md` regola 8 richiamata da `docs/roadmap.md` § F06).

`docs/roadmap.md` riga 97-103 assegna questo dominio a **F06 — Template e Sezioni globali**,
`Stato: ⏳ Da avviare`. F06 ha già una RFC aperta e **non ancora firmata**
(`docs/ai/rfc/RFC-F06-template-sezioni.md`, Status "In discussione", nessuna decisione umana
registrata) che tratta esattamente il rischio di inventare un concetto adiacente ma distinto
sotto un nome già preso. Costruire `theme_templates` per `header`/`footer` ora significa
aprire un **secondo binario per la stessa cosa** — un'entità nuova (`theme_templates`) accanto
a un concetto di dominio già nominato (Sezione globale) e già in coda di decisione — invece di
completare quello fermo.

### 3. `single` e `archive` non sono costruibili senza violare la regola 1 del modello di contenuto

`CLAUDE.md` § Modello di contenuto, regola 1: *"Pagina = entità centrale, nessun tipo 'post'
privilegiato."* Un template `single` (vista di un elemento di un tipo di contenuto) e un
template `archive` (elenco di elementi di un tipo di contenuto) sono, per definizione
WordPress/Elementor da cui il task importa il vocabolario, template **per tipo di post**. Il
CMS non ha tipi di post: ha Pagine, tutte dello stesso tipo, nessuna gerarchia di "tipo
archiviabile". Non esiste oggi:
- un concetto di tassonomia o "collezione" di cui `archive` potrebbe elencare i membri;
- un campo su Pagina che dichiari "questa Pagina usa il template `single` X" — la Pagina non
  ha un contratto per questo (`docs/business-rules.md` non lo definisce).

Implementare l'`enum` con questi due valori ora significa persistere in schema un concetto che
la regola 1 esclude esplicitamente, in attesa di una decisione architetturale (tipi di
contenuto? tassonomie?) che **non è mai stata aperta** in nessuna Decisione aperta di
`CLAUDE.md` né in `docs/roadmap.md`.

### 4. Le condizioni di visualizzazione sono un motore di regole nuovo, senza precedente

`displayConditions` come array di regole (`include`/`exclude` × `all`/`page:id`/...) è una
funzionalità che **nessuna ADR tratta**: non è schema di blocco (ADR-21 riguarda i nodi
dell'albero di una Pagina, non un livello sopra), non è caching (ADR-23 invalida per evento su
chiave nota, non valuta condizioni), non è routing (ADR-24 risolve slug→Pagina, non
Pagina→quale header applicare). Valutare queste regole in `app/public-site` in fase di SSR
significa introdurre un nuovo punto di decisione nella pipeline di rendering pubblico che
ADR-22 non prevede — richiede una propria ADR, non un dettaglio implementativo della tabella.

### 5. RBAC ambiguo tra due righe esistenti

`docs/business-rules.md` § Permessi editoriali ha **due righe** potenzialmente applicabili e
**con soglie diverse**:

| Azione | Soglia |
|---|---|
| Gestire Menu, **Template**, Sezioni globali | Manager+ (20) |
| Gestire **tema** e risorse globali | Admin+ (10) |

Un "Theme Builder" sta terminologicamente sotto la seconda riga (Admin+), ma header/footer
come Sezioni globali starebbero sotto la prima (Manager+). Il task non lo scioglie, e non è
una scelta che un ruolo AI possa decidere da sé.

### 6. Nessuna entità in system-architecture

`docs/system-architecture.md` (citato in `CLAUDE.md` § Database) elenca le entità *"previste
(da approvare)"*: `pages`, `page_revisions`, `redirects`, `menus`, `forms`,
`form_submissions`. `theme_templates` non compare. `CLAUDE.md` § Ask first impone approvazione
umana esplicita per ogni modifica a `schema.ts`, prima di qualunque migrazione.

---

## Soluzione proposta

Non decido al posto dell'umano quale perimetro costruire. Tre inquadramenti, in ordine di
rischio crescente.

### Opzione A — Completare F06 per header/footer, rinviare single/archive (raccomandata)

Trattare `header`/`footer` come **implementazione di "Sezione globale"** (glossario riga 19),
non come nuova entità `theme_templates`:

- Riusa (o estende, se serve un discriminante) una tabella `global_sections` dedicata a F06,
  con `type: 'header' | 'footer' | 'cta' | ...` — coerente col fatto che il glossario nomina
  già "call to action" come terzo caso d'uso della stessa entità, non solo header/footer.
- Le "condizioni di visualizzazione" per header/footer diventano una lista opzionale di
  Pagine escluse/incluse — un caso d'uso reale (es. landing page senza header) che **non**
  richiede il concetto di tipo di post: opera su `pages.guid`, che esiste già.
- `single` e `archive` **non vengono costruiti in questo giro**: richiedono prima una
  decisione architetturale su tipi di contenuto/tassonomie, oggi assente da ogni Decisione
  aperta di `CLAUDE.md`. Vanno aperti come voce propria, eventualmente una nuova feature in
  roadmap (non F09, non F06 — un pilastro non ancora numerato), quando/se il CMS smette di
  essere mono-tipo.
- Endpoint pubblico: estende, non duplica, il consumer di ADR-22 — `app/public-site` risolve
  già la Pagina dalla rotta (ADR-24); l'header/footer attivi si allegano a quella risoluzione,
  non a una rotta `/theme-builder/active` separata con una propria logica di match.

**Impatto**: sblocca F06 (RFC-F06 va comunque firmata prima, sceglie la sua Opzione A/B/C per
"Template" personali — indipendente da questa RFC che riguarda solo Sezioni globali). Una sola
ADR nuova (persistenza + condizioni di visualizzazione per Sezioni globali). RBAC: Manager+
per coerenza con la riga esistente "Gestire Menu, Template, Sezioni globali".

### Opzione B — Nuova feature "Theme Builder" a sé (F13, da assegnare in roadmap)

Dichiarare esplicitamente che questo **non è** F06 né F09: è un pilastro nuovo, con `single` e
`archive` costruiti da subito. Richiede, prima di qualunque schema:

1. Decisione umana su numerazione roadmap (nuovo pilastro, `docs/roadmap.md` — modifica
   umana, non AI).
2. ADR su tipi di contenuto/tassonomie (precondizione per `single`/`archive` — altrimenti i
   due valori restano enum senza semantica implementabile).
3. ADR su `theme_templates` come entità, il motore di `displayConditions`, e il suo punto di
   aggancio in `app/public-site`.
4. Decisione RBAC esplicita tra le due righe di permessi in conflitto.

**Impatto**: molto più ampio del task originale — il vero blocco non è la tabella, è la
mancanza di un concetto di "tipo di contenuto" su cui `single`/`archive` possano operare.

### Opzione C — Solo registro dati, nessuna logica di matching (sconsigliata)

Costruire `theme_templates` con l'enum a quattro valori e `displayConditions` come jsonb
opaco, senza alcun motore che li interpreti in `app/public-site` in questo giro. Scartata: è
uno schema che afferma un contratto (`type: 'single' | 'archive'`) che nessun consumer può
onorare — la stessa figura di "colonne morte che dichiarano un percorso inesistente" che
`CLAUDE.md` § Database vieta esplicitamente per le tabelle append-only, qui applicata a un
intero tipo enum piuttosto che a una colonna.

**Raccomandazione tecnica, non decisione**: Opzione A. Consegna header/footer (il bisogno reale
e già nominato dal glossario) senza inventare né una sigla né un concetto di tipo-di-post che
la regola 1 del modello di contenuto oggi esclude.

---

## Alternative valutate

- **Implementare la specifica alla lettera, rinominando F09→F13 a posteriori.** Scartata: non
  risolve il problema di fondo (`single`/`archive` restano non costruibili senza tipi di
  contenuto), sposta solo il problema di numerazione senza toccare quello concettuale.
- **Trattare `single`/`archive` come "template applicato a tutte le Pagine indistintamente"
  (cioè equivalenti, dato che non esistono tipi di post).** Scartata: renderebbe i due valori
  sinonimi nella pratica, un enum con due nomi per un solo comportamento — confusione futura
  garantita, e comunque un caso d'uso già coperto da "Template" di F06 (struttura di partenza
  copiata alla creazione della Pagina).
- **Backend mock/tabella "temporanea" in attesa della decisione su tassonomie.** Scartata:
  `CLAUDE.md` § Divieti assoluti vieta scorciatoie senza ADR+approvazione; una tabella con un
  enum che dichiara stati non ancora significabili è esattamente questo.

---

## Impatto

- **Roadmap**: nessuna modifica proposta qui (compito umano). Se si sceglie Opzione A, il
  lavoro converge su F06 invece di aprire un binario parallelo. Se si sceglie Opzione B,
  serve una voce di roadmap nuova prima di ogni ADR.
- **Schema DB**: nessuna migrazione in questa RFC. Qualunque tabella (`global_sections` per
  Opzione A, `theme_templates` per Opzione B) resta bloccata su approvazione umana esplicita
  (`CLAUDE.md` § Ask first), da una ADR dedicata generata dopo la firma di questa RFC.
- **`app/public-site`**: qualunque opzione tocca la pipeline SSR di ADR-22 — l'aggancio delle
  Sezioni globali/Template di tema alla risoluzione di rotta di ADR-24 va esplicitato nella
  ADR conseguente, non lasciato implicito nel controller.
- **RBAC**: `docs/business-rules.md` § Permessi editoriali resta il riferimento; questa RFC
  non lo modifica (modifica documento di governance, compito umano), ma segnala l'ambiguità
  da sciogliere nella ADR conseguente.

---

## Rischi

| Rischio | Probabilità | Impatto | Mitigazione |
|---|---|---|---|
| Si costruisce `theme_templates` con enum `single`/`archive` prima di decidere i tipi di contenuto | Alta se si procede senza questa RFC | Alto — schema da migrare due volte, contenuto reale nel mezzo | Opzione A: rinviare esplicitamente `single`/`archive` |
| Doppio binario con F06 (Sezione globale vs `theme_templates` per header/footer) | Alta se si ignora RFC-F06 | Medio — due tabelle per lo stesso concetto, drift silenzioso | Opzione A: riusare esplicitamente il concetto di Sezione globale |
| `displayConditions` costruito come jsonb libero senza motore di valutazione definito | Media | Medio — contratto ambiguo, ogni consumer lo interpreta a modo suo | ADR dedicata al motore di condizioni prima dello schema |
| RBAC implementato con la soglia sbagliata (Admin invece di Manager o viceversa) | Media | Medio — permessi editoriali incoerenti con la tabella esistente | Decisione esplicita in ADR conseguente, non dedotta dal nome "tema" |

---

## Decisione umana

**Esito**: [ ] Approvato · [ ] Rifiutato · [ ] Modificato

**Punti che richiedono una firma esplicita:**

- [ ] **N1** — Perimetro: Opzione A (solo header/footer come Sezione globale, F06) / Opzione B
  (Theme Builder a sé, nuova sigla roadmap) / Opzione C (nessuna, richiede altro giro)
- [ ] **N2** — Se Opzione A: conferma che `single`/`archive` restano fuori scope fino a una
  decisione sui tipi di contenuto
- [ ] **N3** — RBAC: soglia Manager (20) o Admin (10) per la gestione dei template di tema
- [ ] **N4** — Autorizzazione a procedere con una ADR di persistenza (tabella + motore
  `displayConditions`) come task successivo

**Note**: ___________

**Approvato da**: ___________ · **Data**: ___________

**Azione successiva**: [ ] Genera ADR-40 · [ ] Archivio
