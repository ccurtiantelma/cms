/**
 * Modal "Libreria Sezioni" (ADR-34): libreria di preset statici di `section` pronti
 * all'uso — alternativa a "Seleziona la tua struttura" (`SectionStructureModal`, ADR-33
 * § 7), mai annidata a quella: l'utente sceglie fra una `section` vuota e una preimpostata,
 * non le due modal in sequenza (ADR-34 § 5). Componente frontend puro nella cartella
 * `pages/pages/editor/`, stesso principio di `WidgetPalette`/`SectionStructureModal`
 * (ADR-32 § 4 / ADR-33 § 7).
 *
 * Tab singola "Sezioni Predefinite": nessun placeholder per tab future (ADR-34 § 5, "le
 * altre tab restano fuori scope") — il titolo del `Modal` porta già quell'informazione, una
 * `Tabs` a una sola voce sarebbe solo peso visivo senza funzione.
 *
 * Fonte dei preset: `static-section-presets.json`, importato staticamente (nessuna chiamata
 * di rete, ADR-34 § 1). Ogni preset è risolto contro il registro (`resolvePresetSubtree`)
 * al momento della selezione, non al modulo: il registro non cambia durante la sessione di
 * editing, ma risolvere solo on-demand tiene l'eventuale eccezione di un preset
 * disallineato (registro evoluto senza aggiornare il file statico) vicina al click che
 * l'ha causata, non a un side-effect di import.
 *
 * ADR-56 § 4 estende questa stessa tab singola con chip di filtro categoria e un campo di
 * ricerca testuale: entrambi filtrano **client-side** l'array `PRESETS` già in memoria,
 * nessuna seconda tab, nessuna categoria "Pagine Intere" (ADR-56 § 5).
 */
import { useState } from 'react';
import { Badge, Chip, Group, Modal, SimpleGrid, Text, TextInput } from '@mantine/core';
import { IconSearch } from '@tabler/icons-react';
import { useBlockEditorStore } from '../../../hooks/useBlockEditorStore';
import {
  resolvePresetSubtree,
  resolvePresetThumbnailUrl,
  type SectionPreset,
  type SectionPresetCategory,
} from './block-registry.utils';
import rawPresets from './static-section-presets.json';
import styles from './TemplateLibraryModal.module.css';

// `resolveJsonModule` (tsconfig.json) infila i valori letterali del file: la forma reale è
// `SectionPreset[]` (ADR-34 § 1, esteso da ADR-56 § 4), qui riaffermata esplicitamente
// perché il file è manutenuto a mano e non generato da uno schema.
const PRESETS = rawPresets as SectionPreset[];

/**
 * Le quattro categorie fisse (ADR-56 § 4/§ 5) più le rispettive etichette italiane per i
 * `Chip`: elenco chiuso, un quinto valore richiede una nuova ADR — mai un'aggiunta qui senza
 * anche estendere `SectionPresetCategory` (`block-registry.utils.ts`).
 */
const CATEGORY_LABELS: Record<SectionPresetCategory, string> = {
  hero: 'Hero',
  'feature-grid': 'Griglia funzionalità',
  cta: 'Call to Action',
  altro: 'Altro',
};

/**
 * `true` se `preset` soddisfa sia il filtro categoria (chip, `null` = "Tutte") sia la
 * ricerca testuale (`label` o uno qualunque dei `tags`, case-insensitive) — le due
 * condizioni si combinano in AND, non in OR: un chip attivo restringe l'insieme su cui la
 * ricerca testuale filtra ulteriormente.
 */
function matchesFilters(
  preset: SectionPreset,
  activeCategory: SectionPresetCategory | null,
  searchQuery: string,
): boolean {
  if (activeCategory !== null && preset.category !== activeCategory) return false;
  const query = searchQuery.trim().toLowerCase();
  if (query === '') return true;
  const haystack = [preset.label, ...preset.tags].map((value) => value.toLowerCase());
  return haystack.some((value) => value.includes(query));
}

interface TemplateLibraryModalProps {
  /** Stato di apertura, controllato dal chiamante. */
  opened: boolean;
  onClose: () => void;
  /** Contenitore di destinazione del preset: `null` = radice dell'albero. */
  parentId: string | null;
  /** Posizione di inserimento fra i figli del contenitore di destinazione. */
  index: number;
}

/**
 * Valore sentinella del chip "Tutte" (nessun filtro categoria): un `Chip.Group` controllato
 * richiede sempre un valore stringa selezionato, `null` non è un valore di chip valido — la
 * conversione da/verso `activeCategory: SectionPresetCategory | null` avviene solo qui.
 */
const ALL_CATEGORIES_VALUE = 'tutte';

/** Modal di selezione di un preset di Sezione dalla libreria statica (ADR-34), con filtro categoria e ricerca testuale (ADR-56 § 4). */
export default function TemplateLibraryModal({
  opened,
  onClose,
  parentId,
  index,
}: TemplateLibraryModalProps): JSX.Element {
  const insertSubtreeAction = useBlockEditorStore((state) => state.insertSubtreeAction);
  const [activeCategory, setActiveCategory] = useState<SectionPresetCategory | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const filteredPresets = PRESETS.filter((preset) =>
    matchesFilters(preset, activeCategory, searchQuery),
  );

  /** Risolve il preset scelto contro il registro e lo inserisce nel punto di apertura. */
  function handleSelect(preset: SectionPreset): void {
    const resolved = resolvePresetSubtree(preset.subtree);
    insertSubtreeAction(parentId, index, resolved);
    onClose();
  }

  return (
    // zIndex sopra la chrome full-screen dell'editor (z-index 1000,
    // FullScreenEditorLayout.module.css), stesso valore/stesso motivo di
    // `CreateTranslationModal.tsx` e dei `ConfirmModal` di `BlockEditorPanel.tsx`/
    // `PagePageDetail.tsx`: senza, il Modal di Mantine monta al suo z-index di default
    // (200) e resta invisibile dietro l'overlay, pur essendo aperto (bug: il pulsante
    // "Libreria sezioni" della topbar sembrava non rispondere al click).
    <Modal
      opened={opened}
      onClose={onClose}
      title="Libreria Sezioni"
      size="lg"
      centered
      zIndex={1100}
    >
      <Text size="sm" c="dimmed" mb="md">
        Sezioni Predefinite
      </Text>

      <TextInput
        placeholder="Cerca per nome o parola chiave..."
        leftSection={<IconSearch size={16} />}
        value={searchQuery}
        onChange={(event) => setSearchQuery(event.currentTarget.value)}
        mb="sm"
        aria-label="Cerca preset"
      />

      {/* Chip di filtro categoria (ADR-56 § 4): enum chiuso, "Tutte" è il solo valore fuori
          da `SectionPresetCategory` (sentinella locale {@link ALL_CATEGORIES_VALUE}) — mai
          una quinta categoria di dominio, solo l'assenza di filtro. */}
      <Chip.Group
        multiple={false}
        value={activeCategory ?? ALL_CATEGORIES_VALUE}
        onChange={(value) =>
          setActiveCategory(
            value === ALL_CATEGORIES_VALUE ? null : (value as SectionPresetCategory),
          )
        }
      >
        <Group gap="xs" mb="md">
          <Chip value={ALL_CATEGORIES_VALUE} size="xs">
            Tutte
          </Chip>
          {(Object.keys(CATEGORY_LABELS) as SectionPresetCategory[]).map((category) => (
            <Chip key={category} value={category} size="xs">
              {CATEGORY_LABELS[category]}
            </Chip>
          ))}
        </Group>
      </Chip.Group>

      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
        {filteredPresets.map((preset) => (
          <button
            key={preset.id}
            type="button"
            className={styles.presetButton}
            aria-label={preset.label}
            onClick={() => handleSelect(preset)}
          >
            {/* Decorativa: l'`aria-label` del pulsante nomina già la tessera, `alt=""`
                evita una doppia lettura dello stesso nome da parte degli screen reader. */}
            <img
              src={resolvePresetThumbnailUrl(preset)}
              alt=""
              className={styles.presetThumbnail}
            />
            <Text size="sm" fw={600} ta="center">
              {preset.label}
            </Text>
            <Badge size="sm" variant="light" color="gray">
              {CATEGORY_LABELS[preset.category]}
            </Badge>
          </button>
        ))}
      </SimpleGrid>

      {filteredPresets.length === 0 && (
        <Text size="sm" c="dimmed" ta="center" mt="md">
          Nessun preset corrisponde ai filtri selezionati.
        </Text>
      )}
    </Modal>
  );
}
