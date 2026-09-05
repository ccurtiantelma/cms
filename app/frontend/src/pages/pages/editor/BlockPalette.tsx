/**
 * Palette di inserimento blocchi (PLAN-F04-editor-visivo.md T3).
 *
 * Nessun elenco di tipi scritto a mano: le voci sono generate da `BLOCK_TYPES`
 * (`types/blocks.types.ts`, file generato dal registro backend) e filtrate per il
 * contenitore di destinazione — `ROOT_ALLOWED` alla radice, `childrenAllow` del
 * descrittore del genitore altrimenti. Aggiungere un tipo al registro lo fa comparire
 * qui senza toccare questo file; disabilitarlo lo fa sparire.
 */
import { Fragment, useState } from 'react';
import { ActionIcon, Button, Menu, Tooltip } from '@mantine/core';
import {
  IconAlignLeft,
  IconBox,
  IconForms,
  IconHandClick,
  IconHeading,
  IconInputSearch,
  IconLayoutBoard,
  IconPhoto,
  IconPlus,
  IconSend,
  type Icon,
} from '@tabler/icons-react';
import { BLOCK_TYPES, type BlockTypeDescriptor } from '../../../types/blocks.types';
import { allowedChildTypes, defaultPropsFor } from './block-registry.utils';
import { useAuthStore } from '../../../hooks/useAuth';
import { useBlockEditorStore } from '../../../hooks/useBlockEditorStore';
import SectionStructureModal from './SectionStructureModal';

// Re-esportata per compatibilità con gli import esistenti (`WidgetPalette.tsx`,
// `EditorBlockWrapper.tsx`, `FullScreenEditorLayout.tsx`): la funzione vive in
// `block-registry.utils.ts` (modulo neutro, vedi commento lì) da quando anche
// `SectionStructureModal.tsx` ne ha bisogno senza importare da qui (ciclo, ADR-33 § 7).
export { defaultPropsFor };

/** Categoria mostrata per i tipi che non ne dichiarano una nel registro. */
const UNCATEGORIZED = 'Altro';

/**
 * Mappa esplicita `meta.icon` (registro backend, ADR-30 § 1) → componente Tabler. Nessun
 * import dinamico/stringa-to-component: un nome fuori da questa mappa (tipo nuovo senza
 * voce qui, o refuso nel registro) ricade sul fallback generico, mai su un crash a runtime.
 */
const ICON_MAP: Record<string, Icon> = {
  'layout-board': IconLayoutBoard,
  heading: IconHeading,
  'align-left': IconAlignLeft,
  photo: IconPhoto,
  'hand-click': IconHandClick,
  forms: IconForms,
  'input-search': IconInputSearch,
  send: IconSend,
};

/** Icona generica per un `meta.icon` assente o non presente in {@link ICON_MAP}. */
const FALLBACK_ICON: Icon = IconBox;

/** Componente icona per il `meta.icon` di un tipo di blocco, con fallback generico. */
export function blockIcon(iconName: string | undefined): Icon {
  if (!iconName) return FALLBACK_ICON;
  return ICON_MAP[iconName] ?? FALLBACK_ICON;
}

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
  /**
   * Dimensione del pulsante Mantine (le palette annidate sono più compatte). Accetta anche
   * un numero di px (RE-2, restyle chrome Elementor Pro): la maniglia contestuale di
   * `BlockHoverOverlay.tsx` la usa per garantire l'altezza minima di 28px richiesta dal
   * task su ogni pulsante della toolbar, coerente con gli `ActionIcon` dei controlli vicini
   * (`size={28}`) — stesso prop Mantine, mai una seconda scala di taglie inventata qui.
   */
  size?: 'xs' | 'sm' | number;
  /** Variante del pulsante Mantine. */
  variant?: string;
  /**
   * Solo icona (`+`), niente etichetta testuale visibile: `label` resta il testo del
   * `Tooltip` e dell'`aria-label`, non sparisce dall'accessibilità. Usato dalla chrome
   * per-nodo di `EditorBlockWrapper.tsx` (CLAUDE.md/T-canvas-cleanup: nessuna etichetta
   * fissa nel canvas). Il pulsante "Aggiungi blocco in fondo" di `EditorCanvas.tsx`, che
   * non è chrome per-nodo ma un'azione di pagina, resta testuale — non passa questa prop.
   */
  iconOnly?: boolean;
  /**
   * Icona del pulsante trigger in modalità `iconOnly` (default `IconPlus`). Restyle
   * Elementor Pro di `CanvasAddSectionZone.tsx`: quel box riusa questo stesso menu per il
   * terzo pulsante ("Aggiungi widget", icona `IconSparkles`) invece di duplicare la UI di
   * selezione tipo — nessuna copia, stesso principio già in uso per `SectionStructureModal`.
   */
  triggerIcon?: Icon;
  /**
   * Classe CSS Module opzionale applicata al pulsante trigger in modalità `iconOnly`, per
   * personalizzarne l'aspetto (colore di sfondo) dal chiamante senza toccare lo stile di
   * default usato dalla chrome per-nodo.
   */
  triggerClassName?: string;
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
  iconOnly = false,
  triggerIcon: TriggerIcon = IconPlus,
  triggerClassName,
}: BlockPaletteProps): JSX.Element | null {
  const addBlockAction = useBlockEditorStore((state) => state.addBlockAction);
  const roleLevel = useAuthStore((state) => state.user?.role);
  // ADR-33 § 7: la voce "Sezione" apre lo stesso selettore di struttura del pulsante "+"
  // del canvas, invece di creare direttamente una Section con i default puri del
  // registro — scope minimo, solo `type === 'section'` intercettato, il resto della
  // palette resta generico (guidato da `BLOCK_TYPES`, mai per tipo).
  const [sectionModalOpened, setSectionModalOpened] = useState(false);

  const groups = groupByCategory(allowedDescriptors(parentType, roleLevel));
  if (groups.length === 0) return null;

  return (
    <>
      <Menu shadow="md" width={240} position="bottom-start" withinPortal zIndex={1100}>
        <Menu.Target>
          {iconOnly ? (
            <Tooltip label={label} withArrow>
              <ActionIcon
                size={size}
                variant={variant}
                className={triggerClassName}
                aria-label={label}
              >
                <TriggerIcon size={14} />
              </ActionIcon>
            </Tooltip>
          ) : (
            // `Button.size` non accetta un numero di px (a differenza di `ActionIcon.size`
            // sopra, RE-2): la variante testuale non è mai usata dalla maniglia contestuale
            // a 28px (solo `iconOnly`, vedi `BlockHoverOverlay.tsx`), quindi qui basta un
            // fallback alla taglia Mantine più vicina — nessun blocco reale passa oggi un
            // `size` numerico insieme a `iconOnly={false}`.
            <Button
              size={typeof size === 'number' ? 'sm' : size}
              variant={variant}
              leftSection={<IconPlus size={14} />}
            >
              {label}
            </Button>
          )}
        </Menu.Target>
        <Menu.Dropdown>
          {groups.map(([category, descriptors]) => (
            <Fragment key={category}>
              <Menu.Label>{category}</Menu.Label>
              {descriptors.map((descriptor) => {
                const DescriptorIcon = blockIcon(descriptor.meta?.icon);
                return (
                  <Menu.Item
                    key={descriptor.type}
                    leftSection={<DescriptorIcon size={14} />}
                    onClick={() =>
                      descriptor.type === 'section'
                        ? setSectionModalOpened(true)
                        : addBlockAction(
                            parentId,
                            descriptor.type,
                            index,
                            defaultPropsFor(descriptor),
                          )
                    }
                  >
                    {descriptor.meta?.label ?? descriptor.type}
                  </Menu.Item>
                );
              })}
            </Fragment>
          ))}
        </Menu.Dropdown>
      </Menu>

      <SectionStructureModal
        opened={sectionModalOpened}
        onClose={() => setSectionModalOpened(false)}
        parentId={parentId}
        index={index}
      />
    </>
  );
}
