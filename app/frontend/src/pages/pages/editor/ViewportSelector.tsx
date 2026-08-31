import { ActionIcon, Tooltip } from '@mantine/core';
import { IconDeviceDesktop, IconDeviceMobile, IconDeviceTablet } from '@tabler/icons-react';
import type { EditorViewport } from '../../../hooks/useBlockEditorStore';
import styles from './ViewportSelector.module.css';

export interface ViewportSelectorProps {
  value: EditorViewport;
  onViewportChange: (width: string) => void;
}

interface ViewportOption {
  value: EditorViewport;
  label: string;
  width: string;
  icon: typeof IconDeviceDesktop;
}

const VIEWPORT_OPTIONS: ViewportOption[] = [
  // "100%", non un pixel fisso: a differenza di Tablet/Mobile (device frame a larghezza
  // fissa, `.viewportTablet`/`.viewportMobile` in `FullScreenEditorLayout.module.css`),
  // il frame Desktop resta fluido fino al tetto di `.viewportDesktop` (`max-width: 1280px`)
  // — l'etichetta "1440px" precedente non corrispondeva a nessun valore reale del CSS.
  { value: 'desktop', label: 'Desktop', width: '100%', icon: IconDeviceDesktop },
  { value: 'tablet', label: 'Tablet', width: '768px', icon: IconDeviceTablet },
  { value: 'mobile', label: 'Mobile', width: '375px', icon: IconDeviceMobile },
];

export default function ViewportSelector({
  value,
  onViewportChange,
}: ViewportSelectorProps): JSX.Element {
  return (
    <div className={styles.root} role="group" aria-label="Viewport di anteprima">
      {VIEWPORT_OPTIONS.map((option) => {
        const Icon = option.icon;
        return (
          <Tooltip key={option.value} label={`${option.label} ${option.width}`} withArrow>
            <ActionIcon
              variant={value === option.value ? 'filled' : 'subtle'}
              size="lg"
              aria-label={`Viewport ${option.label}, ${option.width}`}
              aria-pressed={value === option.value}
              onClick={() => onViewportChange(option.width)}
            >
              <Icon size={18} />
            </ActionIcon>
          </Tooltip>
        );
      })}
    </div>
  );
}
