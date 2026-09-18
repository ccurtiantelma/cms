/**
 * Switcher del breakpoint simulato dal canvas full-screen (ADR-76-breakpoints-configurabili.md,
 * Sub-Task "Frame WYSIWYG In-Place & Breakpoint Switcher"). Successore di `ViewportSelector.tsx`
 * (stesso pattern: `ActionIcon` + `Tooltip` per opzione dentro un `role="group"`), esteso da 3
 * a N breakpoint — SOLO quelli attivi per il sito corrente, mai i 7 nomi chiusi incondizionatamente
 * (ADR-76 § "Conseguenze": "il pannello... mostra solo le chiavi attive").
 *
 * Legge da solo `useActiveBreakpoints()` (l'elenco dei breakpoint attivi, già ordinato dal più
 * largo al più stretto da `resolveActiveBreakpoints()`, `libs/breakpoints.ts`): a differenza
 * della selezione corrente (`value`/`onBreakpointChange`, prop-driven da `Toolbar.tsx`, stesso
 * principio di `ViewportSelector`), questo elenco non ha un punto di prop-drilling preesistente
 * nella topbar e vive comunque nello stesso store Zustand consultato ovunque nel canvas
 * (`IframeCanvas.tsx`).
 */
import { ActionIcon, Tooltip } from '@mantine/core';
import {
  IconDeviceDesktop,
  IconDeviceLaptop,
  IconDeviceMobile,
  IconDeviceTablet,
  IconDeviceTabletDown,
} from '@tabler/icons-react';
import { useActiveBreakpoints } from '../../../hooks/useBlockEditorStore';
import { BREAKPOINT_LABELS } from '../../../libs/breakpoints';
import type { ResponsiveBreakpointName } from '../../../types/blocks.types';
import styles from './BreakpointSwitcher.module.css';

export interface BreakpointSwitcherProps {
  /** Breakpoint correntemente simulato dal canvas (`useActiveBreakpoint()` nel chiamante). */
  value: ResponsiveBreakpointName;
  /** Invocata con il nome del breakpoint cliccato (`setActiveBreakpoint` nel chiamante). */
  onBreakpointChange: (breakpoint: ResponsiveBreakpointName) => void;
}

/**
 * Icona per ciascuno dei 7 nomi chiusi (ADR-76): `laptop`/`widescreen` condividono
 * `IconDeviceLaptop` (nessuna icona "widescreen" dedicata in `@tabler/icons-react`),
 * `tabletExtra` usa la variante "down" per distinguerla da `tablet` a colpo d'occhio,
 * `mobile`/`mobileExtra` condividono `IconDeviceMobile` per lo stesso motivo di `laptop`/
 * `widescreen` — il tooltip (nome + soglia px) resta la fonte di verità della distinzione.
 */
const BREAKPOINT_ICONS: Record<ResponsiveBreakpointName, typeof IconDeviceDesktop> = {
  default: IconDeviceDesktop,
  widescreen: IconDeviceLaptop,
  laptop: IconDeviceLaptop,
  tabletExtra: IconDeviceTabletDown,
  tablet: IconDeviceTablet,
  mobileExtra: IconDeviceMobile,
  mobile: IconDeviceMobile,
};

export default function BreakpointSwitcher({
  value,
  onBreakpointChange,
}: BreakpointSwitcherProps): JSX.Element {
  // Ordine e appartenenza già decisi da `resolveActiveBreakpoints()`: nessun filtro/ordinamento
  // duplicato qui, questo componente si limita a proiettarlo su pulsanti.
  const activeBreakpoints = useActiveBreakpoints();

  return (
    <div className={styles.root} role="group" aria-label="Breakpoint di anteprima">
      {activeBreakpoints.map((breakpoint) => {
        const Icon = BREAKPOINT_ICONS[breakpoint.name];
        const label = BREAKPOINT_LABELS[breakpoint.name];
        const tooltipLabel =
          breakpoint.widthPx !== undefined ? `${label} ${breakpoint.widthPx}px` : label;
        const isActive = value === breakpoint.name;
        return (
          <Tooltip key={breakpoint.name} label={tooltipLabel} withArrow>
            <ActionIcon
              variant={isActive ? 'filled' : 'subtle'}
              size="lg"
              aria-label={`Breakpoint ${tooltipLabel}`}
              aria-pressed={isActive}
              onClick={() => onBreakpointChange(breakpoint.name)}
            >
              <Icon size={18} />
            </ActionIcon>
          </Tooltip>
        );
      })}
    </div>
  );
}
