# Starter Kit — Istruzioni per AI

> Punto di ingresso obbligatorio per qualsiasi AI che apre questo progetto.
> Leggi questo file e `docs/constitution.md` prima di toccare qualsiasi codice.

---

## Cos'è questo progetto

**Starter Kit** è un boilerplate aziendale riutilizzabile per gestionali e software
interni: autenticazione JWT (access + refresh con rotation), RBAC a soglie di ruolo,
MFA TOTP, audit log, impersonificazione SuperAdmin, gestione utenti, pagina profilo,
tour guidato. Non contiene logica di dominio verticale: ogni progetto che eredita
questo kit aggiunge i propri moduli sopra questa base.

---

## Ordine di lettura obbligatorio

1. `docs/constitution.md` — stack immutabile e divieti (priorità assoluta)
2. `docs/business-rules.md` — regole di dominio (auth/RBAC ereditate + sezione da
   compilare per il progetto verticale)
3. `docs/glossary.md` — dizionario termini (RBAC/auth + sezione da compilare)
4. `docs/system-architecture.md` — porte, URL, flusso auth, servizi esterni
5. `docs/openapi.yaml` — contratto completo di tutti gli endpoint REST
6. `docs/ai/specs/` — specifiche tecniche della feature su cui stai lavorando
7. `docs/ai/features/FXX-nome.md` — user story della feature corrente
8. `docs/ai/plans/FXX-PLAN.md` — piano operativo approvato, sub-task da eseguire

---

## Dove scrivere codice

```
app/backend/src/     ← NestJS: moduli, controller, service, DTO, schema Drizzle
app/frontend/src/    ← React + Mantine: pagine, componenti, servizi HTTP, tipi
bruno/<modulo>/      ← Collezioni Bruno per API testing
```

---

## Policy docs — chi scrive dove

> Aggiornata 2026-07-23 su richiesta esplicita dell'umano (troppa rigidità sui
> documenti puramente tecnici/descrittivi rallentava il lavoro senza motivo — vedi
> `docs/ai/adr/ADR-5-ci-cd-pipeline.md`, sezione Contesto). Restano bloccati **senza
> eccezioni** solo i documenti che fissano regole di dominio o governance (business
> rules, requisiti, definizione di ruoli AI): quelli non li scrive mai l'AI, nemmeno
> su richiesta esplicita, perché è lì che si annida il rischio concreto di
> "inventare" regole non autorizzate. I documenti puramente tecnici/descrittivi
> (architettura, runbook, guida, tracker) possono invece essere aggiornati dall'AI,
> ma **solo quando l'umano lo chiede esplicitamente per quel task** — mai di
> iniziativa autonoma — così il controllo umano resta sempre la porta d'ingresso.

| Percorso | Umano | AI |
|---|---|---|
| `docs/constitution.md` | ✅ | ❌ mai (nemmeno su richiesta) |
| `docs/instructions.md` | ✅ | ❌ mai (nemmeno su richiesta) |
| `docs/business-rules.md` | ✅ | ❌ mai (nemmeno su richiesta) |
| `docs/glossary.md` | ✅ | ❌ mai (nemmeno su richiesta) |
| `docs/non-functional-requirements.md` | ✅ | ❌ mai (nemmeno su richiesta) |
| `docs/system-architecture.md` | ✅ | ✍️ solo su richiesta esplicita |
| `docs/README.md` / `GUIDA_UTILIZZO.md` / `RUNBOOK.md` | ✅ | ✍️ solo su richiesta esplicita |
| `docs/openapi.yaml` | script automatico | script automatico (`npm run openapi:export`) |
| `docs/ai/features/*.md` | ✅ | ❌ mai |
| `docs/ai/features/changes/*.md` | ✅ | ❌ mai |
| `docs/ai/adr/*.md` | ✅ approva | genera su richiesta, attende approvazione (mai auto-approvato) |
| `docs/ai/rfc/*.md` | ✅ approva | genera su richiesta, attende approvazione (mai auto-approvato) |
| `docs/ai/specs/*.md` | ✅ approva | genera su richiesta, attende approvazione (mai auto-approvato) |
| `docs/ai/plans/*.md` | ✅ approva | genera su richiesta, attende approvazione (mai auto-approvato) |
| `docs/ai/progress-tracker.md` | ✅ | ✍️ solo su richiesta esplicita, a fine feature |
| `app/` | review | ✅ scrive codice |
| `bruno/` | review | ✅ scrive .yml |

**✍️ "solo su richiesta esplicita"** ≠ "ask first" generico: significa che l'AI non
tocca questi file di propria iniziativa nemmeno dentro un task più ampio — serve
un'istruzione specifica dell'umano riferita a quel file/quella modifica in quella
conversazione. L'approvazione resta sempre e comunque via review umana (git diff,
PR) prima del merge.

---

## Gerarchia delle decisioni (EAIDOS)

In caso di conflitto tra documenti, prevale sempre il livello superiore:

```
Constitution → Business Rules → Glossary → System Architecture
  → Non Functional Requirements → RFC → ADR → Feature → Spec → Plan → Task → Code
```

Il codice è l'unico territorio in cui l'AI opera autonomamente.

---

## Anti-hallucination

Se l'agente non trova un'informazione nei file `docs/`, deve fermarsi e chiedere.
Non inventare endpoint, tabelle, DTO, business rules o comportamenti non documentati.

---

## Stato di avanzamento

Lo stato aggiornato di tutte le feature è in `docs/ai/progress-tracker.md`.
Verificalo prima di iniziare qualsiasi task.

---

## Ruoli AI disponibili

I 4 ruoli operativi (Orchestrator, Backend Developer, Frontend Developer, Test
Engineer) sono definiti **integralmente** in `/var/www/starter-kit/CLAUDE.md`
(sezione "Ruoli"): questa è la fonte canonica unica — non duplicarla qui. Per
attivare un ruolo, specificalo nel prompt (es. "Agisci come Backend Developer").

> Nota opzionale: se il progetto adotta anche altri tool AI con configurazione ad
> agenti dedicata (es. Kilo Code in `.kilo/agents/`, GitHub Copilot in
> `.github/agents/`), le stesse definizioni di ruolo vanno mirrorate in quelle
> cartelle per restare sincronizzate — ma `CLAUDE.md` resta sempre la fonte di
> verità in caso di divergenza.

---

## Workflow in sintesi

```
1. Umano scrive     → docs/ai/features/FXX.md
2. AI propone       → docs/ai/rfc/ (se necessario)     [approvazione umana]
3. AI propone       → docs/ai/adr/ (se RFC approvato)  [approvazione umana]
4. AI propone       → docs/ai/specs/                   [approvazione umana]
5. AI propone       → docs/ai/plans/FXX-PLAN.md        [approvazione umana]
6. AI implementa    → app/  un task alla volta          [review umana per ogni task]
7. AI scrive        → test Jest + Bruno
8. Umano esegue     → npm run openapi:export + openapi:types
9. Umano aggiorna   → docs/ai/progress-tracker.md
10. Commit → feature successiva
```

**Regola fondamentale**: un task alla volta. Mai "implementa tutta la feature".
