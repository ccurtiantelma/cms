# ADR-74 — Isole JS pubbliche: bundle `public-runtime.js`, deroga controllata ad ADR-53

## Status
[x] **In discussione** · [ ] Approvato · [ ] Rifiutato · [ ] Superseded da ADR-XXX

## Data approvazione
_In attesa di firma umana — vedi "Decisione umana" in fondo a questo documento._

## RFC di riferimento
Nessuna RFC dedicata: ADR-74–ADR-80 sono il round **R0 — Decisioni fondative** di
`docs/PLAN-parita-elementor-pro.md`, un round dichiarato "solo documenti" proprio per evitare il
costo di una RFC completa su decisioni ribaltabili a costo zero prima che il codice esista.
Riferimenti sostanziali: `docs/ELEMENTOR_PRO_GAP_ANALYSIS_v2.md` § 4.1, `docs/SPEC-propkind-v2.md`
§ 7 ultimo paragrafo.

## Numerazione
Il piano operativo (`PLAN-parita-elementor-pro.md`, redatto 2026-09-16) assegnava a questo
round i numeri **73–79**, in continuità con "ultima firmata: ADR-72". Nel frattempo è stata
approvata `ADR-73-rimozione-maniglie-resize-widget-foglia.md` (2026-09-16, dominio Editor
Visivo/Canvas, indipendente da questo round). Stesso principio già applicato da ADR-53 § 
"Numerazione": una ADR approvata non si riscrive, la decisione prende il primo numero libero.
Questo round occupa quindi **ADR-74–ADR-80**; ogni riferimento incrociato fra questi documenti usa
già la numerazione corretta. `docs/PLAN-parita-elementor-pro.md` § "Riepilogo" va aggiornato in
coda a questa firma (nota, non richiede una nuova ADR: è un piano, non una decisione approvata).

## ADR superate da questa decisione
Nessuna. Questa ADR **deroga puntualmente** ad `ADR-53-air-gapped-ssg-zero-db.md` § "Decisione"
punto 2 ("i blocchi statici non caricano framework runtime né script di hydration: il markup
prodotto è terminale"), senza sovrascriverla: ADR-53 resta il regime di default per ogni pagina
che non dichiara isole JS, e il resto della sua decisione (build-on-publish, air-gap di rete,
zero database sul pubblico, CSS critico inline, escaping a valle) resta identico e vincolante.

---

## Contesto

`ELEMENTOR_PRO_GAP_ANALYSIS_v2.md` § 4 elenca undici funzionalità di parità (countdown, popup,
carousel con autoplay reale, motion effects, lightbox, form multi-step con validazione client,
loop "load more", ricerca client, table of contents con scroll-spy, sticky/parallax) che
**richiedono per natura esecuzione JS nel browser del visitatore anonimo**: nessuna di queste è
esprimibile come CSS puro o come markup statico, a differenza di quanto ADR-58/ADR-50 hanno fatto
per stile e sfondo. Il vincolo "zero-JS pubblico" di ADR-53 § "Decisione" punto 2 — motivato da
superficie d'attacco e determinismo del rendering, non da una preferenza estetica — è quindi in
conflitto diretto con l'obiettivo dichiarato dal committente di "clone funzionale completo di
Elementor Pro" (`ELEMENTOR_PRO_GAP_ANALYSIS_v2.md` riga 3, "vincoli di sicurezza rinegoziabili").

Il conflitto va risolto **prima** di R4/R5/R6 (widget base, runtime, widget Pro), perché ogni
widget di quelle liste porta nella propria definizione un campo (`meta.runtime`, § 3 sotto) la cui
forma dipende da questa decisione. Rinviarla avrebbe fatto scrivere N volte lo stesso
compromesso, uno per widget.

Tre proprietà di ADR-53 sono **non negoziabili** e restano intatte da questa ADR:
1. l'air-gap di rete (nessun processo sulla macchina pubblica interroga PostgreSQL/Redis/NestJS);
2. il build-on-publish (il contenuto attraversa il confine gestione→pubblico solo nel job di
   export, mai a runtime);
3. l'assenza di un runtime applicativo lato server sul pubblico.

Ciò che va rinegoziato è solo l'affermazione "il markup prodotto è terminale, nessuno script"
lato **client**, non lato server.

---

## Decisione

1. **Un solo bundle pubblico, `public-runtime.js`**, ESM, senza framework (nessun React, nessuna
   dipendenza runtime — coerente con "Regola sulle nuove dipendenze" della constitution:
   introdurre un framework runtime pubblico sarebbe una firma a sé, non coperta da questa ADR),
   compilato da `app/public-runtime/` con Vite in modalità libreria. Contiene N **moduli
   indipendenti**, uno per capability (`observer`, `motion`, `countdown`, `carousel`, `lightbox`,
   `popup`, `formSteps`, `loopPagination`, `search`, `toc`), ciascuno un modulo ESM separato con
   effetto collaterale nullo all'`import`: si attiva solo leggendo attributi `data-*` sul DOM
   effettivamente presente nella pagina. Un bundle unico e non uno-script-per-widget (alternativa
   scartata, tabella sotto) perché HTTP/2 su un unico file cacheabile a lungo (fingerprint
   nell'URL, come già i CSS di ADR-53 § 3) costa meno del round-trip di N richieste piccole, e
   perché un solo punto di build è un solo punto di audit per il budget di peso del punto 2.

2. **Budget di peso: ≤ 30 KB gzip per l'intero bundle**, misurato in CI (§ "Conformità"). Non è
   un obiettivo, è un **gate**: una pull request che porta il bundle oltre soglia non passa CI. Il
   numero non è arbitrario — è l'ordine di grandezza del runtime minimo di Elementor Pro stesso
   (`frontend.min.js` + moduli lazy) e resta muto rispetto al costo di ogni singolo widget: se un
   modulo futuro (es. `lottie`, esplicitamente segnalato "richiede JS pubblico" in
   `ELEMENTOR_PRO_GAP_ANALYSIS_v2.md` § 1.3) non ci sta nel budget condiviso, la sua libreria di
   supporto non entra in questo bundle — resta un caso R6 a sé, con la propria ADR se necessaria.

3. **Caricamento condizionale, mai incondizionato.** Il job di export (worker `static-export`,
   ADR-53 § "Decisione" punto 1) analizza l'albero blocchi pubblicato e, se **almeno un nodo**
   dichiara nel proprio `meta.runtime: string[]` (elenco chiuso dei nomi di modulo sopra) un
   requisito, inserisce nel file statico:
   - un `<script type="module" src="/assets/public-runtime.<hash>.js" defer>`;
   - un attributo `data-runtime-modules="<lista separata da spazio>"` sul tag che lo introduce,
     letto dal bundle stesso per decidere quali dei suoi N moduli inizializzare (gli altri restano
     `import`-ati ma inerti — nessun secondo bundle per sottoinsieme, che moltiplicherebbe la
     superficie di cache-busting per un risparmio di peso già coperto dal punto 2).
   Una pagina che non usa nessun blocco con `meta.runtime` non riceve **alcun** tag `<script>`:
   resta byte-per-byte nel regime "markup terminale" di ADR-53 per la sua interezza, non solo per
   la CSP.

4. **CSP con nonce per pagina, generato a build-time.** Ogni file HTML che include il bundle porta
   un header/meta `Content-Security-Policy: script-src 'self' 'nonce-<valore>'` con `<valore>`
   generato dal worker di export ad ogni build di quella pagina (non un nonce di sito fisso, che
   sarebbe staticamente estraibile dal file stesso e vanificherebbe la protezione) e iniettato sia
   nell'header servito dall'edge (ADR-53 § "Decisione" punto 4, quando l'edge supporta header
   custom) sia in un `<meta http-equiv="Content-Security-Policy">` di fallback nel documento.
   Nessun `unsafe-inline`, nessun `unsafe-eval`: qualunque logica del bundle che oggi userebbe
   `eval`/`Function()` (nessuna prevista) è vietata per costruzione dalla policy.

5. **`prefers-reduced-motion` è un contratto del bundle, non un'opzione per modulo.** I moduli
   `observer` (entrance animation) e `motion` (scroll/mouse effects) leggono
   `matchMedia('(prefers-reduced-motion: reduce)')` una sola volta all'inizializzazione e, se
   vero, non applicano alcuna trasformazione: il contenuto resta visibile e statico, mai nascosto
   in attesa di un'animazione che non parte. Gli altri moduli (countdown, carousel, lightbox,
   popup, formSteps, loopPagination, search, toc) non sono motion e non leggono questa media
   query.

6. **Zero chiamate di rete dal bundle**, salvo due eccezioni esplicite e chiuse: la sottomissione
   di un form (`formSteps` invia a un endpoint pubblico di submission, già esistente per il
   Modulo di contatto, non introdotto da questa ADR) e la lettura di un indice statico
   pre-generato (`search-index.json`, `loopPagination` per `?page=N` già materializzate a export).
   Nessun modulo apre una `WebSocket`, nessun modulo interroga un'API di terze parti a runtime
   (`ELEMENTOR_PRO_GAP_ANALYSIS_v2.md` riga 59, mappa/video restano **embed** governati da
   ADR-80, non moduli di questo bundle). `check-air-gap.js` (già esistente per ADR-53) viene esteso
   con un caso che carica ogni pagina campione con un proxy che fallisce qualunque richiesta non
   nell'allowlist dei due punti sopra: la CI diventa rossa se un modulo futuro tenta una terza via.

7. **Il bundle è codice del CMS, non contenuto utente.** Nessuna prop di alcun `kind` (§
   `SPEC-propkind-v2.md`) può iniettare JavaScript eseguito da questo bundle: i moduli leggono solo
   attributi `data-*` con forma chiusa e valori tipizzati (numero, stringa da allowlist, guid),
   mai una stringa di codice. `kind: 'css'`/`kind: 'html'` (ADR-78) restano l'unica superficie di
   contenuto utente semi-libero e non hanno relazione con questo bundle.

---

## Alternative valutate

| Opzione | Pro | Contro | Motivo scarto |
|---|---|---|---|
| Mantenere zero-JS assoluto (status quo ADR-53) | Nessun rischio nuovo, air-gap totale anche lato client | Il gap analysis dichiara 11+ funzionalità irraggiungibili senza JS; il committente ha dichiarato i vincoli di sicurezza "rinegoziabili" per questo obiettivo | Blocca l'obiettivo di prodotto dichiarato |
| Uno script separato per widget/modulo (N richieste) | Nessun peso caricato per moduli non usati sulla pagina | N round-trip invece di uno, N voci di cache-busting, CSP con N nonce o whitelist di N hash | Costo di rete > risparmio di peso su pagine con più di un modulo (caso comune: countdown + form + carousel) |
| Framework runtime completo (es. Alpine.js, Stimulus) | Produttività di scrittura dei moduli | Dipendenza pesante non coperta dallo stack immutabile, richiede RFC/ADR propria per la constitution § "Regola sulle nuove dipendenze", rischia di sforare il budget da solo | Nessun bisogno reale: i moduli sono comportamenti isolati su DOM statico, non un'applicazione client |
| Hydration parziale (islands React) | Riuso di componenti React esistenti | Reintroduce un runtime React sul pubblico — esattamente l'alternativa scartata da ADR-53 § "Alternative valutate" ultima riga | Riapre una decisione già chiusa senza un fatto nuovo che la giustifichi |
| Nonce di sito fisso invece che per pagina/build | Header più semplice da generare | Estraibile staticamente dal file HTML stesso: chiunque legga il markup pubblicato può costruire uno script con quel nonce | Vanifica la protezione CSP che la si introduce a fare |

---

## Conseguenze

- **`docs/constitution.md` § Principle 8** ("Public Read is a Different Citizen") va integrato
  con la clausola "...con isole JS dichiarate esplicitamente per blocco, mai codice utente
  arbitrario" (task di aggiornamento del round R0, non di questa ADR: la constitution non si
  modifica di iniziativa AI, richiede la stessa firma umana di questa decisione).
- Ogni `BlockDefinition` che introduce un widget dei round R5/R6 dichiara `meta.runtime:
  string[]` come parte del proprio contratto — un campo nuovo nel registro, non un `kind` di prop
  (nessuna sanitizzazione aggiuntiva richiesta: è un elenco chiuso di nomi di modulo, verificato
  contro l'unione dei dieci moduli dichiarati al punto 1).
- Il worker `static-export` guadagna uno stadio in più (rilevazione `meta.runtime` sull'albero,
  generazione nonce, iniezione tag): va misurato contro l'NFR di ADR-53 § "Conseguenze"
  ("build + sync entro 5 secondi").
- Lighthouse CI (PLAN R5 T5) diventa gate permanente: bundle ≤ 30 KB gzip e `TBT < 50 ms` su una
  pagina demo che carica **tutti** i moduli contemporaneamente (caso peggiore reale).
- **Nessuna modifica allo schema PostgreSQL.** Il campo `meta.runtime` vive nel registro
  (TypeScript) e nell'albero blocchi `jsonb` già esistente, non in una tabella nuova.
- Il debito di superficie che questa ADR apre — CSP, allowlist di host per gli embed di ADR-80,
  audit del bundle — richiede revisione di sicurezza a ogni modulo nuovo aggiunto dopo R5: non è
  una firma "una tantum" per tutti i moduli futuri, è il contratto per i dieci nominati qui.

## Conformità

- CI: job dedicato che compila `app/public-runtime/`, misura la dimensione gzip del bundle e
  fallisce sopra 30 KB.
- `check-air-gap.js` esteso: nessuna richiesta di rete dal bundle fuori dalle due eccezioni del
  punto 6, verificato su ogni pagina campione con tutti i moduli attivi.
- Nessun file statico privo di `meta.runtime` in albero contiene un tag `<script>`: asserito come
  test snapshot sull'output del job di export.
- Ogni pagina con bundle incluso porta un nonce diverso dalle altre pagine della stessa build:
  asserito confrontando due file d'esempio nella stessa suite di export.
- `observer`/`motion` non applicano trasformazioni quando `prefers-reduced-motion: reduce`:
  verificato in Playwright con l'emulazione della media query.

---

## Decisione umana

**Esito**: [ ] Approvato così com'è · [ ] Approvato con modifiche (vedi note) · [ ] Rifiutato ·
[ ] Rinviato

**Approvato da**: _______________ · **Data**: _______________

**Note**:
