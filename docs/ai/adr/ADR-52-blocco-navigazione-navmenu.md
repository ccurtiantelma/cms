# ADR-52 — Blocco di navigazione: `navMenu` + `navMenuItem`, nuovo kind `pageRef`

## Status
[ ] In discussione · [x] **Approvata** · [ ] Rifiutata · [ ] Superseded da ADR-XXX

## Data approvazione
**2026-09-03**, firmata dall'umano in sede di task (stesso pattern di autorizzazione di
ADR-38/47/50/51), a fronte del task "Registra il blocco navMenu" che chiedeva
l'implementazione senza ADR a copertura — bloccato da ADR-21 § 5 ("Un sesto tipo...
entra solo con una nuova firma, mai perché sembra naturale accanto agli altri cinque")
e in tensione con ADR-40 (navigazione via blocchi esistenti) e con
`docs/business-rules.md` § "Menu di navigazione" (entità `menus` propria, non ancora
costruita). Questa bozza scioglie la tensione; approvata così com'è scritta, senza
modifiche alla decisione. Implementazione autorizzata a procedere.

---

## Decisione

1. **Due nuovi ingressi nel registro** (decimo e undicesimo, dopo i nove di ADR-21 §5 +
   ADR-39 + ADR-46 §1): `navMenu` (contenitore, `children.allow: ['navMenuItem']`, ammesso
   a `ROOT_ALLOWED` come `container`) e `navMenuItem` (foglia, **non** in `ROOT_ALLOWED` —
   stesso trattamento di `form-field`/`form-submit`). Composizione **a children**, non a
   prop-array: ogni voce di menu è un nodo con `id` proprio, riordinabile e validabile con
   path d'errore (`blocks[0].children[2]...`) tramite l'Editor Structure Navigator già
   esistente — stesso pattern di `form`/`form-field` (ADR-46 §1), nessun nuovo descrittore
   "lista di oggetti" nel `PropKind` chiuso di ADR-21 §2/§4.
2. Props di `navMenuItem`: `label` (`plainText`, obbligatoria, `maxLength: 80`), `pageGuid`
   (nuovo kind `pageRef`, opzionale), `url` (kind `url` esistente, opzionale,
   `maxLength: 2048`), `target` (`enum` `_self|_blank`, opzionale, default `_self`). `url`
   vince quando presente insieme a `pageGuid` (link esterno esplicito, caso già deciso
   nel commento di `NavMenuBlock.tsx` esistente); nessuno dei due è obbligatorio da solo —
   una voce senza link plausibile resta un'etichetta senza `href`, mai un nodo respinto.
3. **Nuovo `kind: 'pageRef'`** in `PropKind` (estensione del chiuso di ADR-21 §4, non un
   riuso di `mediaRef`): stessa validazione di forma (16 hex, nessuna verifica di esistenza
   a scrittura — la risoluzione è a valle). Non si riusa `mediaRef` perché la semantica
   diverge: un file non ha mai stato "non pubblicato", una Pagina sì
   (`business-rules.md` § Menu regola 2) — confondere i due kind renderebbe impossibile
   applicare in futuro regole distinte (hide-if-unpublished) senza toccare ogni prop
   `mediaRef` esistente.
4. **`business-rules.md` § Menu regola 2 è responsabilità del consumer, non del blocco**:
   il blocco persiste solo `pageGuid`, senza verifica di esistenza/stato a scrittura
   (stesso principio di `mediaRef`, "la risoluzione è di F09"). La risoluzione
   `pageGuid → slug` + il filtro "solo `published`" avvengono nella pipeline SSR di
   `app/public-site` (stesso lookup già usato per ADR-24): un `pageGuid` che non risolve a
   una Pagina pubblicata produce una voce **senza `href`**, mai un link rotto — comportamento
   già implementato lato editor in `NavMenuBlock.tsx`, da estendere al render SSR.
5. **Non introduce la tabella `menus`** di `business-rules.md`/`CLAUDE.md` § Database (voce
   "previste, da approvare"): resta un blocco componibile a mano nel Canvas, dentro una
   Pagina o una Sezione Globale (ADR-40) — stesso limite noto di ADR-46 §2 ("nessun
   registro condiviso"): un menu duplicato su più Pagine/Sezioni non ha un punto di
   modifica unico. La tabella `menus` resta un'estensione futura e ortogonale.
6. **Non è in conflitto con ADR-40**: quell'ADR vieta un meccanismo di navigazione
   *parallelo* al registro di ADR-21 ("non un nuovo tipo di blocco, non un nuovo kind, non
   tocca il registro" — riferito a **come si è costruito F06**, senza introdurne uno).
   `navMenu` **arricchisce** lo stesso registro condiviso; una Sezione Globale `header`/
   `footer` lo userà come userebbe `container` o `button` oggi.

## Alternative scartate

- **Un solo tipo `navMenu` con prop `items: array<{...}>`** — richiede un `kind` "lista di
  oggetti" mai esistito nel registro (riservato a scalari o a forma fissa singola come
  `border`/`shadow`), duplica lo strato di composizione che `children` offre già, perde
  riordino/validazione per-nodo con path d'errore.
- **Riuso di `mediaRef` per `pageGuid`** — stessa forma ma semantica diversa (vedi punto 3):
  impedirebbe di trattare in futuro l'assenza di pubblicazione di una Pagina diversamente
  dall'assenza di un file.
- **Composizione con `container`+`button` dentro una Sezione Globale, come suggerito da
  ADR-40** — `button.href` è un `url` puro, nessuna risoluzione dinamica: ogni cambio di
  slug di una Pagina linkata richiederebbe modifica manuale di ogni voce su ogni Sezione
  Globale — il link fragile che `business-rules.md` § Menu regola 2 esclude esplicitamente.
- **Tabella `menus` dedicata subito, invece del blocco** — architettura più corretta a
  lungo termine (un menu condiviso, un solo punto di modifica) ma è un'entità nuova con
  superficie Admin/Pubblica propria, cache dedicata, migrazione schema: fuori scope per una
  richiesta che parte da un blocco di Pagina. Resta la strada quando servirà un menu
  riusato invece che duplicato.

## Conseguenze

- Il registro passa da 9 a 11 tipi. `navMenuItem` con `pageGuid` verso una Pagina
  cancellata/depubblicata resta valido in scrittura (nessuna verifica di esistenza, come
  `mediaRef`): il link "scompare" solo in lettura pubblica via SSR, mai un errore di
  validazione a salvataggio.
- La pipeline SSR di `app/public-site` guadagna una dipendenza nuova per ogni render: deve
  conoscere stato di pubblicazione + slug corrente di ogni Pagina referenziata da un
  `navMenuItem` — stesso tipo di lookup di ADR-24, riusabile, non un nuovo servizio.
  Nessuna cache dedicata: la risoluzione pesa sulla stessa chiave di ADR-23/ADR-40 già
  invalidata per evento (cambio slug/pubblicazione già invalida quella pagina).
- Un incremento futuro di `v` su `navMenu`/`navMenuItem` resta un deploy a senso unico
  (ADR-21 §1).
- `NavMenuBlock.tsx`/`.test.tsx`/`.module.css` già presenti nel working tree (scritti
  prima di questa ADR, con riferimento a un "F16-01" senza feature/spec/plan a copertura)
  vanno rivisti contro la struttura a due tipi qui decisa — passaggio da "un componente con
  prop `items`" a "un componente `navMenu` che itera i figli `navMenuItem`". Va inoltre
  aggiunta l'omissione dell'`href` per `pageGuid` non risolvibile in contesto SSR
  (attualmente il componente presume risoluzione solo lato editor via `usePublicPageUrl`).

## Conformità

`BLOCK_REGISTRY` contiene `navMenu` (in `ROOT_ALLOWED`) e `navMenuItem` (fuori
`ROOT_ALLOWED`, `children.allow: []`), entrambi `v: 1`. `PropKind` include `pageRef` accanto
a `mediaRef`, con validatore di forma condiviso (16 hex) ma `kind` distinto. Nessuna prop
chiamata `items` in nessun tipo del registro. Test che verifica: un `navMenuItem` con
`pageGuid` verso Pagina non pubblicata non produce `<a href>` nell'HTML SSR; `url` vince su
`pageGuid` quando entrambi presenti; `navMenuItem` respinto a radice (`400`, path del nodo).
