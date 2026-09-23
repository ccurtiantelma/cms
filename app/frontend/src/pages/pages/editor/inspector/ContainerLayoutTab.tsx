/**
 * Prima scheda "Layout" dell'ispettore per `container`/`section` (T-container-layout-tab,
 * ADR-82-container-unificato-grid-flex.md: `container` `v: 2` è il contenitore attivo,
 * `section` `v: 1` è deprecato ma può ancora comparire in contenuti vecchi — stessa UI per
 * entrambi, letta da `node.type`). Sostituisce `ContentTab.tsx` per questi due tipi
 * (`PropertyInspector.tsx` decide il monte, mai qui): due Accordion, "Contenitore" (layout
 * Flex/Grid, larghezza contenuto/massima, altezza minima) ed "Elementi" (contorno griglia,
 * colonne, spaziature — visibile solo a `layout.display === 'grid'`).
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
 * questo redesign: qui c'è solo il selettore Griglia/Flex più i pochi campi Grid richiesti).
 */
import { useState } from 'react';
import {
  ActionIcon,
  Accordion,
  Group,
  NumberInput,
  SegmentedControl,
  Select,
  Slider,
  Stack,
  Switch,
  Text,
  Tooltip,
} from '@mantine/core';
import { IconLink, IconLinkOff } from '@tabler/icons-react';
import type { BlockPropDescriptor, BlockTypeDescriptor } from '../../../../types/blocks.types';
import type { EditorViewport } from '../../../../hooks/useBlockEditorStore';
import { useActiveBreakpoint, useBlockEditorStore } from '../../../../hooks/useBlockEditorStore';
import type { BlockNode } from '../block-tree.utils';
import PropField from './PropField';
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

interface GridPresetLike {
  preset: 'repeat';
  count: number;
}

interface LayoutValueLike {
  display?: 'flex' | 'grid';
  gap?: { x: UnitValueLike; y: UnitValueLike };
  gridTemplateColumns?: GridPresetLike | unknown;
}

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

  const gridColumnsCount =
    isPlainObject(layoutCurrent.gridTemplateColumns) &&
    (layoutCurrent.gridTemplateColumns as Record<string, unknown>).preset === 'repeat' &&
    typeof (layoutCurrent.gridTemplateColumns as Record<string, unknown>).count === 'number'
      ? ((layoutCurrent.gridTemplateColumns as Record<string, unknown>).count as number)
      : 2;

  const gapUnit = layoutCurrent.gap?.x.unit ?? layoutCurrent.gap?.y.unit ?? GAP_UNITS[0];
  const gapX = layoutCurrent.gap?.x.value ?? 0;
  const gapY = layoutCurrent.gap?.y.value ?? 0;

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
                data={[
                  { value: 'flex', label: 'Flex' },
                  { value: 'grid', label: 'Griglia' },
                ]}
                value={display}
                onChange={(next) => writeLayout({ display: next as 'flex' | 'grid' })}
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

              <div>
                <Text size="sm" fw={500} mb={4}>
                  Colonne
                </Text>
                <Group gap="sm" align="center" wrap="nowrap">
                  <Slider
                    style={{ flex: 1 }}
                    min={1}
                    max={12}
                    value={gridColumnsCount}
                    label={(value) => `${value}`}
                    thumbLabel="Colonne"
                    onChange={(next) =>
                      writeLayout({ gridTemplateColumns: { preset: 'repeat', count: next } })
                    }
                  />
                  <NumberInput
                    aria-label="Colonne — Valore"
                    min={1}
                    max={12}
                    value={gridColumnsCount}
                    w={70}
                    onChange={(next) =>
                      writeLayout({
                        gridTemplateColumns: {
                          preset: 'repeat',
                          count: typeof next === 'number' ? next : gridColumnsCount,
                        },
                      })
                    }
                  />
                </Group>
              </div>

              <div>
                <Text size="sm" fw={500} mb={4}>
                  Spaziature
                </Text>
                <Group gap="xs" align="flex-end" wrap="nowrap">
                  <div>
                    <NumberInput
                      aria-label="Spaziatura — Colonna"
                      min={0}
                      max={500}
                      value={gapX}
                      w={80}
                      onChange={handleGapXChange}
                    />
                    <Text size="xs" c="dimmed" ta="center">
                      Colonna
                    </Text>
                  </div>
                  <div>
                    <NumberInput
                      aria-label="Spaziatura — Riga"
                      min={0}
                      max={500}
                      value={gapY}
                      w={80}
                      onChange={handleGapYChange}
                    />
                    <Text size="xs" c="dimmed" ta="center">
                      Riga
                    </Text>
                  </div>
                  <Select
                    aria-label="Spaziatura — Unità"
                    data={[...GAP_UNITS]}
                    value={gapUnit}
                    allowDeselect={false}
                    comboboxProps={{ zIndex: 1100 }}
                    w={80}
                    onChange={(next) => writeGap(gapX, gapY, next ?? gapUnit)}
                  />
                  <Tooltip label={gapLinked ? 'Scollega' : 'Collega'} withArrow>
                    <ActionIcon
                      variant={gapLinked ? 'light' : 'subtle'}
                      color={gapLinked ? 'grape' : 'gray'}
                      aria-label={gapLinked ? 'Scollega spaziature' : 'Collega spaziature'}
                      aria-pressed={gapLinked}
                      onClick={() => setGapLinked((current) => !current)}
                    >
                      {gapLinked ? <IconLink size={14} /> : <IconLinkOff size={14} />}
                    </ActionIcon>
                  </Tooltip>
                </Group>
              </div>
            </Stack>
          </Accordion.Panel>
        </Accordion.Item>
      )}
    </Accordion>
  );
}
