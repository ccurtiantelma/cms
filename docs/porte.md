## Elenco porte (host)

| Servizio | Porta host | Container interno | File |
| :--- | :--- | :--- | :--- |
| Postgres (dev) | 55432 | 5432 | `docker-compose.yml` |
| Redis (dev) | 56379 | 6379 | `docker-compose.yml` |
| Mailhog SMTP (dev) | 51025 | 1025 | `docker-compose.yml` |
| Mailhog Web UI (dev) | 58025 | 8025 | `docker-compose.yml` |
| Backend API (dev, `npm run dev`) | 53000 | — | `.env` / `.env.example` |
| Frontend Vite (dev) | 55173 | — | `app/frontend/vite.config.ts` |
| Public-site SSR (dev) | 55000 | — | `app/public-site/.env` |
| Backend (prod, container) | 53000 | 3000 | `docker-compose.prod.yml` |
| Frontend (prod, container) | **5080** (corretto ora) | 80 | `docker-compose.prod.yml` |
| Public-site SSR (prod, container) | 55000 | 4000 | `docker-compose.prod.yml` |
| Postgres (prod) | non esposta sull'host | 5432 | `docker-compose.prod.yml` (solo rete interna) |
| Redis (prod) | non esposta sull'host | 6379 | `docker-compose.prod.yml` (solo rete interna) |

**Nota:** Postgres/Redis in prod non pubblicano porte sull'host (raggiungibili solo dagli altri container sulla rete Docker interna) — coerente e senza conflitti, nessuna modifica necessaria lì.