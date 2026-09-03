/**
 * Toolbar di selezione **unica** per qualunque tipo di blocco (Sezioni, Colonne, widget
 * foglia): cinque controlli sempre nello stesso punto — trascina, seleziona genitore,
 * duplica, modifica, elimina — al posto delle tre varianti di chrome mutuamente esclusive
 * per categoria che questo file sostituisce in `EditorBlockWrapper.tsx`. Reversal
 * architetturale esplicito, richiesto e autorizzato dal proprietario del progetto (vedi
 * il task che introduce questo componente): supera la decisione precedente, non la
 * ignora — quella decisione resta leggibile nella history di `EditorBlockWrapper.tsx`.
 *
 * Montata solo quando il blocco è **selezionato** (`isSelected`, mai sul solo hover): il
 * solo hover mostra invece un badge nome in alto a sinistra (`.hoverBadge`,
 * `EditorBlockWrapper.tsx`) — due segnali distinti per due stati distinti, richiesta
 * esplicita di un round successivo del task, mai sovrapposti sullo stesso angolo del
 * blocco.
 */
import { ActionIcon, Group, Tooltip } from '@mantine/core';
import type { DraggableAttributes } from '@dnd-kit/core';
import type { DraggableSyntheticListeners } from '@dnd-kit/core';
import {
  IconCopy,
  IconCornerLeftUp,
  IconDeviceFloppy,
  IconGripVertical,
  IconPencil,
  IconTrash,
} from '@tabler/icons-react';
import { useBlockEditorStore } from '../../../../hooks/useBlockEditorStore';
import styles from './BlockHoverOverlay.module.css';

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
  /** Attributi dnd-kit del drag di questo nodo (`useDraggable`, calcolati dal wrapper chiamante). */
  attributes: DraggableAttributes;
  /** Listener dnd-kit del drag di questo nodo (`useDraggable`, calcolati dal wrapper chiamante). */
  listeners: DraggableSyntheticListeners;
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
}

/** Overlay hover/selezione con i controlli comuni a ogni tipo di blocco (trascina/genitore/duplica/modifica/elimina), più "Salva come Preset Globale" quando offerto dal chiamante. */
export default function BlockHoverOverlay({
  id,
  label,
  parentId,
  attributes,
  listeners,
  onDelete,
  onSaveAsPreset,
}: BlockHoverOverlayProps): JSX.Element {
  const duplicateNodeAction = useBlockEditorStore((state) => state.duplicateNodeAction);
  const selectNode = useBlockEditorStore((state) => state.selectNode);

  return (
    <Group
      className={styles.overlay}
      gap={0}
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
      <Tooltip label="Trascina per riordinare" withArrow>
        <ActionIcon
          variant="transparent"
          size="xs"
          className={styles.overlayButton}
          aria-label={`Trascina per spostare il blocco ${label}`}
          onClick={(event) => event.stopPropagation()}
          {...attributes}
          {...listeners}
        >
          <IconGripVertical size={14} />
        </ActionIcon>
      </Tooltip>

      <Tooltip label="Seleziona blocco genitore" withArrow disabled={parentId === null}>
        <ActionIcon
          variant="transparent"
          size="xs"
          className={styles.overlayButton}
          aria-label={`Seleziona il blocco genitore di ${label}`}
          disabled={parentId === null}
          onClick={(event) => {
            event.stopPropagation();
            if (parentId !== null) selectNode(parentId);
          }}
        >
          <IconCornerLeftUp size={14} />
        </ActionIcon>
      </Tooltip>

      <Tooltip label="Duplica" withArrow>
        <ActionIcon
          variant="transparent"
          size="xs"
          className={styles.overlayButton}
          aria-label={`Duplica il blocco ${label}`}
          onClick={(event) => {
            event.stopPropagation();
            duplicateNodeAction(id);
          }}
        >
          <IconCopy size={14} />
        </ActionIcon>
      </Tooltip>

      <Tooltip label="Modifica" withArrow>
        <ActionIcon
          variant="transparent"
          size="xs"
          className={styles.overlayButton}
          aria-label={`Modifica il blocco ${label}`}
          onClick={(event) => {
            event.stopPropagation();
            selectNode(id);
          }}
        >
          <IconPencil size={14} />
        </ActionIcon>
      </Tooltip>

      <Tooltip label="Elimina" withArrow>
        <ActionIcon
          variant="transparent"
          size="xs"
          className={styles.overlayButton}
          aria-label={`Elimina il blocco ${label}`}
          onClick={(event) => {
            event.stopPropagation();
            onDelete();
          }}
        >
          <IconTrash size={14} />
        </ActionIcon>
      </Tooltip>

      {onSaveAsPreset && (
        <Tooltip label="Salva come Preset Globale" withArrow>
          <ActionIcon
            variant="transparent"
            size="xs"
            className={styles.overlayButton}
            aria-label={`Salva il blocco ${label} come Preset Globale`}
            onClick={(event) => {
              event.stopPropagation();
              onSaveAsPreset();
            }}
          >
            <IconDeviceFloppy size={14} />
          </ActionIcon>
        </Tooltip>
      )}
    </Group>
  );
}
