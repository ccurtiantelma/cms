# ADR-58 — Controlli di dimensionamento e ritaglio per il blocco `image`

## Status
[x] Approvato

## Data approvazione
2026-09-05 — approvato da: marketing@antelmagroup.net

## Decisione
Il blocco `image` (ADR-21) guadagna 5 prop opzionali e additive, **nessun bump di `v`**
(stesso principio di ADR-47): `styleSizePreset` (`enum`: `thumbnail|card|hero|og|full|custom`,
default `full`) — i primi quattro sono gli stessi preset art-directed già generati dalla
pipeline di ADR-49, `full` è l'originale non trasformato, comportamento attuale invariato;
`styleWidth`/`styleHeight` (`unitValue`, `px|%|vw` e `px|%|vh`, usate solo quando
`styleSizePreset='custom'`); `styleObjectFit` (`enum`: `cover|contain|fill|none`, default
`cover`); `styleAlign` (`enum`: `left|center|right`, default `left`). Nessun nuovo `kind`:
tutti e cinque riusano `enum`/`unitValue` già chiusi da ADR-21/ADR-38. L'aspect ratio non è
una prop libera: deriva dal preset scelto (proporzioni già fisse in `PRESET_DIMENSIONS`,
ADR-49) o dalla coppia width/height esplicita in modalità `custom` — mai una stringa CSS a
piacere dell'editor, coerente col vocabolario chiuso di `color`/`cssClassName` (ADR-38 §5).

Sul renderer: quando `styleSizePreset ≠ full`, il componente `Image` (condiviso
`app/frontend`/`app/public-site`, ADR-22/ADR-27 §6) emette `data-media-preset="<preset>"`
accanto al marcatore esistente `data-media-ref`. `ExportProcessor.resolveMediaResources`
(già esistente, ADR-49/RFC-44) viene esteso a filtrare la famiglia di varianti (`parentFileId`)
per quel preset invece di aggregare **tutti** i preset generati per quel `guid` nello stesso
`srcset` — corregge un mescolamento latente già presente nel codice: oggi, se lo stesso file
originale viene trasformato per due preset diversi da due blocchi diversi, l'export unirebbe le
varianti in un unico `srcset` a rapporti d'aspetto incompatibili. Se la variante richiesta non è
ancora stata generata, l'editor accoda `POST app/files/:guid/transform` (endpoint già esposto da
ADR-49, mai chiamato da alcun componente ad oggi) al cambio della prop, non ad ogni render; nel
frattempo il blocco mostra l'originale.

## Alternative scartate
- Prop `aspectRatio` libera in stringa (`"16/9"`, arbitraria) — vocabolario aperto e non
  validabile, in contrasto col principio di ADR-38 §5.
- Generazione sincrona delle varianti nel path di upload/render — violerebbe ADR-49 §Decisione
  ("mai nel path di una richiesta HTTP"), `sharp` deve restare confinato al worker.
- Nuovo `kind: 'dimension'` dedicato per width+height+aspectRatio come oggetto singolo —
  nessun secondo uso nel registro oggi, `unitValue`+`enum` bastano senza aprire una nuova firma.

## Conseguenza
`image.block.ts` passa da 12 a 17 prop, tutte opzionali: nessuna migrazione di contenuti
esistenti, nessun bump di `v`. `ExportProcessor` guadagna un parametro di filtro preset-aware
sulla risoluzione delle varianti (correzione di un difetto esistente, non una nuova capability
della pipeline). Nessuna modifica a `sharp`, `MediaProcessor`, alla coda `media-queue` o allo
schema del database.
