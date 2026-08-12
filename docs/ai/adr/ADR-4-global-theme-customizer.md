# ADR-4 — Global Theme Customizer (token semantici + cssVariablesResolver + app_settings)

## Status
[ ] In discussione · [x] Approvato · [ ] Rifiutato · [ ] Superseded da ADR-XXX

## Data approvazione
2026-07-26 — approvato da: ccurti (via chat, approvazione retroattiva nell'ambito
della chiusura della gap analysis del 2026-07-23/26: la feature era già
implementata e in uso, ma lo status dell'ADR non era mai stato aggiornato dal
placeholder)

## RFC di riferimento
Nessuna RFC dedicata — bozza discussa direttamente in sessione con il maintainer
(2026-07-19). Se in fase di review emergono alternative sostanziali, la
discussione va promossa a RFC prima dell'approvazione.

## Revisione v7 (2026-07-22)
Il contratto è avanzato in codice fino a `version: 6` (sostituzione di
`primaryColor`/`customPrimary` con un blocco `colors` a 9 voci semantiche —
Primary/Secondary/Accent/Success/Warning/Alert/Error/Danger/Info) senza che
questo ADR fosse aggiornato di pari passo; questa revisione non colma quel
disallineamento documentale (fuori scope), ma parte dal v6 realmente in
codice per descrivere il bump successivo, a `version: 7`.

Estensione: ogni campo dimensionale del contratto (dimensioni testo e
titoli, spaziatura, radius token, ombre, larghezza sidebar) — finora numeri
impliciti in pixel — porta ora anche un'**unità CSS** scelta dall'admin
(`px`/`em`/`rem`/`%`). Cambi minimi rispetto a §1/§3 originali:
- Nuovi campi enum chiusi: `typography.fontSizeUnit`, `typography.headings.fontSizeUnit`,
  `spacingUnit`, `radiusScaleUnit` (`px`/`em`/`rem`/`%`), `shadowUnit`
  (solo `px`/`em`/`rem`: `box-shadow` CSS non ammette percentuali sugli
  offset — vincolo dello spec, non una scelta di progetto), `navbarWidthUnit`.
  Un'unità per **gruppo** (l'intera scala `xs`–`xl`, o i 6 livelli di
  titolo), non per singolo valore — stessa granularità con cui l'ADR
  originale già trattava le scale come righe uniche.
- Range numerici per unità: il range chiuso condiviso (§1) non può più essere
  un singolo `{min, max}` per campo, perché il range sensato dipende
  dall'unità scelta (es. spaziatura: 0–80 in px, 0–5 in rem/em, 0–100 in %).
  Frontend e backend derivano ora em/rem dal range px esistente (÷16) e
  aggiungono un range `%` scelto esplicitamente dove il CSS lo ammette — la
  tabella px originale (`THEME_NUMERIC_LIMITS`) resta invariata e implicita
  per ogni config precedente alla v7.
- Validazione backend: i decorator `@Min`/`@Max` statici non bastano più (il
  range dipende da un campo gemello, l'unità). Sostituiti su questi campi da
  un unico validatore cross-field (`ThemeDimensionRangesConstraint`,
  `@Validate` su tutto il `ThemeConfigDto`) che legge l'unità e applica il
  range corretto — stesso principio "server valida quanto il frontend",
  nessun rilassamento della sicurezza.
- Resa CSS: nessuna matematica di conversione inventata. `px`/`rem` passano
  dal convertitore nativo Mantine `rem()` (scale-aware, rispetta lo slider
  "scala UI" del tema); `em`/`%` — unità che Mantine non gestisce
  internamente — vengono emesse così come inserite dall'admin e non
  partecipano alla scala UI: comportamento nativo di Mantine per unità che
  non riconosce, non una scelta di questo codice, documentato in `theme.ts`.
- Cambio unità in UI: per evitare un salto visivo insensato (16 "px" che
  diventa 16 "rem"), l'editor converte il valore alla nuova unità
  (`convertDimension`/`convertSizeScale` in `theme.ts`, base 16px per
  em/rem; per `%` il riferimento è il valore di fabbrica dello stesso campo).
- Migrazione: le config v1–v6 salvate adottano `'px'` come unità di ogni
  campo dimensionale in lettura (stesso principio "default di fabbrica =
  pixel-identical" di ogni bump precedente) — nessuna migrazione DB, nessun
  downtime.

## Revisione v2 (2026-07-21)
La Fase 1 (MVP) copriva solo primario, radius e gli 11 token per-scheme
(§1 originale). Su richiesta esplicita di estendere l'Editor tema a "un pò
tutto" il theming Mantine usato dal progetto — non solo qualche colore — il
contratto `ThemeConfig` è stato esteso da `version: 1` a `version: 2`, restando
nello stesso ADR (non ancora approvato) invece di aprirne uno nuovo. Le
sezioni seguenti descrivono direttamente il contratto v2; §1 in fondo elenca
cosa resta invariato rispetto alla v1 e come avviene la migrazione delle
installazioni che avessero già salvato una riga v1.

## Contesto
Lo starter-kit ha oggi un theming minimale: il SuperAdmin/Admin sceglie il colore
primario tra le 14 palette native Mantine tramite `ThemeSwitcher` (Select nella
sidebar), con persistenza **solo su localStorage** (per-browser, non condivisa
tra utenti). Sidebar, sfondi di pagina e card sono fissati nei CSS Modules su
variabili CSS native Mantine (`--mantine-color-dark-7`, `--mantine-color-gray-0`, …).

Serve un "Global Theme Customizer" per il SuperAdmin: un Drawer apribile da un
tasto a ingranaggio nella sidebar, con controlli per modificare in tempo reale
l'aspetto dell'app (primario, sfondi pagina/card, bordi, testi, colori navbar),
salvato come **singolo oggetto JSON sul database** e quindi valido per tutti gli
utenti dell'installazione.

Vincoli emersi in analisi:
- L'app supporta light/dark (`defaultColorScheme="auto"`): ogni colore
  personalizzabile deve avere un valore per entrambi gli schemi, o il customizer
  corregge un tema e devasta l'altro.
- La sidebar è volutamente ancorata alla palette `dark` nativa (commento
  esplicito in `LayoutProtected.module.css` sul contrasto): sovrascrivere
  `--mantine-color-dark-*` globalmente romperebbe ogni altro uso della palette.
- Il primario passa oggi dal rebuild del theme object (`buildAppTheme`), i CSS
  Modules consumano solo variabili CSS Mantine: qualunque soluzione deve avere
  **una sola fonte di verità**, non due canali di stile concorrenti.
- I valori colore inseriti dall'admin finiscono in variabili CSS: sono input
  utente e vanno validati server-side (vettore di CSS injection).

## Decisione

### 1. Modello dati: token semantici chiusi e versionati (contratto v2)
Il tema è un singolo oggetto JSON `ThemeConfig` con:
- `version: 2` — versionamento esplicito per migrare i default nei progetti
  derivati dallo starter-kit senza breaking change;
- `primaryColor` — una delle **14 palette native Mantine oppure `'custom'`**
  (riuso di `MANTINE_PRIMARY_COLORS`); con `'custom'` si attiva `customPrimary`;
- `customPrimary` — tupla di **10 sfumature hex** usata quando `primaryColor`
  è `'custom'`. Generata lato client da un colore base (`generatePrimaryShades`,
  stessa scala di luminosità delle palette native) e rifinibile sfumatura per
  sfumatura; nessuna dipendenza aggiunta;
- `primaryShade` — indici shade (0–9) del "filled" per scheme
  (`{ light, dark }`), prima cablati fissi (`{ light: 8, dark: 5 }`) in
  `buildAppTheme`, ora configurabili;
- `radius` — uno dei valori nativi Mantine (`xs`–`xl`), come in v1;
- `focusRing`, `cursorType`, `respectReducedMotion`, `autoContrast` +
  `luminanceThreshold`, `scale` — mappano 1:1 le omonime opzioni di
  comportamento di `createTheme()` (`theme.focusRing`, `theme.cursorType`,
  `theme.respectReducedMotion`, `theme.autoContrast`,
  `theme.luminanceThreshold`, `theme.scale`);
- `defaultGradient` — `{ from, to, deg }`, mappa `theme.defaultGradient` (le
  variant `gradient` di Button/Badge/ecc.);
- `typography` — font di testo/titoli (**ID di una whitelist**, non stringhe
  libere: `THEME_FONT_FAMILIES`/`THEME_MONO_FONT_FAMILIES` in `theme.ts`
  mappano l'ID allo stack CSS reale, tutti font di sistema, nessun webfont
  esterno), `fontSizes`/`lineHeights` (scala `xs`–`xl`), `headings.fontWeight`
  e dimensione/interlinea per ciascun livello `h1`–`h6`;
- `spacing`, `radiusScale` — scale numeriche `xs`–`xl` in pixel, mappano
  `theme.spacing` e `theme.radius` (il radius *scale*, distinto da `radius`
  che resta il `defaultRadius`);
- `shadows` — ombre `xs`–`xl` come **spec strutturate**
  (`{ y, blur, spread, opacity }`): la stringa CSS `box-shadow` è generata dal
  builder (`buildAppTheme`), l'admin non scrive mai una stringa box-shadow
  libera (stesso principio anti-injection dei colori hex);
- `components` — default per-componente applicati via `theme.components` →
  `defaultProps` per **Button, ActionIcon, Badge, campi input
  (TextInput/PasswordInput/Select/NumberInput), Paper/Card, Modal/Drawer,
  Table, Tooltip, Loader** — gli unici componenti Mantine effettivamente usati
  nel progetto (niente default per componenti non presenti in `app/frontend`).
  Ogni knob enum ammette la sentinella `'unset'` (`THEME_UNSET`): il prop non
  viene emesso in `defaultProps` e vale il default nativo del componente
  Mantine — con `'unset'` ovunque il tema resta identico a oggi;
- due blocchi `light` e `dark`, **invariati dalla v1**, con lo stesso set
  chiuso di 11 token hex (formato obbligatorio `#rrggbb`):

| Token | Uso |
|---|---|
| `pageBg` | Sfondo applicativo (`.appBg`) |
| `cardBg` | Sfondo `ContentCard` / superfici contenuto |
| `cardBorder` | Bordo card |
| `textPrimary` | Testo principale |
| `textSecondary` | Testo secondario/dimmed |
| `navbarBg` | Sfondo sidebar |
| `navbarText` | Testo voci navbar |
| `navbarHoverBg` | Sfondo hover voce |
| `navbarActiveBg` | Sfondo voce attiva |
| `navbarActiveText` | Testo voce attiva |
| `navbarBorder` | Bordi interni sidebar (sezione utente, bottoni) |

Nessun campo fuori da questo set: tutto il resto resta governato dai default
Mantine. Estensioni future = bump di `version` + migrazione dei default.
Ogni campo numerico ha un range chiuso condiviso tra frontend
(`THEME_NUMERIC_LIMITS` in `theme.ts`) e backend (stessi limiti replicati nei
decorator `@Min`/`@Max` del DTO) — vedi §3.

### 2. Applicazione: `cssVariablesResolver` per i token, theme object per il resto
- Il provider esistente `ThemeColorProvider` (`hooks/useThemeColor.tsx`) rimane
  l'unico punto dell'app che monta `MantineProvider` e detiene l'intero
  `ThemeConfig`. Due canali distinti, entrambi API ufficiali Mantine v7, mai
  iniezione manuale (`<style>` o `setProperty` restano vietati):
  - gli **11 token per-scheme** (`light`/`dark`) passano da
    `cssVariablesResolver` come variabili `--app-*`, scheme-aware, come in v1;
  - **tutto il resto del contratto** (primario/palette custom, `primaryShade`,
    tipografia, scale, ombre, comportamento, `components`) passa da
    `buildAppTheme(config)`, che ora accetta l'intero `ThemeConfig` (non più i
    soli `primaryColor`/`radius`) e costruisce il theme object Mantine
    completo con `createTheme()`.
- I token `--app-*` sono consumati dai CSS Modules **con fallback sui valori
  attuali**: `background: var(--app-navbar-bg, var(--mantine-color-dark-7))`.
  Con i soli default l'app resta pixel-identical a oggi (criterio di verifica
  della fase 1, invariato).
- Le ombre custom sono generate come stringa CSS solo se la spec strutturata
  differisce dal default di fabbrica; altrimenti `buildAppTheme` riusa la
  stringa multi-layer nativa di `DEFAULT_THEME.shadows` — stesso principio del
  "solo diff dal default" già usato per i token colore.
- Reattività live: l'editor scrive lo stato *draft* nel provider ad ogni
  change (`updateConfig` clona-muta-imposta); tema e resolver, entrambi
  rimemoizzati sull'intero `themeConfig`, si rigenerano su tutta l'app senza
  salvataggio. "Salva" persiste sul DB, "Annulla" ripristina l'ultimo stato
  salvato, "Ripristina default" ricarica i default di fabbrica.

### 3. Persistenza: tabella `app_settings` (key/value jsonb)
- Tabella `app_settings` in `app/backend/src/db/schema.ts` (struttura standard
  obbligatoria: id, guid, isActive, createdAt, updatedAt, createdBy, updatedBy,
  FK `restrict`) + `key varchar` univoca + `value jsonb` — invariata dalla v1.
  Tabella generica: il tema è la riga `key = 'theme'`; futuri settaggi globali
  (branding, feature flag) riusano la stessa tabella senza nuovi ADR.
- Modulo `app/backend/src/settings/` (module/controller/service/dto), invariato:
  - `GET api/v1/app/settings/theme` — autenticato, tutti i ruoli (il tema serve
    a chiunque usi l'app);
  - `PUT api/v1/app/settings/theme` — **solo `GuardSuperAdmin`**, ogni
    salvataggio registrato su `AuditLogService`. Il PUT accetta **solo il
    contratto v2**: un payload con `version: 1` è respinto con 400.
- DTO (`ThemeConfigDto`, speculare a `ThemeConfig` del frontend) con
  class-validator e `forbidNonWhitelisted`, validazione nested su ogni blocco:
  `primaryColor`/`focusRing`/`cursorType`/le variant componente ∈ whitelist,
  `customPrimary` esattamente 10 hex, ogni token colore con regex
  `^#[0-9a-fA-F]{6}$`, font ∈ whitelist di ID (mai una stringa font libera),
  ogni campo numerico con `@Min`/`@Max` sullo stesso range del frontend,
  `version` intero noto (`2`). Nessuna stringa libera arriva mai a una
  variabile CSS o al theme object.
- Le righe **v1 storiche** salvate prima di questa revisione restano valide in
  DB: `SettingsService.getTheme()` le riconosce (`value.version === 1`) e le
  normalizza al contratto v2 in lettura (`normalizeStoredTheme`), preservando
  `primaryColor`/`radius`/`light`/`dark` e applicando i default v2 per i campi
  nuovi — nessuna migrazione DB necessaria, nessun downtime.
- Aggiornamento `openapi:export` + `openapi:types` + collezioni Bruno
  `bruno/settings/*.yml` per entrambi gli endpoint (payload v2 completo).

### 4. Bootstrap e migrazione dal meccanismo attuale
- Anti-FOUC: l'ultimo `ThemeConfig` ricevuto dal server è cachato in
  localStorage e applicato subito al mount; al login/refresh il provider
  riconcilia con `GET /settings/theme` (server = fonte di verità).
- La chiave localStorage `theme_primary_color` (scelta per-browser, pre-ADR-4)
  è **deprecata e assorbita** nel config globale: al primo avvio post-migrazione
  viene ignorata e rimossa. Un solo tema per installazione, uguale per tutti.
- Cache localStorage v1 storiche (chiave `theme_config`, contratto v1) vengono
  migrate al volo da `migrateThemeConfig()` (stessa logica di
  `normalizeStoredTheme` lato server, duplicata lato client per l'anti-FOUC
  offline): se la migrazione fallisce (JSON corrotto, blocco scheme
  incompleto) si ripiega sui default di fabbrica, mai su valori parziali.
- Il tasto a ingranaggio/pagina Editor tema è visibile al solo SuperAdmin
  (anche a sidebar compressa, variante icon-only).
- Le pagine pubbliche (`/login`, ecc.) usano i default di fabbrica o la cache
  localStorage se presente: nessun endpoint pubblico non autenticato per il tema
  nell'MVP.

## Alternative valutate
| Opzione | Pro | Contro | Motivo scarto |
|---|---|---|---|
| `cssVariablesResolver` + theme object completo (scelta) | API ufficiali v7, scheme-aware, reattiva via React, una sola fonte di verità per canale | Vocabolario token/campi da progettare a monte | — |
| Iniezione manuale di `<style>`/`setProperty` | Nessun vincolo di API | Bypassa Mantine, non gestisce light/dark, secondo canale di stile non tracciato, più difficile da testare | Duplicazione della fonte di verità; le API ufficiali coprono lo stesso caso |
| Primario hex arbitrario con generazione shade (v2) | Massima libertà per l'admin | Serve generare 10 shade coerenti, rischio contrasto | Adottata in v2 come opzione aggiuntiva (`primaryColor: 'custom'`), non in sostituzione delle 14 palette native |
| Token liberi/aperti (l'admin può ridefinire qualunque variabile) | Flessibilità totale | Esplosione dei controlli, combinazioni illeggibili, superficie di injection ampia | Set chiuso (anche esteso in v2) = UI guidata, validazione stretta, manutenzione prevedibile |
| `theme.components` con `defaultProps` liberi (stringhe libere, no whitelist) | Copertura 1:1 di ogni prop Mantine | Superficie di validazione enorme, props non sempre string-safe (oggetti, funzioni) | Whitelist chiusa per componente/knob (`THEME_UNSET` incluso) copre i casi reali usati nel progetto senza aprire un vettore di input libero |
| Salvataggio su tabella `users` (tema per-utente) | Personalizzazione individuale | Il requisito è un tema **globale** di installazione; per-utente moltiplica stati e supporto | Fuori scope; `app_settings` non lo preclude in futuro |
| Persistenza solo localStorage (status quo esteso) | Zero backend | Non condiviso tra utenti/browser, non è "identità visiva dell'installazione" | Non soddisfa il requisito |

## Conseguenze
- Positive: identità visiva per-installazione configurabile senza rebuild né
  fork dei CSS o del codice — tipografia, scale, ombre e default componente
  inclusi, non solo colori; i progetti derivati dallo starter-kit personalizzano
  il brand cambiando una riga jsonb; i CSS Modules restano puliti (solo
  variabili, con fallback); anteprima live senza salvataggio; palette custom
  disponibile senza dipendenze aggiuntive (generazione shade in-house).
- Negative / costi: ogni nuovo componente Mantine adottato nel progetto che si
  vuole rendere "brandizzabile" richiede l'estensione esplicita di
  `ThemeComponentsConfig` (frontend + DTO) — non è automatico; ogni nuova
  superficie/testo deve consumare i token `--app-*` (con fallback) invece
  delle variabili Mantine dirette — va rispettato nelle review; il contratto è
  versionato: aggiungere campi richiede bump di `version` e una funzione di
  migrazione (come fatto per v1→v2).
- Il contrasto tra i colori scelti resta responsabilità dell'admin (anteprima
  live come strumento di verifica); `autoContrast`/`luminanceThreshold` sono
  disponibili come aiuto opzionale, non enforcement automatico WCAG.
- La modifica a `schema.ts` (tabella `app_settings`) e la migrazione Drizzle
  restano soggette ad approvazione umana esplicita come da CLAUDE.md — questo
  ADR la documenta, non la autorizza. La revisione v2 non ha richiesto
  modifiche allo schema (stesso `value jsonb`, cambia solo la forma).

## Conformità
- `app/frontend/src/theme.ts`: tipo `ThemeConfig` v2, default di fabbrica,
  whitelist font/variant, `THEME_NUMERIC_LIMITS`, type guard `isThemeConfig`,
  `migrateThemeConfig` (v1→v2), `generatePrimaryShades`, factory del
  `cssVariablesResolver` e di `buildAppTheme(config)`. Nessun hex/stack font
  hardcoded fuori dai default e dalla whitelist.
- `app/frontend/src/hooks/useThemeColor.tsx`: unico provider del tema; nessun
  altro punto dell'app monta `MantineProvider` o scrive variabili CSS.
- `app/frontend/src/components/theme-editor/` (`ThemeEditorDemos.tsx`,
  `ThemeEditorPanels.tsx`) + `app/frontend/src/config/themeEditorSections.ts`:
  demo dal vivo e pannelli di modifica, un pannello per sezione, valori sempre
  vincolati (hex, whitelist, range) — mai un input libero verso il tema.
- CSS Modules: ogni consumo dei token per-scheme nel formato
  `var(--app-<token>, <fallback attuale>)`; ricerca `grep -r "setProperty"` e
  `grep -r "<style"` su `app/frontend/src` senza risultati riferiti al tema.
- `app/backend/src/settings/`: DTO speculare (`ThemeConfigDto`) con regex
  `^#[0-9a-fA-F]{6}$` su ogni token colore, whitelist su palette/font/variant,
  `@Min`/`@Max` sugli stessi range del frontend, `GuardSuperAdmin` sul `PUT`
  (solo `version: 2` accettato in scrittura), chiamata ad `AuditLogService`
  nel service, migrazione v1→v2 in lettura (`normalizeStoredTheme`).
- Test: Supertest su `GET`/`PUT` (happy path, riga v1 storica migrata in
  lettura, payload con hex/font/variant invalido o numero fuori range → 400,
  `version: 1` sul PUT → 400, ruolo non-SuperAdmin sul PUT → 403); Vitest su
  `theme.test.ts` (guard, migrazione, generatore sfumature); Bruno
  `bruno/settings/` con payload v2 completo; fase 1 verificabile con app
  visivamente identica ai default di fabbrica.
