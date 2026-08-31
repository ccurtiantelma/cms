/**
 * Sidebar sinistra del Template Editor (Theme Builder) dei Template di Sito, 300px, a due
 * schede Mantine ("Elementi"/"Ispettore") — stessa idea di `EditorSidebar.tsx` dell'editor di
 * Pagina, ma widget propri: qui non c'è una libreria trascinabile generica
 * (`WidgetPalette.tsx`), le categorie sono quelle di un Template di Sito ("Sito/Struttura",
 * "Template/Contenuto", "Layout & Base"), non riusata direttamente per non mescolare i due
 * domini (CLAUDE.md — solo il task corrente, zero refactoring fuori scope).
 *
 * La scheda attiva vive in `useBlockEditorStore.activeSidebarTab` (`'widgets'`/`'properties'`,
 * stessi valori dell'editor di Pagina — nessun nuovo campo nello store, `selectNode` porta già
 * la sidebar su "Ispettore" da sola quando si seleziona un blocco nel canvas, stesso
 * comportamento riusato qui senza modificare `useBlockEditorStore.ts`).
 *
 * **Inserimento widget**: click-to-add, stessa destinazione di `WidgetPalette.tsx`
 * (`clickInsertionTarget`, non esportata da quel file — replicata qui, ~10 righe, per non
 * introdurre una dipendenza incrociata fra i due domini) — dentro il nodo selezionato se è un
 * contenitore, altrimenti in fondo alla radice.
 *
 * **"Area Contenuto Pagina"**: vedi il commento di testa di `ContentPlaceholderBlock.tsx` —
 * un `container` reale con `customElementId: CONTENT_AREA_BLOCK_ID`, offerto solo per
 * `single_page`/`search_results`/`error_404` (elenco letterale della spec del task, non
 * l'intero complemento di `RESOLVABLE_SITE_TEMPLATE_TYPES` in `app/backend/src/common/
 * enums.ts`: quel complemento include anche `loop_item`, qui deliberatamente escluso —
 * "Area Contenuto Pagina" presuppone una singola Pagina da innestare, semantica che un
 * Template per elemento di loop non ha).
 */
import { Stack, Tabs, Text } from '@mantine/core';
import {
  IconAdjustments,
  IconAlignLeft,
  IconBox,
  IconFileDescription,
  IconHandClick,
  IconHeading,
  IconLayoutBoard,
  IconLayoutNavbar,
  IconPhoto,
  IconStack2,
  IconTemplate,
  IconTypography,
  type Icon,
} from '@tabler/icons-react';
import { CONTENT_AREA_BLOCK_ID } from '../../../../components/blocks/blocks/ContentPlaceholderBlock';
import { useAuthStore } from '../../../../hooks/useAuth';
import {
  useActiveSidebarTab,
  useBlockEditorStore,
  useNodeById,
  useSelectedId,
  type EditorSidebarTab,
} from '../../../../hooks/useBlockEditorStore';
import { defaultPropsFor } from '../../../pages/editor/block-registry.utils';
import PropertyInspector from '../../../pages/editor/PropertyInspector';
import { BLOCK_TYPES, type BlockTypeDescriptor } from '../../../../types/blocks.types';
import type { SiteTemplateType } from '../../../../types/site-templates.types';
import styles from './BuilderSidebar.module.css';

/** Tipi di Template con semantica di risoluzione pubblica per cui offrire "Area Contenuto Pagina". */
const CONTENT_AREA_ELIGIBLE_TYPES: ReadonlySet<SiteTemplateType> = new Set([
  'single_page',
  'search_results',
  'error_404',
]);

/** Dove inserire il prossimo blocco: dentro il nodo selezionato se è un contenitore, altrimenti in radice. */
interface InsertionTarget {
  parentId: string | null;
  index: number;
}

/** Stesso criterio di `isContainer` in `EditorBlockWrapper.tsx`/`WidgetPalette.tsx`. */
function isContainerType(type: string | undefined): boolean {
  const descriptor = BLOCK_TYPES.find((entry) => entry.type === type);
  return descriptor?.childrenAllow === '*' || (descriptor?.childrenAllow.length ?? 0) > 0;
}

function findDescriptor(type: string): BlockTypeDescriptor | undefined {
  return BLOCK_TYPES.find((entry) => entry.type === type);
}

interface WidgetEntry {
  key: string;
  label: string;
  icon: Icon;
  insert: (target: InsertionTarget) => void;
}

interface WidgetGroup {
  category: string;
  widgets: WidgetEntry[];
}

/** Firma di `addBlockAction` (`useBlockEditorStore.ts`) — solo per tipizzare le fabbriche di widget sotto, mai ridichiarata come azione a sé. */
type AddBlockAction = (
  parentId: string | null,
  type: string,
  index: number,
  defaultProps: Record<string, unknown>,
) => void;

/** Le tre voci "Sito/Struttura" (F09 — Temi/Risorse): blocchi esistenti con contenuto di default, nessun tipo nuovo. */
function siteStructureWidgets(addBlockAction: AddBlockAction): WidgetEntry[] {
  return [
    {
      key: 'site-logo',
      label: 'Logo Sito',
      icon: IconPhoto,
      insert: (target) => {
        const descriptor = findDescriptor('image');
        if (!descriptor) return;
        addBlockAction(target.parentId, 'image', target.index, defaultPropsFor(descriptor));
      },
    },
    {
      key: 'site-title',
      label: 'Titolo Sito',
      icon: IconTypography,
      insert: (target) => {
        const descriptor = findDescriptor('heading');
        if (!descriptor) return;
        addBlockAction(target.parentId, 'heading', target.index, {
          ...defaultPropsFor(descriptor),
          text: 'Titolo del Sito',
        });
      },
    },
    {
      key: 'page-title',
      label: 'Titolo Pagina',
      icon: IconFileDescription,
      insert: (target) => {
        const descriptor = findDescriptor('heading');
        if (!descriptor) return;
        addBlockAction(target.parentId, 'heading', target.index, {
          ...defaultPropsFor(descriptor),
          text: 'Titolo della Pagina',
        });
      },
    },
    {
      key: 'nav-menu',
      label: 'Menu Navigazione',
      icon: IconLayoutNavbar,
      insert: (target) => {
        const containerDescriptor = findDescriptor('container');
        const richTextDescriptor = findDescriptor('richText');
        if (!containerDescriptor || !richTextDescriptor) return;
        addBlockAction(
          target.parentId,
          'container',
          target.index,
          defaultPropsFor(containerDescriptor),
        );
        // `addBlockAction` seleziona sincronicamente il nodo appena inserito
        // (`useBlockEditorStore.ts`): lo si legge subito per inserirci dentro il figlio di
        // testo indicativo, senza bisogno di un secondo giro di render.
        const containerId = useBlockEditorStore.getState().selectedId;
        if (!containerId) return;
        addBlockAction(containerId, 'richText', 0, {
          ...defaultPropsFor(richTextDescriptor),
          html: '<p>Menu di navigazione</p>',
        });
      },
    },
  ];
}

/** "Area Contenuto Pagina": vedi il commento di testa del file e di `ContentPlaceholderBlock.tsx`. */
function templateContentWidgets(addBlockAction: AddBlockAction): WidgetEntry[] {
  return [
    {
      key: 'content-area',
      label: 'Area Contenuto Pagina',
      icon: IconTemplate,
      insert: (target) => {
        const descriptor = findDescriptor('container');
        if (!descriptor) return;
        addBlockAction(target.parentId, 'container', target.index, {
          ...defaultPropsFor(descriptor),
          customElementId: CONTENT_AREA_BLOCK_ID,
        });
      },
    },
  ];
}

/** Icona per i tipi di blocco generici di "Layout & Base" — stessa mappa di `BlockPalette.tsx` (non esportata da lì). */
const GENERIC_ICON_MAP: Record<string, Icon> = {
  section: IconLayoutBoard,
  container: IconBox,
  heading: IconHeading,
  richText: IconAlignLeft,
  image: IconPhoto,
  button: IconHandClick,
};

/** "Layout & Base": i tipi di blocco generici del registro, assegnabili a qualunque ruolo ammesso. */
function genericBlockWidgets(
  addBlockAction: AddBlockAction,
  roleLevel: number | undefined,
): WidgetEntry[] {
  return BLOCK_TYPES.filter(
    (descriptor) =>
      descriptor.enabled &&
      !descriptor.deprecated &&
      (descriptor.minRole === undefined ||
        roleLevel === undefined ||
        roleLevel <= descriptor.minRole),
  ).map((descriptor) => ({
    key: descriptor.type,
    label: descriptor.meta?.label ?? descriptor.type,
    icon: GENERIC_ICON_MAP[descriptor.type] ?? IconBox,
    insert: (target: InsertionTarget) => {
      addBlockAction(target.parentId, descriptor.type, target.index, defaultPropsFor(descriptor));
    },
  }));
}

export interface BuilderSidebarProps {
  /** Tipo del Template in editing — governa la visibilità del gruppo "Template/Contenuto". */
  templateType: SiteTemplateType;
}

/** Sidebar a schede Elementi/Ispettore del Template Editor. */
export default function BuilderSidebar({ templateType }: BuilderSidebarProps): JSX.Element {
  const activeTab = useActiveSidebarTab();
  const setActiveSidebarTab = useBlockEditorStore((state) => state.setActiveSidebarTab);
  const addBlockAction = useBlockEditorStore((state) => state.addBlockAction);
  const roleLevel = useAuthStore((state) => state.user?.role);
  const selectedId = useSelectedId();
  const selectedNode = useNodeById(selectedId);

  const target: InsertionTarget = isContainerType(selectedNode?.type)
    ? { parentId: selectedNode?.id ?? null, index: Number.MAX_SAFE_INTEGER }
    : { parentId: null, index: Number.MAX_SAFE_INTEGER };

  const groups: WidgetGroup[] = [
    { category: 'Sito/Struttura', widgets: siteStructureWidgets(addBlockAction) },
    ...(CONTENT_AREA_ELIGIBLE_TYPES.has(templateType)
      ? [{ category: 'Template/Contenuto', widgets: templateContentWidgets(addBlockAction) }]
      : []),
    { category: 'Layout & Base', widgets: genericBlockWidgets(addBlockAction, roleLevel) },
  ];

  return (
    <div className={styles.root}>
      <Tabs
        value={activeTab}
        onChange={(value) => value && setActiveSidebarTab(value as EditorSidebarTab)}
        className={styles.tabs}
      >
        <Tabs.List grow>
          <Tabs.Tab value="widgets" leftSection={<IconStack2 size={16} />}>
            Elementi
          </Tabs.Tab>
          <Tabs.Tab value="properties" leftSection={<IconAdjustments size={16} />}>
            Ispettore
          </Tabs.Tab>
        </Tabs.List>
      </Tabs>

      <div className={styles.content}>
        {activeTab === 'widgets' ? (
          <Stack gap="md" className={styles.panel}>
            {groups.map((group) => (
              <Stack key={group.category} gap="xs">
                <Text size="xs" fw={700} tt="uppercase" c="dimmed">
                  {group.category}
                </Text>
                <div className={styles.grid}>
                  {group.widgets.map((widget) => (
                    <button
                      key={widget.key}
                      type="button"
                      className={styles.tile}
                      onClick={() => widget.insert(target)}
                      aria-label={`Inserisci il blocco ${widget.label}`}
                    >
                      <widget.icon size={22} className={styles.tileIcon} />
                      <Text size="xs" className={styles.tileLabel}>
                        {widget.label}
                      </Text>
                    </button>
                  ))}
                </div>
              </Stack>
            ))}
          </Stack>
        ) : (
          <div className={styles.panel}>
            <PropertyInspector />
          </div>
        )}
      </div>
    </div>
  );
}
