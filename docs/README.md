# CMS

Content Management System **headless**, ad alte prestazioni e sicuro, orientato alla
produzione e gestione di **Pagine** — non un motore di blog.

L'obiettivo è un super clone avanzato di WordPress/Elementor: la pagina è l'entità
centrale, composta da blocchi visuali, versionata, tradotta, ottimizzata per i motori di
ricerca e per i motori generativi, e servita via API a qualsiasi frontend.

## I 7 pilastri

1. Editor visivo avanzato (page builder a blocchi)
2. Gestione SEO e GEO per pagina
3. Moduli di contatto integrati
4. Gestione multilingua nativa
5. Dashboard di controllo
6. Gestione del tema e delle risorse
7. Chatbot integrato

Stato di ciascuno e sequenza di sviluppo: `docs/roadmap.md`.

## Cosa c'è già

Autenticazione JWT (access + refresh con rotation), RBAC a soglie di ruolo, MFA TOTP,
audit log, impersonificazione SuperAdmin, gestione utenti, profilo, sessioni/dispositivi,
notifiche persistenti + realtime, storage documenti, export Excel/PDF, health check,
scheduling, osservabilità opzionale, tour guidato, theme customizer.

La logica di dominio del CMS si costruisce sopra questa base.

## Stack

- **Backend**: NestJS 11 · TypeScript 5 · PostgreSQL · Drizzle ORM · Redis · BullMQ · Socket.io
- **Frontend**: React 19 · Vite · Mantine v7 · Axios · React Router · Zustand
- **Metodo**: Spec-Driven Development con framework EAIDOS

## Avvio rapido

```bash
npm install
cp .env.example app/backend/.env     # compila con i valori reali
cp .env.example app/frontend/.env    # compila con i valori reali
docker-compose up -d                 # postgres + redis + mailhog
npm run db:migrate
npm run seed
npm run dev
```

| Servizio | URL |
|---|---|
| Frontend | http://localhost:5175 |
| Backend API | http://localhost:3001/api/v1 |
| Swagger (fuori produzione) | http://localhost:3001/api/v1/docs |
| Mailhog (email di sviluppo) | http://localhost:8026 |

## Documentazione

Ordine di lettura obbligatorio per chiunque — umano o AI — apra il progetto:

| # | File | Contenuto |
|---|---|---|
| 1 | `CLAUDE.md` (root) | Regole operative, ruoli AI, divieti assoluti |
| 2 | `docs/constitution.md` | Identità del prodotto, stack e regole immutabili |
| 3 | `docs/business-rules.md` | Regole di dominio: pagine, stati, permessi, SEO/GEO, multilingua |
| 4 | `docs/glossary.md` | Dizionario dei termini — se non è qui, non esiste |
| 5 | `docs/roadmap.md` | I 7 pilastri mappati sulle feature, ordinate per dipendenze |
| — | `docs/TODO.md` | **A che punto siamo e cosa serve decidere** — elenco operativo ordinato |
| 6 | `docs/system-architecture.md` | Struttura monorepo, porte, superfici API, moduli |
| 7 | `docs/non-functional-requirements.md` | Soglie di performance, sicurezza, integrità del contenuto |
| 8 | `docs/openapi.yaml` | Contratto API (generato, non modificare a mano) |
| — | `docs/GUIDA_UTILIZZO.md` | Comandi e flusso di lavoro quotidiano |
| — | `docs/ai/` | ADR, RFC, spec, feature, plan, template, progress tracker |

## AI

Questo progetto usa il framework EAIDOS (Spec-Driven Development). `CLAUDE.md` nella root
è la **fonte canonica unica** delle regole operative e delle definizioni dei 4 ruoli
(Orchestrator, Backend Developer, Frontend Developer, Test Engineer). Per attivare un
ruolo, specificalo nel prompt: "Agisci come Backend Developer".

Regola non negoziabile: se un'informazione non è nei file `docs/`, **non va inventata** —
va chiesta.
