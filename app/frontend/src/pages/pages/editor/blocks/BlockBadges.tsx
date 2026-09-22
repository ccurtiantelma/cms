/**
 * Badge informativi della chrome di un blocco (nessuno entra nel flusso del contenuto, tutti
 * `position: absolute` in `EditorBlockWrapper.module.css`): nome su hover, maniglia di
 * selezione del Contenitore, "Sezione Globale" e "Nascosto su [Device]".
 */
import { createElement } from 'react';
import { IconWorld } from '@tabler/icons-react';
import { blockIcon } from '../block-icon';
import styles from '../EditorBlockWrapper.module.css';

interface BlockBadgesProps {
  label: string;
  /** Nome icona di registro (`meta.icon`). */
  iconName: string | undefined;
  /** Livello gerarchico: colora il badge come cornice e barra (ADR-95). */
  tone: 'section' | 'container' | 'widget';
  isHovered: boolean;
  isSelected: boolean;
  isGlobalRef: boolean;
  isContainerBlockType: boolean;
  /** Etichetta del dispositivo attivo se il nodo è nascosto su di esso, altrimenti `null`. */
  hiddenOnViewportLabel: string | null;
  onSelect: () => void;
}

export default function BlockBadges({
  label,
  iconName,
  tone,
  isHovered,
  isSelected,
  isGlobalRef,
  isContainerBlockType,
  hiddenOnViewportLabel,
  onSelect,
}: BlockBadgesProps): JSX.Element {
  return (
    <>
      {/* Nome su hover **senza** selezione (lì c'è la toolbar); mai su `globalRef`, che ha il proprio badge. */}
      {isHovered && !isSelected && !isGlobalRef && (
        <span className={styles.hoverBadge} data-tone={tone} aria-hidden="true">
          {/* `createElement`: `blockIcon` ritorna un riferimento stabile, ma un tag JSX dinamico confonde React Compiler. */}
          {createElement(blockIcon(iconName), { size: 12, color: '#ffffff', 'aria-hidden': true })}
          {/* Solo icona (stile Elementor): il nome resta nel DOM, visivamente nascosto. */}
          <span className={styles.hoverBadgeLabel}>{label}</span>
        </span>
      )}

      {/* Maniglia di selezione del Contenitore (RE-3): hover o selezionato, stesso `selectNode` del click. */}
      {isContainerBlockType && (isHovered || isSelected) && (
        <button
          type="button"
          className={styles.containerSelectHandle}
          aria-label="Seleziona Contenitore"
          title="Seleziona Contenitore"
          onClick={(event) => {
            event.stopPropagation();
            onSelect();
          }}
        />
      )}

      {/* Sempre visibile su un `globalRef` (ADR-55): il contenuto vero vive altrove. */}
      {isGlobalRef && (
        <span className={styles.globalRefBadge} aria-hidden="true">
          <IconWorld size={12} />
          Sezione Globale
        </span>
      )}

      {/* Sempre visibile se nascosto sul dispositivo attivo (ADR-37 § 3). */}
      {hiddenOnViewportLabel !== null && (
        <span className={styles.hiddenBadge} aria-hidden="true">
          Nascosto su {hiddenOnViewportLabel}
        </span>
      )}
    </>
  );
}
