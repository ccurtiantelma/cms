# Plan — F05 Multilingua e localizzazione dei contenuti

## Spec di riferimento
`docs/ai/rfc/RFC-F05-multilingua.md` (in discussione — nessun punto M1-M6 ancora firmato)

> ⚠️ Nessun task di questo piano può iniziare prima della firma dei punti corrispondenti
> della RFC (`CLAUDE.md` § Ask first, § Documentation Policy). Il piano è ordinato per
> essere eseguibile a mano a mano che le firme arrivano, non tutto insieme.

---

## Audit strategico

### Falle logiche / Contraddizioni rilevate nella richiesta iniziale

- **Dove**: richiesta iniziale, campo `translationGroupGuid`
  **Problema**: F01 ha già implementato e messo in produzione `translationGroupId`
  (`char(16)` opaco, S4 di `SPEC-F01`, confermata il 2026-08-17). Il nome proposto non
  esiste nello schema e introdurlo significherebbe rinominare una colonna già in uso da
  `pages.service.ts`, `pages.controller.ts`, DTO e OpenAPI.
  **Impatto**: implementare alla lettera avrebbe rotto il contratto esistente per un
  cambio di nome senza guadagno funzionale. **Risolto**: si riusa `translationGroupId`,
  vedi RFC § Premessa.

- **Dove**: richiesta iniziale, "routing con prefisso locale (`/:locale/*`)"
  **Problema**: la forma della URL pubblica è già decisa da **ADR-24 § 5** (approvata il
  2026-08-17): lingua di default senza prefisso, le altre con `/{locale}/...`. Un prefisso
  uniforme su tutte le lingue è l'alternativa che ADR-24 ha **già scartato**, proprio per
  evitare la riscrittura di massa delle URL della lingua principale.
  **Impatto**: implementare `/:locale/*` per ogni lingua avrebbe rotto ogni URL esistente
  della lingua di default e contraddetto un'ADR approvata (che si supera solo con una
  nuova ADR, non con un piano di feature). **Risolto**: si eredita la forma di ADR-24,
  vedi RFC § 4.

- **Dove**: `docs/roadmap.md` § F05, "Richiede ADR: modello multilingua"
  **Problema**: la scelta (righe autonome vs. campi affiancati) è già presa e già
  implementata da F01 (A3, S4), ma non esiste un documento `ADR-*` dedicato — solo la
  conferma in `business-rules.md`.
  **Impatto**: è un debito formale, non un blocco tecnico — il codice esiste da prima di
  questo piano. **Non risolto qui**: firma **M5** della RFC decide se produrre un'ADR di
  registrazione o aggiornare la roadmap.

### Rischi architetturali / Over-engineering

- **Componente**: tabella `locales` dedicata con CRUD proprio.
  **Rimedio**: **fuori scope**. Il numero di lingue di un sito è piccolo e non referenziato
  da FK in nessuna regola di dominio. Si riusa `app_settings` (pattern già in produzione
  per il Theme Customizer, ADR-4). Se un Locale accumulasse metadati propri in futuro
  (nome visualizzato, RTL, valuta), è un'estensione aggiungibile senza rifare questo lavoro.

- **Componente**: fallback automatico di lingua.
  **Rimedio**: vietato dalla regola 7 di `business-rules.md` § Multilingua. Ogni percorso
  del piano che tocca la risoluzione pubblica (T4) deve rispondere `404`, mai servire la
  lingua di default al posto di quella richiesta.

- **Componente**: editor multi-pannello per tradurre più lingue simultaneamente.
  **Rimedio**: non richiesto da nessuna regola di dominio. Lo switcher (T6) naviga fra
  Pagine indipendenti, ognuna con il proprio ciclo di editing — coerente con "bozza e
  pubblicato coesistono per riga", già implementato una volta sola in F01.

- **Componente**: generazione XML di `hreflang`/sitemap dentro F05.
  **Rimedio**: assegnata a F07 dalla roadmap. F05 espone solo i dati (T3), non genera
  markup: costruire il rendering qui duplicherebbe lavoro quando F07 arriverà con la sua
  ADR sitemap/SEO.

---

## Roadmap di implementazione

Tre passi, nell'ordine dichiarato dalla richiesta iniziale — **con una correzione**: il
registro dei Locale attivi (T1) deve esistere prima che la creazione di una traduzione
(T3) o la risoluzione pubblica (T4) abbiano qualcosa da validare, quindi resta comunque
il prerequisito reale, non solo quello dichiarato.

```
Step 1 — Schema DB & Migrazioni                              (T1, T2)   ⚠️ dipende da M1, M2
   │      Registro Locale attivi (app_settings) + indice di unicità
   │      per gruppo di traduzione. Nessuna UI e nessuna rotta pubblica
   │      hanno senso prima di questo passo.
   ▼
Step 2 — API Backend & Routing                                (T3, T4, T5)  ⚠️ dipende da M3, M4, M6
   │      Creazione traduzione, risoluzione pubblica locale-prefissata,
   │      esposizione dati hreflang per F07. Costruibile e testabile
   │      end-to-end via Bruno/Supertest senza UI.
   ▼
Step 3 — UI Editor Switcher Locale                            (T6)
          Switcher + "Crea traduzione" in PagePageDetail.tsx, contro
          il contratto di T3 già stabile.
```

---

## Task operativi (ordinati per dipendenze)

### T1 — Registro dei Locale attivi (backend)
- **Output atteso**:
  `app/backend/src/settings/dto/multilingual-settings.dto.ts` (nuovo) ·
  `app/backend/src/settings/settings.service.ts` (lettura/scrittura chiave
  `multilingual.locales` sul modulo `AppSettingsModule` esistente) ·
  `app/backend/src/settings/settings.controller.ts`
  (`GET`/`PUT app/settings/multilingual`, `GuardAdmin`)
- **Dipendenze**: firma **M1**, **M6** della RFC
- **Criterio di Done**: `GET app/settings/multilingual` restituisce
  `{ active: string[], default: string }`, con fallback a
  `{ active: [AppConstants.defaultLocale], default: AppConstants.defaultLocale }` se la
  chiave non è ancora stata scritta; `PUT` rifiuta con `400` se `default` non è incluso in
  `active`; solo Admin+ può scrivere, ogni ruolo autenticato può leggere (necessario allo
  switcher di T6); `npm run openapi:export` + `openapi:types` eseguiti.
- **Agente**: backend-developer

### T2 — Vincolo di unicità per gruppo di traduzione (backend)
- **Output atteso**:
  `app/backend/src/db/schema.ts` (⚠️ indice `pages_translation_group_locale_uq` su
  `(translation_group_id, locale)` filtrato su `is_active`) ·
  migrazione `drizzle-kit generate` ·
  `app/backend/src/common/db-error.mapper.ts` (nuovo `code` distinto per questo conflitto,
  se non già coperto dal mapping generico di violazione indice)
- **Dipendenze**: firma **M2** — ⚠️ **bloccante, tocca lo schema**
- **Criterio di Done**: un tentativo di creare due righe con lo stesso
  `translationGroupId` e lo stesso `locale` (entrambe `is_active`) fallisce con `409` a
  livello DB, mappato dal filtro globale, mai da un controllo preventivo in `pages.service.ts`;
  una riga soft-eliminata libera lo slot, coerente con il pattern già in uso per lo slug.
- **Agente**: backend-developer

### T3 — Creazione di una traduzione (backend)
- **Output atteso**:
  `app/backend/src/pages/dto/create-translation.dto.ts` (nuovo) ·
  `app/backend/src/pages/pages.service.ts` (`createTranslation()`) ·
  `app/backend/src/pages/pages.controller.ts`
  (`POST app/pages/:guid/translations`)
- **Dipendenze**: T1 (validazione Locale attivo), T2 (vincolo DB) · firma **M3**
- **Criterio di Done**: `404` su Pagina sorgente inesistente/soft-eliminata; `400` se
  `locale` non è in `active`; `409` se la coppia `(translationGroupId, locale)` esiste già
  (dal vincolo di T2, non da una query preventiva); la riga creata condivide
  `translationGroupId` con la sorgente, nasce `status='draft'`, `parentId=null`,
  `draftContent`/`draftSeo` sono deep-clone della sorgente (non lo stesso riferimento
  `jsonb` — verificato mutando la copia e controllando che la sorgente resti intatta);
  stesse regole di ownership di `POST app/pages` (ADR-18); `openapi:export`+`types` eseguiti.
- **Agente**: backend-developer

### T4 — Risoluzione pubblica locale-prefissata
- **Output atteso**:
  `app/backend/src/pages/public-path.util.ts` (estrazione del prefisso di lingua) ·
  `app/backend/src/pages/public-pages.service.ts` (risoluzione con `locale` estratto) ·
  `app/backend/src/pages/public-pages.controller.ts`
- **Dipendenze**: T1 (elenco Locale attivi per il match del prefisso) · firma **M4**
- **Criterio di Done**: `/chi-siamo` continua a risolvere nella lingua di default,
  invariato bit a bit rispetto a oggi (test di non-regressione esplicito); `/en-GB/about`
  risolve nella traduzione inglese se `en-GB` è attivo e la Pagina esiste `published`;
  un primo segmento che non corrisponde a nessun Locale attivo è trattato come primo slug
  nella lingua di default (nessun cambio di comportamento); Pagina assente in quel Locale →
  `404`, mai fallback alla lingua di default; canonicalizzazione (ADR-24 § 4) applicata dopo
  l'estrazione del prefisso; nessuna colonna nuova, nessuna query fuori dagli indici già
  esistenti.
- **Agente**: backend-developer

### T5 — Dati traduzioni per `hreflang` (backend)
- **Output atteso**: `app/backend/src/pages/dto/public-page.dto.ts` (campo opzionale
  `translations: { locale: string; path: string }[]`) ·
  `app/backend/src/pages/public-pages.service.ts` (popolamento da `translationGroupId`,
  solo traduzioni `published`)
- **Dipendenze**: T3, T4
- **Criterio di Done**: l'endpoint pubblico di lettura Pagina espone la lista delle
  traduzioni pubblicate dello stesso gruppo (locale + percorso), esclusa la Pagina corrente
  se non pubblicata; il campo è assente/vuoto se la Pagina non ha traduzioni pubblicate;
  nessun markup `hreflang` generato qui (fuori scope, assegnato a F07); `openapi:export`+`types`.
- **Agente**: backend-developer

### T6 — Switcher di Locale in editor (frontend)
- **Output atteso**:
  `app/frontend/src/services/pages.service.ts` (metodo `createTranslation`) ·
  `app/frontend/src/pages/pages/PagePageDetail.tsx` (switcher `Select` + azione "Crea
  traduzione")
- **Dipendenze**: T1 (elenco Locale attivi da proporre), T3 (endpoint di creazione)
- **Criterio di Done**: lo switcher elenca le traduzioni esistenti del gruppo (da T5 o da
  una query dedicata se T5 non è ancora consumato altrove) e naviga alla Pagina scelta;
  "Crea traduzione" propone solo i Locale attivi **non** già presenti nel gruppo; ogni
  chiamata API in `try`/`catch` con `notifications.show`; un `409` di traduzione già
  esistente (corsa fra due editor) mostra un messaggio esplicito, mai un overwrite silenzioso.
- **Agente**: frontend-developer

### T7 — Suite di test
- **Output atteso**:
  `bruno/settings/multilingual-get.yml`, `bruno/settings/multilingual-put.yml` ·
  `bruno/pages/create-translation.yml` ·
  integration test Supertest su T1, T3, T4 (inclusa la non-regressione della lingua di
  default) · unit test su `public-path.util.ts` (estrazione prefisso) · unit test sul
  deep-clone di T3 · test frontend sullo switcher (T6)
- **Dipendenze**: T1-T6
- **Criterio di Done**: per ogni endpoint nuovo — happy path, un errore, un caso RBAC non
  autorizzato; copertura esplicita dei tre scenari di dominio critici — nessun fallback
  automatico di lingua, unicità `(translationGroupId, locale)` rispettata, non-regressione
  della risoluzione pubblica senza prefisso; nessun `any` su mock/payload; nessun test
  placeholder.
- **Agente**: test-engineer

---

## Matrice dei rischi

| Rischio | Probabilità | Impatto | Mitigazione |
|---|---|---|---|
| Firma **M2** negata (indice di unicità) | Bassa | Medio | T3 resta costruibile con un controllo applicativo (non garantito da DB): degrado dichiarato, non silenzioso. Da rivalutare se il conflitto si presenta in pratica. |
| Configurazione di `app_settings` con `default` non incluso in `active` | Bassa | Alto | T1 rifiuta la scrittura con `400`; nessuno stato incoerente raggiungibile via API. |
| Collisione fra un primo segmento di path reale e un codice Locale attivo | Bassa | Medio | Vedi RFC § Rischi — conflitto di configurazione dichiarato, non ambiguità di risoluzione. |
| Deriva verso un'ADR sitemap/hreflang scritta dentro F05 | Media | Basso | T5 esplicitamente non genera markup; il criterio di Done lo vieta. |
| Debito ADR (M5) non firmato, roadmap resta inconsistente | Alta | Basso | Non blocca l'implementazione tecnica; è una voce a sé, tracciata nella RFC. |

---

## Definition of Done — Checklist globale

### Prerequisiti di firma (bloccanti)
- [ ] **M1** Registro Locale come chiave `app_settings` approvato
- [ ] **M2** Migrazione indice `pages_translation_group_locale_uq` approvata
- [ ] **M3** Endpoint `POST app/pages/:guid/translations` con la semantica descritta approvato
- [ ] **M4** Risoluzione pubblica locale-prefissata approvata
- [ ] **M5** Debito ADR modello multilingua: sciolto (ADR di registrazione o aggiornamento roadmap)
- [ ] **M6** RBAC Admin+ sul registro Locale approvato

### Implementazione
- [ ] Tutti i task implementati
- [ ] Nessun `any` TypeScript senza commento
- [ ] Nessun `console.log` rimasto
- [ ] Ogni funzione pubblica con JSDoc
- [ ] Nessuna dipendenza npm nuova
- [ ] Nessuna colonna nuova su `pages` oltre l'indice di T2 (nessuna migrazione a sorpresa)
- [ ] `/chi-siamo` (lingua di default) invariato bit a bit rispetto a prima di T4

### Test
- [ ] Unit test scritti e superati (Jest backend, Vitest frontend)
- [ ] Integration test Supertest per T1, T3, T4
- [ ] Collezioni Bruno per ogni endpoint nuovo
- [ ] Nessun test placeholder

### Build e qualità
- [ ] `npx tsc --noEmit` pulito su backend e frontend
- [ ] `npm run build --workspace=app/backend` superata
- [ ] `npm run build --workspace=app/frontend` superata
- [ ] Lint superato

### Contratti e documentazione
- [ ] `npm run openapi:export` eseguito
- [ ] `npm run openapi:types` eseguito
- [ ] `docs/ai/progress-tracker.md` aggiornato **su richiesta umana esplicita**

### Commit
- [ ] Commit atomico per task, Conventional Commits
- [ ] Branch `feature/F05-multilingua`
