/**
 * Rappresentazione a "box model" (stile DevTools) delle otto prop di spaziatura per lato
 * di ADR-33 § 4 (`stylePaddingTop/Right/Bottom/Left`, `styleMarginTop/Right/Bottom/Left`).
 * Sostituisce gli otto `Slider` separati di `PropertyInspector.tsx` **solo** quando il tipo
 * in editing le dichiara tutte e otto (vedi il chiamante, che ricade sul rendering
 * individuale se anche una sola manca).
 *
 * Perché un componente a sé invece di otto controlli in fila: la relazione fra le due
 * spaziature — il margine attorno al box, il padding dentro — è spaziale, non elencabile.
 * Quattro rettangoli concentrici la mostrano a colpo d'occhio; otto Slider indipendenti la
 * perdono, costringendo a tenerla a mente leggendo le etichette una per una.
 *
 * Ogni lato resta comunque un token della scala chiusa `prop.values` (mai un valore
 * libero, ADR-33 § 4): il popover che si apre al click offre solo quei dieci token via
 * `SegmentedControl`, non un campo di testo — lo stesso principio dello Slider a indice
 * che sostituisce, solo con un controllo diverso.
 *
 * La lettura/scrittura dell'envelope responsive `{ default, tablet?, mobile? }` riusa
 * esattamente le funzioni già usate da `PropertyInspector.tsx` (`responsiveEnvelope`,
 * `effectiveScalarForViewport`, `breakpointKey`) — mai una propria logica di merge: è
 * l'invariante esplicitamente protetto dal rischio "Responsive scritto a metà: renderer o
 * ispettore che perdono tablet/mobile" (Alta probabilità/Alto impatto,
 * PLAN-F04c-editor-maturo.md), e una seconda implementazione qui lo violerebbe in
 * silenzio al primo refactor disallineato fra le due. `setAndCommit` è la stessa closure
 * di `PropertyForm` (chiude sullo stato locale `draft` di quel form): arriva come prop,
 * non viene mai ricreata qui, per restare sull'unica fonte di verità del form.
 *
 * Il lucchetto per gruppo (Margine/Padding) è stato locale del pannello, non una prop: blocca
 * solo *come* si scrive sui quattro lati di quel gruppo (stesso token su tutti e quattro
 * invece che sul solo lato toccato), mai *cosa* si scrive — resta comunque una scrittura per
 * prop via `setAndCommit`, quindi nessun formato composito nuovo nel `jsonb`.
 */
import { useState } from 'react';
import { ActionIcon, Popover, SegmentedControl, Stack, Text, Tooltip, UnstyledButton } from '@mantine/core';
import { IconLock, IconLockOpen } from '@tabler/icons-react';
import type { BlockPropDescriptor } from '../../../types/blocks.types';
import type { EditorViewport } from '../../../hooks/useBlockEditorStore';
import {
  asString,
  breakpointKey,
  effectiveScalarForViewport,
  propLabel,
  responsiveEnvelope,
  VIEWPORT_LABELS,
  type PropsMeta,
} from './PropertyInspector';
import styles from './VisualBoxModelInspector.module.css';

/** Le otto prop di spaziatura, indicizzate per nome — vedi il chiamante in `PropertyInspector.tsx`. */
export interface SpacingPropsByName {
  stylePaddingTop: BlockPropDescriptor;
  stylePaddingRight: BlockPropDescriptor;
  stylePaddingBottom: BlockPropDescriptor;
  stylePaddingLeft: BlockPropDescriptor;
  styleMarginTop: BlockPropDescriptor;
  styleMarginRight: BlockPropDescriptor;
  styleMarginBottom: BlockPropDescriptor;
  styleMarginLeft: BlockPropDescriptor;
}

interface VisualBoxModelInspectorProps {
  /** I descrittori delle otto prop, dal registro del tipo in editing. */
  spacingProps: SpacingPropsByName;
  /** Bozza locale del form (`PropertyForm.draft`): stessa fonte di verità di ogni altro controllo. */
  draft: Record<string, unknown>;
  /** Metadati di prop del tipo corrente (etichette dal registro, ADR-30 § 1). */
  propsMeta: PropsMeta;
  /** Viewport attivo dello Switcher: decide la chiave dell'envelope su cui si scrive. */
  activeViewport: EditorViewport;
  /** Scrive nello store — la stessa closure di `PropertyForm`, mai ricreata qui. */
  setAndCommit: (name: string, value: unknown) => void;
}

/** Posizione del lato nel box model, sia come area della griglia CSS sia come lato del popover. */
type BoxSide = 'top' | 'right' | 'bottom' | 'left';

interface SideDescriptor {
  propName: keyof SpacingPropsByName;
  side: BoxSide;
}

const MARGIN_SIDES: readonly SideDescriptor[] = [
  { propName: 'styleMarginTop', side: 'top' },
  { propName: 'styleMarginRight', side: 'right' },
  { propName: 'styleMarginBottom', side: 'bottom' },
  { propName: 'styleMarginLeft', side: 'left' },
];

const PADDING_SIDES: readonly SideDescriptor[] = [
  { propName: 'stylePaddingTop', side: 'top' },
  { propName: 'stylePaddingRight', side: 'right' },
  { propName: 'stylePaddingBottom', side: 'bottom' },
  { propName: 'stylePaddingLeft', side: 'left' },
];

interface SpacingSideControlProps {
  prop: BlockPropDescriptor;
  label: string;
  /** Valore corrente in bozza per questa prop (envelope, o vuoto per un nodo nuovo). */
  value: unknown;
  activeViewport: EditorViewport;
  side: BoxSide;
  onChangeToken: (nextToken: string) => void;
}

/**
 * Un solo lato: bottone che mostra il token corrente, popover con i token della scala
 * chiusa `prop.values` al click. Raggiungibile da tastiera (bottone nativo, `Popover`
 * Mantine gestisce `Escape`/click esterno) con `aria-label` esplicito sul valore e sul
 * viewport in editing — coerente con il tono di `EditorBlockWrapper.tsx`.
 */
function SpacingSideControl({
  prop,
  label,
  value,
  activeViewport,
  side,
  onChangeToken,
}: SpacingSideControlProps): JSX.Element {
  const [opened, setOpened] = useState(false);
  const scale = prop.values ?? [];
  const envelope = responsiveEnvelope(prop, value);
  const displayValue = effectiveScalarForViewport(envelope, activeViewport);
  const currentToken = asString(displayValue) || scale[0] || '0';
  const fieldLabel =
    activeViewport === 'desktop' ? label : `${label} (${VIEWPORT_LABELS[activeViewport]})`;

  return (
    <Popover
      opened={opened}
      onChange={setOpened}
      position={side}
      withArrow
      zIndex={1100}
      shadow="md"
    >
      <Popover.Target>
        <UnstyledButton
          type="button"
          className={`${styles.sideButton} ${styles[side]}`}
          aria-label={`${fieldLabel}: ${currentToken}px`}
          onClick={() => setOpened((current) => !current)}
        >
          {currentToken}px
        </UnstyledButton>
      </Popover.Target>
      <Popover.Dropdown>
        <Stack gap={4}>
          <Text size="xs" fw={500}>
            {fieldLabel}
          </Text>
          <SegmentedControl
            orientation="vertical"
            size="xs"
            value={currentToken}
            data={scale.map((token) => ({ value: token, label: `${token}px` }))}
            onChange={(nextToken) => {
              onChangeToken(nextToken);
              setOpened(false);
            }}
          />
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}

/**
 * Box model a rettangoli concentrici: Margin (esterno, arancio) → Padding (intermedio,
 * verde acqua) → "Contenuto" (centro, solo etichetta — non editabile qui: il contenuto
 * del blocco si modifica nella scheda "Contenuto" o nel canvas, mai da questo pannello).
 * Vedi il commento di testa per l'invariante sull'envelope responsive.
 */
export default function VisualBoxModelInspector({
  spacingProps,
  draft,
  propsMeta,
  activeViewport,
  setAndCommit,
}: VisualBoxModelInspectorProps): JSX.Element {
  const activeBreakpoint = breakpointKey(activeViewport);
  // Bloccato = i quattro lati del gruppo si muovono insieme (un lato cambiato propaga lo
  // stesso token agli altri tre), come nel pattern "catena spezzata" di Elementor/DevTools.
  // Stato locale, non nel `draft` del form: è una preferenza di editing del pannello, non un
  // valore di prop — non deve né sopravvivere al salvataggio né viaggiare verso il server.
  const [marginLocked, setMarginLocked] = useState(false);
  const [paddingLocked, setPaddingLocked] = useState(false);

  /**
   * Scrive solo la chiave del breakpoint attivo, preservando le altre già salvate —
   * stesso pattern di `PropertyInspector.tsx` (mai un merge scritto qui una seconda volta).
   * Con il gruppo bloccato scrive lo stesso token sui quattro lati del gruppo invece del solo
   * lato toccato: resta comunque una scrittura per prop (mai un valore composito), quindi
   * undo/redo e dirty-tracking restano quelli già garantiti da `setAndCommit`.
   */
  function writeSide(
    propName: keyof SpacingPropsByName,
    nextToken: string,
    locked: boolean,
    groupSides: readonly SideDescriptor[],
  ): void {
    const targets = locked ? groupSides.map((side) => side.propName) : [propName];
    for (const target of targets) {
      const prop = spacingProps[target];
      const envelope = responsiveEnvelope(prop, draft[target]);
      setAndCommit(target, { ...envelope, [activeBreakpoint]: nextToken });
    }
  }

  function renderSide(
    descriptor: SideDescriptor,
    locked: boolean,
    groupSides: readonly SideDescriptor[],
  ): JSX.Element {
    const prop = spacingProps[descriptor.propName];
    const label = propLabel(prop, propsMeta);
    return (
      <SpacingSideControl
        key={descriptor.propName}
        prop={prop}
        label={label}
        value={draft[descriptor.propName]}
        activeViewport={activeViewport}
        side={descriptor.side}
        onChangeToken={(nextToken) => writeSide(descriptor.propName, nextToken, locked, groupSides)}
      />
    );
  }

  function renderLockToggle(
    locked: boolean,
    setLocked: (next: boolean) => void,
    groupLabel: string,
  ): JSX.Element {
    const action = locked ? 'Sblocca' : 'Blocca';
    return (
      <Tooltip label={`${action} ${groupLabel.toLowerCase()}: modifica i quattro lati insieme`} withArrow>
        <ActionIcon
          variant={locked ? 'light' : 'subtle'}
          color={locked ? 'blue' : 'gray'}
          size="sm"
          aria-label={`${action} ${groupLabel.toLowerCase()}`}
          aria-pressed={locked}
          onClick={() => setLocked(!locked)}
        >
          {locked ? <IconLock size={14} /> : <IconLockOpen size={14} />}
        </ActionIcon>
      </Tooltip>
    );
  }

  return (
    <Stack gap={6}>
      <Text size="sm" fw={500}>
        Spaziatura
      </Text>

      <div className={`${styles.box} ${styles.marginBox}`}>
        {MARGIN_SIDES.map((side) => renderSide(side, marginLocked, MARGIN_SIDES))}
        <div className={`${styles.center} ${styles.box} ${styles.paddingBox}`}>
          {PADDING_SIDES.map((side) => renderSide(side, paddingLocked, PADDING_SIDES))}
          <div className={`${styles.center} ${styles.contentBox}`} aria-hidden="true">
            Contenuto
          </div>
        </div>
      </div>

      <div className={styles.legend}>
        <span className={`${styles.legendDot} ${styles.legendDotMargin}`} aria-hidden="true" />
        <Text size="xs" c="dimmed">
          Margine
        </Text>
        {renderLockToggle(marginLocked, setMarginLocked, 'Margine')}
        <span className={`${styles.legendDot} ${styles.legendDotPadding}`} aria-hidden="true" />
        <Text size="xs" c="dimmed">
          Padding
        </Text>
        {renderLockToggle(paddingLocked, setPaddingLocked, 'Padding')}
      </div>
    </Stack>
  );
}
