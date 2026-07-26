# Matrice Operativa Agenti — Starter Kit

> Riferimento rapido: quale ruolo AI usare, quando, con quale prompt iniziale.
> Le definizioni complete dei 4 ruoli vivono in `/var/www/starter-kit/CLAUDE.md`
> (sezione "Ruoli") — questa matrice è solo un indice operativo, non la fonte
> canonica delle regole.

---

## Quando usare quale ruolo

| Situazione | Ruolo | Prompt di avvio |
|---|---|---|
| Inizio nuova feature | Orchestrator | "Agisci come Orchestrator. Leggi F0X-nome.md e constitution.md, genera la spec tecnica in docs/ai/specs/" |
| Generare plan da spec | Orchestrator | "Agisci come Orchestrator. Leggi la spec F0X e genera docs/ai/plans/F0X-plan.md" |
| Audit architetturale | Orchestrator | "Agisci come Orchestrator. Analizza la spec F0X, trova falle logiche e rischi" |
| Creare/modificare schema DB | Backend Developer | "Agisci come Backend Developer. Esegui T1 del plan F0X: aggiungi entità X in src/db/schema.ts" |
| Creare modulo NestJS | Backend Developer | "Agisci come Backend Developer. Esegui T-0X del plan F0X: crea il modulo X con controller, service, DTO" |
| Creare endpoint | Backend Developer | "Agisci come Backend Developer. Esegui T-0X del plan F0X: implementa POST api/v1/app/X" |
| Creare pagina React | Frontend Developer | "Agisci come Frontend Developer. Esegui T-0X del plan F0X: crea PageX in src/pages/X/" |
| Creare servizio HTTP | Frontend Developer | "Agisci come Frontend Developer. Esegui T-0X del plan F0X: crea x.service.ts" |
| Scrivere test backend | Test Engineer | "Agisci come Test Engineer. Scrivi i test Jest+Supertest per il modulo X basandoti sulla spec F0X" |
| Scrivere collezioni Bruno | Test Engineer | "Agisci come Test Engineer. Crea i file .yml per gli endpoint del modulo X in bruno/X/" |

---

## Limiti di ogni agente

### Orchestrator
- Analizza spec, genera plan, trova rischi
- Non scrive codice
- Non ha accesso al terminale
- Non modifica file sorgente

### Backend Developer
- Scrive tutto in `app/backend/src/`
- Non scrive componenti React o CSS
- Non modifica file in `docs/`
- Max 2 file completi per messaggio — poi aspetta "Procedi"

### Frontend Developer
- Scrive tutto in `app/frontend/src/`
- Non scrive logica server-side o SQL
- Non usa Tailwind, React Suite, Material UI o altre UI lib diverse da Mantine v7
- Max 2 file completi per messaggio — poi aspetta "Procedi"

### Test Engineer
- Scrive test (Jest/Supertest) e file Bruno (`.yml`)
- Non modifica mai file di produzione
- Non corregge bug — li segnala nell'output
- Max 1 file di test completo per messaggio — poi aspetta "Procedi"

---

## Regole trasversali (tutti i ruoli)

1. Leggono sempre `docs/constitution.md` prima di qualsiasi operazione
2. Implementano solo il task corrente — zero refactoring fuori scope
3. In conflitto tra spec e constitution: **constitution vince sempre**
4. Nessun `any` TypeScript senza commento esplicativo
5. File completi — zero placeholder, zero `// TODO` non pianificati
6. Se mancano informazioni critiche: dichiarano assunzioni esplicitamente e si
   fermano (**STOP**, non inventare)

Ruoli e ranghi RBAC di riferimento nel codice: `SuperAdmin` (5) · `Admin` (10) ·
`Manager` (20) · `User` (30) — numero minore = privilegio maggiore. Prefisso API:
`api/v1`.

---

## Output format atteso da ogni agente

Ogni risposta deve concludersi con:

```
### File Generati/Modificati
- [path completo]

### Cosa è cambiato
[riassunto tecnico]

### Come verificare
1. ...
2. ...
3. ...
```
