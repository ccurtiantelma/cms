/**
 * Chrome visiva del blocco (ADR-92): cornice hover/selezione, toolbar di selezione e badge
 * (nessuna maniglia di resize sul box selezionato). Tutto `position: absolute` fuori dal flusso: mai una modifica al box model.
 */
import type { ComponentProps } from 'react';
import type { BlockLocation, BlockNode } from '../block-tree.utils';
import BlockBadges from './BlockBadges';
import BlockHoverToolbar from './BlockHoverToolbar';
import BlockSelectionChrome, { type BlockChromeTone } from './BlockSelectionChrome';

type ToolbarProps = ComponentProps<typeof BlockHoverToolbar>;

interface BlockChromeLayerProps {
  node: BlockNode;
  location: BlockLocation & { parentType: string | undefined };
  label: string;
  iconName: string | undefined;
  chromeState: 'selected' | 'hover' | null;
  isHovered: boolean;
  isSelected: boolean;
  isGlobalRef: boolean;
  isSection: boolean;
  isContainer: boolean;
  isContainerBlockType: boolean;
  isContainerOrSection: boolean;
  /** Gerarchia cromatica (sezione viola, contenitore arancione, widget verde). */
  tone: BlockChromeTone;
  isTopLevelContainerOrSection: boolean;
  hiddenOnViewportLabel: string | null;
  anchorInside: boolean;
  dragHandle: Pick<ToolbarProps, 'attributes' | 'listeners'>;
  onSelect: () => void;
  onDelete: () => void;
  onSaveAsPreset: () => void;
  onConvertToGlobalSection: () => void;
}

export default function BlockChromeLayer(props: BlockChromeLayerProps): JSX.Element {
  const { node, location, label, isSelected, isContainerOrSection } = props;
  return (
    <>
      {props.chromeState && <BlockSelectionChrome tone={props.tone} state={props.chromeState} />}
      {isSelected && (
        <BlockHoverToolbar
          node={node}
          label={label}
          iconName={props.iconName}
          location={location}
          attributes={props.dragHandle.attributes}
          listeners={props.dragHandle.listeners}
          anchorInside={props.anchorInside}
          isSection={props.isSection}
          isContainer={props.isContainer}
          isContainerOrSection={isContainerOrSection}
          tone={props.tone}
          isTopLevelContainerOrSection={props.isTopLevelContainerOrSection}
          onDelete={props.onDelete}
          onSaveAsPreset={props.onSaveAsPreset}
          onConvertToGlobalSection={props.onConvertToGlobalSection}
        />
      )}
      <BlockBadges
        label={label}
        iconName={props.iconName}
        tone={props.tone}
        isHovered={props.isHovered}
        isSelected={isSelected}
        isGlobalRef={props.isGlobalRef}
        isContainerBlockType={props.isContainerBlockType}
        hiddenOnViewportLabel={props.hiddenOnViewportLabel}
        onSelect={props.onSelect}
      />
    </>
  );
}
