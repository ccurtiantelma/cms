# ADR-17 — State management frontend con Zustand

## Status
[x] In discussione · [ ] Approvato · [ ] Rifiutato · [ ] Superseded da ADR-XXX

> ⚠️ **Bozza — non approvata.** Il codice è già stato implementato su richiesta
> esplicita dell'utente (2026-08-05) prima della stesura di questa ADR; questo
> documento formalizza a posteriori la decisione e resta in attesa di
> approvazione umana. Vedi "Note sul processo" in fondo.

## Data approvazione
N/D — in attesa di approvazione umana

## RFC di riferimento
Nessuna (decisione presa direttamente su richiesta dell'utente).

## Contesto

Lo stato globale del frontend era gestito con tre `React Context` distinti, uno
per dominio:

| Context | File | Consumer |
|---|---|---|
| `AuthContext` | `hooks/useAuth.tsx` | `App`, `LayoutProtected`, `PageLogin`, `PageDashboard`, `PageProfile`, `PageUsers`, `ImpersonationBanner` |
| `NotificationsContext` | `hooks/useNotifications.tsx` | `NotificationBell` |
| `ThemeColorContext` | `hooks/useThemeColor.tsx` | `LayoutProtected`, `PageThemeEditor` |

Il limite strutturale di `React Context` è che **ogni consumer si ri-renderizza
a ogni cambio del value**, anche quando legge un solo campo che non è cambiato.
Nei tre Context il value era un oggetto con campi eterogenei letti da consumer
diversi — nessun consumer li leggeva tutti:

- `ImpersonationBanner` legge solo `user`, ma si ri-renderizzava a ogni cambio
  di `isLoading`, `isMfaEnabled` e `impersonatedBy`.
- `NotificationBell` legge `items`/`unreadCount`, ma si ri-renderizzava anche
  al cambio di `isLoading`.
- `PageThemeEditor` propaga ogni pixel di drag di Slider/ColorPicker nel
  `ThemeConfig`: con Context, ogni frame di un drag continuo è un context change
  per l'intero albero (mitigato ma non eliminato da `useDeferredValue`).

A questo si aggiungeva il costo di tre `<Provider>` annidati in `main.tsx` e
`LayoutProtected`, con l'ordine di montaggio che diventava significativo.

## Decisione

Adottare **Zustand** (`zustand@^5`) come libreria di state management globale
del frontend, sostituendo i tre `React Context`.

Regole di adozione:

1. **Zustand è per lo stato globale condiviso fra rami diversi dell'albero.**
   Lo stato locale di un componente o di una pagina resta `useState`/`useReducer`:
   nessuna migrazione a Zustand di `usePaginatedList`, `useColumnVisibility`,
   `useColorScheme` o dello stato dei form (vedi "Alternative valutate").
2. **Ogni consumer usa un selettore mirato**, mai il destructuring dell'intero
   store: `useAuthStore((state) => state.user)`, non
   `const { user } = useAuthStore()`. È questo che rende la migrazione
   vantaggiosa; senza selettori si riproduce esattamente il problema del Context.
3. **Un file per store**, in `src/hooks/`, con l'export nominato
   `use<Dominio>Store`. Gli store attuali sono `useAuthStore`,
   `useNotificationsStore`, `useThemeColorStore`.
4. **Gli effetti di bootstrap restano hook React** (`useAuthInit`,
   `useNotificationsInit`) montati una sola volta nel punto dell'albero
   corretto: lo store detiene i dati, non il ciclo di vita.
5. `ThemeColorProvider` **resta un componente React** perché deve wrappare
   `MantineProvider` e usare `useDeferredValue`: è un consumer dello store, non
   più il detentore dello stato.

## Alternative valutate

| Opzione | Pro | Contro | Motivo scarto |
|---|---|---|---|
| Restare su `React Context` | Zero dipendenze, già in uso | Re-render di tutti i consumer a ogni cambio di value; nessun selettore nativo | È il problema che la richiesta chiedeva di risolvere |
| Context + `useMemo`/`memo` sui consumer | Nessuna dipendenza nuova | Mitigazione manuale, fragile e da ripetere a ogni consumer nuovo; non elimina il context change | Sposta il costo sulla disciplina dello sviluppatore, contro lo spirito di uno starter kit |
| Redux Toolkit | Ecosistema maturo, devtools | Boilerplate elevato (slice, action, dispatch) per 3 store piccoli; sproporzionato per una base senza logica di dominio | Over-engineering rispetto all'MVP dello starter kit |
| Jotai / Recoil (atomici) | Granularità massima | Modello mentale atomico meno diretto per stato "a dominio" già coeso; Recoil poco mantenuto | Zustand copre il caso d'uso con meno concetti |
| Migrare anche `usePaginatedList` / `useColumnVisibility` a Zustand | Uniformità apparente | Sono stato **locale per-pagina**, non condiviso: servirebbe uno store per istanza o con chiave dinamica, più complesso di `useState` senza alcun beneficio | Zustand non è un sostituto di `useState`; migrarli sarebbe over-engineering |

## Conseguenze

**Positive**
- Re-render ridotti ai soli consumer del campo effettivamente cambiato.
- `GET /auth/me` passa da 2 a 1 chiamata in sviluppo: la guardia a livello di
  modulo in `useAuthStore.init()` neutralizza il doppio effetto di
  `React.StrictMode`. Rilevante perché `auth/*` è sotto rate limiting (ADR-1)
  ed era la motivazione originale per cui l'auth era in Context.
- `main.tsx` non annida più i provider di auth/notifiche; l'ordine di montaggio
  non è più significativo.
- Lo stato è leggibile fuori da React (`useAuthStore.getState()`) — utile per
  interceptor e utility, oggi non ancora sfruttato.

**Negative / costi**
- Una dipendenza runtime in più (~1 kB gzip).
- La regola "selettori mirati" non è imposta dal compilatore: un
  `const { user } = useAuthStore()` compila e funziona, ma annulla il beneficio.
  Va presidiata in code review (vedi "Conformità").
- Lo stato non è più naturalmente scoped al montaggio di un provider: gli store
  sono singleton di modulo. `useNotificationsStore.disconnect()` deve ripulire
  esplicitamente lo stato allo smontaggio di `LayoutProtected`, cosa che prima
  avveniva da sé smontando il provider.

## Conformità

Come verificare che il codice rispetti questa decisione:

1. **Nessun `React Context` per stato globale**:
   `grep -rn "createContext" app/frontend/src` non deve restituire risultati.
2. **Selettori mirati**: nessun destructuring diretto dello store.
   `grep -rnE "const \{[^}]+\} = use[A-Za-z]+Store\(\)" app/frontend/src` non
   deve restituire risultati.
3. **Naming e collocazione**: ogni store è in `app/frontend/src/hooks/` ed
   esporta `use<Dominio>Store`.
4. **Stato locale non migrato**: `usePaginatedList`, `useColumnVisibility`,
   `useColorScheme` restano basati su `useState` — non sono stato globale.
5. **Regressioni funzionali**: `npm run test:e2e:browser` (ADR-16) deve passare
   sul flusso login → MFA → azione autenticata → logout.

## Impatto su ADR già approvate

**ADR-4 (Global theme customizer)** — due affermazioni restano vere nella
sostanza ma non più alla lettera, perché il detentore dello stato è cambiato:

| Punto ADR-4 | Prima | Ora |
|---|---|---|
| §2 «il provider `ThemeColorProvider` […] detiene l'intero `ThemeConfig`» | Il provider detiene lo stato | Lo stato è in `useThemeColorStore`; il provider lo consuma |
| «Conformità»: «`hooks/useThemeColor.tsx`: unico provider del tema» | Invariato | Invariato — `ThemeColorProvider` resta l'unico punto che monta `MantineProvider` |

Il vincolo architetturale che ADR-4 tutela (un solo `MantineProvider`, nessuna
iniezione manuale di stili, il tema applicato via `buildAppTheme` +
`cssVariablesResolver`) **non cambia**. ADR-4 non è stata modificata: le AI non
possono toccare ADR già approvate (CLAUDE.md — AI Governance). Se questa ADR
viene approvata, valutare un aggiornamento redazionale di ADR-4 §2 a cura umana.

## Note sul processo

Questa ADR è stata scritta **dopo** l'implementazione, non prima, in deroga a
"Ogni decisione architetturale significativa richiede un ADR. Nessuna
eccezione." (CLAUDE.md — Architecture Policy). Il motivo è che l'utente ha
richiesto direttamente installazione e adozione di Zustand; la deroga è
registrata qui per trasparenza. Il documento resta in stato "In discussione"
fino ad approvazione umana esplicita: le AI non possono auto-approvare ADR
(CLAUDE.md — AI Governance).
