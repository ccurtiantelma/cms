/**
 * Manopola circolare per l'angolo del gradiente di default: la ghiera mostra
 * un'anteprima live del gradiente `from → to` alla rotazione corrente (stessa
 * convenzione angolare di `linear-gradient(<deg>deg, ...)`: 0° = verso l'alto,
 * senso orario), trascinabile col mouse/touch o regolabile da tastiera.
 * Affiancata al `NumberInput` per l'inserimento del valore esatto.
 */
import { useCallback, useRef } from 'react';
import { Tooltip } from '@mantine/core';
import classes from './GradientAngleDial.module.css';

/** Normalizza un angolo in gradi nell'intervallo [0, 360). */
function normalizeDeg(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/** Angolo (convenzione `linear-gradient`: 0° in alto, orario) del punto rispetto al centro del dial. */
function angleFromPoint(
  centerX: number,
  centerY: number,
  clientX: number,
  clientY: number,
): number {
  const dx = clientX - centerX;
  const dy = clientY - centerY;
  const rad = Math.atan2(dx, -dy);
  return normalizeDeg((rad * 180) / Math.PI);
}

export interface GradientAngleDialProps {
  /** Angolo corrente in gradi (0–360, convenzione `linear-gradient`). */
  value: number;
  /** Notifica il nuovo angolo (arrotondato all'intero), da trascinamento o tastiera. */
  onChange: (value: number) => void;
  /** Colore di partenza del gradiente, per l'anteprima nella ghiera. */
  from: string;
  /** Colore di arrivo del gradiente, per l'anteprima nella ghiera. */
  to: string;
  /** Diametro in px del dial. */
  size?: number;
  /** Etichetta accessibile di base (screen reader + tooltip). */
  'aria-label': string;
}

/** Dial trascinabile per l'angolo del gradiente, con anteprima live `from → to`. */
export function GradientAngleDial({
  value,
  onChange,
  from,
  to,
  size = 34,
  'aria-label': ariaLabel,
}: GradientAngleDialProps): JSX.Element {
  const dialRef = useRef<HTMLDivElement>(null);

  /** Calcola l'angolo dal punto del puntatore e lo propaga (arrotondato). */
  const updateFromPointer = useCallback(
    (clientX: number, clientY: number) => {
      const rect = dialRef.current?.getBoundingClientRect();
      if (!rect) return;
      const deg = angleFromPoint(
        rect.left + rect.width / 2,
        rect.top + rect.height / 2,
        clientX,
        clientY,
      );
      onChange(Math.round(deg));
    },
    [onChange],
  );

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>): void => {
    event.currentTarget.setPointerCapture(event.pointerId);
    updateFromPointer(event.clientX, event.clientY);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    updateFromPointer(event.clientX, event.clientY);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    const step = event.shiftKey ? 15 : 1;
    switch (event.key) {
      case 'ArrowUp':
      case 'ArrowRight':
        event.preventDefault();
        onChange(normalizeDeg(value + step));
        break;
      case 'ArrowDown':
      case 'ArrowLeft':
        event.preventDefault();
        onChange(normalizeDeg(value - step));
        break;
      case 'Home':
        event.preventDefault();
        onChange(0);
        break;
      case 'End':
        event.preventDefault();
        onChange(360);
        break;
      default:
        break;
    }
  };

  return (
    <Tooltip label={`${ariaLabel}: ${Math.round(value)}°`} withArrow>
      <div
        ref={dialRef}
        role="slider"
        tabIndex={0}
        aria-label={ariaLabel}
        aria-valuemin={0}
        aria-valuemax={360}
        aria-valuenow={Math.round(value)}
        aria-valuetext={`${Math.round(value)}°`}
        className={classes.dial}
        style={{
          width: size,
          height: size,
          background: `linear-gradient(${value}deg, ${from}, ${to})`,
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onKeyDown={handleKeyDown}
      >
        <div
          className={classes.needle}
          style={{ height: size / 2, transform: `rotate(${value}deg)` }}
        >
          <span className={classes.needleTip} />
        </div>
      </div>
    </Tooltip>
  );
}
