# Plan — F04d Libreria di preset di Sezione (estensione: quarto preset "Text & Media")

## Spec di riferimento
`docs/ai/rfc/RFC-F04d-template-library.md` (approvata 2026-08-25) · eredita
`docs/ai/adr/ADR-34-subtree-insertion-engine-preset-statici.md`

---

## Audit strategico

### Falle logiche / Contraddizioni rilevate
Nessuna nella spec: il quarto preset è un'aggiunta additiva a un file JSON già
esistente, senza toccare contratto, store o componenti. L'unico rischio di deriva è
concettuale (vedi RFC-F04d § Rischi) — mitigato dichiarando esplicitamente fuori
scope ogni task di persistenza/"Global Templates" in questo plan.

### Rischi architetturali / Over-engineering
- Componente: nessuno sovradimensionato. Il task esterno originale chiedeva un
  registro di preset, un modale, il collegamento al pulsante Cartella e la
  persistenza backend — tutto già esistente o esplicitamente rinviato (RFC-F06 T0).
- Rimedio: questo plan copre **solo** l'aggiunta del quarto preset e la verifica che
  l'infrastruttura esistente lo assorba senza modifiche di codice oltre al file dati.

---

## Task operativi (max 8, ordinati per dipendenze)

### T1 — Aggiungere il preset "Text & Media" al catalogo statico
- **Output atteso**: `app/frontend/src/pages/pages/editor/static-section-presets.json`
  — nuovo oggetto `SectionPreset` (`id: "text-media"`, `label: "Testo e Media"`),
  `subtree` radice `type: "section"` con `props: { columns: "2" }` e due figli
  diretti: `richText` (prop `html` valorizzata con un paragrafo segnaposto reale, non
  vuoto) e `image` (prop `mediaRef` — placeholder esplicito coerente con lo schema
  `kind: 'mediaRef'` del registro — e `alt` valorizzato, mai stringa vuota: la prop è
  `required`). Stesso pattern piatto già in uso per "Features Grid 3 colonne".
- **Dipendenze**: nessuna.
- **Criterio di Done**: il file resta JSON valido, il nuovo oggetto rispetta la forma
  `SectionPreset`/`SectionPresetNode` (`block-registry.utils.ts`), ogni prop
  `required` senza `default` del registro (`heading`... non usato qui; `richText.html`
  e `image.mediaRef`/`image.alt`) è valorizzata esplicitamente.
- **Agente**: frontend-developer.

### T2 — Verifica di non-regressione dell'infrastruttura esistente
- **Output atteso**: nessun file nuovo — conferma che `TemplateLibraryModal.tsx`
  (rendering via `PRESETS.map`), `EditorCanvas.tsx` e `FullScreenEditorLayout.tsx`
  (punti di apertura del modale) mostrano/gestiscono il quarto preset senza modifiche
  di codice, come previsto da RFC-F04d.
- **Dipendenze**: T1.
- **Criterio di Done**: ispezione manuale/dev server — la card "Testo e Media" appare
  nella griglia del modale, la selezione inserisce il sottoalbero nel punto atteso
  (radice o dentro `section`, secondo `canContainType`).
- **Agente**: frontend-developer.

### T3 — Verifica TypeScript
- **Output atteso**: nessun file — solo verifica.
- **Dipendenze**: T1.
- **Criterio di Done**: `npx tsc --noEmit` pulito su `app/frontend`.
- **Agente**: frontend-developer.

### T4 — Copertura di test
- **Output atteso**: nessuna modifica a
  `static-section-presets.test.ts` è strutturalmente necessaria (itera già
  genericamente su `PRESETS`, copre il quarto preset senza codice aggiuntivo) — il
  Test Engineer verifica che sia davvero così eseguendo la suite, e valuta se serve
  un test dedicato per l'unicità degli `id` rigenerati specificamente su un sottoalbero
  a due figli diretti (caso non ancora coperto dai tre preset esistenti, che hanno
  al più struttura piatta a 3 figli dello stesso tipo alternato); la copertura di
  `insertSubtreeAction`/rigenerazione UUID in generale è già in
  `useBlockEditorStore.test.ts` e `block-tree.utils.test.ts` — non duplicare.
- **Dipendenze**: T1.
- **Criterio di Done**: `npm run test --workspace=app/frontend` verde, nessun test
  placeholder, nessuna duplicazione di copertura già esistente.
- **Agente**: test-engineer.

---

## Matrice dei rischi

| Rischio | Probabilità | Impatto | Mitigazione |
|---|---|---|---|
| Preset con `mediaRef` placeholder che il registro rifiuta a runtime (nessun media reale in libreria) | Media | Basso | `resolvePresetSubtree` non valida i *valori* — solo `static-section-presets.test.ts` verifica presenza/enum; il valore di `mediaRef` resta un id di file placeholder da sostituire quando l'utente seleziona l'immagine, stesso schema già in uso per `href`/`label` dei preset esistenti (contenuto reale d'esempio, non funzionale finché l'utente non lo personalizza) |
| Deriva verso "Global Templates" aggiunta per comodità nello stesso giro | Bassa | Alto | Nessun task di persistenza in questo plan; RFC-F04d dichiara il confine esplicitamente |

---

## Definition of Done — Checklist globale

### Implementazione
- [ ] T1 implementato (`static-section-presets.json` con 4 preset)
- [ ] Nessun `any` TypeScript senza commento
- [ ] Nessun `console.log` rimasto

### Test
- [ ] `static-section-presets.test.ts` verde con 4 preset
- [ ] Nessun test placeholder
- [ ] Nessuna copertura duplicata rispetto a `useBlockEditorStore.test.ts`

### Build e qualità
- [ ] `npx tsc --noEmit` (`app/frontend`) superata
- [ ] Lint superato

### Contratti e documentazione
- [ ] Nessun endpoint toccato → nessun `openapi:export`/`types` richiesto
- [ ] Nessun aggiornamento a `docs/roadmap.md`/progress-tracker in questo giro (non
      richiesto esplicitamente dall'umano)

### Commit
- [ ] Commit atomico, messaggio Conventional Commits (`feat(editor): ...`)
