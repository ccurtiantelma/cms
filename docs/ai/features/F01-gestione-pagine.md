# F01 — Gestione Pagine

> Feature fondativa del CMS. Ogni altra feature del dominio dipende da questa.
> Redatta il 2026-08-13 nell'ambito della ristrutturazione documentale.

## Obiettivo

Un redattore deve poter creare una Pagina, lavorarci in bozza, farla approvare,
pubblicarla, modificarla senza che il pubblico veda le modifiche in corso, e tornare a
una versione precedente se serve.

## Attori coinvolti

| Ruolo | Cosa può fare in questa feature |
|---|---|
| SuperAdmin (5) | Tutto |
| Admin (10) | Tutto, incluso il soft delete di una Pagina |
| Manager (20) | Crea, modifica qualsiasi Pagina, pubblica, programma, archivia, ripristina revisioni |
| User (30) | Crea e modifica **solo le proprie** bozze, invia in revisione. Non pubblica, non archivia, non elimina |

## Outcomes (stato finale desiderato)

- [ ] Esiste l'entità Pagina con slug, gerarchia, lingua, stato e albero di contenuto
- [ ] Esiste l'entità Revisione, immutabile, creata a ogni pubblicazione
- [ ] Il ciclo di vita `draft → review → scheduled → published → archived` è applicato
      lato server: le transizioni non ammesse sono respinte
- [ ] Modificare una Pagina pubblicata non altera ciò che il pubblico vede
- [ ] Lo slug è unico per (locale, genitore) e generato automaticamente dal titolo
- [ ] Il cambio di slug su una Pagina pubblicata propone un redirect
- [ ] La cronologia delle revisioni è consultabile e ripristinabile
- [ ] Il salvataggio concorrente è protetto da controllo ottimistico (`409`, mai
      sovrascrittura silenziosa)
- [ ] Ogni pubblicazione, archiviazione, ripristino e soft delete è in audit log
- [ ] Esiste l'elenco paginato delle Pagine in area amministrativa, con filtri per stato,
      lingua e ricerca testuale
- [ ] Esistono le collezioni Bruno per ogni endpoint

## Out of scope

- **Editor visivo** — l'albero di blocchi si salva via API come JSON. L'interfaccia
  drag & drop è F04.
- **Validazione dei tipi di blocco** — qui l'albero è accettato come JSON strutturalmente
  valido; il registro dei tipi e la validazione per tipo sono F02.
- **Endpoint pubblici di lettura** — F03.
- **Multilingua operativa** — qui la Pagina porta il campo `locale` e il gruppo di
  traduzione, ma la gestione delle lingue e la creazione guidata delle traduzioni è F05.
- **SEO/GEO** — qui esiste lo spazio per i metadati, la logica è F07/F08.
- **Template e Sezioni globali** — F06.
- **Programmazione effettiva della pubblicazione differita** — lo stato `scheduled` e la
  data esistono; il job che pubblica alla scadenza si aggancia in F03, quando esiste una
  cache pubblica da invalidare.

## Acceptance Criteria

**Creazione e slug**
- Dato un titolo "Chi siamo", quando creo una Pagina senza specificare lo slug, allora lo
  slug generato è `chi-siamo`
- Dato uno slug già esistente per la stessa coppia (locale, genitore), quando salvo,
  allora fallisce con status `409`
- Dato uno slug riservato (`api`, `admin`, `public`, `assets`, `_health`), quando salvo,
  allora fallisce con status `400`
- Dato che imposto come genitore una Pagina che è già mia discendente, quando salvo,
  allora fallisce con status `400`

**Stati e pubblicazione**
- Data una Pagina in `draft`, quando la pubblico, allora il suo stato è `published`,
  `publishedAt` è valorizzato ed esiste una nuova Revisione
- Data una Pagina in `published`, quando ne modifico il contenuto, allora lo stato resta
  `published` e la Revisione pubblicata non cambia
- Data una Pagina in `archived`, quando tento la transizione a `review`, allora fallisce
  con status `400`
- Dato un utente con ruolo User (30), quando tenta di pubblicare, allora fallisce con
  status `403`
- Dato un utente con ruolo User (30), quando tenta di modificare la bozza di un altro
  utente, allora fallisce con status `403`

**Revisioni**
- Data una Pagina con tre Revisioni, quando ripristino la prima, allora si crea una nuova
  bozza con quel contenuto e la Revisione pubblicata online non cambia
- Data una Revisione esistente, quando tento di modificarla o cancellarla, allora non
  esiste alcun endpoint che lo consenta

**Concorrenza**
- Dati due utenti che caricano la stessa bozza, quando il secondo salva dopo il primo,
  allora fallisce con status `409` e nessuna modifica del primo viene persa

**Sicurezza**
- Dato un utente non autenticato, quando chiama qualsiasi endpoint di questa feature,
  allora fallisce con status `401`
- Dato il guid di una Pagina soft-deleted, quando la richiedo, allora ricevo `404`

## Note di dominio

Riferimenti in `docs/business-rules.md`: "Stati di una Pagina e transizioni", "Permessi
editoriali", "Slug, gerarchia e risoluzione delle URL", "Revisioni e cronologia",
"Editing concorrente". Termini in `docs/glossary.md`, sezione "Termini di dominio —
Contenuto".

Vincoli costituzionali applicabili: Principle 6 (Content is Data), Principle 7 (Headless
by Default), regole 1-6 di "Il modello di contenuto" in `docs/constitution.md`.

## Dipendenze

Moduli già esistenti su cui si appoggia: `auth` (JWT + guard di ruolo), `common`
(`AuditLogService`, `Utils`, `AllExceptionsFilter`), `db` (Drizzle), `realtime`
(presenza di altri editor, opzionale in questa feature).
