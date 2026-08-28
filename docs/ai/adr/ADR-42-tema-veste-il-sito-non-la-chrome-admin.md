# ADR-42 — Il tema di installazione veste il sito pubblicato, non la chrome amministrativa

## Status
[ ] In discussione · [x] Approvata · [ ] Rifiutata · [ ] Superseded da ADR-XXX

## Data approvazione
2026-08-28 (approvazione umana esplicita in sessione, contestuale al task che apre questa ADR)

---

## Decisione

1. **Il `ThemeConfig` (ADR-4) governa l'aspetto del sito pubblicato, non quello
   dell'amministrazione.** La chrome admin monta `MantineProvider` sui **default di
   fabbrica** (`DEFAULT_THEME_CONFIG`) e non riflette mai il tema salvato. È il rapporto che
   WordPress ha col proprio customizer: il tema veste il sito, non il pannello di gestione.
   Questo **supera ADR-4 § 2 e § 4** limitatamente al *destinatario* del tema; il modello
   dati (§ 1), la persistenza su `app_settings` e la superficie API (§ 3) restano
   integralmente in vigore. ADR-4 non viene modificata (rientra nell'intervallo storico
   1–18 che CLAUDE.md § Ruoli dichiara non aggiornabile).

2. **Il canale verso il sito sono variabili CSS, non Mantine.** `utils/theme-css.utils.ts`
   compila il `ThemeConfig` in un blocco CSS puro, iniettato in un `<style>` nell'head di
   ogni documento SSR (`app/public-site`). Mantine non esiste sul sito pubblico (ADR-22 § 5)
   e non deve diventarne una dipendenza per far passare un colore.

3. **Il tema sovrascrive il vocabolario dei token dei blocchi.** Oltre alla superficie
   `--theme-*`, il compilatore riemette i nomi `--cms-*` di
   `components/blocks/style-tokens.module.css` coi valori del tema. Senza questo ponte una
   modifica del tema resterebbe dichiarata e invisibile: i blocchi leggono `--cms-*`, non
   `--theme-*`. I valori statici del foglio restano come fallback quando nessun tema è
   applicato (backend irraggiungibile in SSR, test di componente isolati) — nessuna
   regressione.

4. **I default `h1`–`h6` sono emessi dentro `:where()`**, quindi a specificità zero: una
   scelta esplicita sul singolo blocco (`styleFontSize`, `styleTextColor`, …, specificità
   0,1,0) vince sempre sul default del tema, senza `!important` da nessuna delle due parti.

5. **Lo scope non ha default.** `generateThemeCss` esige un `selector` esplicito dal
   chiamante — `:root` per il documento SSR, la classe della radice del Canvas per l'editor.
   Stessa cautela già adottata da `globalTokensCompiler.ts`: uno scope implicito è
   esattamente il modo in cui il tema del sito tornerebbe a ridipingere la chrome che
   circonda il canvas.

6. **Il sito pubblico segue la preferenza di sistema del visitatore**: token `light` come
   base, token `dark` sotto `@media (prefers-color-scheme: dark)`. Il Canvas dell'editor usa
   invece lo scheme chiaro forzato — è una superficie di editing, il suo aspetto non deve
   dipendere dalle impostazioni del sistema operativo di chi ci lavora.

7. **L'anteprima dell'Editor tema è scopata alla sola colonna delle demo**, tramite un
   `MantineProvider` annidato (`cssVariablesSelector` su una classe stabile,
   `forceColorScheme`, `getRootElement` che restituisce `undefined`). Prima l'anteprima era
   l'intera app — cioè l'Editor tema ridipingeva l'amministrazione invece del sito.

8. **I Global Design Tokens cessano di essere un secondo sistema di stile.** Il drawer
   "Impostazioni Sito" è ritirato dalla toolbar dell'editor e il sito pubblico non legge più
   `public/settings/global-tokens`; endpoint, DTO e riga `app_settings` restano in piedi,
   non rimossi. Il picker "colori globali" dell'ispettore prop attinge ora ai colori del
   tema. Un solo sistema di stile globale per installazione.

## Alternative scartate

- **Tema base + Global Design Tokens come override** — nessuna feature ritirata, ma
  cambiare il primario nell'Editor tema non cambierebbe l'accento dei blocchi: due tavolozze
  concorrenti sulle stesse proprietà, esattamente la confusione da cui nasce questa ADR.
- **Lasciare ai Global Tokens palette/font/spaziatura e dare al tema solo il resto** —
  divide il vocabolario per accidente storico anziché per significato; l'admin dovrebbe
  ricordare quale delle due schermate governa quale proprietà.
- **Portare Mantine nel sito pubblico e riusare `buildAppTheme`** — riuso massimo del codice
  esistente, ma viola ADR-22 § 5 e caricherebbe una UI library in un documento che non idrata
  nulla.
- **Continuare a vestire anche l'admin col tema salvato** — status quo; è precisamente il
  comportamento che il maintainer ha chiesto di invertire.
- **Ricostruire l'Editor tema attorno ad anteprime a blocchi invece che a componenti
  Mantine** — anteprima più fedele al sito, ma è una riprogettazione della feature, non il
  cambio di destinatario che questa ADR registra.

## Conseguenza

`app/frontend/src/theme-tokens.ts` nasce come foglia priva di Mantine (whitelist font, size
token, unità, livelli di titolo) e `theme.ts` la ri-esporta: è la condizione perché
`theme-css.utils.ts` e `globalTokensCompiler.ts` siano importabili da `app/public-site`.
Questo **sana una violazione preesistente di ADR-22 § 5** — il bundle SSR importava
`DEFAULT_THEME` da `@mantine/core`; ora contiene zero occorrenze di Mantine, verificabile con
`grep -c mantine app/public-site/dist/server.js`.

`ThemeStyleTag.tsx` è l'**unico** punto del sito pubblico che usa `dangerouslySetInnerHTML`
per il CSS, condiviso da Pagina, anteprima di bozza e pagine di errore; il test di guardia
`app/public-site/test/escaping.spec.ts` lo impone. Non è un vettore di injection: il DTO è già
validato server-side, e `generateThemeCss` ricontrolla comunque ogni valore prima di emetterlo
(colori sulla regex `#rrggbb`, unità e pesi su whitelist, numeri su `Number.isFinite`), con
ripiego sul default di fabbrica per qualunque valore fuori contratto.

`LayoutProtected` invoca ora `reconcileThemeFromServer()` — dichiarata da ADR-4 § 4 ma di
fatto non chiamata da nessuno: senza, l'Editor tema si apriva sui default su un browser nuovo
e il Canvas dipingerebbe un tema stantio.

Costi: ogni token del tema che si vuole rendere visibile sul contenuto richiede una riga di
ponte esplicita nel compilatore, non è automatico; un valore del `ThemeConfig` privo di
equivalente nel vocabolario dei blocchi resta inerte sul sito finché quel ponte non esiste. Le
demo dell'Editor tema restano componenti Mantine — utili a giudicare colori e tipografia, non
un'anteprima fedele del sito: quella è `/__preview/` (ADR-25), che dalla presente ADR usa lo
stesso tema del sito pubblicato.
