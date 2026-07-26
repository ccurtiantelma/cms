# Starter Kit

Boilerplate aziendale riutilizzabile per gestionali e software interni: autenticazione
JWT, RBAC a soglie di ruolo, MFA TOTP, audit log, impersonificazione, gestione utenti.
Nessuna logica di dominio verticale — ogni nuovo progetto aggiunge i propri moduli sopra
questa base.

## Stack

- **Backend**: NestJS 11 · TypeScript 5 · PostgreSQL · Drizzle ORM · Redis · BullMQ ·
  Socket.io (opzionale, non importato di default)
- **Frontend**: React 19 · Vite · Mantine v7 · Axios · React Router
- **Metodo**: Spec-Driven Development con framework EAIDOS

## Avvio rapido

```bash
npm install
cp .env.example app/backend/.env     # compila con i valori reali
cp .env.example app/frontend/.env    # compila con i valori reali
docker-compose up -d                 # postgres + redis + mailhog
npm run db:migrate
npm run dev
```

Frontend: http://localhost:5173
Backend API: http://localhost:3000/api/v1
Swagger (fuori produzione): http://localhost:3000/api/v1/docs
Mailhog (email di sviluppo): http://localhost:8025

## Documentazione

| File | Contenuto |
|---|---|
| `docs/instructions.md` | Entry point per AI — leggi prima di tutto |
| `docs/constitution.md` | Stack e regole immutabili |
| `docs/business-rules.md` | Regole di dominio ereditate (auth/RBAC) + sezione da compilare per il progetto |
| `docs/glossary.md` | Dizionario termini RBAC/auth + sezione da compilare per il progetto |
| `docs/system-architecture.md` | Struttura monorepo, porte, flusso auth, servizi esterni |
| `docs/non-functional-requirements.md` | Soglie di performance, sicurezza, disponibilità |
| `docs/openapi.yaml` | Contratto API (generato, non modificare a mano) |
| `docs/GUIDA_UTILIZZO.md` | Come lavorare giorno per giorno |
| `docs/RUNBOOK.md` | Riferimento rapido comandi |
| `docs/MATRICE_AGENTI.md` | Quale ruolo AI usare e quando |
| `docs/ai/` | ADR, RFC, spec, feature, plan, template, progress tracker |

## AI

Questo progetto usa il framework EAIDOS (Spec-Driven Development). Ogni AI che apre il
progetto deve leggere `docs/instructions.md` e `/var/www/starter-kit/CLAUDE.md` (sezione
"Ruoli") prima di scrivere codice.
