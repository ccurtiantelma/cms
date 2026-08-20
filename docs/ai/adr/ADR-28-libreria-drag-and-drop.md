# ADR-28 — Libreria di drag & drop dell'editor

## Status
[ ] In discussione · [x] **Approvata** · [ ] Rifiutata · [ ] Superseded da ADR-XXX

## Data approvazione
2026-08-20

---

## Decisione

1. **`dnd-kit`, headless, tre pacchetti nel solo `app/frontend`.** Versioni verificate e
   installate il 2026-08-20: `@dnd-kit/core@6.3.1`, `@dnd-kit/sortable@10.0.0`,
   `@dnd-kit/utilities@3.2.2`, più la transitiva `@dnd-kit/accessibility@3.1.1`. Le peer
   dependency dichiarate sono `react >= 16.8.0` (e `react-dom >= 16.8.0` per `core`):
   soddisfatte da React 19.2.8 senza `overrides` e senza `--legacy-peer-deps` — condizione
   verificata **prima** dell'installazione, e condizione di validità di questa ADR. La
   ragione della scelta è che la libreria non porta un solo componente di UI: qualunque
   libreria che imponga i propri elementi sarebbe una seconda UI lib dentro l'admin, cioè un
   divieto assoluto (`CLAUDE.md` § Frontend Developer). `app/public-site` non la vede mai —
   non ha JavaScript client.

2. **Lo strato dnd non è una seconda via di mutazione dell'albero.** Il rilascio è
   `moveNodeToAction(id, targetParentId, index)`: firma esistente, già validata contro il
   registro, già invertibile in history, già testata (F04b/T2). Il codice di trascinamento
   calcola i tre argomenti e li passa. **Nessuna azione nuova nello store.** Se un requisito
   futuro chiedesse una mutazione che quella firma non copre, va deciso lì e non qui: una
   seconda strada per spostare un nodo è la classe di divergenza che questa ADR esclude.

3. **Lo stato del trascinamento in corso vive nel contesto della libreria, mai nello store
   Zustand.** È un vincolo, non una raccomandazione: uno `set()` per movimento del puntatore
   su uno store da cui dipende l'intero albero sfonda la soglia NFR dell'editor (100 blocchi
   interattivi entro 2s).

4. **I pulsanti freccia / dentro / fuori restano.** Sono l'unico percorso da tastiera già
   coperto, e gli `aria-label` su cui poggiano gli helper e2e sono la superficie di
   automazione esistente: rimuoverli significherebbe riscrivere quella copertura per
   sostituirla con la forma di interazione più fragile da automatizzare. Il drag & drop si
   aggiunge, non sostituisce.

5. **Una sola sede per la regola di ammissibilità del rilascio**: un predicato puro
   `canDropInto(tree, dragId, targetParentId)` che compone il controllo di discendenza già
   dentro `moveNodeTo` con `canContainType` di `block-registry.utils.ts` — la stessa funzione
   che filtra la palette. Serve a **mostrare** il rifiuto durante l'hover invece di farlo
   scoprire come no-op silenzioso al rilascio. Con la profondità 2 di oggi il ramo
   "discendente di sé stesso" è irraggiungibile e resta scritto lo stesso: è la sede dove
   F04d deve trovare la regola già decisa. Il controllo di `MAX_DEPTH` **non** entra: oggi
   non esiste alcun rilascio che possa superarlo.

6. **La meccanica è della libreria, il linguaggio visivo è nostro.** `dnd-kit` non dice dove
   il blocco atterrerà: servono la linea di inserimento fra fratelli, l'evidenziazione del
   contenitore per il rilascio "dentro" e lo stato di rifiuto quando il predicato del § 5 è
   falso. Vincolo di implementazione: la linea è un **pseudo-elemento sulla zona di
   rilascio**, mai un nodo inserito nel DOM dell'albero — un nodo vero sposta il layout e
   perturba la collision detection che lo ha appena calcolato.

## Alternative scartate

- **`@hello-pangea/dnd`** — l'annidamento contenitore-dentro-contenitore è il suo caso
  debole, e vincola il DOM circostante (niente trasformazioni sugli antenati) proprio dove il
  canvas dovrà crescere.
- **`@atlaskit/pragmatic-drag-and-drop`** — adatto e più leggero, ma adattatore React e
  ricette di lista annidata sono a carico nostro: si paga in codice ciò che si risparmia in bundle.
- **Eventi HTML5 nativi, zero dipendenze** — niente touch, niente auto-scroll, niente
  tastiera: si riscrive una libreria mediocre per non installarne una buona.
- **`Sortable.js` / `react-sortablejs`** — muta il DOM sotto React, cioè la classe di bug che
  con un albero derivato da uno store non si chiude più.
- **Restare ai soli pulsanti** — è lo stato attuale: componibile, ma non l'editor che il
  round si è impegnato a consegnare.
- **Forzare l'installazione con un `override`** — sarebbe stata la via se le peer dependency
  non avessero retto; il `package.json` di root ne ha già quattro e non è il posto dove
  nascondere un problema. Non è servita, e resta scartata anche per il futuro: un
  aggiornamento di `dnd-kit` che rompesse la compatibilità torna al tavolo, non in `overrides`.

## Conseguenza

Il peso della dipendenza è tutto e solo nella chrome amministrativa: `app/public-site` resta
senza JavaScript client, senza Mantine e senza `dnd-kit`, quindi l'HTML pubblico non cambia di
un byte per effetto di questa decisione. La verifica delle peer dependency è parte della
decisione, non un passo preliminare dimenticabile: **`dnd-kit` è nominato qui perché il gate è
passato**, e se un aggiornamento futuro lo facesse cadere la decisione va rivista invece di
essere puntellata. Sul piano dei test il conto è dichiarato in anticipo: il trascinamento a
puntatore in Playwright richiede passi intermedi espliciti ed è la via fragile, quindi la
copertura deterministica del riordino passa dal **sensore da tastiera** di `dnd-kit` — che è
anche il percorso accessibile che il trascinamento da solo non ha. Il debito che questa ADR
lascia in eredità è il § 5 al contrario: quando F04d riaprirà l'annidamento, `canDropInto` è
già il posto dove aggiungere `MAX_DEPTH`, e aggiungerlo altrove sarà un errore riconoscibile.
