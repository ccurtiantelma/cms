/**
 * Prima scheda "Layout" dell'ispettore per `container`/`section` (T-container-layout-tab,
 * ADR-82-container-unificato-grid-flex.md: `container` `v: 2` è il contenitore attivo,
 * `section` `v: 1` è deprecato ma può ancora comparire in contenuti vecchi — stessa UI per
 * entrambi, letta da `node.type`). Sostituisce `ContentTab.tsx` per questi due tipi
 * (`PropertyInspector.tsx` decide il monte, mai qui): due Accordion, "Contenitore" (layout
 * Flex/Grid, larghezza contenuto/massima, altezza minima) ed "Elementi" (contorno griglia,
 * colonne, righe, spaziature, flusso automatico, giustifica/allinea elementi — visibile solo a
 * `layout.display === 'grid'`, tutti i campi nello stesso ordine dello screenshot Elementor Pro).
 *
 * Ogni scrittura passa da `setAndCommit` (`PropertyForm.commit`, mai uno stato locale di
 * valore): `draft` resta l'unica fonte di verità, stesso principio di `ContentTab`/`StyleTab`.
 * Il solo stato locale di questo file è lo stato UI del lucchetto gap (`gapLinked`, non un
 * valore di dominio — stesso principio del lucchetto Margin/Padding di
 * `VisualBoxModelInspector.tsx`).
 *
 * Riusa `PropField` (unico punto di dispaccio per `kind`) per `contentWidth` (`kind: 'enum'`)
 * e per `boxedWidth`/`minHeight` (`kind: 'unitValue'`, stesso `case` di `PropField.tsx` righe
 * ~516-583) — nessuna riscrittura di quei due rami. Il campo "Layout del contenitore"
 * (`layout.display`) e il gruppo "Elementi" (`layout.gridTemplateColumns`/`gap`) restano
 * invece qui: leggono/scrivono `layout` con lo stesso pattern di `LayoutField.tsx`
 * (`readStatefulResponsiveValue`/`buildStatefulResponsivePropPatch`, `state: 'normal'`),
 * senza montare l'intero `LayoutField` (che espone anche i controlli Flex, fuori scope di
 * questo redesign: qui c'è solo il selettore Griglia/Flex più i campi Grid). I controlli
 * dedicati (Colonne/Righe con unità, gruppi di icone) vivono in `ContainerGridControls.tsx`.
 */
import { useState } from 'react';
import {
  ActionIcon,
  Accordion,
  Group,
  NumberInput,
  SegmentedControl,
  Select,
  Stack,
  Switch,
  Text,
  Tooltip,
} from '@mantine/core';
import {
  IconArrowBarBoth,
  IconLayoutAlignBottom,
  IconLayoutAlignCenter,
  IconLayoutAlignLeft,
  IconLayoutAlignMiddle,
  IconLayoutAlignRight,
  IconLayoutAlignTop,
  IconLayoutDistributeHorizontal,
  IconLayoutGrid,
  IconLink,
  IconLinkOff,
} from '@tabler/icons-react';
import type { BlockPropDescriptor, BlockTypeDescriptor } from '../../../../types/blocks.types';
import type { EditorViewport } from '../../../../hooks/useBlockEditorStore';
import { useActiveBreakpoint, useBlockEditorStore } from '../../../../hooks/useBlockEditorStore';
import type { BlockNode } from '../block-tree.utils';
import PropField from './PropField';
import {
  FieldLabel,
  GridTrackField,
  IconChoiceField,
  type IconChoiceOption,
} from './ContainerGridControls';
import {
  breakpointKey,
  buildStatefulResponsivePropPatch,
  readStatefulResponsiveValue,
  type PropsMeta,
} from './inspector.utils';
import styles from './inspector.module.css';

export interface ContainerLayoutTabProps {
  node: BlockNode;
  descriptor: BlockTypeDescriptor;
  draft: Record<string, unknown>;
  propsMeta: PropsMeta;
  activeViewport: EditorViewport;
  setLocal: (name: string, value: unknown) => void;
  commit: (name: string, value: unknown) => void;
  setAndCommit: (name: string, value: unknown) => void;
  // Fanno parte di `tabProps` (`PropertyInspector.tsx`) ma non servono a questa scheda —
  // accettate solo perché `PropertyForm` spreada `{...tabProps}` su ogni scheda indistintamente
  // (stesso principio di `ContentTab.tsx`/`StyleTab.tsx`, che ignorano allo stesso modo le
  // prop che non usano).
  onOpenMediaPicker?: (propName: string) => void;
  onOpenCropper?: (propName: string) => void;
  nodeType?: string;
  onSavePreset?: (name: string) => void;
  onConvertToGlobalSection?: (title: string) => Promise<boolean>;
}

const GAP_UNITS = ['px', '%', 'em', 'rem'] as const;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function findProp(descriptor: BlockTypeDescriptor, name: string): BlockPropDescriptor | undefined {
  return descriptor.props.find((prop) => prop.name === name);
}

interface UnitValueLike {
  value: number;
  unit: string;
}

interface LayoutValueLike {
  display?: 'flex' | 'grid';
  gap?: { x: UnitValueLike; y: UnitValueLike };
  gridTemplateColumns?: unknown;
  gridTemplateRows?: unknown;
  autoFlow?: string;
  justifyItems?: string;
  alignItems?: string;
}

// Vocabolario Grid (`LAYOUT_GRID_ALIGN_VALUES`/`LAYOUT_AUTO_FLOW_VALUES`, validatore backend).
// Icone e ordine come lo screenshot Elementor Pro: inizio, centro, fine, stretch.
const JUSTIFY_ITEMS_OPTIONS: readonly IconChoiceOption[] = [
  { value: 'start', label: 'Inizio', icon: <IconLayoutAlignLeft size={16} aria-hidden /> },
  { value: 'center', label: 'Centro', icon: <IconLayoutAlignCenter size={16} aria-hidden /> },
  { value: 'end', label: 'Fine', icon: <IconLayoutAlignRight size={16} aria-hidden /> },
  { value: 'stretch', label: 'Estendi', icon: <IconArrowBarBoth size={16} aria-hidden /> },
];

const ALIGN_ITEMS_OPTIONS: readonly IconChoiceOption[] = [
  { value: 'start', label: 'Inizio', icon: <IconLayoutAlignTop size={16} aria-hidden /> },
  { value: 'center', label: 'Centro', icon: <IconLayoutAlignMiddle size={16} aria-hidden /> },
  { value: 'end', label: 'Fine', icon: <IconLayoutAlignBottom size={16} aria-hidden /> },
  {
    value: 'stretch',
    label: 'Estendi',
    icon: <IconArrowBarBoth size={16} aria-hidden style={{ transform: 'rotate(90deg)' }} />,
  },
];

const AUTO_FLOW_OPTIONS = [
  { value: 'row', label: 'Riga' },
  { value: 'column', label: 'Colonna' },
] as const;

// Default Elementor Pro per una griglia appena creata: 2 colonne, 1 riga.
const DEFAULT_GRID_COLUMNS = 2;
const DEFAULT_GRID_ROWS = 1;

export default function ContainerLayoutTab({
  node,
  descriptor,
  draft,
  propsMeta,
  activeViewport,
  setLocal,
  commit,
  setAndCommit,
}: ContainerLayoutTabProps): JSX.Element {
  const activeBreakpoint = useActiveBreakpoint();
  // Lucchetto Colonna/Riga (Sezione "Elementi" § 3): stato UI locale, non un valore di
  // dominio — stesso principio del lucchetto Margin/Padding di `VisualBoxModelInspector.tsx`.
  const [gapLinked, setGapLinked] = useState(true);

  const isGridOutlineVisible = useBlockEditorStore((state) => state.gridOutlineNodeId === node.id);
  const setGridOutlineVisible = useBlockEditorStore((state) => state.setGridOutlineVisible);

  const layoutProp = findProp(descriptor, 'layout');
  const contentWidthProp = findProp(descriptor, 'contentWidth');
  const boxedWidthProp = findProp(descriptor, 'boxedWidth');
  const minHeightProp = findProp(descriptor, 'minHeight');

  const layoutRaw = draft.layout;
  const layoutCurrent: LayoutValueLike = layoutProp
    ? (() => {
        const value = readStatefulResponsiveValue(
          layoutProp,
          layoutRaw,
          'normal',
          activeBreakpoint,
        );
        return isPlainObject(value) ? (value as LayoutValueLike) : {};
      })()
    : {};
  const display = layoutCurrent.display === 'grid' ? 'grid' : 'flex';

  function writeLayout(patch: Partial<LayoutValueLike>): void {
    if (!layoutProp) return;
    const next = { ...layoutCurrent, ...patch };
    setAndCommit(
      'layout',
      buildStatefulResponsivePropPatch(layoutProp, layoutRaw, 'normal', activeBreakpoint, next),
    );
  }

  const gapUnit = layoutCurrent.gap?.x.unit ?? layoutCurrent.gap?.y.unit ?? GAP_UNITS[0];
  const gapX = layoutCurrent.gap?.x.value ?? 0;
  const gapY = layoutCurrent.gap?.y.value ?? 0;

  // `autoFlow` ammette anche le varianti `dense` (validatore backend): la UI espone solo
  // Riga/Colonna come Elementor, ma cambiare direzione non deve perdere un `dense` già scritto.
  const autoFlowRaw = layoutCurrent.autoFlow ?? 'row';
  const autoFlowDense = autoFlowRaw.endsWith('dense');
  const autoFlowDirection = autoFlowRaw.startsWith('column') ? 'column' : 'row';

  // Passando a Griglia scrive subito le tracce predefinite (2 colonne, 1 riga) se mancano:
  // senza, i controlli mostrerebbero 2 colonne ma il CSS emesso avrebbe una sola colonna implicita.
  function handleDisplayChange(next: 'flex' | 'grid'): void {
    if (next !== 'grid') {
      writeLayout({ display: next });
      return;
    }
    writeLayout({
      display: 'grid',
      gridTemplateColumns: layoutCurrent.gridTemplateColumns ?? {
        preset: 'repeat',
        count: DEFAULT_GRID_COLUMNS,
      },
      gridTemplateRows: layoutCurrent.gridTemplateRows ?? {
        preset: 'repeat',
        count: DEFAULT_GRID_ROWS,
      },
    });
  }

  function writeGap(nextX: number, nextY: number, nextUnit: string): void {
    writeLayout({
      gap: { x: { value: nextX, unit: nextUnit }, y: { value: nextY, unit: nextUnit } },
    });
  }

  function handleGapXChange(next: number | string): void {
    const nextX = typeof next === 'number' ? next : Number(next) || 0;
    writeGap(nextX, gapLinked ? nextX : gapY, gapUnit);
  }

  function handleGapYChange(next: number | string): void {
    const nextY = typeof next === 'number' ? next : Number(next) || 0;
    writeGap(gapLinked ? nextY : gapX, nextY, gapUnit);
  }

  // `boxedWidth` non è `responsive` nello schema attuale (`container.block.ts`): nessun
  // pallino di override qui, coerente col registro — un indicatore breakpoint non avrebbe
  // senso su un valore che non ne porta. Default visivo 100 se non ancora impostato.
  const boxedWidthValue = isPlainObject(draft.boxedWidth)
    ? draft.boxedWidth
    : { value: 100, unit: boxedWidthProp?.units?.[0] ?? 'px' };

  const activeBreakpoint3Way = breakpointKey(activeViewport);

  return (
    <Accordion multiple defaultValue={['Contenitore', 'Elementi']} variant="separated">
      <Accordion.Item value="Contenitore">
        <Accordion.Control>Contenitore</Accordion.Control>
        <Accordion.Panel>
          <Stack gap="sm" className={styles.fieldList}>
            <div>
              <Text size="sm" fw={500} mb={4}>
                Disposizione
              </Text>
              <SegmentedControl
                aria-label="Disposizione"
                classNames={{
                  root: styles.segmentedRoot,
                  indicator: styles.segmentedIndicator,
                  input: styles.segmentedInput,
                  label: styles.segmentedLabel,
                }}
                data={[
                  {
                    value: 'flex',
                    label: (
                      <Group gap={6} wrap="nowrap" justify="center">
                        <IconLayoutDistributeHorizontal size={16} aria-hidden />
                        <span>Flex</span>
                      </Group>
                    ),
                  },
                  {
                    value: 'grid',
                    label: (
                      <Group gap={6} wrap="nowrap" justify="center">
                        <IconLayoutGrid size={16} aria-hidden />
                        <span>Griglia</span>
                      </Group>
                    ),
                  },
                ]}
                value={display}
                onChange={(next) => handleDisplayChange(next as 'flex' | 'grid')}
                fullWidth
              />
            </div>

            {contentWidthProp && (
              <PropField
                prop={contentWidthProp}
                value={draft.contentWidth}
                propsMeta={propsMeta}
                activeViewport={activeViewport}
                activeBreakpoint={activeBreakpoint3Way}
                onLocal={(next) => setLocal('contentWidth', next)}
                onCommit={(next) => commit('contentWidth', next)}
                onSetAndCommit={(next) => setAndCommit('contentWidth', next)}
                onOpenMediaPicker={() => {}}
                onOpenCropper={() => {}}
              />
            )}

            {boxedWidthProp && (
              <PropField
                prop={boxedWidthProp}
                value={boxedWidthValue}
                propsMeta={propsMeta}
                activeViewport={activeViewport}
                activeBreakpoint={activeBreakpoint3Way}
                onLocal={(next) => setLocal('boxedWidth', next)}
                onCommit={(next) => commit('boxedWidth', next)}
                onSetAndCommit={(next) => setAndCommit('boxedWidth', next)}
                onOpenMediaPicker={() => {}}
                onOpenCropper={() => {}}
              />
            )}

            {minHeightProp && (
              <div>
                <PropField
                  prop={minHeightProp}
                  value={draft.minHeight}
                  propsMeta={propsMeta}
                  activeViewport={activeViewport}
                  activeBreakpoint={activeBreakpoint3Way}
                  onLocal={(next) => setLocal('minHeight', next)}
                  onCommit={(next) => commit('minHeight', next)}
                  onSetAndCommit={(next) => setAndCommit('minHeight', next)}
                  onOpenMediaPicker={() => {}}
                  onOpenCropper={() => {}}
                />
                <Text size="xs" c="dimmed" fs="italic" mt={4}>
                  Per raggiungere la piena altezza al Contenitore utilizzare 100vh.
                </Text>
              </div>
            )}
          </Stack>
        </Accordion.Panel>
      </Accordion.Item>

      {display === 'grid' && (
        <Accordion.Item value="Elementi">
          <Accordion.Control>Elementi</Accordion.Control>
          <Accordion.Panel>
            <Stack gap="sm" className={styles.fieldList}>
              <Group justify="space-between" wrap="nowrap">
                <Text size="sm" fw={500}>
                  Contorno griglia
                </Text>
                <Switch
                  aria-label="Contorno griglia"
                  color="grape"
                  checked={isGridOutlineVisible}
                  onChange={(event) => setGridOutlineVisible(node.id, event.currentTarget.checked)}
                />
              </Group>

              <GridTrackField
                label="Colonne"
                viewport={activeViewport}
                value={layoutCurrent.gridTemplateColumns}
                defaultCount={DEFAULT_GRID_COLUMNS}
                onChange={(next) => writeLayout({ gridTemplateColumns: next })}
              />

              <GridTrackField
                label="Righe"
                viewport={activeViewport}
                value={layoutCurrent.gridTemplateRows}
                defaultCount={DEFAULT_GRID_ROWS}
                onChange={(next) => writeLayout({ gridTemplateRows: next })}
              />

              <div>
                <Group justify="space-between" align="center" wrap="nowrap" mb={4}>
                  <FieldLabel label="Spaziature" viewport={activeViewport} />
                  <Select
                    aria-label="Spaziatura — Unità"
                    variant="unstyled"
                    className={styles.unitFieldUnitSelect}
                    data={[...GAP_UNITS]}
                    value={gapUnit}
                    allowDeselect={false}
                    comboboxProps={{ zIndex: 1100, width: 'max-content', position: 'bottom-end' }}
                    rightSectionWidth={18}
                    onChange={(next) => writeGap(gapX, gapY, next ?? gapUnit)}
                  />
                </Group>
                <Group gap={0} align="flex-start" wrap="nowrap">
                  <div style={{ flex: 1 }}>
                    <NumberInput
                      aria-label="Spaziatura — Colonna"
                      min={0}
                      max={500}
                      value={gapX}
                      hideControls
                      classNames={{ input: styles.gapInputStart }}
                      onChange={handleGapXChange}
                    />
                    <Text size="xs" c="dimmed" ta="center" mt={2}>
                      Colonna
                    </Text>
                  </div>
                  <div style={{ flex: 1 }}>
                    <NumberInput
                      aria-label="Spaziatura — Riga"
                      min={0}
                      max={500}
                      value={gapY}
                      hideControls
                      classNames={{ input: styles.gapInputMiddle }}
                      onChange={handleGapYChange}
                    />
                    <Text size="xs" c="dimmed" ta="center" mt={2}>
                      Riga
                    </Text>
                  </div>
                  <Tooltip label={gapLinked ? 'Scollega' : 'Collega'} withArrow>
                    <ActionIcon
                      className={styles.gapLinkButton}
                      size={36}
                      variant={gapLinked ? 'filled' : 'default'}
                      color={gapLinked ? 'gray' : undefined}
                      aria-label={gapLinked ? 'Scollega spaziature' : 'Collega spaziature'}
                      aria-pressed={gapLinked}
                      onClick={() => setGapLinked((current) => !current)}
                    >
                      {gapLinked ? <IconLink size={14} /> : <IconLinkOff size={14} />}
                    </ActionIcon>
                  </Tooltip>
                </Group>
              </div>

              <Group justify="space-between" align="center" wrap="nowrap">
                <FieldLabel label="Flusso automatico" viewport={activeViewport} />
                <Select
                  aria-label="Flusso automatico"
                  data={[...AUTO_FLOW_OPTIONS]}
                  value={autoFlowDirection}
                  allowDeselect={false}
                  comboboxProps={{ zIndex: 1100 }}
                  w={132}
                  onChange={(next) => {
                    if (next !== 'row' && next !== 'column') return;
                    writeLayout({ autoFlow: autoFlowDense ? `${next} dense` : next });
                  }}
                />
              </Group>

              <IconChoiceField
                label="Giustifica elementi"
                viewport={activeViewport}
                options={JUSTIFY_ITEMS_OPTIONS}
                value={layoutCurrent.justifyItems ?? 'stretch'}
                onChange={(next) => writeLayout({ justifyItems: next })}
              />

              <IconChoiceField
                label="Allinea elementi"
                viewport={activeViewport}
                options={ALIGN_ITEMS_OPTIONS}
                value={layoutCurrent.alignItems ?? 'stretch'}
                onChange={(next) => writeLayout({ alignItems: next })}
              />
            </Stack>
          </Accordion.Panel>
        </Accordion.Item>
      )}
    </Accordion>
  );
}
