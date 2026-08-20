# ADR-30 — Metadati d'editor nel registro dei blocchi

## Status
[ ] In discussione · [x] **Approvata** · [ ] Rifiutata · [ ] Superseded da ADR-XXX

## Data approvazione
2026-08-20

---

## Decisione

1. **Un solo blocco di metadati d'editor, dentro `BlockEditorMeta`, che già esiste ed è già
   dichiarata opaca alla validazione** (ADR-21 § 2). Si estende in un punto solo:

   ```ts
   export interface BlockEditorPropMeta {
     label: string;               // etichetta leggibile — chiude la voce 3.10 di docs/TODO.md
     tab?: 'content' | 'style';   // scheda dell'ispettore; assente = 'content'
     order?: number;              // ordine dentro la scheda; assente = ordine di dichiarazione
     help?: string;               // riga di aiuto sotto il campo, facoltativa
   }

   export interface BlockEditorMeta {
     label: string;
     icon?: string;
     category?: string;
     props?: Record<string, BlockEditorPropMeta>;   // indicizzato per nome di prop
   }
   ```

2. **I metadati d'editor non entrano in `PropSpec`.** `PropSpec` è il descrittore di
   validazione **e** il contratto di sanitizzazione (ADR-21 § 4): mescolarci etichetta e
   scheda significa che ogni `kind` cresce campi di presentazione, e che chi legge lo `switch`
   esaustivo del validatore trova roba che il validatore deve ignorare. I metadati restano
   dove stanno già le cose opache, dentro `meta`.

3. **`tab` assente vale `'content'`.** Le props di contenuto esistenti non vanno annotate una
   per una perché questo round ha aggiunto una scheda.

4. **Una prop dichiarata senza voce in `meta.props` è un difetto, non un default silenzioso.**
   Un fallback sul nome tecnico riaprirebbe la voce 3.10 da sola alla prima prop nuova. Il
   presidio è un **test di invariante sul registro** che enumera le props dichiarate da ogni
   definizione e asserisce che ciascuna abbia la propria voce: costo una funzione, chiude il
   problema una volta per tutte.

5. **L'ispettore deriva la propria struttura dai metadati: due schede, `Contenuto` e `Stile`.**
   Resta **un solo `PropertyInspector.tsx`**, che mappa su `prop.kind` e **mai** su
   `prop.type`: le schede sono un raggruppamento dei descrittori *prima* dello `switch`, non
   una seconda strada per tipo di blocco. Un tipo senza props di stile mostra una scheda sola —
   mai una scheda vuota. Le etichette vengono da `meta.props[nome].label`, e `propLabel()`
   smette di restituire il nome tecnico.

6. **`meta.icon` smette di essere decorativa.** Oggi è dichiarata e non consumata: la palette
   disegna `IconPlus` cinque volte. Un nome di icona non si risolve dinamicamente in un
   componente Tabler senza import dinamici, quindi serve una **mappa esplicita nome →
   componente nel frontend**, con fallback su un'icona generica per un nome sconosciuto. È un
   costo reale e va detto: è il prezzo perché il registro possa nominare un'icona senza che il
   frontend importi l'intera libreria.

7. **`generate-blocks-types.js` va aggiornato con i campi nuovi**, o il contratto generato non
   li porta al frontend: le interfacce del contratto sono stringhe letterali dentro il
   generatore, non un'estrazione automatica. Il gate CI `blocks-sync` resta la verifica.

## Alternative scartate

- **Etichette e schede in una mappa nel frontend** — una prop nuova nel registro nasce di
  nuovo senza etichetta e nel posto sbagliato: è ciò che la voce 3.10 esclude per iscritto.
- **Campi d'editor dentro `PropSpec`** — mescola validazione e sanitizzazione con la
  presentazione, proprio dove il validatore guarda.
- **Solo l'etichetta ora, schede e ordine dopo** — la lista piatta con nove controlli è il
  problema di *questo* round, e sarebbe un secondo giro sullo stesso file.
- **Ispettore a schede senza metadati, con l'euristica del prefisso `style`** — una convenzione
  che nessuno può dichiarare né violare esplicitamente, e che si rompe alla prima prop di
  contenuto chiamata `styleGuideUrl`.
- **Un componente ispettore per tipo di blocco** — si perde la proprietà, posta da F04/T5, che
  una prop nuova nel registro compaia senza toccare il frontend.
- **Due `Fieldset` fissi invece delle schede** — è l'alternativa seria: meno codice, nessuno
  stato di scheda attiva. Scartata perché con nove props il pannello diventa una colonna da
  scorrere in cui la prop di contenuto sta sempre sopra sette tendine di stile; resta il
  ripiego se le schede Mantine si rivelassero un attrito, e **non sarebbe un cambio di
  decisione**, perché i metadati che lo governano sono gli stessi.
- **Un fallback silenzioso sul nome della prop quando manca l'etichetta** — è esattamente lo
  stato di oggi, promosso a comportamento previsto.

## Conseguenza

**Da oggi la struttura dell'ispettore è dettata dal registro, cioè dal backend.** Non è un
effetto collaterale: è la decisione. Aggiungere una prop a un tipo di blocco significa
dichiararne anche etichetta e scheda, e ometterle non produce un pannello un po' più brutto ma
un **test rosso** (§ 4). Il registro acquisisce così un contratto di presentazione verso il
frontend che prima non aveva — parente stretto dello scostamento da ADR-21 § 2 che ADR-29
dichiara per le props di stile, ma di natura diversa e più mite: questi campi restano opachi
alla validazione e alla sanitizzazione, e nessun renderer li legge. Il prezzo è che
l'evoluzione dell'ispettore passa per il registro e per la pipeline `blocks:export` +
`blocks:types`: una scheda nuova, un ordinamento diverso, una riga di aiuto sono modifiche
backend con un gate CI in mezzo, non ritocchi nel componente. In cambio la voce 3.10 di
`docs/TODO.md` si chiude come parte di una decisione invece che come rifinitura, e con
l'invariante che impedisce di riaprirla per distrazione.
