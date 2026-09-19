/**
 * Toolbar di selezione **unica** per qualunque tipo di blocco (Sezioni, Colonne, widget
 * foglia): aggiungi sopra, trascina, seleziona genitore, duplica, modifica, elimina,
 * aggiungi sotto — al posto delle tre varianti di chrome mutuamente esclusive per categoria
 * che questo file sostituisce in `EditorBlockWrapper.tsx`. Reversal architetturale esplicito,
 * richiesto e autorizzato dal proprietario del progetto (vedi il task che introduce questo
 * componente): supera la decisione precedente, non la ignora — quella decisione resta
 * leggibile nella history di `EditorBlockWrapper.tsx`.
 *
 * **Maniglia centrale stile Elementor Pro (RE-2, restyle T-editor-refinement).** Ancorata
 * in alto al centro del blocco (`.overlay`, `BlockHoverOverlay.module.css` — `left: 50%;
 * transform: translate(-50%,-100%)`), non più in un angolo: coerente con la richiesta
 * esplicita del task, che cita letteralmente lo standard Elementor Pro. Ogni pulsante è
 * largo/alto almeno 28px (`size={28}` sugli `ActionIcon`/sul trigger di `BlockPalette`,
 * più `min-width`/`min-height` di sicurezza in CSS) — i precedenti `size="xs"` (~20px)
 * erano sotto soglia di contrasto/tocco. Il colore di sfondo **non è più derivato dal
 * livello di annidamento** (T-editor-refinement, requisito esplicito pixel-perfect del
 * task, supera la Decisione originaria di RE-2 riportata sotto): `.overlay` usa ora un
 * azzurro chiaro traslucido fisso, identico per ogni tipo/livello di blocco — non legge
 * più `var(--block-level-color)` (custom property impostata da `EditorBlockWrapper.tsx`
 * sul wrapper del nodo, viola/azzurro/blu per livello — quella resta ma alimenta solo il
 * bordo di hover/selezione dei widget foglia, vedi `EditorBlockWrapper.module.css`). Le
 * icone interne sono ora nere (`.overlayButton`), non più bianche: il bianco presupponeva
 * lo sfondo colorato pieno appena rimosso.
 *
 * Primo controllo, "+" (`BlockPalette`): inserisce un blocco **sopra** questo nodo, stesso
 * menu di selezione tipo già usato per i contenitori vuoti — nessuna seconda UI di scelta
 * tipo. Riceve `parentId`/`index` del nodo corrente (non del suo contenuto: l'inserimento è
 * un fratello precedente, non un figlio) dal chiamante.
 *
 * Ultimo controllo, "+" speculare (`BlockPalette`, stessa istanza di componente, secondo
 * utilizzo): inserisce un blocco **sotto** questo nodo, stesso `parentId` del primo "+" ma
 * `addAfterIndex`/`addAfterParentType` dedicati (indice successivo al nodo corrente, non
 * l'indice del primo "+"). In coda alla `Group`, dopo Elimina e prima degli eventuali
 * controlli opzionali (Salva Preset/Converti in Sezione Globale/Esporta JSON): l'ordine
 * visivo resta aggiungi sopra → trascina → genitore → duplica → modifica → elimina →
 * aggiungi sotto.
 *
 * Montata solo quando il blocco è **selezionato** (`isSelected`, mai sul solo hover): il
 * solo hover mostra invece un badge nome in alto a sinistra (`.hoverBadge`,
 * `EditorBlockWrapper.tsx`) — due segnali distinti per due stati distinti, richiesta
 * esplicita di un round successivo del task, mai sovrapposti sullo stesso angolo del
 * blocco.
 */
import { ActionIcon, Group, Text, Tooltip } from '@mantine/core';
import type { DraggableAttributes } from '@dnd-kit/core';
import type { DraggableSyntheticListeners } from '@dnd-kit/core';
import {
  IconCopy,
  IconCornerLeftUp,
  IconDeviceFloppy,
  IconFileExport,
  IconGripVertical,
  IconPencil,
  IconTrash,
  IconWorld,
} from '@tabler/icons-react';
import { useBlockEditorStore } from '../../../../hooks/useBlockEditorStore';
import BlockPalette from '../BlockPalette';
import styles from './BlockHoverOverlay.module.css';

/** Altezza/larghezza minima condivisa da ogni pulsante della maniglia (RE-2, requisito esplicito del task: min 28px). */
const HANDLE_BUTTON_SIZE = 28;
/** Dimensione delle icone, proporzionata al pulsante 28px (14px su un pulsante 20px era sproporzionato in eccesso di spazio vuoto). */
const HANDLE_ICON_SIZE = 16;

export interface BlockHoverOverlayProps {
  /** Id del nodo su cui agiscono i cinque controlli (`duplicateNodeAction`/`selectNode`). */
  id: string;
  /**
   * Etichetta leggibile del tipo di blocco (`BLOCK_TYPES[...].meta.label`, già risolta dal
   * chiamante), usata nei cinque `aria-label` sotto — stesso formato già cercato dagli
   * helper Playwright pre-esistenti in `e2e/tests/helpers/page-editor.ts` prima della
   * rimozione della vecchia toolbar unica.
   */
  label: string;
  /**
   * Genitore del nodo (`BlockLocation.parentId`, `null` per un nodo di radice): governa solo
   * l'abilitazione di "Seleziona genitore" sotto — un nodo di radice non ha un contenitore da
   * risalire, il pulsante resta disabilitato invece di sparire (stessa affordance visibile-ma-
   * non-cliccabile di "Sposta su/giù" ai bordi in `CanvasContextMenu.tsx`).
   */
  parentId: string | null;
  /**
   * Contenitore/indice in cui inserire un nuovo blocco **prima** di questo nodo (RE-2,
   * primo controllo "+"): stessi `location.parentId`/`location.index` già calcolati dal
   * chiamante per `parentId` sopra — non uno stesso valore, `parentId` lì sopra è quello
   * usato per "Seleziona genitore" (id del contenitore), qui serve anche l'indice del
   * fratello per inserire nella posizione corretta invece che sempre in coda.
   */
  addBeforeIndex: number;
  /**
   * Tipo del contenitore target dell'inserimento "+", per filtrare i tipi ammessi
   * (`BlockPalette.tsx`, `allowedChildTypes`) — `undefined` alla radice, dove vale
   * `ROOT_ALLOWED`, stessa convenzione di `BlockPalette`/`EditorBlockWrapper.tsx` altrove.
   */
  addBeforeParentType?: string;
  /**
   * Contenitore/indice in cui inserire un nuovo blocco **dopo** di questo nodo (controllo
   * speculare ad "Aggiungi Sopra", in coda alla toolbar): stesso `location.parentId` di
   * `parentId` sopra, ma indice del fratello successivo (`location.index + 1`, calcolato dal
   * chiamante) invece di quello del nodo corrente — altrimenti il nuovo blocco atterrerebbe
   * prima, non dopo.
   */
  addAfterIndex: number;
  /**
   * Tipo del contenitore target dell'inserimento "+" sotto, stessa convenzione di
   * `addBeforeParentType` sopra — `undefined` alla radice, dove vale `ROOT_ALLOWED`.
   */
  addAfterParentType?: string;
  /** Attributi dnd-kit del drag di questo nodo (`useDraggable`, calcolati dal wrapper chiamante). */
  attributes: DraggableAttributes;
  /** Listener dnd-kit del drag di questo nodo (`useDraggable`, calcolati dal wrapper chiamante). */
  listeners: DraggableSyntheticListeners;
  /**
   * Anti-clipping (calcolato dal chiamante, `EditorBlockWrapper.tsx`, contro il bordo
   * scrollabile reale del canvas): `true` quando il blocco è troppo vicino al bordo
   * superiore scrollabile perché la toolbar, ancorata di default appena sopra il blocco
   * (`.overlay`), non finisca tagliata da quell'`overflow-y: auto` — la riancora invece
   * dentro il margine superiore del blocco (`.overlayInside`). Nessun calcolo di geometria
   * qui: solo la classe da applicare.
   */
  anchorInside?: boolean;
  /**
   * Apre il `ConfirmModal` di eliminazione già montato in `EditorBlockWrapper.tsx`:
   * l'overlay non gestisce un secondo modal di conferma, solo lo richiede.
   */
  onDelete: () => void;
  /**
   * Apre il modal "Salva come Preset Globale" già montato in `EditorBlockWrapper.tsx`
   * (stesso `usePresetStore`/`BlockPresetManager` già usati da `AdvancedTab.tsx` per
   * container/section): sesto controllo, mostrato solo quando il chiamante lo passa —
   * oggi solo su `section` (F14-01). `undefined` sugli altri tipi: il pulsante non
   * compare affatto, mai disabilitato, nessuna regola duplicata qui su quali tipi la
   * offrono.
   */
  onSaveAsPreset?: () => void;
  /**
   * Apre `ConvertToGlobalSectionModal.tsx` (ADR-55, estende ADR-40): settimo controllo,
   * mostrato solo quando il chiamante lo passa — oggi solo su un contenitore/`section` di
   * primo livello (`EditorBlockWrapper.tsx` decide l'ammissibilità, mai una seconda regola
   * duplicata qui). `undefined` su ogni altro nodo: il pulsante non compare affatto, mai
   * disabilitato.
   */
  onConvertToGlobalSection?: () => void;
  /**
   * Esporta il sottoalbero di questo nodo come file JSON (ADR-56 § 2/§ 3, stesso principio
   * di `onSaveAsPreset`/`onConvertToGlobalSection` sopra): ottavo controllo, mostrato solo
   * quando il chiamante lo passa — oggi solo su un contenitore (`EditorBlockWrapper.tsx`
   * decide l'ammissibilità con `isContainer`, mai una seconda regola duplicata qui).
   * `undefined` su ogni altro nodo: il pulsante non compare affatto, mai disabilitato.
   */
  onExportJson?: () => void;
  /**
   * Etichetta della maniglia drag (Tooltip + `aria-label`), sovrascrive il default
   * "Trascina per riordinare" — oggi solo `section` la passa ("Modifica Contenitore",
   * fedele a Elementor, T-editor-refinement). `undefined`: default invariato per ogni
   * altro tipo di blocco.
   */
  dragTooltipLabel?: string;
  /** Aspetto della barra: trasparente per sezioni/contenitori, verde chiaro per i widget. */
  tone?: 'section' | 'component';
}

/** Overlay hover/selezione con i controlli comuni a ogni tipo di blocco (aggiungi sopra/trascina/genitore/duplica/modifica/elimina/aggiungi sotto), più "Salva come Preset Globale"/"Converti in Sezione Globale"/"Esporta JSON" quando offerti dal chiamante. */
export default function BlockHoverOverlay({
  id,
  label,
  parentId,
  addBeforeIndex,
  addBeforeParentType,
  addAfterIndex,
  addAfterParentType,
  attributes,
  listeners,
  anchorInside,
  onDelete,
  onSaveAsPreset,
  onConvertToGlobalSection,
  onExportJson,
  dragTooltipLabel,
  tone = 'component',
}: BlockHoverOverlayProps): JSX.Element {
  const duplicateNodeAction = useBlockEditorStore((state) => state.duplicateNodeAction);
  const selectNode = useBlockEditorStore((state) => state.selectNode);
  const resolvedDragTooltipLabel = dragTooltipLabel ?? 'Trascina per riordinare';

  return (
    <Group
      className={[
        styles.overlay,
        anchorInside ? styles.overlayInside : '',
        tone === 'section' ? styles.sectionOverlay : styles.componentOverlay,
      ]
        .filter(Boolean)
        .join(' ')}
      gap={6}
      wrap="nowrap"
      // Aggancio per `EditorBlockWrapper.module.css` (`.selected:has(...) >
      // [data-block-overlay='true']`): nasconde l'overlay di un antenato quando un
      // figlio è sotto il cursore/selezionato, così le due chrome non si sovrappongono
      // mai sullo stesso angolo del canvas.
      data-block-overlay="true"
      // Un click su un pulsante dell'overlay non deve mai risalire al wrapper del blocco
      // (che lo riselezionerebbe) né al contenitore che lo ospita.
      onClick={(event) => event.stopPropagation()}
    >
      {/*
        Etichetta nome blocco (ADR-92): stesso testo già mostrato dal badge separato di solo
        hover (`.hoverBadge`, `EditorBlockWrapper.tsx`) — qui perché il badge non è montato
        durante la selezione (`isHovered && !isSelected`), lasciando la toolbar priva finora
        di un'indicazione testuale del tipo di blocco selezionato.
      */}
      <Text size="xs" fw={600} className={styles.overlayLabel}>
        {label}
      </Text>

      {/*
        "+" (RE-2, primo controllo, restyle Elementor Pro): inserisce un nuovo blocco
        **prima** di questo nodo — stesso `BlockPalette` già usato per i contenitori vuoti
        (nessuna seconda UI di scelta tipo), puntato su `parentId`/`addBeforeIndex` invece
        che sul contenuto del nodo stesso (quello sarebbe un figlio, questo un fratello
        precedente).
      */}
      <BlockPalette
        parentId={parentId}
        parentType={addBeforeParentType}
        index={addBeforeIndex}
        label={`Aggiungi blocco sopra ${label}`}
        size={HANDLE_BUTTON_SIZE}
        variant="transparent"
        iconOnly
        triggerClassName={styles.overlayButton}
      />

      <Tooltip label={resolvedDragTooltipLabel} withArrow>
        <ActionIcon
          variant="transparent"
          size={HANDLE_BUTTON_SIZE}
          className={styles.overlayButton}
          aria-label={`Trascina per spostare il blocco ${label}`}
          onClick={(event) => event.stopPropagation()}
          {...attributes}
          {...listeners}
        >
          <IconGripVertical size={HANDLE_ICON_SIZE} />
        </ActionIcon>
      </Tooltip>

      <Tooltip label="Seleziona blocco genitore" withArrow disabled={parentId === null}>
        <ActionIcon
          variant="transparent"
          size={HANDLE_BUTTON_SIZE}
          className={styles.overlayButton}
          aria-label={`Seleziona il blocco genitore di ${label}`}
          disabled={parentId === null}
          onClick={(event) => {
            event.stopPropagation();
            if (parentId !== null) selectNode(parentId);
          }}
        >
          <IconCornerLeftUp size={HANDLE_ICON_SIZE} />
        </ActionIcon>
      </Tooltip>

      <Tooltip label="Duplica" withArrow>
        <ActionIcon
          variant="transparent"
          size={HANDLE_BUTTON_SIZE}
          className={styles.overlayButton}
          aria-label={`Duplica il blocco ${label}`}
          onClick={(event) => {
            event.stopPropagation();
            duplicateNodeAction(id);
          }}
        >
          <IconCopy size={HANDLE_ICON_SIZE} />
        </ActionIcon>
      </Tooltip>

      <Tooltip label="Modifica" withArrow>
        <ActionIcon
          variant="transparent"
          size={HANDLE_BUTTON_SIZE}
          className={styles.overlayButton}
          aria-label={`Modifica il blocco ${label}`}
          onClick={(event) => {
            event.stopPropagation();
            selectNode(id);
          }}
        >
          <IconPencil size={HANDLE_ICON_SIZE} />
        </ActionIcon>
      </Tooltip>

      <Tooltip label="Elimina" withArrow>
        <ActionIcon
          variant="transparent"
          size={HANDLE_BUTTON_SIZE}
          className={styles.overlayButton}
          aria-label={`Elimina il blocco ${label}`}
          onClick={(event) => {
            event.stopPropagation();
            onDelete();
          }}
        >
          <IconTrash size={HANDLE_ICON_SIZE} />
        </ActionIcon>
      </Tooltip>

      {/*
        "+" speculare, ultimo controllo base: inserisce un nuovo blocco **dopo** questo nodo
        — stesso identico `BlockPalette` del primo "+" sopra, stesso `parentId`, ma
        `addAfterIndex`/`addAfterParentType` (indice del fratello successivo) invece di
        `addBeforeIndex`/`addBeforeParentType`.
      */}
      <BlockPalette
        parentId={parentId}
        parentType={addAfterParentType}
        index={addAfterIndex}
        label={`Aggiungi blocco sotto ${label}`}
        size={HANDLE_BUTTON_SIZE}
        variant="transparent"
        iconOnly
        triggerClassName={styles.overlayButton}
      />

      {onSaveAsPreset && (
        <Tooltip label="Salva come Preset Globale" withArrow>
          <ActionIcon
            variant="transparent"
            size={HANDLE_BUTTON_SIZE}
            className={styles.overlayButton}
            aria-label={`Salva il blocco ${label} come Preset Globale`}
            onClick={(event) => {
              event.stopPropagation();
              onSaveAsPreset();
            }}
          >
            <IconDeviceFloppy size={HANDLE_ICON_SIZE} />
          </ActionIcon>
        </Tooltip>
      )}

      {onConvertToGlobalSection && (
        <Tooltip label="Converti in Sezione Globale" withArrow>
          <ActionIcon
            variant="transparent"
            size={HANDLE_BUTTON_SIZE}
            className={styles.overlayButton}
            aria-label={`Converti il blocco ${label} in Sezione Globale`}
            onClick={(event) => {
              event.stopPropagation();
              onConvertToGlobalSection();
            }}
          >
            <IconWorld size={HANDLE_ICON_SIZE} />
          </ActionIcon>
        </Tooltip>
      )}

      {onExportJson && (
        <Tooltip label="Esporta JSON" withArrow>
          <ActionIcon
            variant="transparent"
            size={HANDLE_BUTTON_SIZE}
            className={styles.overlayButton}
            aria-label={`Esporta il blocco ${label} in JSON`}
            onClick={(event) => {
              event.stopPropagation();
              onExportJson();
            }}
          >
            <IconFileExport size={HANDLE_ICON_SIZE} />
          </ActionIcon>
        </Tooltip>
      )}
    </Group>
  );
}
