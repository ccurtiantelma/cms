/**
 * Bottone-icona per le azioni di riga delle tabelle CRUD (modifica, elimina,
 * dettaglio, ecc.). Tooltip su hover + `ActionIcon` Mantine con stile uniforme
 * (variante chiara, angoli arrotondati, dimensione compatta).
 */
import type { ReactNode } from 'react';
import { ActionIcon, Tooltip } from '@mantine/core';

interface RowActionIconProps {
  /** Testo del tooltip e `aria-label` (l'azione non ha etichetta visibile). */
  label: string;
  /** Icona da renderizzare (es. `<IconPencil size={16} />`). */
  icon: ReactNode;
  /** Colore Mantine dell'icona; grigio (in linea col testo) per default. */
  color?: string;
  onClick: () => void;
}

/** Icona-azione con tooltip per le righe delle tabelle elenco. */
export default function RowActionIcon({
  label,
  icon,
  color = 'gray',
  onClick,
}: RowActionIconProps): JSX.Element {
  return (
    <Tooltip label={label} withArrow>
      <ActionIcon variant="light" color={color} radius="md" aria-label={label} onClick={onClick}>
        {icon}
      </ActionIcon>
    </Tooltip>
  );
}
