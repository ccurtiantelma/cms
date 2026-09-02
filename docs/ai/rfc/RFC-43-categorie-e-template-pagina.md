# RFC-43 — Categorie di Pagina e Template per Pagina: due decisioni distinte dietro un solo task esterno

## Status
[x] In discussione · [ ] Approvato → genera ADR-[N] · [ ] Rifiutato

## Proposto da
AI Orchestrator · Data: 2026-08-31

---

## Problema

Un task esterno ("Prompt per Claude — Backend Developer") ha chiesto di implementare
direttamente in `app/backend`:

1. Due tabelle mutabili nuove in `schema.ts`: `templates` e `categories` (gerarchia via
   `parent_id`, self-reference come `pageEntity.parentId`), più FK `category_id` e
   `template_id` su `pages`.
2. `CategoriesModule` (Controller+Service, paginazione, audit log, gestione gerarchica).
3. `TemplatesModule` per CRUD di "layout visuali" di Pagina.
4. Un `TemplateResolverService` **dentro `PagesModule`**, cascata
   `Page.templateId ?? Category.defaultTemplateId ?? SystemDefaultTemplate`.
5. Ownership, guid immutabile, soft delete, `DBErrorMapper`.

Il controllo documentale preliminare (obbligatorio per `CLAUDE.md` § Anti-hallucination)
è stato eseguito prima di scrivere qualunque riga di schema o codice, come richiesto. Le
tre premesse ricevute insieme al task sono state verificate una per una contro lo stato
reale del repository — non solo `docs/`, anche `app/backend/src/db/schema.ts` e
`app/backend/src/site-templates/` — e in un caso vanno **corrette**, non confermate così
come formulate.

### 1. "Categorie" — la premessa A è confermata, ed è più grave di come è stata formulata

`docs/glossary.md`, `docs/business-rules.md`, `docs/roadmap.md`, tutte le ADR/RFC non
contengono alcuna occorrenza di "categoria" come concetto di dominio (le uniche
occorrenze del termine sono: categorie della password policy, e `meta.category` — un
campo puramente decorativo del registro dei blocchi che raggruppa voci nella palette
dell'editor, non un'entità persistita né una relazione fra Pagine). `CLAUDE.md` § Modello
di contenuto, regola 1: *"Pagina = entità centrale, nessun tipo 'post' privilegiato."*
`docs/system-architecture.md` riga 133-135 elenca le entità di dominio previste (da
approvare): `pages`, `page_revisions`, `redirects`, `menus`, `forms`, `form_submissions`.
`categories` non c'è.

Quello che l'audit fornito non poteva sapere senza leggere il codice: **questa domanda è
già stata posta e lasciata esplicitamente irrisolta tre giorni fa**, nello stesso
repository. `app/backend/src/common/enums.ts` righe 24-52 (`SiteTemplateType`,
`RESOLVABLE_SITE_TEMPLATE_TYPES`) esclude deliberatamente i valori `single_post` e
`archive` da ogni risoluzione reale, con un commento che cita testualmente: *"il CMS non
ha oggi un concetto di tipo di contenuto/tassonomia (regola 1 del modello di contenuto),
la precondizione che RFC-40 § 3 segnala come mancante"*. Una "Categoria" con gerarchia
(`parent_id`) e un `defaultTemplateId` che governa il layout di tutte le Pagine che vi
appartengono **è** un concetto di tassonomia — è esattamente la precondizione mancante
che `RFC-40` (`docs/ai/rfc/RFC-40-theme-builder-template-registry.md`, letta per intero)
ha rifiutato di costruire senza una decisione architetturale dedicata. Costruire
`categories` ora significa riaprire, per la porta di servizio di un task diverso, una
domanda che il repository ha già formalmente lasciato in sospeso.

Non esiste inoltre alcuna voce di `docs/roadmap.md` (F01–F12) che nomini una tassonomia
di Pagine come funzionalità prevista. Non è solo "manca l'ADR": manca la feature stessa
nel piano approvato.

**Premessa A: confermata, con un'aggravante che il controllo documentale isolato da
`docs/` non poteva vedere.**

### 2. "Template" — la premessa B è imprecisa: non sono due concetti in collisione, sono tre, e il secondo ha un debito di governance proprio

`docs/glossary.md` riga 20 definisce **Template**: *"Struttura di partenza riusabile per
creare nuove Pagine. A differenza della Sezione globale, il Template viene copiato alla
creazione e da quel momento la Pagina è indipendente."* Copia una tantum, nessun
riferimento persistente, nessuna risoluzione a runtime. Questo concetto **non è mai stato
costruito**: `docs/roadmap.md` gli assegna F06 (`Stato: ⏳ Da avviare`), e l'unica RFC che
lo tocca (`docs/ai/rfc/RFC-F06-template-sezioni.md`, ancora "In discussione", nessuna
decisione umana registrata) riguarda per giunta un **quarto** significato — una libreria
di snippet salvabili dall'editor, non il Template a livello di Pagina del glossario. La
riga di glossario resta quindi, letteralmente, non implementata da nessuna parte.

Il secondo concetto esiste già in codice, non solo in teoria, ed è quello a cui la
premessa B fa riferimento come "(a)/(b)/(c) da chiarire": `app/backend/src/site-templates/`
— tabella `site_templates`, `TemplateResolverService.resolveForRoute(path, type, lang)`,
risoluzione per `type`+`lingua`+`priority` con `displayConditions` (`include`/`exclude`
su rotta o pattern), **nessuna colonna che leghi una riga di `site_templates` a una riga
di `pages`**. Qui la premessa B chiede di verificare quale ADR lo copre: **nessuna lo
copre**. Il commento in testa alla tabella (`schema.ts` riga 409-419) e il commento su
`SiteTemplateType` (`enums.ts` riga 24-28) dichiarano entrambi *"RFC-40 Opzione B,
decisione umana 2026-08-31"* — la data di oggi — ma `RFC-40-theme-builder-template-registry.md`
ha ancora, alla lettera, la sezione "Decisione umana" in bianco (`Esito: [ ] Approvato`,
`Approvato da: ___________`), e l'Opzione B della RFC stessa elencava quattro
precondizioni esplicite prima di qualunque schema — fra cui *"ADR su `theme_templates`
come entità, il motore di `displayConditions`, e il suo punto di aggancio in
`app/public-site`"* e *"decisione umana su numerazione roadmap (nuovo pilastro)"`. Nessuna
delle due esiste: non c'è un `ADR-4x-site-templates.md` in `docs/ai/adr/`, e
`docs/roadmap.md` non nomina né "Theme Builder" né alcun tredicesimo pilastro. `ADR-40`
esiste ma copre solo l'Opzione A della stessa RFC (Sezioni Globali per header/footer,
`global_sections` — tabella diversa, già approvata regolarmente il 2026-08-27). In altre
parole: **`site_templates` è già in `schema.ts` senza che il proprio processo di
approvazione — quello che la sua stessa RFC di origine imponeva — risulti chiuso per
iscritto**. Questa non è una cosa che questa RFC può sanare (non tocca `schema.ts`, non
riscrive `RFC-40` che è un documento già esistente): è un fatto che chi deve decidere sul
task esterno deve conoscere prima di trattare `site_templates` come precedente solido su
cui appoggiarsi.

Il terzo concetto è quello richiesto dal task esterno: un `templateId` **persistito come
FK su `pages`**, risolto con una cascata di ownership (`Page.templateId ?? Category.
defaultTemplateId ?? SystemDefaultTemplate`) da un `TemplateResolverService` **dentro
`PagesModule`**. Semanticamente questo è l'opposto del Template di glossario (che è
copiato, non referenziato): un `templateId` che resta assegnato e si risolve a ogni
lettura è un **riferimento vivo**, la stessa semantica della **Sezione Globale**
(`docs/glossary.md` riga 19, `docs/business-rules.md` § Blocchi regola 8: *"referenziata,
non copiata... la modifica si riflette su tutte le Pagine che la usano"*), non quella del
Template. È anche strutturalmente diverso da `site_templates`: quello risolve per
**rotta** (`path`+`type`+`lang`), mai per FK su una riga di `pages`; questo risolverebbe
per **appartenenza** (`Page`→`Category`→sistema), mai per pattern di rotta. Sono due
motori di risoluzione indipendenti che risponderebbero alla stessa domanda ("quale layout
per questa richiesta pubblica?") con regole incompatibili se coesistessero.

Il task esterno propone inoltre di chiamare la nuova classe `TemplateResolverService`,
**lo stesso identificatore già usato** da `app/backend/src/site-templates/
template-resolver.service.ts` per un algoritmo completamente diverso. Anche restando in
moduli diversi (compilerebbe), è la stessa categoria di rischio che RFC-F06 ha già
segnalato per "Template" come nome: *"'Template' nel codice smette di significare quello
che dice il glossario, e ogni lettura futura della codebase... parte da un'assunzione
sbagliata"* — qui applicato a un nome di classe invece che a un termine di glossario, con
lo stesso effetto su `grep`, autocompletamento, onboarding.

**Premessa B: la direzione è corretta (serve chiarire la relazione), ma il quadro è più
affollato di come viene descritto — tre concetti, non due, e il secondo porta con sé un
buco di governance proprio (RFC-40 Opzione B non risulta chiusa per iscritto) che va
segnalato, non usato come base data per estenderla.**

### 3. Divieto di modifica diretta dello schema — la premessa C è confermata senza riserve

`CLAUDE.md` § Database: *"Schema unico... ogni modifica richiede approvazione umana."* §
Ask first: *"schema DB/migrazioni"* è nel primo elenco, senza eccezioni. Il task chiede
due tabelle nuove e due FK su `pages` senza alcuna ADR a monte. Anche a voler concedere
che "Template" coincida con `site_templates` (una delle letture possibili, vedi sotto),
resterebbe comunque da approvare la FK `pages.template_id` — che oggi non esiste in
nessuna forma — e l'intera tabella `categories`, per cui non esiste alcun precedente,
nemmeno irregolare.

**Premessa C: confermata.**

---

## Soluzione proposta

Non decido al posto dell'umano quale perimetro costruire. Due decisioni indipendenti,
ciascuna con le proprie opzioni.

### Decisione 1 — Categorie: un concetto nuovo, non un dettaglio implementativo

#### Opzione A — Non costruire Categorie ora (raccomandata)

Nessuna tabella `categories`, nessuna FK `pages.category_id`. Il task esterno le tratta
come se fossero già un concetto acquisito quando non lo sono in nessun documento di
governance né in nessuna feature di roadmap. Se il vero bisogno del task è "un modo per
raggruppare Pagine e dare loro un layout condiviso senza assegnarlo pagina per pagina",
questo bisogno può essere rivalutato **dopo** aver capito se `site_templates` +
`displayConditions` (già esistente, `PathPattern`/`SpecificPage`/`EntireSite`) lo copre
già per via di pattern di rotta, senza introdurre una tassonomia.

**Impatto**: sblocca subito il resto del task (Template, se disambiguato) senza aprire un
fronte che RFC-40 ha già segnalato come precondizione mancante.

#### Opzione B — Tag piatti, senza gerarchia

Un concetto più leggero di "Categoria gerarchica": etichette semplici associabili a una
Pagina, senza `parent_id`, senza `defaultTemplateId`. Riduce ma non elimina il problema di
principio: resta comunque una tassonomia nuova non prevista da `docs/roadmap.md`, richiede
comunque una voce di glossario/business-rules (scrittura umana) e una ADR («nuova entità
di dominio»/«modello di ownership permessi editoriali» se le Categorie hanno RBAC
proprio). Non risolve da sola il bisogno del task, che vuole `defaultTemplateId` per
categoria — questo richiederebbe comunque la gerarchia o quantomeno il campo, quindi
Opzione B non è "lo stesso risultato più semplice": è un risultato diverso, più povero.

**Impatto**: minore di Opzione C, ma non copre la cascata di risoluzione richiesta dal
task senza reintrodurre `defaultTemplateId` — a quel punto la differenza con una "vera"
Categoria gerarchica si riduce alla sola assenza di `parent_id`.

#### Opzione C — Aprire formalmente la decisione su tipi di contenuto/tassonomie

Trattare "Categoria" come la precondizione che RFC-40 ha segnalato mancante, e aprirla
come voce propria in `docs/roadmap.md` (compito umano, non un pilastro esistente fra
F01–F12) prima di qualunque ADR. Questo è l'inquadramento più onesto se il prodotto ha
davvero bisogno di una tassonomia — ma è un impegno enormemente più ampio del "aggiungere
una tabella": tocca la regola 1 del modello di contenuto, quindi potenzialmente
`docs/constitution.md` stesso, che è il documento a priorità assoluta e che l'AI non
tocca mai di propria iniziativa.

**Raccomandazione tecnica, non decisione**: Opzione A. Non c'è nessuna feature approvata
che nomini le Categorie, il concetto più vicino (tassonomia per `single`/`archive`) è
stato già lasciato esplicitamente irrisolto tre giorni fa nello stesso repository, e il
task esterno non porta alcuna motivazione di prodotto per riaprirlo ora.

### Decisione 2 — Template: quale dei tre concetti, con quale nome

#### Opzione A — Il task chiede in realtà `site_templates`, va esteso non duplicato

Se l'obiettivo reale è "assegnare un layout a una Pagina", e non serve la semantica di
copia-alla-creazione del glossario, la strada più coerente con quanto già esiste è
estendere `TemplateResolverService.resolveForRoute` con un modo di risoluzione aggiuntivo
per `pages.guid` (non necessariamente una FK dedicata — potrebbe restare dentro
`displayConditions.SpecificPage`, che già esiste) invece di costruire un secondo motore
di risoluzione con lo stesso nome di classe in un modulo diverso.

**Impatto**: prima di poter procedere, va sanato il debito di governance già descritto al
punto 2 — la propria RFC di origine (RFC-40) non risulta chiusa per iscritto per l'Opzione
B, nonostante il codice sia già in `schema.ts`. Questa RFC non lo risolve: segnala che va
chiuso (RFC-40 approvata per iscritto + l'ADR-conseguente che la stessa RFC-40 chiedeva)
prima di costruirci sopra qualunque cosa nuova.

#### Opzione B — Il task chiede un concetto distinto, serve un terzo nome

Se invece serve davvero un riferimento persistito per-Pagina (diverso dalla risoluzione
per-rotta di `site_templates` e dalla copia-alla-creazione del glossario), va nominato in
modo che non collida: né "Template" (preso dal glossario, F06, non ancora costruito), né
`TemplateResolverService` come nome di classe (preso da `site-templates/`, semantica
diversa). Serve:

- una voce di glossario nuova (scrittura umana, o AI su richiesta esplicita e
  circostanziata) che lo distingua esplicitamente da entrambi i concetti esistenti;
- una ADR dedicata per la tabella e per il meccanismo di risoluzione (che assomiglia più a
  una Sezione Globale con ownership che a un Template — vedi analisi sopra);
- un nome di classe diverso, es. `PageLayoutResolverService`, per evitare l'ambiguità con
  `site-templates/template-resolver.service.ts` anche solo a livello di ricerca nel
  codice.

**Impatto**: è l'opzione più fedele a quanto il task descrive letteralmente, ma è anche
quella che introduce più superficie nuova (tabella, modulo, ADR, voce di glossario).

#### Opzione C — Rinviare "Template per Pagina" a dopo F06

`docs/roadmap.md` ha già una sequenza: F06 (Template + Sezioni Globali) non è mai stata
avviata nella sua parte "Template copiato alla creazione". Costruire un quarto/quinto
significato di "Template" prima che il primo (quello di glossario) esista anche solo come
spec è la stessa figura di rischio che RFC-F06 ha già segnalato per l'editor visivo:
sovrapposizione di concetti non ancora chiariti. Si potrebbe congelare la richiesta del
task fino a quando F06 (RFC-F06, ancora "In discussione") non è sciolta, e solo allora
valutare se il bisogno del task è già coperto o resta un concetto a sé.

**Raccomandazione tecnica, non decisione**: prima sanare il debito di governance di
`site_templates` (Opzione A del punto precedente, RFC-40 chiusa per iscritto + ADR
conseguente), poi verificare se `displayConditions` già copre il bisogno del task senza
tabella nuova. Solo se non basta, procedere con l'Opzione B qui sopra con un nome che non
collida. In ogni caso, il `TemplateResolverService` del task **non va scritto dentro
`PagesModule`** con questo nome finché la relazione con quello già esistente non è
esplicita in una ADR.

---

## Alternative valutate

- **Implementare il task alla lettera, accettando la collisione di nome fra i due
  `TemplateResolverService`.** Scartata: è la stessa figura di rischio già descritta da
  RFC-F06 per "Template" come termine — qui riproposta identica per un nome di classe.
- **Rinominare silenziosamente `categories`/`templates` in qualcosa che sembri meno una
  tassonomia, per aggirare la regola 1.** Scartata: cambiare il nome non cambia la
  semantica (gerarchia + layout ereditato per raggruppamento resta una tassonomia),
  esattamente la scorciatoia che `CLAUDE.md` § Divieti assoluti vieta ("inventare
  entità di contenuto... non documentate").
- **Trattare la conferma implicita nel commento di `schema.ts` ("decisione umana
  2026-08-31") come approvazione valida per questa RFC, e procedere basandosi su
  quella.** Scartata: un commento nel codice non è il documento di approvazione previsto
  dalla Documentation Policy (`docs/ai/rfc/RFC-40...md` § Decisione umana, tuttora in
  bianco); anche se la decisione fosse stata presa a voce, il record scritto è quello che
  manca, ed è quello che la policy richiede prima di costruirci sopra qualunque cosa
  d'ulteriore.
- **Costruire solo `templates` (rinviando `categories`) trattando `Page.templateId` come
  bastante senza la cascata.** Considerata come possibile riduzione di scope, ma non
  proposta come opzione a sé: senza sciogliere prima quale dei tre concetti di "Template"
  si sta costruendo (Decisione 2), anche una sola tabella `templates` rischia di nascere
  con lo schema, il nome di classe o la semantica sbagliata.

---

## Impatto

- **Schema DB**: nessuna migrazione proposta da questa RFC. `categories`, `templates` e
  ogni FK su `pages` restano bloccate su approvazione umana esplicita (`CLAUDE.md` § Ask
  first), da ADR dedicate generate dopo la firma di questa RFC (una per Decisione 1, una
  per Decisione 2 se l'esito è Opzione B).
- **Roadmap**: se Decisione 1 procede oltre l'Opzione A raccomandata, serve una voce di
  `docs/roadmap.md` che oggi non esiste — compito umano, non deducibile da questa RFC.
  Analogamente, `site_templates`/Theme Builder (Decisione 2) non ha mai ricevuto la voce
  di roadmap che la propria RFC di origine (RFC-40 Opzione B) indicava come precondizione:
  se si procede su quel binario, va aperta anche questa, indipendentemente dall'esito di
  questa RFC.
- **Glossario/Business rules**: qualunque esito diverso da "Categorie non costruite,
  Template = estensione di `site_templates`" richiede nuove voci — scrittura umana o AI
  solo su richiesta esplicita e circostanziata (`CLAUDE.md` § Documentation Policy).
- **RBAC**: `docs/business-rules.md` § Permessi editoriali non nomina "Categorie" in
  nessuna riga. Per "Template" esiste una riga (*"Gestire Menu, Template, Sezioni
  globali"*, Manager+) ma non è chiaro se copre `site_templates` (RFC-40 ha già segnalato
  la stessa ambiguità fra questa riga e *"Gestire tema e risorse globali"*, Admin+, senza
  scioglierla) o il concetto nuovo del task. Va deciso esplicitamente, non dedotto dal
  nome.
- **`app/public-site`**: qualunque forma di risoluzione per-Pagina di un Template tocca la
  pipeline SSR di ADR-22 e potenzialmente la risoluzione di rotta di ADR-24 — va reso
  esplicito nella ADR conseguente, non lasciato implicito nel resolver.
- **Debito preesistente segnalato, non generato da questa RFC**: la RFC-40 Opzione B
  (`site_templates`, `TemplateResolverService` esistente) risulta implementata in
  `schema.ts`/`enums.ts` senza che la propria sezione "Decisione umana" sia compilata e
  senza l'ADR-conseguente che la stessa RFC richiedeva al punto N4. Va chiuso a prescindere
  dall'esito di questa RFC, perché mina la solidità di qualunque scelta che vi si appoggi.

---

## Rischi

| Rischio | Probabilità | Impatto | Mitigazione |
|---|---|---|---|
| Si costruisce `categories` come tassonomia implicita, riaprendo per la via breve la domanda che `RFC-40`/`SiteTemplateType` ha già lasciato esplicitamente aperta | Alta se si procede senza questa RFC | Alto — collide con una decisione già presa (escludere `single_post`/`archive` finché non c'è un concetto di tassonomia) | Decisione 1, Opzione A |
| Si scrive un secondo `TemplateResolverService` con lo stesso nome e semantica diversa da quello già in `site-templates/` | Alta se si implementa il task alla lettera | Medio — confusione di lettura/ricerca nel codice, stesso rischio già segnalato da RFC-F06 per "Template" come termine | Decisione 2, nome di classe distinto se si sceglie Opzione B |
| Si tratta `site_templates` come precedente "chiuso" su cui estendere, quando la propria RFC di origine non risulta approvata per iscritto | Media | Medio — si costruisce sopra una decisione che non ha un record scritto valido, propagando il debito | Chiudere RFC-40 per iscritto (o farla chiudere) prima di estendere `site_templates` |
| Si introduce `pages.category_id`/`pages.template_id` in schema senza ADR, violando `CLAUDE.md` § Ask first | Alta se si implementa il task alla lettera | Alto — modifica non approvata a `schema.ts`, la tabella unica del progetto | Nessuna migrazione senza ADR + approvazione umana esplicita, come da questa RFC |
| RBAC assegnato per analogia ("assomiglia a Template quindi Manager+") invece che deciso esplicitamente | Media | Medio — permessi editoriali incoerenti con le righe esistenti, stesso rischio già segnalato da RFC-40 § 5 | Decisione esplicita in ADR conseguente |

---

## Decisione umana

**Esito**: [ ] Approvato · [ ] Rifiutato · [ ] Modificato

**Punti che richiedono una firma esplicita, singolarmente:**

- [ ] **N1** — Categorie: Opzione A (non costruire ora, raccomandata) / Opzione B (tag
  piatti, senza gerarchia) / Opzione C (aprire una decisione formale su tipi di
  contenuto/tassonomie, voce di roadmap nuova)
- [ ] **N2** — Se N1 = B o C: conferma che serve comunque una voce di
  `docs/roadmap.md` prima di ogni ADR (compito umano)
- [ ] **N3** — Template: Opzione A (estendere `site_templates`/`TemplateResolverService`
  esistente) / Opzione B (terzo concetto distinto, nuovo nome in glossario e in codice) /
  Opzione C (rinviare a dopo la chiusura di RFC-F06)
- [ ] **N4** — Autorizzazione a chiudere per iscritto il debito di governance già presente
  su `RFC-40-theme-builder-template-registry.md` § Opzione B (sezione "Decisione umana"
  in bianco, ADR-conseguente mai prodotta) come precondizione a qualunque estensione di
  `site_templates` — indipendente dall'esito di N1/N3, va comunque chiuso
- [ ] **N5** — RBAC: soglia esplicita per la gestione di Categorie (se N1 ≠ A) e per il
  concetto di Template scelto in N3, senza dedurla dalla riga "Gestire Menu, Template,
  Sezioni globali" già ambigua (RFC-40 § 5)

**Note**: ___________

**Approvato da**: ___________ · **Data**: ___________

**Azione successiva**: [ ] Genera ADR-[N] (una per N1 se ≠ A, una per N3 se ≠ A) · [ ] Archivio
