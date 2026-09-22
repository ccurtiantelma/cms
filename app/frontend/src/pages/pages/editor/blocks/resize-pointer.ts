import type { PointerEvent as ReactPointerEvent } from 'react';

/** Handler pointer di una maniglia trascinabile (`ColumnResizer`, `ContainerResizeHandle`). */
export interface ResizePointerHandlers {
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerUp: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerCancel: (event: ReactPointerEvent<HTMLDivElement>) => void;
}

/** Rilascia la cattura del puntatore sulla maniglia, se ancora attiva. */
export function releaseHandleCapture(event: ReactPointerEvent<HTMLDivElement>): void {
  const handle = event.currentTarget;
  if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
}
