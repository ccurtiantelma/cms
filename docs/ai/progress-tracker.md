# Progress Tracker — CMS

> File mantenuto dall'umano (vedi `docs/constitution.md` → "Documentation Policy").
> Le AI non lo modificano autonomamente: lo stato viene aggiornato a fine feature, su
> richiesta esplicita.
>
> Ultima revisione: 2026-08-13 — aggiunta la sezione del dominio CMS.

---

## Parte 1 — Base di piattaforma (completata)

| Feature | Riferimento | Status | Completato |
|---|---|---|---|
| Setup infrastruttura (DB, Redis, Docker, main.ts) | docs/system-architecture.md | ✅ Done | — |
| Schema DB core (`users`, `audit_log`) + migrazioni | docs/business-rules.md | ✅ Done | — |
| Filtro errori globale backend (`AllExceptionsFilter`) | constitution: Error Handling Policy | ✅ Done | — |
| Autenticazione JWT (access + refresh con rotation) | ADR-2-security-baseline.md | ✅ Done | — |
| RBAC a soglie di ruolo (SuperAdmin/Admin/Manager/User) | business-rules: Attori e ruoli | ✅ Done | — |
| MFA TOTP (setup/enable/disable) | business-rules: MFA | ✅ Done | — |
| Attivazione account + recupero password (anti-enumeration) | business-rules: Autenticazione estesa | ✅ Done | — |
| Gestione utenti (Admin) | business-rules: Attori e ruoli | ✅ Done | — |
| Impersonificazione utente (SuperAdmin only) | business-rules: Impersonificazione | ✅ Done | — |
| Audit Log | business-rules: Audit Log | ✅ Done | — |
| Pagina Profilo Utente (password, MFA, tema) | business-rules: Pagina Profilo Utente | ✅ Done | — |
| Tema chiaro/scuro | business-rules: Tema chiaro/scuro | ✅ Done | — |
| Global Theme Customizer | ADR-4-global-theme-customizer.md | ✅ Done | 2026-07-26 |
| Tour guidato e help contestuale | business-rules: Tour guidato | ✅ Done | — |
| Seed/reset dati demo | business-rules: Funzioni di sistema | ✅ Done | — |
| Collezioni Bruno (auth + admin) | bruno/auth, bruno/admin | ✅ Done | — |
| Rate limiting endpoint auth | ADR-1-rate-limiting-auth.md | ✅ Done | — |
| Standard e2e, lint, format | ADR-3-standard-e2e-lint-format.md | ✅ Done | — |
| Pipeline CI/CD (GitHub Actions) | ADR-5-ci-cd-pipeline.md | ✅ Done | 2026-07-23 |
| Containerizzazione produzione | ADR-6-containerizzazione-produzione.md | ✅ Done | 2026-07-23 |
| Health check applicativo (@nestjs/terminus) | ADR-7-health-check-terminus.md | ✅ Done | 2026-07-23 |
| Storage documenti — FilesModule | ADR-8-storage-abstraction-files.md | ✅ Done | 2026-07-23 |
| Remediation vulnerabilità dipendenze | ADR-9-security-dependency-upgrades.md | ✅ Done | 2026-07-23 |
| Export liste/report (Excel + PDF) | ADR-10-export-liste-report.md | ✅ Done | 2026-07-23 |
| Scheduling (`@nestjs/schedule` + repeatable job) | ADR-11-scheduling-cron-repeatable-jobs.md | ✅ Done | 2026-07-23 |
| Notifiche persistenti + push realtime | ADR-12-notifiche-persistenti-realtime.md | ✅ Done | 2026-07-23 |
| Gestione sessioni/dispositivi attivi | ADR-13-gestione-sessioni-dispositivi.md | ✅ Done | 2026-07-23 |
| Cookie SameSite / valutazione CSRF | ADR-14-cookie-samesite-csrf.md | ✅ Done | — |
| Osservabilità opzionale (Sentry + `/metrics`) | ADR-15-observability-sentry-prometheus.md | ✅ Done | 2026-07-23 |
| E2E browser (Playwright) | ADR-16-e2e-browser-playwright.md | ✅ Done | 2026-07-26 |
| State management frontend con Zustand | ADR-17-state-management-zustand.md | ⚠️ Bloccata — codice implementato e verificato, ADR in attesa di approvazione umana | — |

---

## Parte 2 — Dominio CMS (da sviluppare)

> Sequenza e dipendenze in `docs/roadmap.md`. Nessuna riga può passare a "In progress"
> prima che spec e plan siano approvati.

| # | Feature | Pilastro | Riferimento | Status |
|---|---|---|---|---|
| F01 | Gestione Pagine (modello, stati, slug, revisioni) | fondativa | features/F01-gestione-pagine.md · specs/SPEC-F01-gestione-pagine.md | 📝 Spec in bozza, in attesa di approvazione |
| F02 | Registro e validazione dei Blocchi | 1 | — | ⏳ Pending |
| F03 | Superficie pubblica di lettura + cache | 2, 7 | — | ⏳ Pending |
| F04 | Editor visivo (page builder) | 1 | — | ⏳ Pending |
| F05 | Multilingua | 4 | — | ⏳ Pending |
| F06 | Template e Sezioni globali | 1 | — | ⏳ Pending |
| F07 | SEO per pagina | 2 | — | ⏳ Pending |
| F08 | GEO per pagina | 2 | — | ⏳ Pending |
| F09 | Media editoriali | 6 | — | ⏳ Pending |
| F10 | Moduli di contatto | 3 | — | ⏳ Pending |
| F11 | Chatbot integrato | 7 | — | ⏳ Pending |
| F12 | Dashboard editoriale | 5 | — | ⏳ Pending |

**Legenda**: ⏳ Pending · 📝 In definizione · 🔄 In progress · ✅ Done · ⚠️ Bloccata

---

## ADR mancanti che bloccano il dominio

Decisioni architetturali richieste dalla Architecture Policy e non ancora prese. Ognuna va
proposta come RFC e approvata prima dell'implementazione della feature che la richiede.

| ADR da produrre | Blocca |
|---|---|
| Formato e versionamento dello schema dei blocchi | F02, F04 |
| Strategia di versionamento/revisioni (snapshot vs. diff) | F01 |
| Caching e invalidazione del contenuto pubblico | F03 |
| Modello multilingua | F05 |
| Routing e risoluzione degli slug | F03 |
| Pipeline di trasformazione media e trattamento SVG | F09 |
| Scelta e confine del provider del chatbot | F11 |
| Generazione di sitemap e structured data | F07 |

---

## Debito documentale aperto

| # | Voce | Nota |
|---|---|---|
| D1 | ADR-13 e ADR-17 in attesa di approvazione umana | Il codice è già in produzione: la firma manca, non l'implementazione |
| D2 | ADR-4 disallineata dal codice | L'ADR descrive il contratto fino a `version: 7`, il codice è più avanti. Va chiusa con una nuova ADR, non riscrivendo quella approvata |
| D3 | Le ADR 1–17 conservano il lessico dell'origine del progetto (`starter-kit`, `progetto verticale`, `gestionale`) e i riferimenti ai repository progenitori (`cima-infortunistica`, `openbridge`) | Voluto: sono record storici immutabili. La nuova identità vive nei documenti normativi, non nella riscrittura del passato |
| D4 | ADR-5, ADR-6 e ADR-15 rinviano a file eliminati nella ristrutturazione del 2026-08-13 | Non correggibile senza modificare ADR approvate. Mappa dei rinvii qui sotto |

### Mappa dei rinvii storici

I file citati dalle ADR e non più esistenti vanno letti così:

| Riferimento nelle ADR | Dove si trova oggi |
|---|---|
| `docs/instructions.md` → "Policy docs — chi scrive dove" | `docs/constitution.md` → "Documentation Policy" → "Chi scrive dove" |
| `docs/instructions.md` (entry point AI, ordine di lettura, workflow) | `CLAUDE.md` (root) |
| `docs/RUNBOOK.md` | `docs/GUIDA_UTILIZZO.md` (contenuto assorbito) |
| `docs/MATRICE_AGENTI.md` | `CLAUDE.md` (root) → "Ruoli" |

---

## Note sprint corrente

Ristrutturazione documentale completata il 2026-08-13: identità del prodotto ridefinita
come CMS headless a pagine, regole di dominio redatte, roadmap dei 7 pilastri stabilita,
F01 pronta per l'approvazione.

Secondo passaggio dello stesso giorno, su richiesta esplicita dell'umano: `CLAUDE.md`
riportato alla forma rigorosa completa (670 righe) fondendo le definizioni inline dei 4
ruoli con l'identità CMS — una versione condensata intermedia aveva delegato i ruoli a
`.claude/agents/` e perso per strada l'intera Testing Policy. Allineati anche i due
template in `docs/ai/templates/`, che insegnavano ancora un `update` senza lock ottimistico
e non conoscevano il confine Mantine ↔ componenti dei blocchi.

**Prossimo passo atteso**: approvazione umana delle assunzioni A1–A6 in
`docs/business-rules.md` e della spec F01.
