# RFC-45 — Editing in-place nel Canvas: consuntivo dell'esistente e domanda aperta sulla formattazione ricca di `heading`/`button`

## Status
[ ] In discussione · [x] **Approvato — Parte B opzione (a), nessuna ADR generata** · [ ] Rifiutato

## Proposto da
AI Orchestrator · Data: 2026-09-01

---

## Problema

Il task che origina questa RFC chiede di "eliminare la dipendenza dal pannello laterale
(PropertyInspector) per la modifica dei testi", costruendo per i blocchi `heading`,
`rich-text` e `button`: integrazione di `contentEditable` o Tiptap/Slate headless nei
componenti di resa del Canvas, sincronizzazione debounced a 150ms verso
`useBlockEditorStore`, preservazione di focus/selezione, una toolbar fluttuante inline
(Bold/Italic/Link/Alignment/Font Size) con sanitizzazione pre-commit, zero breaking
change allo schema v1 e isolamento Editing/Preview.

Il controllo documentale preliminare (obbligatorio per `CLAUDE.md` § Anti-hallucination)
non si è fermato a `docs/`: verificando `app/frontend/src` — passo necessario perché
`docs/roadmap.md` marca F04 come round multipli già chiusi (F04/F04b/F04c/F04d, tutti
`✅ Done` in `docs/ai/progress-tracker.md`) — **la quasi totalità di quanto richiesto
risulta già implementata**, non in una feature branch separata ma nel working tree
corrente (`git status` la mostra come modifica non ancora committata di
`EditorBlockWrapper.tsx`, `useBlockEditorStore.ts`, più il file nuovo
`BlockHoverOverlay.tsx`):

| Richiesta del task | Stato reale | Riferimento |
|---|---|---|
| `contentEditable` nel Canvas per `heading`/`rich-text`/`button` | **Fatto**, sui tre tipi nominati | `Heading.tsx`, `Button.tsx`, `RichText.tsx` (props `editable`/`on<Prop>Change`/`on<Prop>Input`) |
| Tiptap/Slate headless nei componenti di resa | **Deliberatamente scartato**, non solo assente | Commento di testa `InlineFloatingToolbar.tsx` § 2: "nessuna dipendenza pesante nuova... senza introdurre un secondo motore di rich text accanto a quello già approvato (ADR-26, mai dal canvas)" |
| Sync debounced 150ms verso lo store | **Fatto, ma a 300ms** | `EDIT_DEBOUNCE_MS = 300` — `EditorBlockWrapper.tsx:244` |
| Preservazione focus/selezione | **Fatto** | pattern "DOM come unica fonte di verità", guardia `textContent/innerHTML !== prop` — `Heading.tsx:81-90`, `RichText.tsx:73-82` |
| Toolbar fluttuante inline (Bold/Italic/Link/Alignment) | **Fatto, ma solo su `richText`** | `InlineFloatingToolbar.tsx`, montata solo `node.type === 'richText'` — `EditorBlockWrapper.tsx:1371-1373` |
| Toolbar fluttuante con Font Size | **Non presente, su nessun tipo** | assente sia da `InlineFloatingToolbar.tsx` sia dall'ispettore ADR-26 |
| Sanitizzazione pre-commit dell'HTML | **Invariata, resta server-side** | nessuna sanitizzazione client aggiunta, ADR-20/21 restano l'unica autorità |
| Zero breaking change schema v1 | **Vero, per costruzione** | nessuna modifica a `PropSpec`, `kind`, `v` |
| Isolamento Editing/Preview | **Vero, per costruzione** | `editable?` opzionale, `undefined` sul sito pubblico — vedi Parte A |

Questo lavoro ha una nota di governance già scritta, non aggiunta da questa RFC:
`docs/ai/plans/PLAN-F04c-editor-maturo.md` § T9 (righe 397-439) lo documenta **a
consuntivo** come estensione di scope non prevista dall'RFC/piano originali, arrivata
per implementazione diretta, e conclude che resta **sotto la soglia che `CLAUDE.md`
riserva all'ADR obbligatoria**: non tocca schema blocchi, `PropSpec`, `kind` né
sanitizzazione server-side.

Quello che il task chiede e che **non** risulta costruito, né deliberato altrove, è
un'unica cosa reale: **formattazione ricca (Bold/Italic/Link/Font Size) su `heading` e
`button`**. Qui la richiesta non è "manca l'implementazione" — è che il codice esistente
la esclude **per una ragione di schema dichiarata per iscritto**
(`EditorBlockWrapper.tsx:1364-1369`): `heading.text` e `button.label` sono `plainText`
per il registro (ADR-21 § 5), e Bold/Corsivo/Link ne cambierebbero il `kind` — modifica
di schema blocco, fuori dalla soglia "chrome" di T9, dentro quella che `CLAUDE.md` §
Ask first riserva alla firma umana. Questa RFC si divide di conseguenza in due parti
indipendenti.

---

## Soluzione proposta

### Parte A — Consuntivo: chiusa, nessuna azione

L'architettura di in-place editing richiesta dal task — `contentEditable` nativo (mai
Tiptap/Slate) su `heading`/`richText`/`button`, dispatch a doppio canale
(`on<Prop>Input` debounced verso lo store, `on<Prop>Change` immediato su `blur` sempre
via `updateBlockPropsAction` — resta sull'undo stack), toolbar fluttuante ancorata alla
selezione viva per `richText` — è **completa, testata (`RichTextFieldEditor.tiptap-
allowlist.test.ts`, `useEditorShortcuts.test.ts`) e già documentata a consuntivo** in
`PLAN-F04c-editor-maturo.md` § T9. Questa RFC non ripropone quell'architettura come
nuova: la userebbe come controfattuale contro cui il proprio codice divergerebbe senza
motivo.

Due scarti puntuali rispetto alla formulazione del task, nessuno dei due un problema:

1. **Debounce a 300ms, non 150ms.** Il valore attuale (`EditorBlockWrapper.tsx:244`) è
   una scelta già fatta, non un default trascurato — dimezzarlo a 150ms è una modifica
   di UX misurabile (frequenza dei dispatch verso lo store, quindi degli `undo` generati
   indirettamente da `updateBlockPropsAction`) senza un problema riportato che la
   giustifichi. Restare a 300ms finché non emerge un problema concreto di percepita
   lentezza.
2. **Font Size assente dalla toolbar fluttuante**, presente né nell'ispettore (ADR-26 §
   3, toolbar del profilo `basic`) né nel canvas. Aggiungerla è un'estensione della
   toolbar ai sensi di ADR-26 § 3 ("allargare la toolbar... è una nuova firma"): fuori
   scope qui, segnalata e non aggiunta d'iniziativa.

**Nessuna azione per Parte A.** Non genera ADR: la nota di governance di T9 ha già
concluso che non ne serve una, e questa RFC verifica quella conclusione piuttosto che
riaprirla senza un fatto nuovo.

### Parte B — Domanda aperta: formattazione ricca su `heading`/`button`

Tre opzioni, nessuna scelta qui — la sezione "Decisione umana" resta in bianco per
questa parte.

**(a) Status quo — nessuna formattazione ricca su `heading`/`button`.** Zero costo, zero
rischio. Il titolo resta testo puro (coerente con l'uso che F07/F08 ne fanno come
outline — vedi ADR-21 § 5), l'etichetta del bottone resta un'unica riga di testo. Un
autore che vuole un titolo parzialmente in corsivo lo ottiene solo cambiando tipo di
blocco (`richText` con un heading semantico perso) — limite noto, non nuovo.

**(b) Nuovo `kind` dedicato** (es. `richTextInline`, distinto da `richText`) per
`heading.text` e `button.label`, sul profilo **`inline`** — che non va creato: esiste
già, inutilizzato, in `block-sanitize-profiles.config.ts:84-87`
(`INLINE_SANITIZE_OPTIONS`, tag `a b br em i s strong u`), col commento di testa che
dichiara esplicitamente il motivo della sua esistenza anticipata: "nessuna prop dei
cinque tipi del primo rilascio lo usa... esiste perché ADR-21 § 4 nomina l'insieme
chiuso dei profili come già completo". Nessun `text-align`/allineamento nel profilo
(coerente con "testo su una riga sola", `Heading.tsx:119`) — la richiesta "Alignment"
del task non è ottenibile con questo profilo per costruzione, non per svista. Resta
comunque un incremento di `v` per i due tipi (ADR-21 § 1: **deploy a senso unico**, il
rollback del backend oltre quell'incremento richiede rollback dei contenuti), migrazione
totale/pura da stringa a sé stessa (nessuna perdita, la forma attuale è già una stringa
valida nel profilo `inline`). `F07`/`F08` dovrebbero leggere l'outline del titolo
spogliando i tag inline invece che usare la stringa diretta — un costo di parsing
minimo ma reale, da scrivere prima che quelle feature partano.

**(c) Riuso del `kind: 'richText'` esistente** sulle stesse prop, stesso profilo
`basic` di ADR-26 § 3: zero nuovo profilo, ma riapre esattamente la ragione per cui
ADR-21 § 5 ha reso `heading` un tipo a sé invece di testo dentro `richText` — "l'outline
della pagina serve a F07/F08... sepolto nel markup, estrarlo diventa parsing HTML". Fra
le tre, questa è l'opzione che **contraddice più direttamente** una decisione già
motivata per iscritto: non è vietata, ma chi la sceglie deve accettare esplicitamente di
riaprire quella motivazione, non semplicemente ignorarla.

In tutti e tre i casi la toolbar fluttuante da montare su `heading`/`button` **non può
essere la stessa istanza di `InlineFloatingToolbar.tsx`** senza modifiche: quel
componente esegue query di stato (`document.queryCommandState`) e comandi
(`execCommand('bold')` ecc.) sul `contentEditable`, che restano validi indipendentemente
dal `kind` — ma la sua allowlist implicita (quali pulsanti mostrare) andrebbe fatta
dipendere dal profilo dichiarato dalla prop, sul modello già stabilito da ADR-26 § 2 per
l'ispettore ("la toolbar la sceglie il `profile` dichiarato dal registro").

---

## Alternative valutate

- **Tiptap/Slate headless nel Canvas** (come suggerito dal task) — scartata prima ancora
  di questa RFC, per iscritto in `InlineFloatingToolbar.tsx` § 2: introdurrebbe un
  secondo motore di rich text accanto a quello già approvato per l'ispettore (ADR-26),
  raddoppiando la superficie da mantenere in sincronia con l'allowlist di
  sanitizzazione. Il canvas usa `contentEditable` nativo + `execCommand` proprio per
  restare un solo motore.
- **Estendere l'ispettore invece del canvas** (mantenere PropertyInspector come unico
  punto di editing, respingendo l'intera premessa del task) — scartata: il task chiede
  esplicitamente di ridurre la dipendenza dal pannello, e il canvas in-place per
  `richText` esiste già e funziona accanto all'ispettore (i due non sono in conflitto,
  l'ispettore resta necessario per le prop non testuali).
- **Per Parte B: allargare `plainText` a "quasi mai HTML" con un'eccezione runtime** —
  scartata: ADR-21 § 4 chiude esplicitamente questa via ("la distinzione non si indovina
  a runtime dal contenuto della stringa: è dichiarata dal registro"); un'eccezione
  runtime la contraddice alla lettera.

---

## Impatto

**Parte A**: nessuno. Il codice esiste, è testato, è documentato. Questa RFC non tocca
`app/frontend`.

**Parte B**, solo se approvata un'opzione diversa da (a): nuovo `kind` o riuso di uno
esistente (registro blocchi, `app/backend/src/blocks/types/heading.block.ts` e
`button.block.ts`), collegamento al profilo `inline` già presente e inutilizzato se (b)
(`block-sanitize-profiles.config.ts:84-87`, nessun nuovo profilo da scrivere),
incremento di `v` per i due tipi con tutto ciò che ADR-21 § 1 comporta (deploy a senso
unico), aggiornamento `SPEC-F02-blocchi.md` § 3.3/3.6, nuova variante della toolbar
fluttuante per quei tipi, `openapi:export`/`blocks:export` + rigenerazione tipi
frontend.

---

## Rischi

- **Parte B, opzione (c)**: perdita silenziosa della capacità di estrarre l'outline
  strutturato per F07/F08 finché quelle feature non vengono aggiornate a leggere HTML
  invece di plain text — rischio concreto perché F07/F08 sono ancora "Da avviare"
  (`docs/roadmap.md`), quindi il debito nasce prima che esista codice che lo misuri.
- **Qualunque opzione di Parte B**: se la toolbar per `heading`/`button` non deriva la
  propria allowlist dal profilo dichiarato (come richiede ADR-26 § 2/§ 3) ma la
  duplica a mano, un aggiornamento futuro del profilo `basic` non si propaga — stesso
  guasto di classe che ADR-26 § 3 ha reso "dimostrabile" con un test dedicato per
  l'ispettore; senza lo stesso test lato canvas, la garanzia non copre il nuovo punto
  di editing.
- **Nessun rischio da Parte A**: è consuntivo di codice già in produzione nel round
  F04c, non una nuova costruzione.

---

## Decisione umana

**Parte A — Consuntivo**: nessuna decisione richiesta. Registrata come chiusa da questa
RFC; nessuna `[ ]` da spuntare.

**Parte B — Formattazione ricca su `heading`/`button`**

**Esito**: [x] Approvato — opzione (a) status quo · [ ] Approvato — opzione (b) nuovo
`kind` · [ ] Approvato — opzione (c) riuso `richText` · [ ] Rifiutato · [ ] Rinviato

**Note**: Nessuna formattazione ricca su `heading.text`/`button.label`. Nessun costo,
nessun rischio, nessuna ADR: la Parte A resta l'unico consuntivo di questo round,
confermato invariato.

**Approvato da**: marketing@antelmagroup.net · **Data**: 2026-09-02

**Azione successiva**: [ ] Genera ADR-[N] (solo se (b) o (c)) · [x] Archivio (se (a) o
rinviato)
