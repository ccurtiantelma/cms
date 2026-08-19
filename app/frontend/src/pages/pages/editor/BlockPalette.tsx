/**
 * Palette di inserimento blocchi (PLAN-F04-editor-visivo.md T3).
 *
 * Nessun elenco di tipi scritto a mano: le voci sono generate da `BLOCK_TYPES`
 * (`types/blocks.types.ts`, file generato dal registro backend) e filtrate per il
 * contenitore di destinazione — `ROOT_ALLOWED` alla radice, `childrenAllow` del
 * descrittore del genitore altrimenti. Aggiungere un tipo al registro lo fa comparire
 * qui senza toccare questo file; disabilitarlo lo fa sparire.
 */
import { Fragment } from 'react';
import { Button, Menu } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import {
  BLOCK_TYPES,
  type BlockPropDescriptor,
  type BlockTypeDescriptor,
} from '../../../types/blocks.types';
import { allowedChildTypes } from './block-registry.utils';
import { useAuthStore } from '../../../hooks/useAuth';
import { useBlockEditorStore } from '../../../hooks/useBlockEditorStore';

/** Categoria mostrata per i tipi che non ne dichiarano una nel registro. */
const UNCATEGORIZED = 'Altro';

interface BlockPaletteProps {
  /** Contenitore di destinazione: `null` = radice dell'albero. */
  parentId: string | null;
  /** Tipo del contenitore di destinazione; assente alla radice (dove vale `ROOT_ALLOWED`). */
  parentType?: string;
  /**
   * Posizione di inserimento fra i figli del contenitore. Il default aggiunge in coda:
   * `addBlock` (T1) restringe sempre l'indice ai limiti validi della lista.
   */
  index?: number;
  /** Etichetta del pulsante che apre la palette. */
  label?: string;
  /** Dimensione del pulsante Mantine (le palette annidate sono più compatte). */
  size?: 'xs' | 'sm';
  /** Variante del pulsante Mantine. */
  variant?: string;
}

/**
 * Valore iniziale di una prop appena creata. Rispetta il `default` dichiarato dal
 * registro quando c'è; altrimenti il valore neutro del `kind`. Una prop obbligatoria
 * **non** riceve un valore plausibile inventato dal client (SPEC-F02 § 3): nasce vuota
 * e sarà il server, non l'editor, a rifiutare il salvataggio finché non è compilata.
 */
function defaultPropValue(prop: BlockPropDescriptor): unknown {
  if (prop.default !== undefined) return prop.default;
  switch (prop.kind) {
    case 'enum':
      return prop.values?.[0] ?? '';
    case 'boolean':
      return false;
    case 'number':
      return 0;
    default:
      return '';
  }
}

/** Props iniziali di un blocco nuovo, calcolate interamente dal descrittore del registro. */
function defaultPropsFor(descriptor: BlockTypeDescriptor): Record<string, unknown> {
  const props: Record<string, unknown> = {};
  for (const prop of descriptor.props) {
    props[prop.name] = defaultPropValue(prop);
  }
  return props;
}

/**
 * Tipi inseribili nel contenitore indicato. Applica, nell'ordine, i tre filtri che il
 * backend applicherebbe comunque: tipo ammesso dal contenitore, tipo attivo e non
 * deprecato, soglia di ruolo `minRole` (stessa semantica del validatore: livello del
 * ruolo maggiore della soglia = non ammesso).
 */
function allowedDescriptors(
  parentType: string | undefined,
  roleLevel: number | undefined,
): BlockTypeDescriptor[] {
  const allowedTypes = allowedChildTypes(parentType);

  return BLOCK_TYPES.filter(
    (descriptor) =>
      allowedTypes.includes(descriptor.type) &&
      descriptor.enabled &&
      !descriptor.deprecated &&
      (descriptor.minRole === undefined ||
        roleLevel === undefined ||
        roleLevel <= descriptor.minRole),
  );
}

/** Raggruppa i descrittori per `meta.category`, conservando l'ordine del registro. */
function groupByCategory(descriptors: BlockTypeDescriptor[]): [string, BlockTypeDescriptor[]][] {
  const groups = new Map<string, BlockTypeDescriptor[]>();
  for (const descriptor of descriptors) {
    const category = descriptor.meta?.category ?? UNCATEGORIZED;
    const bucket = groups.get(category);
    if (bucket) bucket.push(descriptor);
    else groups.set(category, [descriptor]);
  }
  return [...groups.entries()];
}

/** Menu "Aggiungi blocco" per un contenitore (radice o `section`). */
export default function BlockPalette({
  parentId,
  parentType,
  index = Number.MAX_SAFE_INTEGER,
  label = 'Aggiungi blocco',
  size = 'sm',
  variant = 'light',
}: BlockPaletteProps): JSX.Element | null {
  const addBlockAction = useBlockEditorStore((state) => state.addBlockAction);
  const roleLevel = useAuthStore((state) => state.user?.role);

  const groups = groupByCategory(allowedDescriptors(parentType, roleLevel));
  if (groups.length === 0) return null;

  return (
    <Menu shadow="md" width={240} position="bottom-start" withinPortal>
      <Menu.Target>
        <Button size={size} variant={variant} leftSection={<IconPlus size={14} />}>
          {label}
        </Button>
      </Menu.Target>
      <Menu.Dropdown>
        {groups.map(([category, descriptors]) => (
          <Fragment key={category}>
            <Menu.Label>{category}</Menu.Label>
            {descriptors.map((descriptor) => (
              <Menu.Item
                key={descriptor.type}
                onClick={() =>
                  addBlockAction(parentId, descriptor.type, index, defaultPropsFor(descriptor))
                }
              >
                {descriptor.meta?.label ?? descriptor.type}
              </Menu.Item>
            ))}
          </Fragment>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
}
