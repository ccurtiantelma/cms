/**
 * Toolbar contestuale ancorata in alto a sinistra del blocco selezionato (ADR-92): etichetta
 * del tipo, maniglia di drag, seleziona genitore, duplica, modifica, elimina, "+" sopra/sotto
 * e i controlli opzionali (Salva Preset, Converti in Sezione Globale, Esporta JSON).
 *
 * Questo modulo decide **quali** controlli offrire per il nodo (in base a tipo e posizione);
 * il rendering dei pulsanti resta di `components/BlockHoverOverlay.tsx`, che continua a
 * essere il bersaglio dei test e degli helper Playwright (`aria-label` invariati). Posizionata
 * in `position: absolute` sopra il bordo del blocco: non entra nel flusso del contenuto.
 */
import type { DraggableAttributes, DraggableSyntheticListeners } from '@dnd-kit/core';
import type { BlockLocation, BlockNode } from '../block-tree.utils';
import type { BlockChromeTone } from './BlockSelectionChrome';
import BlockHoverOverlay from '../components/BlockHoverOverlay';
import { exportSubtreeToJson } from '../utils/template-io.utils';

interface BlockHoverToolbarProps {
  node: BlockNode;
  label: string;
  iconName?: string;
  location: BlockLocation & { parentType: string | undefined };
  attributes: DraggableAttributes;
  listeners: DraggableSyntheticListeners;
  /** `true` quando il bordo superiore è troppo vicino al confine scrollabile: la barra si riancora dentro. */
  anchorInside: boolean;
  isSection: boolean;
  isContainer: boolean;
  isContainerOrSection: boolean;
  tone: BlockChromeTone;
  isTopLevelContainerOrSection: boolean;
  onDelete: () => void;
  onSaveAsPreset: () => void;
  onConvertToGlobalSection: () => void;
}

export default function BlockHoverToolbar({
  node,
  label,
  iconName,
  location,
  attributes,
  listeners,
  anchorInside,
  isSection,
  isContainer,
  tone,
  isTopLevelContainerOrSection,
  onDelete,
  onSaveAsPreset,
  onConvertToGlobalSection,
}: BlockHoverToolbarProps): JSX.Element {
  return (
    <BlockHoverOverlay
      id={node.id}
      label={label}
      iconName={iconName}
      parentId={location.parentId}
      // "+" sopra: fratello **prima** del nodo (stesso parent, indice del nodo).
      addBeforeIndex={location.index}
      addBeforeParentType={location.parentType}
      // "+" sotto: fratello **dopo** il nodo (stesso parent, indice successivo).
      addAfterIndex={location.index + 1}
      addAfterParentType={location.parentType}
      attributes={attributes}
      listeners={listeners}
      anchorInside={anchorInside}
      onDelete={onDelete}
      // "Salva come Preset Globale" (F14-01): solo su `section`.
      onSaveAsPreset={isSection ? onSaveAsPreset : undefined}
      // "Converti in Sezione Globale" (ADR-55): solo su contenitore/`section` di primo livello.
      onConvertToGlobalSection={isTopLevelContainerOrSection ? onConvertToGlobalSection : undefined}
      // Esporta il sottoalbero (ADR-56): solo su un contenitore.
      onExportJson={isContainer ? () => exportSubtreeToJson(node) : undefined}
      // Tooltip della maniglia drag: "Modifica Contenitore" solo su `section`.
      dragTooltipLabel={isSection ? 'Modifica Contenitore' : undefined}
      tone={tone}
    />
  );
}
