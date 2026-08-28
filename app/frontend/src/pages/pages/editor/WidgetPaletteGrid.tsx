import { createElement } from 'react';
import {
  IconAlignLeft,
  IconBox,
  IconHandClick,
  IconHeading,
  IconLayoutBoard,
  IconPhoto,
  IconTemplate,
  type Icon,
} from '@tabler/icons-react';
import { BLOCK_TYPES, type BlockTypeDescriptor } from '../../../types/blocks.types';
import { useBlockEditorStore } from '../../../hooks/useBlockEditorStore';
import { instantiatePreset } from './BlockPresetManager';
import { usePresetStore } from './usePresetStore';
import styles from './WidgetPaletteGrid.module.css';

export interface WidgetPaletteGridProps {
  onWidgetSelect?: (type: string) => void;
  parentId?: string | null;
  index?: number;
  presetsOnly?: boolean;
}

interface WidgetCategory {
  label: string;
  types: readonly string[];
}

const CATEGORIES: readonly WidgetCategory[] = [
  { label: 'Layout', types: ['section', 'container'] },
  { label: 'Contenuto', types: ['heading', 'richText', 'button'] },
  { label: 'Media', types: ['image'] },
];

const ICONS: Record<string, Icon> = {
  section: IconLayoutBoard,
  container: IconBox,
  heading: IconHeading,
  richText: IconAlignLeft,
  button: IconHandClick,
  image: IconPhoto,
};

function descriptorFor(type: string): BlockTypeDescriptor | undefined {
  return BLOCK_TYPES.find((descriptor) => descriptor.type === type);
}

export default function WidgetPaletteGrid({
  onWidgetSelect,
  parentId = null,
  index = Number.MAX_SAFE_INTEGER,
  presetsOnly = false,
}: WidgetPaletteGridProps): JSX.Element {
  const presets = usePresetStore((state) => state.presets);
  const insertSubtreeAction = useBlockEditorStore((state) => state.insertSubtreeAction);

  return (
    <div className={styles.root}>
      {!presetsOnly && CATEGORIES.map((category) => (
        <section
          key={category.label}
          className={styles.category}
          aria-labelledby={`palette-${category.label}`}
        >
          <h2 id={`palette-${category.label}`} className={styles.categoryTitle}>
            {category.label}
          </h2>
          <div className={styles.grid}>
            {category.types.map((type) => {
              const descriptor = descriptorFor(type);
              if (!descriptor || !descriptor.enabled || descriptor.deprecated) return null;
              const Icon = ICONS[type] ?? IconBox;
              const label = descriptor.meta?.label ?? type;

              return (
                <button
                  key={type}
                  type="button"
                  className={styles.card}
                  aria-label={`Aggiungi ${label}`}
                  onClick={() => onWidgetSelect?.(type)}
                >
                  <span className={styles.icon} aria-hidden="true">
                    {createElement(Icon, { size: 22, stroke: 1.7 })}
                  </span>
                  <span className={styles.label}>{label}</span>
                </button>
              );
            })}
          </div>
        </section>
      ))}
      <section className={styles.category} aria-labelledby="palette-i-miei-preset">
        <h2 id="palette-i-miei-preset" className={styles.categoryTitle}>
          I Miei Preset
        </h2>
        {presets.length === 0 ? (
          <p className={styles.empty}>Nessun preset salvato</p>
        ) : (
          <div className={styles.grid}>
            {presets.map((preset) => (
              <button
                key={preset.id}
                type="button"
                className={styles.card}
                aria-label={`Inserisci preset ${preset.name}`}
                onClick={() => insertSubtreeAction(parentId, index, instantiatePreset(preset))}
              >
                <span className={styles.icon} aria-hidden="true">
                  <IconTemplate size={22} stroke={1.7} />
                </span>
                <span className={styles.label}>{preset.name}</span>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
