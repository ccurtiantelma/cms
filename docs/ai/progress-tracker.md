# Progress Tracker — Starter Kit

> File mantenuto dall'umano (vedi `docs/instructions.md` → "Policy docs — chi scrive dove").
> Le AI non modificano questo file autonomamente: lo stato viene aggiornato a fine feature,
> su richiesta esplicita.

---

| # | Feature | Spec/Riferimento | Status | Inizio | Completato |
|---|---|---|---|---|---|
| — | Setup infrastruttura (DB, Redis, Docker, main.ts) | docs/system-architecture.md | ✅ Done | — | — |
| — | Schema DB core (`users`, `audit_log`) + migrazioni | docs/business-rules.md | ✅ Done | — | — |
| — | Filtro errori globale backend (`AllExceptionsFilter`) | constitution: Error Handling Policy | ✅ Done | — | — |
| — | Autenticazione JWT (access + refresh con rotation) | docs/ai/adr/ADR-2-security-baseline.md | ✅ Done | — | — |
| — | RBAC a soglie di ruolo (SuperAdmin/Admin/Manager/User) | docs/business-rules.md: Attori e ruoli | ✅ Done | — | — |
| — | MFA TOTP (setup/enable/disable) | docs/business-rules.md: MFA | ✅ Done | — | — |
| — | Attivazione account + recupero password (anti-enumeration) | docs/business-rules.md: Autenticazione estesa | ✅ Done | — | — |
| — | Gestione utenti (Admin) | docs/business-rules.md: Attori e ruoli | ✅ Done | — | — |
| — | Impersonificazione utente (SuperAdmin only) | docs/business-rules.md: Impersonificazione | ✅ Done | — | — |
| — | Audit Log | docs/business-rules.md: Audit Log | ✅ Done | — | — |
| — | Pagina Profilo Utente (password, MFA, tema) | docs/business-rules.md: Pagina Profilo Utente | ✅ Done | — | — |
| — | Tema chiaro/scuro | docs/business-rules.md: Tema chiaro/scuro | ✅ Done | — | — |
| — | Tour guidato e help contestuale | docs/business-rules.md: Tour guidato | ✅ Done | — | — |
| — | Seed/reset dati demo | docs/business-rules.md | ✅ Done | — | — |
| — | Collezioni Bruno (auth + admin) | bruno/auth, bruno/admin | ✅ Done | — | — |
| — | Pipeline CI/CD (GitHub Actions: lint+test+build su PR, gate opzionale OpenAPI) | docs/ai/adr/ADR-5-ci-cd-pipeline.md | ✅ Done | 2026-07-23 | 2026-07-23 |
| — | Containerizzazione produzione (Dockerfile backend/frontend + docker-compose.prod.yml) | docs/ai/adr/ADR-6-containerizzazione-produzione.md | ✅ Done | 2026-07-23 | 2026-07-23 |
| — | Health check applicativo con @nestjs/terminus (DB + Redis + BullMQ) | docs/ai/adr/ADR-7-health-check-terminus.md | ✅ Done | 2026-07-23 | 2026-07-23 |
| — | Storage documenti — FilesModule (StorageDriver, local disk + S3-compatibile) | docs/ai/adr/ADR-8-storage-abstraction-files.md | ✅ Done | 2026-07-23 | 2026-07-23 |
| — | Remediation vulnerabilità dipendenze (drizzle-orm, nodemailer, vite/vitest) + fix permessi CI | docs/ai/adr/ADR-9-security-dependency-upgrades.md | ✅ Done | 2026-07-23 | 2026-07-23 |
| — | Scheduling: `@nestjs/schedule` (cron dichiarativo) + BullMQ repeatable job (pulizia blob orfani `FilesModule`) | docs/ai/adr/ADR-11-scheduling-cron-repeatable-jobs.md | ✅ Done | 2026-07-23 | 2026-07-23 |
| — | Export liste/report — `ExportService` core (Excel via exceljs, PDF via pdfkit) | docs/ai/adr/ADR-10-export-liste-report.md | ✅ Done | 2026-07-23 | 2026-07-23 |
| — | Notifiche persistenti (campanella/badge) + push realtime Socket.io (`NotificationsModule`, `RealtimeModule` montato) | docs/ai/adr/ADR-12-notifiche-persistenti-realtime.md | ✅ Done | 2026-07-23 | 2026-07-23 |
| — | Gestione sessioni/dispositivi attivi (`GET/DELETE auth/sessions`, tab "Sessioni attive" in Profilo) | docs/ai/adr/ADR-13-gestione-sessioni-dispositivi.md | ✅ Done | 2026-07-23 | 2026-07-23 |
| — | Osservabilità opzionale: Sentry (backend+frontend) + endpoint Prometheus `/metrics`, entrambi opt-in dietro `AppConstants` | docs/ai/adr/ADR-15-observability-sentry-prometheus.md | ✅ Done | 2026-07-23 | 2026-07-23 |
| — | E2E browser (Playwright): login → MFA → azione autenticata → logout | docs/ai/adr/ADR-16-e2e-browser-playwright.md | ✅ Done | 2026-07-26 | 2026-07-26 |
| — | State management frontend con Zustand (auth/notifiche/tema, sostituisce i 3 React Context) | docs/ai/adr/ADR-17-state-management-zustand.md | ⚠️ Bloccata — codice implementato e verificato, ADR-17 in attesa di approvazione umana | 2026-08-05 | — |

**Legenda**: ⏳ Pending · 🔄 In progress · ✅ Done · ⚠️ Bloccata

---

## Ordine di sviluppo consigliato

Le feature core elencate sopra sono la base ereditata dallo starter-kit: non vanno
re-implementate dal progetto verticale, solo estese se serve (es. nuovi campi profilo).

Ogni nuova feature di dominio del progetto verticale aggiunge una riga a questa tabella,
con riferimento alla propria spec in `docs/ai/specs/`.

---

## Note sprint corrente

[Vuoto — da compilare dall'umano man mano che il progetto verticale procede.]
