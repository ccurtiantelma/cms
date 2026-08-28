import { useState, type MouseEvent, type ReactNode } from 'react';
import { Menu } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  IconArrowDown,
  IconArrowUp,
  IconClipboard,
  IconCopy,
  IconPalette,
  IconTrash,
} from '@tabler/icons-react';
import { useBlockEditorStore, useNodeById } from '../../../hooks/useBlockEditorStore';
import { findLocation } from './block-tree.utils';

interface ContextMenuPosition {
  x: number;
  y: number;
}

export interface CanvasContextMenuProps {
  children: ReactNode;
}

/** Menu contestuale condiviso dalle superfici visuali dell'editor. */
export default function CanvasContextMenu({ children }: CanvasContextMenuProps): JSX.Element {
  const [position, setPosition] = useState<ContextMenuPosition | null>(null);
  const [targetId, setTargetId] = useState<string | null>(null);
  const selectNode = useBlockEditorStore((state) => state.selectNode);
  const duplicateNodeAction = useBlockEditorStore((state) => state.duplicateNodeAction);
  const copyStyleAction = useBlockEditorStore((state) => state.copyStyleAction);
  const pasteStyleAction = useBlockEditorStore((state) => state.pasteStyleAction);
  const removeBlockAction = useBlockEditorStore((state) => state.removeBlockAction);
  const moveBlockAction = useBlockEditorStore((state) => state.moveBlockAction);
  const node = useNodeById(targetId);
  const tree = useBlockEditorStore((state) => state.tree);
  const styleClipboard = useBlockEditorStore((state) => state.styleClipboard);

  function close(): void {
    setPosition(null);
    setTargetId(null);
  }

  function handleContextMenu(event: MouseEvent<HTMLDivElement>): void {
    event.preventDefault();
    const blockElement = (event.target as HTMLElement).closest<HTMLElement>('[data-block-id]');
    const id = blockElement?.dataset.blockId ?? null;
    if (!id) {
      close();
      return;
    }
    event.stopPropagation();
    selectNode(id);
    setTargetId(id);
    setPosition({ x: event.clientX, y: event.clientY });
  }

  function run(action: () => void): void {
    action();
    close();
  }

  const location = targetId ? findLocation(tree, targetId) : undefined;
  const canMoveUp = Boolean(location && location.index > 0);
  const canMoveDown = Boolean(
    location && location.index < location.siblingsCount - 1,
  );

  return (
    <div onContextMenu={handleContextMenu}>
      <Menu opened={position !== null} onClose={close} withinPortal shadow="md">
        <Menu.Target>
          <div
            aria-hidden="true"
            style={{
              position: 'fixed',
              top: position?.y ?? 0,
              left: position?.x ?? 0,
              width: 1,
              height: 1,
            }}
          />
        </Menu.Target>
        <Menu.Dropdown onContextMenu={(event) => event.preventDefault()}>
          <Menu.Item
          leftSection={<IconCopy size={14} />}
          rightSection={<span>Ctrl+D</span>}
          disabled={!node}
          onClick={() => targetId && run(() => duplicateNodeAction(targetId))}
        >
          Duplica
          </Menu.Item>
          <Menu.Item
          leftSection={<IconPalette size={14} />}
          disabled={!node}
          onClick={() => targetId && run(() => copyStyleAction(targetId))}
        >
          Copia stile
          </Menu.Item>
          <Menu.Item
          leftSection={<IconClipboard size={14} />}
          disabled={!node || !styleClipboard}
          onClick={() => targetId && run(() => pasteStyleAction(targetId))}
        >
          Incolla stile
          </Menu.Item>
          <Menu.Divider />
          <Menu.Item
          leftSection={<IconArrowUp size={14} />}
          disabled={!canMoveUp}
          onClick={() => targetId && run(() => moveBlockAction(targetId, 'up'))}
        >
          Sposta su
          </Menu.Item>
          <Menu.Item
          leftSection={<IconArrowDown size={14} />}
          disabled={!canMoveDown}
          onClick={() => targetId && run(() => moveBlockAction(targetId, 'down'))}
        >
          Sposta giù
          </Menu.Item>
          <Menu.Divider />
          <Menu.Item
          color="red"
          leftSection={<IconTrash size={14} />}
          disabled={!node}
          onClick={() =>
            targetId &&
            run(() => {
              removeBlockAction(targetId);
              notifications.show({ color: 'blue', message: 'Blocco eliminato.' });
            })
          }
        >
          Elimina
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
      {children}
    </div>
  );
}