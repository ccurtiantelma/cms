/**
 * Chrome dell'editor attorno a un singolo nodo dell'albero (PLAN-F04-editor-visivo.md T4):
 * selezione, riordino fra fratelli, spostamento dentro/fuori da un contenitore, inserimento
 * posizionale di un blocco nuovo sopra o sotto questo, eliminazione, e — sui contenitori —
 * il trigger della palette per aggiungere figli.
 *
 * Ogni azione che cambia la struttura passa dallo store, che la verifica contro il registro
 * dei blocchi prima di applicarla: qui si decide solo se *offrirla*, e con la stessa
 * funzione (`canContainType`) che lo store userà per accettarla — mai con una regola
 * scritta due volte.
 *
 * **Un solo renderer.** Il contenuto del blocco è renderizzato dai componenti di F02 T8,
 * invariati: `BlockRenderer` per le foglie. Per un contenitore la chrome deve inserirsi
 * *fra* il contenitore e i suoi figli (ogni figlio ha la propria toolbar), cosa che il
 * dispatcher ricorsivo non può fare dall'esterno: si riusa quindi lo **stesso** componente
 * di F02 (`CONTAINER_COMPONENTS`) passando i figli già avvolti. Nessun componente di blocco
 * viene riscritto qui: ciò che si vede nell'editor è ciò che pubblica il sito.
 *
 * Sottoscrizioni allo store: mirate per id (nodo, posizione fra i fratelli, id dei figli,
 * "sono io il selezionato?"). Nessun componente legge l'intero `tree` (NFR § Performance —
 * editor).
 */
import { createContext, memo, useContext, useState, type ReactNode } from 'react';
import { ActionIcon, Group, Text, Tooltip, UnstyledButton } from '@mantine/core';
import { useShallow } from 'zustand/react/shallow';
import {
  IconArrowDown,
  IconArrowUp,
  IconIndentDecrease,
  IconIndentIncrease,
  IconTrash,
} from '@tabler/icons-react';
import { BLOCK_TYPES, type BlockTypeDescriptor } from '../../../types/blocks.types';
import { useBlockEditorStore, useNodeById } from '../../../hooks/useBlockEditorStore';
import { findLocation, findNode, type BlockNode } from './block-tree.utils';
import { canContainType } from './block-registry.utils';
import BlockRenderer from '../../../components/blocks/BlockRenderer';
import BlockErrorBoundary from '../../../components/blocks/BlockErrorBoundary';
import Section from '../../../components/blocks/blocks/Section';
import ConfirmModal from '../../../components/ConfirmModal';
import BlockPalette from './BlockPalette';
import styles from './EditorBlockWrapper.module.css';

/**
 * Componenti di F02 che accettano figli. Non è un secondo renderer: è la stessa
 * implementazione che `BlockRenderer` monta per quel tipo, montata qui direttamente
 * perché l'editor deve interporre la propria chrome fra contenitore e figli. Un tipo
 * contenitore nuovo nel registro senza voce qui ricade su `BlockRenderer` (i figli si
 * vedono, senza toolbar per figlio): un difetto visibile, mai un contenuto divergente.
 */
const CONTAINER_COMPONENTS: Record<string, (props: { children: ReactNode }) => JSX.Element> = {
  section: Section,
};

/** Id del nodo respinto dall'ultima validazione server-side, o `null`. */
const InvalidBlockContext = createContext<string | null>(null);

/** Rende disponibile a tutta la chrome il nodo colpevole dell'ultimo `400` di validazione. */
export function InvalidBlockProvider({
  invalidBlockId,
  children,
}: {
  invalidBlockId: string | null;
  children: ReactNode;
}): JSX.Element {
  return (
    <InvalidBlockContext.Provider value={invalidBlockId}>{children}</InvalidBlockContext.Provider>
  );
}

/** Un valore di prop è "non compilato" se assente o stringa vuota. */
function isBlankValue(value: unknown): boolean {
  return (
    value === undefined || value === null || (typeof value === 'string' && value.trim() === '')
  );
}

/**
 * Prop obbligatorie ancora vuote, secondo il registro. Puramente informativo (UX): la
 * validazione autorevole resta il `400` del server, che questa nota non anticipa né
 * sostituisce — non blocca nulla.
 */
function blankRequiredProps(
  descriptor: BlockTypeDescriptor | undefined,
  node: BlockNode,
): string[] {
  if (!descriptor) return [];
  return descriptor.props
    .filter((prop) => prop.required && isBlankValue(node.props[prop.name]))
    .map((prop) => prop.name);
}

interface EditorBlockWrapperProps {
  id: string;
}

/**
 * Avvolge il rendering di un nodo con la chrome di editing. `memo` sull'id: quando un
 * fratello cambia, questo nodo non si ri-renderizza (le sue props non cambiano e le sue
 * sottoscrizioni allo store restituiscono gli stessi riferimenti — structural sharing di
 * `block-tree.utils.ts`).
 */
const EditorBlockWrapper = memo(function EditorBlockWrapper({
  id,
}: EditorBlockWrapperProps): JSX.Element | null {
  const node = useNodeById(id);
  const location = useBlockEditorStore(useShallow((state) => findLocation(state.tree, id)));
  const childIds = useBlockEditorStore(
    useShallow((state) => findNode(state.tree, id)?.children.map((child) => child.id) ?? []),
  );
  const isSelected = useBlockEditorStore((state) => state.selectedId === id);
  const isInvalid = useContext(InvalidBlockContext) === id;

  /**
   * Tipo del contenitore che ospita questo nodo (`undefined` alla radice): serve alle due
   * palette di inserimento posizionale, che devono filtrare i tipi ammessi *accanto* a
   * questo blocco, non dentro di lui.
   */
  const parentType = useBlockEditorStore((state) => {
    const current = findLocation(state.tree, id);
    return current?.parentId ? findNode(state.tree, current.parentId)?.type : undefined;
  });

  /**
   * Destinazione di "sposta dentro": il fratello **precedente**, se è un contenitore che il
   * registro ammette per questo tipo. `null` quando la mossa non è possibile — ed è il
   * registro a dirlo, non un elenco di tipi scritto qui.
   */
  const indentTarget = useBlockEditorStore(
    useShallow((state) => {
      const node = findNode(state.tree, id);
      const current = findLocation(state.tree, id);
      if (!node || !current || current.index === 0) return null;
      const siblings =
        current.parentId === null
          ? state.tree
          : (findNode(state.tree, current.parentId)?.children ?? []);
      const previous = siblings[current.index - 1];
      if (!previous || !canContainType(previous.type, node.type)) return null;
      return { parentId: previous.id, index: previous.children.length };
    }),
  );

  /**
   * Destinazione di "porta fuori": il livello del contenitore, subito dopo di lui. `null`
   * se il nodo è già alla radice o se lì il suo tipo non è ammesso.
   */
  const outdentTarget = useBlockEditorStore(
    useShallow((state) => {
      const node = findNode(state.tree, id);
      const current = findLocation(state.tree, id);
      if (!node || !current || current.parentId === null) return null;
      const parentLocation = findLocation(state.tree, current.parentId);
      if (!parentLocation) return null;
      const grandParentType =
        parentLocation.parentId === null
          ? undefined
          : findNode(state.tree, parentLocation.parentId)?.type;
      if (!canContainType(grandParentType, node.type)) return null;
      return { parentId: parentLocation.parentId, index: parentLocation.index + 1 };
    }),
  );

  const selectNode = useBlockEditorStore((state) => state.selectNode);
  const moveBlockAction = useBlockEditorStore((state) => state.moveBlockAction);
  const moveNodeToAction = useBlockEditorStore((state) => state.moveNodeToAction);
  const removeBlockAction = useBlockEditorStore((state) => state.removeBlockAction);

  const [confirmOpened, setConfirmOpened] = useState(false);

  // Il nodo può sparire dall'albero fra un render e l'altro (eliminato da questa stessa
  // toolbar): non è un errore, semplicemente non c'è più nulla da renderizzare.
  if (!node || !location) return null;

  const descriptor = BLOCK_TYPES.find((entry) => entry.type === node.type);
  const label = descriptor?.meta?.label ?? node.type;
  const ContainerComponent = CONTAINER_COMPONENTS[node.type];
  const isContainer = (descriptor?.childrenAllow.length ?? 0) > 0;
  const blankRequired = blankRequiredProps(descriptor, node);

  const className = [
    styles.wrapper,
    isSelected ? styles.selected : '',
    isInvalid ? styles.invalid : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={className}
      data-block-type={node.type}
      onClick={(event) => {
        // Il click seleziona il nodo più interno: senza stop, la selezione risalirebbe
        // fino alla sezione che lo contiene.
        event.stopPropagation();
        selectNode(id);
      }}
    >
      <Group className={styles.toolbar} gap={4} wrap="nowrap">
        <UnstyledButton
          className={styles.label}
          onClick={(event) => {
            event.stopPropagation();
            selectNode(id);
          }}
        >
          {label}
        </UnstyledButton>

        <Tooltip label="Sposta su" withArrow>
          <ActionIcon
            variant="subtle"
            size="sm"
            aria-label={`Sposta su il blocco ${label}`}
            disabled={location.index === 0}
            onClick={(event) => {
              event.stopPropagation();
              moveBlockAction(id, 'up');
            }}
          >
            <IconArrowUp size={14} />
          </ActionIcon>
        </Tooltip>

        <Tooltip label="Sposta giù" withArrow>
          <ActionIcon
            variant="subtle"
            size="sm"
            aria-label={`Sposta giù il blocco ${label}`}
            disabled={location.index === location.siblingsCount - 1}
            onClick={(event) => {
              event.stopPropagation();
              moveBlockAction(id, 'down');
            }}
          >
            <IconArrowDown size={14} />
          </ActionIcon>
        </Tooltip>

        <Tooltip
          label={indentTarget ? 'Sposta dentro il blocco precedente' : 'Nessun contenitore sopra'}
          withArrow
        >
          <ActionIcon
            variant="subtle"
            size="sm"
            aria-label={`Sposta il blocco ${label} dentro il contenitore precedente`}
            disabled={!indentTarget}
            onClick={(event) => {
              event.stopPropagation();
              if (indentTarget) moveNodeToAction(id, indentTarget.parentId, indentTarget.index);
            }}
          >
            <IconIndentIncrease size={14} />
          </ActionIcon>
        </Tooltip>

        <Tooltip label="Porta fuori dal contenitore" withArrow>
          <ActionIcon
            variant="subtle"
            size="sm"
            aria-label={`Porta il blocco ${label} fuori dal contenitore`}
            disabled={!outdentTarget}
            onClick={(event) => {
              event.stopPropagation();
              if (outdentTarget) moveNodeToAction(id, outdentTarget.parentId, outdentTarget.index);
            }}
          >
            <IconIndentDecrease size={14} />
          </ActionIcon>
        </Tooltip>

        <Tooltip label="Elimina" withArrow>
          <ActionIcon
            variant="subtle"
            color="red"
            size="sm"
            aria-label={`Elimina il blocco ${label}`}
            onClick={(event) => {
              event.stopPropagation();
              setConfirmOpened(true);
            }}
          >
            <IconTrash size={14} />
          </ActionIcon>
        </Tooltip>

        {/*
          Inserimento posizionale: un blocco nuovo si mette dove serve, non solo in fondo
          all'albero. Il contenitore di destinazione è quello che ospita *questo* nodo, e
          l'indice è il suo — quindi le due palette offrono esattamente i tipi ammessi in
          quella posizione, non quelli ammessi dentro questo blocco.
        */}
        <BlockPalette
          parentId={location.parentId}
          parentType={parentType}
          index={location.index}
          label="Inserisci sopra"
          size="xs"
          variant="subtle"
        />
        <BlockPalette
          parentId={location.parentId}
          parentType={parentType}
          index={location.index + 1}
          label="Inserisci sotto"
          size="xs"
          variant="subtle"
        />

        {isContainer && (
          <BlockPalette
            parentId={id}
            parentType={node.type}
            label="Aggiungi dentro"
            size="xs"
            variant="subtle"
          />
        )}
      </Group>

      {blankRequired.length > 0 && (
        <Text className={styles.emptyLeaf} component="p" mb={4}>
          Proprietà obbligatorie non compilate: {blankRequired.join(', ')}.
        </Text>
      )}

      {isContainer && ContainerComponent ? (
        <BlockErrorBoundary>
          <ContainerComponent>
            {childIds.length === 0 ? (
              <div className={styles.emptyContainer}>
                Contenitore vuoto — usa &laquo;Aggiungi dentro&raquo; per inserire un blocco.
              </div>
            ) : (
              <div className={styles.childrenArea}>
                {childIds.map((childId) => (
                  <EditorBlockWrapper key={childId} id={childId} />
                ))}
              </div>
            )}
          </ContainerComponent>
        </BlockErrorBoundary>
      ) : (
        <BlockRenderer node={node} />
      )}

      {confirmOpened && (
        <ConfirmModal
          opened
          onClose={() => setConfirmOpened(false)}
          onConfirm={() => {
            removeBlockAction(id);
            setConfirmOpened(false);
          }}
          title={`Elimina blocco "${label}"`}
          confirmLabel="Elimina"
          confirmColor="red"
        >
          {childIds.length > 0
            ? `Il blocco e i suoi ${childIds.length} blocchi figli vengono rimossi dalla bozza. L'eliminazione diventa definitiva al salvataggio.`
            : "Il blocco viene rimosso dalla bozza. L'eliminazione diventa definitiva al salvataggio."}
        </ConfirmModal>
      )}
    </div>
  );
});

export default EditorBlockWrapper;
