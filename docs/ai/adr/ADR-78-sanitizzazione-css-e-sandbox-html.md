# ADR-78 — Deroga controllata a "nessun CSS/HTML utente": `kind: 'css'` via AST (`css-tree`) e `kind: 'html'` in sandbox `<iframe>`

## Status
[ ] **In discussione** · [x] Approvato · [ ] Rifiutato · [ ] Superseded da ADR-XXX

## Data approvazione
2026-09-18 — vedi "Decisione umana" in fondo a questo documento.

## RFC di riferimento
Nessuna RFC dedicata (round R0, vedi ADR-74 § "RFC di riferimento"). Riferimento sostanziale:
`docs/SPEC-propkind-v2.md` § 3.15/§ 3.16, `docs/ELEMENTOR_PRO_GAP_ANALYSIS_v2.md` § 4 punto 2.

## Numerazione
Vedi ADR-74 § "Numerazione": questo round occupa ADR-74–ADR-80.

## ADR di riferimento (non superate, non modificate)
`ADR-21-schema-blocchi-versionamento.md` § 3.7 (pipeline di sanitizzazione per `kind`) e
`ADR-38`/§ "Regola sulle nuove dipendenze" della constitution restano il quadro invariato: questa
ADR **aggiunge due `kind` nuovi** allo stesso contratto di sanitizzazione, non lo riscrive.

---

## Contesto

`docs/constitution.md` § "Il modello di contenuto — regole costituzionali" regola 2 vieta "HTML
arbitrario persistito come contenuto strutturale"; nessuna riga della constitution vieta
esplicitamente il CSS libero, ma il registro attuale non ha mai esposto una prop CSS proprio per
coerenza con quel principio, reso operativo dal validator con `kind` chiusi e a forma fissa
(`ADR-33`/`ADR-38`). `ELEMENTOR_PRO_GAP_ANALYSIS_v2.md` § 4 punto 2 dichiara questo vincolo il
secondo conflitto da risolvere per la parità Elementor: "Custom CSS per elemento" e il widget
"HTML/embed" sono funzionalità Pro richieste esplicitamente, entrambe intrinsecamente **markup o
regole non riducibili a un `kind` a valore letterale**.

Il principio 6 della constitution ("Content is Data") non vieta che un campo contenga una stringa
— `plainText`/`richText` sono già stringhe — vieta che quella stringa sia esente da validazione e
opaca al sistema. La domanda che questa ADR chiude è quindi: **quale grado di validazione rende una
stringa CSS o HTML "dato", non "codice arbitrario"?** La risposta non può essere "nessuno" (violerebbe
il principio) né "vietato" (bloccherebbe la parità dichiarata dal committente come priorità).

---

## Decisione

### `kind: 'css'`

1. **Il valore è sempre una stringa**, `maxLength: 5000`, sanitizzata **server-side prima della
   persistenza** (stesso stadio della pipeline di ADR-21 § 3.7, mai lato client soltanto) tramite
   parsing AST con **`css-tree`** — libreria nuova, non nello stack immutabile: la sua introduzione
   richiede l'approvazione esplicita di questa stessa ADR ai sensi della constitution § "Regola
   sulle nuove dipendenze", non un'aggiunta silenziosa a `package.json`. `css-tree` è scelta (e non
   un parser regex/stringa) perché la sanitizzazione qui non può essere un filtro testuale: un
   allowlist di proprietà verificata su un CSS non parsato è aggirabile con commenti, escape
   Unicode o dichiarazioni annidate malformate — lo stesso motivo per cui `sanitize-html` (già in
   uso, ADR-21) opera su un DOM parsato e non su regex per `richText`.

2. **Auto-scoping obbligatorio**: ogni selettore dichiarato dall'utente viene riscritto dal
   sanitizzatore per essere annidato sotto `[data-block="<id-del-nodo>"]` prima della persistenza —
   l'utente scrive `color: red;` o al più regole con pseudo-classi/media query
   (`&:hover { ... }`, `@media (...) { ... }`), mai un selettore libero che potrebbe raggiungere
   altri nodi della pagina o l'admin stesso. Un selettore che l'utente tenta di scrivere
   esplicitamente (es. `body { ... }`) viene **rifiutato**, non silenziosamente riscritto: la
   riscrittura automatica riguarda solo lo scoping implicito della singola dichiarazione, non un
   tentativo di scavalcarlo.

3. **Allowlist di proprietà, non blocklist**: `css-tree` produce un AST di dichiarazioni; ogni
   `Declaration.property` è verificata contro un elenco chiuso di proprietà CSS sicure (dimensioni,
   colori, tipografia, flexbox/grid, transform, filter, transition — lo stesso superset di
   `SPEC-propkind-v2.md` § 3.9/3.10), **escluse esplicitamente e sempre**: `behavior`,
   `-moz-binding`, `expression`, qualunque proprietà con `expression(` nel valore (IE legacy, ma
   verificata comunque per difesa in profondità), `content` con `url()` esterno. Un'allowlist e non
   una blocklist perché una blocklist richiederebbe prevedere ogni futuro vettore CSS
  (`ADR-21` ha già scelto whitelist-first per `richText` con lo stesso ragionamento).

4. **Nessun `url()` salvo `public/media/<guid>`**: qualunque funzione `url()` nell'AST che non
   referenzi un percorso interno del `FilesModule` (stesso formato guid a 16 esadecimali del resto
   del registro) è rifiutata. Questo chiude sia l'esfiltrazione (richiesta a host esterno da CSS,
   es. `background: url(https://evil/track.png)`) sia l'iniezione di risorse non gestite
   dall'astrazione di storage di ADR-8.

5. **Nessuna regola `@import`, `@font-face`, `@namespace`**: rifiutate per intero se presenti
   nell'AST — `@font-face` ha già un percorso dedicato e sicuro (`customFonts` in `global_kit`,
   ADR-77), un secondo percorso via CSS libero duplicherebbe la superficie di validazione senza
   necessità.

6. **Rifiuto integrale, mai riparazione parziale silenziosa.** Un CSS che fallisce anche una sola
   regola del sanitizzatore produce `400` con il `path` della dichiarazione colpevole (stesso
   principio "mai persistere un valore diverso da quello validato" già in vigore per ogni altro
   `kind`) — il sanitizzatore **non** rimuove silenziosamente la dichiarazione incriminata e salva
   il resto, comportamento che sorprenderebbe l'autore (il CSS salvato sarebbe diverso da quello
   scritto, senza errore visibile).

### `kind: 'html'`

7. **Due profili distinti, mai un solo "HTML libero".** `{ kind: 'html'; profile: 'embed' }`
   copre il caso maggioritario (video/mappa/social embed): il valore passa da un profilo
   `sanitize-html` (stessa libreria già in uso, un secondo profilo di configurazione — nessuna
   dipendenza nuova) che ammette **solo** `<iframe>` il cui `src` appartiene a un'allowlist chiusa
   di host (YouTube, Vimeo, Google Maps, Spotify — coerente con `SPEC-propkind-v2.md` § 3.16 e con
   i provider di ADR-80), forza `sandbox="allow-scripts allow-same-origin allow-popups"` **anche
   se l'utente lo omette o lo scrive diverso**, e non ammette alcun `<script>`, `<style>`,
   `on*`, `<object>`, `<embed>`.

8. **Il secondo profilo ("HTML arbitrario") non passa da sanitizzazione a whitelist di tag: è
   isolato per costruzione in un `<iframe sandbox="">` (nessun permesso, non
   `allow-same-origin`, non `allow-scripts`) con il markup utente iniettato via `srcdoc` a
   export-time**, non un `<iframe src="...">` verso una risorsa separata. La differenza rispetto al
   punto 7 è netta: qui l'utente può scrivere markup arbitrario (compreso `<script>`, se lo desidera
   per un widget di terze parti), e la sicurezza non viene dalla pulizia del contenuto ma
   dall'assenza totale di privilegi del contesto in cui gira — uno script dentro un
   `iframe sandbox=""` senza `allow-scripts` **non esegue affatto**; con `allow-scripts` ma senza
   `allow-same-origin` esegue in un'origin opaca, senza accesso a cookie/storage/DOM del
   documento padre. La scelta fra "nessun privilegio" e "solo script, origin opaca" è un parametro
   del widget `html` (`SPEC-propkind-v2.md` § 3.16 non lo specifica: questa ADR fissa il default a
   **nessun privilegio**, `sandbox=""` puro, salvo che un futuro caso d'uso concreto non ne
   dimostri la necessità con una firma dedicata).

9. **Nessuna delle due sanitizzazioni gira lato client soltanto.** Come ogni altro `kind` (ADR-21 §
   3.7), il server rifiuta un valore che non supera la pulizia prima di persisterlo; l'editor
   applica la stessa pulizia lato client solo per l'anteprima immediata, mai come unico controllo.

10. **Soglia di ruolo**: `kind: 'css'` è disponibile a qualunque autore che possa editare il
    blocco che lo dichiara (stesso `minRole` del blocco ospite — nessuna soglia aggiuntiva, la
    sanitizzazione stessa è il controllo). `kind: 'html'` con `profile: 'embed'` segue la stessa
    regola. L'"HTML arbitrario" (punto 8) resta riservato a **SuperAdmin**, coerente con
    `docs/glossary.md` "SuperAdmin ... unico abilitato a ... usare il blocco HTML/embed" già
    dichiarato nel glossario esistente prima di questa ADR: questa ADR non introduce quella soglia,
    la eredita e la rende operativa per il nuovo profilo "sandbox libera".

---

## Alternative valutate

| Opzione | Pro | Contro | Motivo scarto |
|---|---|---|---|
| Mantenere il divieto assoluto (status quo) | Nessuna nuova superficie di attacco | Nessun clone di Elementor Pro è possibile senza Custom CSS e widget HTML — dichiarato esplicitamente non negoziabile dal committente per questi due casi | Blocca l'obiettivo di prodotto |
| Blocklist di proprietà/tag pericolosi invece di allowlist | Meno lavoro di manutenzione iniziale | Richiede prevedere ogni vettore futuro; stesso ragionamento già scartato da ADR-21 per `richText` | Whitelist-first è il pattern già stabilito nel repository |
| Parsing CSS con regex invece di `css-tree` | Nessuna dipendenza nuova | Aggirabile con CSS malformato ma valido per il browser (commenti, escape, annidamento) — non è una difesa reale | Sanitizzazione illusoria, stesso principio che ha fatto scegliere `sanitize-html` (DOM-based) per `richText` |
| `<iframe sandbox>` con `allow-same-origin` sempre attivo per semplicità | Un solo set di permessi da documentare | `allow-same-origin` + `allow-scripts` insieme **disabilita l'isolamento sandbox** (documentato dalla specifica HTML: la combinazione permette allo script di rimuovere il proprio stesso attributo `sandbox`) | Vanifica la sicurezza che il sandbox dovrebbe garantire |
| HTML arbitrario disponibile a Manager (non solo SuperAdmin) | Più autori possono usarlo | Il glossario esistente già riserva il blocco HTML/embed a SuperAdmin prima di questa ADR; abbassare la soglia sarebbe un allentamento di un vincolo di sicurezza già approvato, non coperto dallo scopo di questa ADR | Fuori scopo, richiederebbe firma propria |

---

## Conseguenze

- Nuova dipendenza approvata da questa ADR: `css-tree` (backend, solo in `BlockPropSanitizerService`
  — nessuna esposizione lato client del parser, la sanitizzazione resta server-side).
- `sanitize-html` (già presente) guadagna un secondo profilo di configurazione dedicato a
  `kind: 'html'` profile `'embed'`; nessuna dipendenza nuova per questo caso.
- Il worker `static-export` emette, per ogni nodo con `kind: 'css'` valorizzato, un blocco CSS
  scoping già risolto (il selettore è già stato riscritto in fase di sanitizzazione, non a export)
  dentro il CSS critico della pagina (ADR-53 § 2) — nessuna differenza di pipeline rispetto agli
  altri `kind` di stile.
- `kind: 'html'` profile `'embed'` produce markup diretto nel file statico (coerente con ADR-53:
  nessun runtime, l'`<iframe>` verso un host allowlisted è comunque "markup terminale" dal punto di
  vista del CMS). Il profilo "sandbox libera" produce un `<iframe sandbox="">` con `srcdoc`
  contenente il markup utente **as-is** (non sanitizzato — è l'isolamento del contesto, non la
  pulizia del contenuto, a fornire la sicurezza): questo va documentato chiaramente nell'inspector
  ("il contenuto non è filtrato, l'isolamento è strutturale") per non generare un falso senso di
  doppia protezione.
- Introduce per la prima volta nel registro un `kind` il cui valore può contenere una stringa non
  interamente prevedibile a priori (CSS/HTML): il test di escaping ereditato da ADR-22/ADR-53 § 7
  va esteso con casi dedicati per questi due `kind`, non solo per `plainText`/`richText`.
- Nessuna modifica allo schema PostgreSQL: entrambi i `kind` vivono nel `jsonb` esistente.

## Conformità

- Suite di sanitizzazione `css-tree`: property allowlist, rifiuto `url()` esterno, rifiuto
  `@import`/`@font-face`/`@namespace`, rifiuto selettore esplicito non annidabile, auto-scoping
  verificato sull'output.
- Suite `sanitize-html` profilo `embed`: solo host allowlisted superano la pulizia, `sandbox`
  sempre presente e mai `allow-same-origin` + `allow-scripts` insieme, nessun `<script>` residuo.
- Test dedicato: profilo "sandbox libera" produce sempre `sandbox=""` puro (nessun permesso) salvo
  override esplicito e documentato per widget futuri con firma propria.
- Test RBAC: un autore sotto SuperAdmin non può salvare un nodo con profilo "sandbox libera" (`403`
  o rifiuto DTO, coerente con il pattern RBAC esistente).
- Nessun `<script>` eseguibile nel documento padre può mai originare da `kind: 'css'`/`kind:
  'html'`: verificato con un test che tenta ogni vettore XSS noto (script tag, attributo `on*`,
  `javascript:` URL, CSS `expression()`) e asserisce il rifiuto server-side.

---

## Decisione umana

**Esito**: [x] Approvato così com'è · [ ] Approvato con modifiche (vedi note) · [ ] Rifiutato ·
[ ] Rinviato

**Approvato da**: marketing@antelmagroup.net · **Data**: 2026-09-18

**Note**: Approvazione raccolta in sessione Claude Code a supporto dell'implementazione del
Sub-Task S5.1 (Hardening Backend, Server-Side CSS-Tree Sanitization & Tree-Shaking Purge).
Nessun plan tracciato in `docs/ai/plans/` per S5.1 al momento dell'approvazione — vedi
`docs/ai/INDEX.md` per l'assenza di riferimento; l'implementazione copre solo il perimetro
`kind: 'css'` (punti 1-6 e 9-10 della Decisione sopra), non il perimetro `kind: 'html'`
(punti 7-8), non richiesto da questo sub-task.
