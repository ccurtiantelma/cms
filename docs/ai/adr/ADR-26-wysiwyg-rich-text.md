# ADR-26 — Editor WYSIWYG per il rich text

## Status
[x] **In discussione** · [ ] Approvata · [ ] Rifiutata · [ ] Superseded da ADR-XXX

## Data approvazione
_(in attesa di firma)_

---

## Decisione

1. **Tiptap, adottato attraverso `@mantine/tiptap`.** Il wrapper Mantine è la ragione della
   scelta, non un dettaglio d'integrazione: la chrome dell'editor è obbligatoriamente Mantine
   (`CLAUDE.md` § Frontend Developer), e ogni altro editor imporrebbe una seconda libreria di
   UI dentro l'admin — cioè un divieto assoluto. Cinque pacchetti nuovi, tutti richiesti dal
   `RichTextEditor` di Mantine:
   `@mantine/tiptap`, `@tiptap/react`, `@tiptap/pm`, `@tiptap/starter-kit`,
   `@tiptap/extension-link`. Nessun altro pacchetto entra con questa firma: un'estensione
   Tiptap ulteriore è una dipendenza nuova ai fini di `CLAUDE.md` § Ask first.

2. **L'editor sta solo nell'ispettore, solo sulle prop `kind: 'richText'`, e la toolbar la
   sceglie il `profile` dichiarato dal registro** (ADR-21 § 4). Oggi una sola prop lo usa
   (`richText.html`, profilo `basic`); il profilo `inline` esiste nel registro e riceve la
   toolbar stretta corrispondente. Le prop `plainText` **non** ricevono il WYSIWYG: sono
   testo verbatim per contratto (ADR-21 § 4), e dare loro un editor di markup significa
   produrre tag dove il registro promette che non ce ne sono.

3. **La toolbar è vincolata al profilo `basic` come sottoinsieme dimostrabile, e il vincolo
   vive nel set di estensioni, non nei pulsanti.** L'allowlist `basic` è
   `p br strong b em i u s a ul ol li` (`block-sanitize-profiles.config.ts`). Nascondere un
   pulsante non basta: `StarterKit` porta heading, blockquote, code, codeBlock,
   horizontalRule e le loro scorciatoie da tastiera e input rule (`# ` a inizio riga diventa
   un `h1`), e l'incolla da Word arriva comunque. Quindi le estensioni che producono tag
   fuori dall'allowlist si **disattivano nella configurazione di `StarterKit`**, e la toolbar
   è la proiezione di ciò che resta — non il contrario.
   **Dimostrabile** significa verificato, non affermato: un unit test enumera l'insieme dei
   tag producibili dalle estensioni configurate e asserisce che sia contenuto
   nell'allowlist del profilo, importando l'allowlist dalla stessa costante che il backend
   usa per sanitizzare. Se un aggiornamento di `StarterKit` aggiunge un nodo, il test cade.

4. **Il server resta l'unica autorità sulla sicurezza.** Il WYSIWYG è comodità di redazione:
   la sanitizzazione server-side pre-persistenza non cambia di una riga (ADR-20), e ciò che
   l'editor rimonta dopo un salvataggio è il valore sanitizzato restituito dal server — il
   meccanismo esiste già (`generation` nello store). Se la toolbar e il profilo divergessero,
   l'effetto è che l'utente vede sparire una formattazione dopo il salvataggio: sgradevole,
   mai una falla. Nessun `dangerouslySetInnerHTML` nuovo compare in `app/frontend`: il
   contatore di F03/T6 resta a uno, dentro `components/blocks/`.

## Alternative scartate

- **Restare sulla textarea di HTML grezzo** (limite noto di F04) — chiede all'autore di
  scrivere markup che il server poi riscrive: è il difetto, non la linea di base.
- **Lexical, Slate, Quill, TinyMCE, CKEditor** — nessuno ha un wrapper Mantine ufficiale:
  ognuno porta la propria UI dentro l'admin, contro il divieto sulla seconda UI lib.
- **Un contenteditable scritto in casa** — l'incolla, l'undo e la normalizzazione del markup
  sono il 90% del lavoro di un editor, ed è esattamente la parte che si sbaglia.
- **Markdown al posto dell'HTML** — cambia il formato persistito di una prop `richText`, cioè
  è una migrazione di schema dei blocchi per ottenere lo stesso risultato.
- **Persistere il JSON di Tiptap invece dell'HTML** — legherebbe il contenuto salvato alla
  libreria d'editing, e il renderer pubblico (che non conosce Tiptap) dovrebbe ricostruirlo.
- **`StarterKit` completo con la sola toolbar ridotta** — scorciatoie, input rule e incolla
  producono comunque tag fuori allowlist, che il server scarta in silenzio: perdita di
  contenuto percepita come bug dell'editor.
- **Allargare `basic` per far posto ai pulsanti utili** (titoli, citazioni, tabelle) — è
  l'inversione del rapporto: l'allowlist è una decisione di sicurezza, la toolbar la segue.

## Conseguenza

Cinque pacchetti npm in più nel solo `app/frontend`, con ProseMirror come peer: `app/public-site`
non li importa mai — non ha JavaScript client e i componenti dei blocchi restano senza Mantine,
quindi il peso è tutto e solo nella chrome amministrativa. Il vincolo che questa ADR lascia in
eredità è il § 3 al contrario: **allargare la toolbar non è una preferenza di stile, è una nuova
firma** — richiede di estendere l'allowlist di un profilo di sanitizzazione, che ADR-21 § 4
dichiara insieme chiuso, e quindi passa da `CLAUDE.md` § Ask first. Chi chiederà "aggiungiamo i
titoli nell'editor" sta chiedendo di modificare un profilo di sicurezza, e il test del § 3 è ciò
che rende quella richiesta visibile invece che silenziosa. I titoli, va detto, hanno già la loro
risposta: esiste il tipo `heading`, ed è un tipo a sé proprio perché l'outline serva a F07/F08
(ADR-21 § 5) — sepolto dentro un `richText` non sarebbe estraibile.
