/**
 * Overlay hover/selezione **unico** per qualunque tipo di blocco (Sezioni, Colonne,
 * widget foglia): quattro controlli sempre nello stesso punto — trascina, duplica,
 * elimina, modifica — al posto delle tre varianti di chrome mutuamente esclusive per
 * categoria che questo file sostituisce in `EditorBlockWrapper.tsx`. Reversal
 * architetturale esplicito, richiesto e autorizzato dal proprietario del progetto (vedi
 * il task che introduce questo componente): supera la decisione precedente, non la
 * ignora — quella decisione resta leggibile nella history di `EditorBlockWrapper.tsx`.
 */
import { ActionIcon, Group, Tooltip } from '@mantine/core';
import type { DraggableAttributes } from '@dnd-kit/core';
import type { DraggableSyntheticListeners } from '@dnd-kit/core';
import {
  IconCopy,
  IconCornerLeftUp,
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
}

/** Overlay hover/selezione con i cinque controlli comuni a ogni tipo di blocco (trascina/genitore/duplica/modifica/elimina). */
export default function BlockHoverOverlay({
  id,
  label,
  parentId,
  attributes,
  listeners,
  onDelete,
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
    </Group>
  );
}
