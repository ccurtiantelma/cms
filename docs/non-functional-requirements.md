# Non Functional Requirements — Starter Kit

> Nessuna AI modifica questo file. Priorità: dopo System Architecture.

---

## Performance

- API response time < 300ms al 95° percentile in condizioni normali
- Frontend First Contentful Paint < 1.5s
- Query DB con indici su tutte le FK e colonne usate in WHERE frequenti
- Job pesanti (invio email massivo, elaborazioni asincrone) sempre in coda BullMQ

---

## Scalabilità

- Architettura stateless: nessuno stato in memoria del processo NestJS
- Sessioni e cache in Redis (ioredis)
- BullMQ per tutti i job asincroni
- Connessione DB con pool gestito da Drizzle + pg

---

## Sicurezza

- HTTPS obbligatorio in produzione
- Headers sicurezza: Helmet NestJS abilitato
- Rate limiting sugli endpoint `/auth/*`
- Nessun segreto nel codice sorgente — tutto in variabili d'ambiente tramite AppConstants
- Stack trace mai esposto nelle risposte di errore in produzione
- JWT access token: durata 15 minuti (default `JWT_EXPIRATION`)
- JWT refresh token: durata 7 giorni (default `RTK_EXPIRATION`), signed httpOnly cookie

---

## Disponibilità

- Target uptime: 99.5%
- Graceful shutdown NestJS (gestione SIGTERM)
- Health check endpoint: `GET api/v1/health`

---

## Logging

- Winston con rotazione giornaliera (`winston-daily-rotate-file`)
- Livelli in produzione: `error`, `warn`, `info`
- Livelli in sviluppo: `error`, `warn`, `info`, `debug`
- MAI `console.log` nel codice — usare sempre `Logger NestJS`
- Log strutturato (JSON) in produzione per aggregatori esterni
- Redazione automatica dei dati sensibili nei log (`sanitizeLogData`) — vedi ADR-2

---

## Compatibilità browser

- Chrome, Firefox, Edge: ultime 2 versioni
- Safari: ultima versione
- Mobile: responsive ma non è l'uso primario

---

## Accessibilità

- Livello minimo: WCAG 2.1 AA per i componenti Mantine (già conformi di default)
