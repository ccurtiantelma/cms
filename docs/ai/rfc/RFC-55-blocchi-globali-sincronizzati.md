# RFC-55 — Blocchi Globali Sincronizzati (`globalBlockId`) e riconciliazione con l'SSG air-gapped

## Status
[ ] In discussione · [x] Approvato → genera ADR-55 · [ ] Rifiutato

## Proposto da
AI Orchestrator · Data: 2026-09-05

---

## Problema

Un task esterno ("Fase 6 / Prompt 13") chiede di introdurre un "Blocco Globale
Sincronizzato": qualsiasi blocco o contenitore selezionato nel Canvas deve poter essere
convertito, da Floating Toolbar/Inspector, in un'entità riutilizzabile su più Pagine,
con un nodo puntatore `global-ref`/`globalBlockId` che ne referenzia il contenuto
nell'albero della Pagina, sincronizzato in tempo reale su Canvas e su `public-site`.

Prima di scrivere schema o codice, il controllo documentale preliminare (obbligatorio
per `CLAUDE.md` § Anti-hallucination) ha trovato tre conflitti con decisioni già
approvate, più un difetto preesistente sullo stesso perimetro.

**1. La feature non è nuova: esiste già, con un perimetro deliberatamente più
stretto.** `docs/roadmap.md` F06 — "Sezioni globali come riferimento condiviso" — è
implementata da `docs/ai/adr/ADR-40-sezioni-globali-e-layout.md` (approvata
2026-08-27) e dal modulo `app/backend/src/global-sections/` (tabella
`global_sections`, `layoutSlot: none|header|footer`). ADR-40 § Conseguenze è
esplicito: *"un solo nuovo `layoutSlot` come concetto di dominio — **non un nuovo tipo
di blocco, non un nuovo `kind`, non tocca il registro di ADR-21**"*. Il task esterno
chiede esattamente ciò che ADR-40 ha scartato in partenza (Opzione B della sua stessa
tabella alternative: "Header/Footer come Pagine" è stata bocciata per non piegare un
modello a un caso che non gli appartiene — un `global-ref` referenziabile ovunque
nell'albero di qualunque Pagina è un salto di scopo ancora più ampio, non contemplato).

**2. `ADR-21-schema-blocchi-versionamento.md` è chiusa a cinque tipi.** Riga 190:
*"I cinque tipi sono approvati uno per uno con questa ADR. Un sesto tipo è 'nuovo tipo
di blocco'"* — `CLAUDE.md` § Ask first lo elenca esplicitamente, e § Architecture
richiede ADR per "schema blocchi e versionamento". `global-ref` sarebbe il sesto tipo:
non posso registrarlo nel backend (`block-tree-validator.service.ts`) né nel frontend
senza una firma dedicata, per lo stesso motivo per cui RFC-38 non ha introdotto i suoi
`kind` senza passare da ADR-38.

**3. `ADR-53-air-gapped-ssg-zero-db.md` (approvata 2026-09-04, la più recente in
`docs/ai/adr/`) rende la superficie pubblica air-gapped e zero-DB.** Supera ADR-22/23/24:
nessuna API pubblica raggiungibile a runtime, nessun Postgres dietro al traffico
anonimo, contenuto servito da file statici pre-esportati (RFC-44/ADR-45,
`app/backend/src/export/`). Il requisito "propagazione in tempo reale... sulla
superficie pubblica" del task è quindi irrealizzabile com'è scritto: non esiste un
runtime pubblico a cui propagare nulla in tempo reale. L'unico canale legittimo è
quello già usato dal resto del sistema — invalidazione che accoda un job di
ri-esportazione (`ExportService.enqueueFullSiteExport`, `export.service.ts:81-84`,
commento *"rigenerazione completa (cambio tema/sezione globale)"*) — non un websocket
o un poll verso il pubblico.

**Difetto preesistente scoperto durante l'audit, rilevante per lo scoping di questa
RFC**: `GlobalSectionsService` (`app/backend/src/global-sections/global-sections.service.ts`,
righe 138/187/204) invalida solo la cache Redis `PublicGlobalSectionsCacheService` — il
meccanismo di ADR-23/ADR-40, pensato per il vecchio SSR a richiesta di ADR-22. Non
chiama mai `ExportService.enqueueFullSiteExport()`. Da quando ADR-53 ha superato
ADR-22/23, quella cache non è più letta da nessun consumer pubblico (il rendering è
statico, pre-esportato): oggi una modifica a una Sezione Globale già approvata
(header/footer) invalida una chiave che nessuno legge più, e **non** accoda la
ri-esportazione che la renderebbe visibile sui file statici pubblici. Questo è un
difetto di F06/ADR-40 indipendente dal task esterno, ma qualunque generalizzazione dei
blocchi globali erediterebbe lo stesso buco se costruita per analogia.

## Soluzione proposta

Non decido al posto dell'umano quale perimetro costruire. Presento tre inquadramenti,
con l'impatto architetturale di ciascuno — nessuno è eseguibile senza la relativa ADR.

### Opzione A — Generalizzare `global_sections` a riferimento in-tree arbitrario

Estendere l'entità già approvata (non una tabella nuova): un `layoutSlot` aggiuntivo o
un campo `slot: 'layout' | 'inline'` che permetta a una riga `global_sections` di
essere referenziata anche da un nodo dentro l'albero `content` di una Pagina qualsiasi,
non solo dai due slot fissi. Richiede comunque il sesto tipo di ADR-21 (il nodo
puntatore nell'albero della Pagina, es. `type: 'globalRef'`, prop
`globalSectionGuid`), ma **non** una nuova tabella né un nuovo modulo backend — riusa
CRUD, RBAC (Manager+, già la riga "Gestire Menu, Template, Sezioni globali" di
`docs/business-rules.md` riga 119) e pipeline di validazione/sanitizzazione esistenti.

- **Impatto**: una ADR che estenda ADR-21 (sesto tipo, forma minima: solo un `guid` di
  riferimento, zero props di contenuto proprie — il contenuto vive nella riga
  `global_sections` referenziata) + un'estensione di ADR-40 (il vincolo di unicità
  parziale su `header`/`footer` resta, il nuovo modo di referenziare è ortogonale).
  Risolve anche il difetto preesistente: la stessa ADR deve chiudere il collegamento
  mancante `GlobalSectionsService` → `ExportService.enqueueFullSiteExport()`.
- **Rischio**: riferimenti ciclici (una Sezione Globale che, nel proprio `content`,
  contenesse un nodo `globalRef` verso se stessa o verso una catena che torna a se
  stessa) — il validatore deve rifiutarli esplicitamente, non solo affidarsi
  all'assenza accidentale del caso nei dati di test. Nesting (`globalRef` dentro una
  Sezione Globale referenziata da un altro `globalRef`) va vietato o limitato a
  profondità 1 per contratto, non lasciato implicito.

### Opzione B — Nuova entità dedicata, distinta da `global_sections`

Dichiarare "Blocco Globale" come concetto di dominio a sé, separato dalle Sezioni
Globali (che restano solo header/footer): nuova tabella (`global_blocks` o simile),
nuovo modulo, eventualmente RBAC/ownership diversi da Manager+ (es. anche User se si
vuole una libreria "personale" oltre a quella condivisa — da chiarire, non assunto).

- **Impatto**: nuova tabella (`Ask first` § schema DB), nuovo modulo backend a
  superficie doppia Admin/Pubblica sul modello di `GlobalSectionsModule`, voce nuova in
  `docs/glossary.md` (un terzo termine oltre "Sezione globale" e "Template" — stessa
  cautela terminologica di RFC-F06 § Problema) e nella tabella permessi di
  `docs/business-rules.md`. Stesso identico sesto tipo di ADR-21 per il nodo puntatore.
- **Coerenza**: più fedele a un requisito generico "qualunque blocco può diventare
  globale" senza forzare la semantica di "Sezione" (oggi implicitamente
  header/footer-shaped) su casi che non lo sono. Costo: due entità che risolvono un
  problema quasi identico (riferimento condiviso + invalidazione a cascata) con due
  tabelle, due moduli, due pipeline di cache — duplicazione che né ADR-40 né ADR-21
  hanno mai tollerato altrove nel registro.

### Opzione C — Riperimetrare: nessun sesto tipo, estendere solo gli slot

Restare dentro il perimetro già firmato: aggiungere altri `layoutSlot` con cardinalità
1 (es. `sidebar`) invece di un riferimento in-tree libero. Risolve casi "blocco
riutilizzato in una posizione fissa del layout" ma **non** il requisito del task
("qualsiasi blocco selezionato nel Canvas → globale, ovunque nell'albero") — è un
descoping, non un'implementazione del prompt originale.

- **Impatto**: zero ADR nuove su ADR-21 (nessun sesto tipo), solo un'estensione
  dell'enum `GlobalSectionLayoutSlot` (`app/backend/src/common/enums.ts:18`) — cambio
  di schema blocco comunque soggetto ad `Ask first`, ma di scala minore.
- **Coerenza col task**: bassa. Consegna una versione ristretta di "globale", non la
  conversione libera da Floating Toolbar che il prompt descrive.

**Raccomandazione tecnica, non decisione**: Opzione A. Riusa l'unica ADR di dominio già
esistente sul concetto "contenuto condiviso e referenziato" (ADR-40) invece di
duplicarla (B), e consegna il requisito reale del task (qualunque blocco, non solo gli
slot fissi), a differenza di C. Il costo — il sesto tipo di ADR-21 — è comunque
inevitabile in ogni opzione che soddisfi il prompt alla lettera (A o B), quindi non è un
argomento contro A.

## Alternative valutate

| Opzione | Pro | Contro | Motivo scarto |
|---|---|---|---|
| Implementare `global-ref` alla lettera, subito, senza ADR | Aderenza 1:1 al prompt, consegna immediata | Viola `CLAUDE.md` § Ask first (nuovo tipo di blocco, schema DB) e § Divieti assoluti (scorciatoie senza ADR+approvazione); tocca un registro che ADR-21 dichiara chiuso senza firma | Stesso divieto categorico già applicato in RFC-38 per i nuovi `kind` |
| "Sincronizzazione in tempo reale" letterale verso `public-site` (WebSocket/poll pubblico) | Aderenza 1:1 al prompt | Richiede un runtime pubblico raggiungibile e/o una connessione dati verso il pubblico — esattamente la superficie DoS e l'accoppiamento di disponibilità che ADR-53 ha eliminato deliberatamente | Supersede implicito di ADR-53 senza RFC dedicata né firma umana |
| Far leggere a `public-site` il DB in diretta solo per i blocchi globali (eccezione al modello SSG) | Semplice da implementare, bypassa il problema dell'export | Reintroduce esattamente una delle tre dipendenze che ADR-53 § Contesto elenca come rischio (Node esposto/API raggiungibile/Postgres dietro), solo per un sottoinsieme di contenuto — incoerenza architetturale silenziosa | ADR-53 non ammette eccezioni parziali: l'air-gap è totale o non è air-gap |

## Impatto

- **Schema DB**: Opzione A non aggiunge tabelle; Opzione B ne aggiunge una
  (`Ask first`). In entrambe, il nodo puntatore nell'albero (`global-ref`/`globalRef`)
  è un sesto tipo in `ADR-21`, con proprio contratto di validazione/sanitizzazione (un
  solo campo `guid`, nessun contenuto proprio da sanitizzare — più vicino a
  `navMenuItem.pageGuid`, ADR-52, che a un tipo con props di stile).
- **Backend**: `block-tree-validator.service.ts` guadagna la risoluzione del
  riferimento (esistenza della riga referenziata, stato attivo, **rilevamento cicli**);
  `GlobalSectionsService` (o il modulo nuovo di B) deve chiamare
  `ExportService.enqueueFullSiteExport()` a ogni scrittura che tocca `content`/
  `isActive` — chiude anche il difetto preesistente descritto in § Problema. Serve un
  indice inverso (quali Pagine referenziano quale entità globale) per sapere cosa
  ri-esportare senza un full-site rebuild a ogni modifica minore, se il volume di
  contenuto lo giustifica — da decidere in sede di ADR, non assunto qui.
- **Frontend**: Floating Toolbar (`EditorBlockWrapper.tsx`) guadagna "Converti in
  Blocco Globale"; Canvas rende un overlay/badge distintivo sull'istanza; Zustand store
  guadagna un'azione di conversione (estrae sotto-albero, sostituisce con nodo
  puntatore) sul modello di `duplicateNodeAction` già presente
  (`useBlockEditorStore.ts`), non ancora esistente per "sostituisci con puntatore".
- **`public-site`**: nessuna sincronizzazione realtime. La propagazione è
  "invalidazione → job BullMQ `static-export` → file statico rigenerato", stessa SLA
  NFR già in vigore per la pubblicazione di una Pagina (< 5s dal commit, RFC-44
  Decisione 4) — non istantanea, non un canale nuovo.
- **RBAC**: Opzione A non ne richiede di nuovo (riusa Manager+ di "Sezioni globali");
  Opzione B lo richiede solo se si vuole un ambito "personale" diverso da quello
  condiviso — da decidere esplicitamente, non assumere per analogia con RFC-F06 § Rischi.

## Rischi

1. **Riferimenti circolari**: un'entità globale che referenzia se stessa (direttamente
   o tramite una catena) deve essere rifiutata dal validatore con un errore esplicito
   (path del nodo colpevole in `details`, come ogni altro 400 di dominio) — non un
   comportamento "che non si presenta nei test attuali".
2. **Concentrazione di rischio nell'editor visivo**, segnalata da `CLAUDE.md` §
   Orchestrator come area a rischio insieme al chatbot: conversione, overlay,
   sincronizzazione e invalidazione a cascata sono un sotto-sistema intero. Mitigazione:
   consegnare Opzione A in incrementi (prima il sesto tipo + risoluzione in lettura,
   poi l'azione di conversione da UI, infine l'overlay visivo) invece che in un round
   unico, sul modello che RFC-38 § Rischi 1 ha raccomandato per i `kind` multipli.
3. **Cascata di invalidazione non delimitata**: senza un indice inverso
   Pagina↔entità-globale, ogni modifica a un blocco globale molto usato forza un
   full-site rebuild — accettabile per header/footer (già il comportamento di ADR-40),
   rischioso se blocchi globali arbitrari diventano frequenti e piccoli. Da dimensionare
   in ADR, non nel codice.
4. **Debito preesistente non risolto altrove**: se questa RFC procede senza chiudere il
   collegamento mancante `GlobalSectionsService → enqueueFullSiteExport` (§ Problema),
   il nuovo meccanismo erediterebbe lo stesso difetto silenzioso — una modifica
   "salvata con successo" che non si vede mai sul sito pubblico.

---

## Decisione umana

**Esito**: [x] Approvato · [ ] Rifiutato · [ ] Modificato

**Note**: Opzione A confermata. Nesting/cicli chiusi per contratto (non per rilevamento a
grafo): un nodo `globalRef` è respinto se il sottalbero validato appartiene esso stesso a
una Sezione Globale (`BlockTreeValidationContext.insideGlobalSection`) — profondità di
riferimento sempre 0 dentro una Sezione Globale, non 1. Nessun indice inverso
Pagina↔entità globale in questo giro: ogni scrittura che tocca `content`/`layoutSlot`/
`isActive` di una riga `global_sections` accoda un full-site export, stesso comportamento
già accettato oggi per header/footer (ADR-40) — non una regressione.

**Approvato da**: ccurti · **Data**: 2026-09-05

**Azione successiva**: [x] Genera ADR-55 · [ ] Archivio

---

## Appendice — Bozza di piano operativo (non eseguibile, non è un PLAN-55)

Bozza descrittiva, non sostituisce un `docs/ai/plans/PLAN-55-*.md` (che l'Orchestrator
scrive solo su richiesta esplicita, dopo firma di questa RFC e delle ADR conseguenti).
Assume Opzione A (raccomandata); se l'umano scegie B o C i task da T2 in poi cambiano.

### T0 — Sbloccare la decisione concettuale (precondizione bloccante)
- Output atteso: nessun file — scelta A/B/C (o altra) registrata in "Decisione umana".
- Agente: umano (non delegabile).

### T1 — ADR: sesto tipo di blocco `globalRef` + estensione ADR-40
- Output atteso: `docs/ai/adr/ADR-55-blocchi-globali-globalref.md` (o numero libero al
  momento della firma), con forma del nodo, regola anti-ciclo, collegamento
  obbligatorio a `ExportService.enqueueFullSiteExport()`.
- Dipendenze: T0. Agente: nessuno — bozza solo su richiesta esplicita successiva, l'ADR
  non si auto-approva.

### T2 — Backend: registro + validatore + collegamento export
- Output atteso: nuovo descrittore in `app/backend/src/blocks/`, ramo di validazione
  con rilevamento cicli in `block-tree-validator.service.ts`, fix del collegamento
  mancante in `global-sections.service.ts` (o nel modulo di B).
- Dipendenze: T1. Agente: backend-developer.

### T3 — Frontend: azione di conversione + overlay Canvas
- Output atteso: azione store (sostituzione sotto-albero → puntatore) in
  `useBlockEditorStore.ts`, voce Floating Toolbar/Inspector, badge visivo sull'istanza.
- Dipendenze: T1 (contratto), T2 (validazione lato server da rispettare lato client).
  Agente: frontend-developer.

### T4 — Copertura di test
- Output atteso: unit test risoluzione riferimento + rilevamento cicli (vitest/jest),
  Bruno per l'endpoint toccato, e2e conversione da Canvas.
- Dipendenze: T2, T3. Agente: test-engineer.

### T5 — Verifica di build
- Output atteso: nessun file — solo verifica.
- Criterio di Done: `tsc --noEmit` su backend e frontend, suite verde.
- Agente: chi ha eseguito l'ultimo task di codice.
