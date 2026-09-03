/**
 * Picker interattivo del punto focale editoriale di un'immagine (ADR-49 § M4): click o
 * trascinamento sull'immagine posizionano un mirino, in percentuale (0-100) rispetto alle
 * dimensioni rese — mai in pixel assoluti, che dipenderebbero dalla dimensione di rendering
 * corrente e non dalle dimensioni reali del file (quella conversione resta compito del
 * worker `MediaProcessor`, non di questo componente).
 *
 * Stateless sul valore: il chiamante (`MediaCropperModal`) possiede `focalX`/`focalY` e
 * decide quando persisterli — questo componente si limita a mostrare la posizione corrente
 * e a segnalare ogni cambiamento via `onChange`, stesso principio "un solo componente,
 * nessuna copia locale del valore" già in vigore per `PropField`/`PropertyForm.draft`.
 */
import { useCallback, useState } from 'react';
import { Button, Group, Stack, Text } from '@mantine/core';
import { IconFocus2 } from '@tabler/icons-react';
import styles from './FocalPointPicker.module.css';

/** Centro immagine, default sia del backend (`files.focalX/focalY`) sia di questo componente. */
const CENTER_FOCAL = 50;

export interface FocalPointPickerProps {
  imageUrl: string;
  focalX?: number;
  focalY?: number;
  onChange: (focalX: number, focalY: number) => void;
}

/** Clampa una coordinata percentuale entro i limiti validi del backend (0-100). */
function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value));
}

export default function FocalPointPicker({
  imageUrl,
  focalX = CENTER_FOCAL,
  focalY = CENTER_FOCAL,
  onChange,
}: FocalPointPickerProps): JSX.Element {
  const [isDragging, setIsDragging] = useState(false);

  /** Percentuale del punto cliccato/trascinato rispetto al rettangolo corrente della surface. */
  const computeFromPointer = useCallback(
    (surface: HTMLElement, clientX: number, clientY: number): void => {
      const rect = surface.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const x = clampPercent(((clientX - rect.left) / rect.width) * 100);
      const y = clampPercent(((clientY - rect.top) / rect.height) * 100);
      onChange(x, y);
    },
    [onChange],
  );

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>): void {
    event.currentTarget.setPointerCapture(event.pointerId);
    setIsDragging(true);
    computeFromPointer(event.currentTarget, event.clientX, event.clientY);
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>): void {
    if (!isDragging) return;
    computeFromPointer(event.currentTarget, event.clientX, event.clientY);
  }

  function endDrag(event: React.PointerEvent<HTMLDivElement>): void {
    setIsDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  return (
    <Stack gap="xs">
      <div
        className={styles.surface}
        data-testid="focal-point-surface"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        {/* Decorativa: il punto focale è un attributo dell'asset, non un'informazione che un
            testo alternativo deve portare qui — quello vive sulla prop `alt` del blocco. */}
        <img src={imageUrl} alt="" className={styles.image} draggable={false} />
        <div
          className={styles.crosshair}
          data-testid="focal-point-crosshair"
          style={{ left: `${focalX}%`, top: `${focalY}%` }}
        >
          <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true">
            <circle cx="14" cy="14" r="9" className={styles.crosshairRing} />
            <line x1="14" y1="1" x2="14" y2="8" className={styles.crosshairLine} />
            <line x1="14" y1="20" x2="14" y2="27" className={styles.crosshairLine} />
            <line x1="1" y1="14" x2="8" y2="14" className={styles.crosshairLine} />
            <line x1="20" y1="14" x2="27" y2="14" className={styles.crosshairLine} />
          </svg>
        </div>
      </div>
      <Group justify="space-between" wrap="nowrap">
        <Text size="xs" c="dimmed">
          Punto focale: {Math.round(focalX)}% / {Math.round(focalY)}%
        </Text>
        <Button
          size="xs"
          variant="subtle"
          leftSection={<IconFocus2 size={14} />}
          onClick={() => onChange(CENTER_FOCAL, CENTER_FOCAL)}
        >
          Reset a Centro (50/50)
        </Button>
      </Group>
    </Stack>
  );
}
