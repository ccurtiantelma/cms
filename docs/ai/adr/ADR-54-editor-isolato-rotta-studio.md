# ADR-54 — Editor visivo isolato su rotta `/studio/:id`, fuori da `LayoutProtected`

## Status
[x] **Approvata**

## Data approvazione
**2026-09-04**, approvata dall'umano in sede di task, via conferma esplicita alla domanda
"Full route migration" posta in questa sessione (stesso pattern di autorizzazione di
ADR-38/47/50/51/52), a fronte del task "Isolamento Rotta Full-Screen Studio Layout" che
richiedeva una rotta `/studio/:id` dedicata in sostituzione dell'overlay CSS attuale
(`FullScreenEditorLayout.tsx`, montato dentro `pages/:guid`/`LayoutProtected`, la cui
stessa intestazione documenta la scelta opposta: "Non tocca il routing... nessuna nuova
rotta, nessuna modifica ad `App.tsx`"). Implementazione autorizzata a procedere.

## Decisione

Il "Contenuto" (editor visivo a blocchi) lascia la scheda `Tabs` di `PagePageDetail.tsx` e
diventa una rotta propria `/studio/:id`, dentro `RequireAuth` ma **fuori** da
`LayoutProtected`: nessuna sidebar/topbar admin, shell dedicata a piena finestra
(`LayoutStudio`, `100vw`×`100vh`, `overflow:hidden`, `display:flex; flex-direction:column`).
`PagePageDetail.tsx` perde la scheda "Contenuto" e il montaggio di `BlockEditorPanel`; resta
responsabile solo di Metadati/SEO/GEO/Revisioni. I punti di ingresso in `PagePages.tsx`
(creazione rapida, azione "Apri") e `PagePageDetail.tsx` instradano su `/studio/:id`. Il
fetch iniziale dell'albero (`useBlockEditorStore.initTree`) è pilotato dall'`id` di rotta
(`useParams`), non più da una prop passata giù da `PagePageDetail`.

## Alternative scartate

- **Overlay CSS `position:fixed` dentro `pages/:guid`** (stato attuale,
  `FullScreenEditorLayout`) — non soddisfa il requisito esplicito di una rotta isolata; il
  task lo richiede in sostituzione, non in aggiunta.
- **Rotta `/studio/:id` aggiuntiva, overlay esistente lasciato intatto come secondo
  ingresso** — due punti di ingresso sulla stessa sessione di editing con gestione
  divergente delle modifiche non salvate, in conflitto con "mai overwrite silenzioso".

## Conseguenze

`FullScreenEditorLayout.tsx` perde la ragion d'essere di overlay coordinato con
`Tabs`/`activeTab` (keepMounted per non perdere modifiche, z-index sopra l'`AppShell`,
`active` pilotato dalla scheda selezionata) — il contenuto viene riusato come chrome
dell'editor dentro `PageStudio`, ma la logica di coordinamento con `Tabs`/`activeTab` va
rimossa, non lasciata come codice morto. La protezione da perdita di modifiche non salvate
va ricostruita a livello di rotta (conferma all'uscita da `/studio/:id`, es.
`beforeunload`/conferma di navigazione), non più a livello di tab. I pulsanti
"Anteprima"/menu di stato oggi duplicati fra editor e dettaglio (disambiguati da
`activeTab !== 'content'`) vanno rivisti perché quella condizione sparisce insieme alla
scheda: "Anteprima" nel dettaglio Pagina resta sempre visibile su bozza, quello nella
topbar dello Studio è l'unico presente durante l'editing.

## Conformità

`App.tsx` contiene una `<Route path="studio/:id">` fuori da `LayoutProtected`, dentro
`RequireAuth`. `pages/:guid` in `PagePageDetail.tsx` non monta più `BlockEditorPanel`/scheda
"Contenuto". `LayoutStudio` non importa `AppShell`/componenti di navigazione di
`LayoutProtected`.
