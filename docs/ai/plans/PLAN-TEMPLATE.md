# Plan — F[N] [Nome Feature]

## Spec di riferimento
`docs/ai/specs/XX-nome.md`

---

## Audit strategico

### Falle logiche / Contraddizioni rilevate
- Dove: [sezione della spec]
- Problema: [descrizione]
- Impatto: [conseguenza a runtime]

### Rischi architetturali / Over-engineering
- Componente: [cosa è sovradimensionato]
- Rimedio: [come semplificare]

---

## Task operativi (max 8, ordinati per dipendenze)

### T1 — [Titolo]
- **Output atteso**: [file da creare/modificare con path completo]
- **Dipendenze**: [task prerequisiti o "nessuna"]
- **Criterio di Done**: [come verificare che il task è concluso]
- **Agente**: backend-developer / frontend-developer / test-engineer

### T2 — [Titolo]
- **Output atteso**: ...
- **Dipendenze**: T1
- **Criterio di Done**: ...
- **Agente**: ...

[T3..T8]

---

## Matrice dei rischi

| Rischio | Probabilità | Impatto | Mitigazione |
|---|---|---|---|
| ... | Alta/Media/Bassa | Alto/Medio/Basso | ... |

---

## Definition of Done — Checklist globale

### Implementazione
- [ ] Tutti i task implementati
- [ ] Nessun `any` TypeScript senza commento
- [ ] Nessun `console.log` rimasto
- [ ] Ogni funzione pubblica con JSDoc

### Test
- [ ] Unit test scritti e superati (Jest)
- [ ] Integration test scritti e superati (Supertest)
- [ ] Collezioni Bruno create per ogni endpoint nuovo o modificato
- [ ] Mock per servizi esterni (SMTP, Socket.io)
- [ ] Nessun test placeholder (`expect(true).toBe(true)`)

### Build e qualità
- [ ] `npm run build --workspace=app/backend` superata
- [ ] `npm run build --workspace=app/frontend` superata
- [ ] Lint superato
- [ ] Code review completata

### Contratti e documentazione
- [ ] `npm run openapi:export` eseguito (se endpoint nuovi o modificati)
- [ ] `npm run openapi:types` eseguito
- [ ] Spec aggiornata se sono emerse deviazioni durante l'implementazione
- [ ] `docs/ai/progress-tracker.md` aggiornato

### Commit
- [ ] Commit atomico per task con messaggio Conventional Commits
- [ ] Branch `feature/F[N]-nome` aggiornato
