import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { Menu } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  IconArrowDown,
  IconArrowUp,
  IconClipboard,
  IconCopy,
  IconPalette,
  IconRowInsertBottom,
  IconRowInsertTop,
  IconTrash,
} from '@tabler/icons-react';
import { useBlockEditorStore, useNodeById } from '../../../hooks/useBlockEditorStore';
import { findLocation, findNode } from './block-tree.utils';
import BlockPalette from './BlockPalette';

interface ContextMenuPosition {
  x: number;
  y: number;
}

/**
 * Richiesta di apertura del flusso "Inserisci Prima"/"Inserisci Dopo" (PLAN-F04e): il
 * tipo di blocco da inserire resta una scelta dell'utente (stesso principio del trigger
 * "+" di `EditorBlockWrapper.tsx`), quindi non si crea un blocco direttamente da qui — si
 * riapre lo stesso `BlockPalette` generico già usato altrove, mai una seconda logica di
 * inserimento scritta apposta per il menu contestuale. Mantine 7.17 (versione installata,
 * verificata in `node_modules`) non espone `Menu.Sub`/submenu nativi: nidificare
 * `BlockPalette` (che monta a sua volta un proprio `Menu`) dentro un `Menu.Item` di questo
 * menu produrrebbe due `Menu` annidati che si contendono lo stesso click — si segue quindi
 * l'alternativa esplicitamente prevista dal task: il menu contestuale si chiude e riapre
 * subito lo stesso `BlockPalette`, ancorato alle stesse coordinate del click destro.
 * `key` incrementale: forza un remount di `BlockPalette` (e del suo `Menu` interno,
 * uncontrolled) ad ogni richiesta, anche quando target/posizione coincidono con la
 * precedente — altrimenti un secondo "Inserisci Prima" sullo stesso nodo non
 * riaprirebbe un `Menu` già chiuso al suo stato uncontrolled iniziale.
 */
interface InsertFlowRequest {
  key: number;
  x: number;
  y: number;
  parentId: string | null;
  parentType?: string;
  index: number;
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

  /** Richiesta corrente di "Inserisci Prima/Dopo" (vedi commento di testa di {@link InsertFlowRequest}). */
  const [insertFlow, setInsertFlow] = useState<InsertFlowRequest | null>(null);
  const insertFlowIdRef = useRef(0);
  /** Contenitore del trigger invisibile di `BlockPalette` (click simulato dall'effetto sotto). */
  const insertFlowAnchorRef = useRef<HTMLDivElement | null>(null);

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
  const canMoveDown = Boolean(location && location.index < location.siblingsCount - 1);

  /**
   * "Inserisci Prima"/"Inserisci Dopo": chiude questo menu contestuale e prepara
   * l'apertura dello stesso `BlockPalette` generico ancorato allo stesso punto del
   * click destro — `offset` è `0` per "prima" (stesso indice del bersaglio) e `1` per
   * "dopo" (subito dopo, `location.index + 1`). `parentType` non è quello del bersaglio
   * (`targetId`), ma quello del **suo** genitore (`findNode(tree, location.parentId)`):
   * il nuovo blocco entra nello stesso contenitore del bersaglio, non dentro di esso.
   * `undefined` alla radice, dove `BlockPalette` usa già `ROOT_ALLOWED` (vedi il suo
   * commento di testa).
   */
  function openInsertFlow(offset: 0 | 1): void {
    if (!targetId || !location || !position) return;
    const parentType = location.parentId
      ? findNode(tree, location.parentId)?.type
      : undefined;
    insertFlowIdRef.current += 1;
    const anchor = position;
    setInsertFlow({
      key: insertFlowIdRef.current,
      x: anchor.x,
      y: anchor.y,
      parentId: location.parentId,
      parentType,
      index: location.index + offset,
    });
    close();
  }

  // Apre subito il `BlockPalette` appena la richiesta è pronta (nuovo `key`, quindi anche
  // se target/posizione coincidono con la precedente): simula un click reale sul suo
  // trigger, mai un secondo canale di apertura — stesso `Menu` uncontrolled di ogni altro
  // uso di `BlockPalette` in questo codebase, aperto come lo aprirebbe l'utente.
  useEffect(() => {
    if (!insertFlow) return;
    insertFlowAnchorRef.current?.querySelector('button')?.click();
  }, [insertFlow]);

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
          {/*
            "Inserisci Prima"/"Inserisci Dopo" (PLAN-F04e): azioni di inserimento, vicine a
            Duplica — non di riordino/eliminazione, vedi le voci più sotto. Il tipo del
            blocco resta una scelta dell'utente (`openInsertFlow` sopra), mai deciso qui.
          */}
          <Menu.Item
          leftSection={<IconRowInsertTop size={14} />}
          disabled={!node}
          onClick={() => openInsertFlow(0)}
        >
          Inserisci Prima
          </Menu.Item>
          <Menu.Item
          leftSection={<IconRowInsertBottom size={14} />}
          disabled={!node}
          onClick={() => openInsertFlow(1)}
        >
          Inserisci Dopo
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

      {/*
        Bersaglio invisibile di "Inserisci Prima/Dopo" (vedi commento di testa di
        {@link InsertFlowRequest}): stesso punto 1x1 del `Menu.Target` del menu contestuale
        sopra, riusato per ancorare `BlockPalette` allo stesso punto del click destro.
        L'effetto sopra simula un click reale sul suo bottone appena `insertFlow` cambia —
        nessuna apertura "a freddo", lo stesso gesto che l'utente farebbe cliccando "+" a
        mano. `key={insertFlow.key}`: forza il remount ad ogni richiesta (vedi commento del
        tipo).
      */}
      {insertFlow && (
        <div
          ref={insertFlowAnchorRef}
          aria-hidden="true"
          style={{
            position: 'fixed',
            top: insertFlow.y,
            left: insertFlow.x,
            width: 1,
            height: 1,
          }}
        >
          <BlockPalette
            key={insertFlow.key}
            parentId={insertFlow.parentId}
            parentType={insertFlow.parentType}
            index={insertFlow.index}
            label="Inserisci blocco"
            size="xs"
            variant="transparent"
            iconOnly
          />
        </div>
      )}

      {children}
    </div>
  );
}