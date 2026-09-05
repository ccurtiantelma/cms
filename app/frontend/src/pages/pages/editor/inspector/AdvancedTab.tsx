/**
 * Scheda "Avanzato" dell'ispettore (ADR-37 § 5): le props filtrate da `groupPropsByTab` per
 * `tab: 'advanced'`, raggruppate in sezioni Accordion stile Elementor (`groupPropsBySection`/
 * `advancedSectionFor`, T-inspector-elementor-parity) — "Layout & Responsive"
 * (`styleLayer`, `styleHideDesktop/Tablet/Mobile`) e "Attributi Custom" (`customCssClass`/
 * `customElementId`, `kind: 'cssClassName'`/`'htmlId'`, ADR-38 § 5). Tutte le sezioni
 * popolate restano aperte di default (`Accordion` `multiple` + `defaultValue`). Ogni prop
 * resta resa da `PropField`, come in `ContentTab.tsx` — nessun ramo diverso per tipo di
 * blocco, solo una sezione diversa.
 */
import { useState } from 'react';
import { Accordion, Button, Group, Modal, Stack, TextInput } from '@mantine/core';
import { IconDeviceFloppy, IconWorld } from '@tabler/icons-react';
import PropField from './PropField';
import styles from './inspector.module.css';
import {
  ADVANCED_SECTION_ORDER,
  advancedSectionFor,
  breakpointKey,
  groupPropsBySection,
} from './inspector.utils';
import type { PropertyTabProps } from './ContentTab';
import ResponsiveVisibilityControls from '../ResponsiveVisibilityControls';
import ConvertToGlobalSectionModal from '../ConvertToGlobalSectionModal';

const VISIBILITY_PROP_NAMES = ['styleHideDesktop', 'styleHideTablet', 'styleHideMobile'] as const;

export default function AdvancedTab({
  fields,
  draft,
  propsMeta,
  activeViewport,
  setLocal,
  commit,
  setAndCommit,
  onOpenMediaPicker,
  onOpenCropper,
  nodeType,
  onSavePreset,
  onConvertToGlobalSection,
}: PropertyTabProps): JSX.Element {
  const [presetModalOpened, setPresetModalOpened] = useState(false);
  const [presetName, setPresetName] = useState('');
  /** Modal "Converti in Sezione Globale" (ADR-55), aperto dal pulsante montato solo quando `onConvertToGlobalSection` è definito — vedi il suo commento in `ContentTab.tsx`. */
  const [convertModalOpened, setConvertModalOpened] = useState(false);
  const activeBreakpoint = breakpointKey(activeViewport);
  const sections = groupPropsBySection(fields, advancedSectionFor, ADVANCED_SECTION_ORDER);
  const visibilityFields = new Set<string>(VISIBILITY_PROP_NAMES);

  const canSavePreset = (nodeType === 'section' || nodeType === 'container') && onSavePreset;
  /**
   * Nessun ulteriore controllo su `nodeType`/posizione qui: `onConvertToGlobalSection`
   * arriva già `undefined` da `PropertyInspector.tsx` per ogni nodo che non sia un
   * contenitore/`section` di primo livello (unica fonte di verità sull'ammissibilità, mai
   * duplicata in questa scheda).
   */
  const canConvertToGlobalSection = Boolean(onConvertToGlobalSection);

  function handleSavePreset(): void {
    const name = presetName.trim();
    if (!name || !onSavePreset) return;
    onSavePreset(name);
    setPresetName('');
    setPresetModalOpened(false);
  }

  return (
    <Stack gap="sm">
      <Accordion
      multiple
      defaultValue={sections.map((section) => section.section)}
      variant="separated"
    >
      {sections.map((section) => (
        <Accordion.Item key={section.section} value={section.section}>
          <Accordion.Control>{section.section}</Accordion.Control>
          <Accordion.Panel>
            <div className={styles.fieldList}>
              {section.section === 'Layout & Responsive' &&
                section.items.some((prop) => visibilityFields.has(prop.name)) && (
                  <ResponsiveVisibilityControls
                    value={{
                      hideDesktop: draft.styleHideDesktop === true,
                      hideTablet: draft.styleHideTablet === true,
                      hideMobile: draft.styleHideMobile === true,
                    }}
                    onChange={(next) => {
                      const nextValues = {
                        styleHideDesktop: next.hideDesktop === true,
                        styleHideTablet: next.hideTablet === true,
                        styleHideMobile: next.hideMobile === true,
                      };
                      for (const [name, nextValue] of Object.entries(nextValues)) {
                        if (!Object.is(draft[name], nextValue)) setAndCommit(name, nextValue);
                      }
                    }}
                  />
                )}
              {section.items
                .filter((prop) => !visibilityFields.has(prop.name))
                .map((prop) => (
                  <PropField
                    key={prop.name}
                    prop={prop}
                    value={draft[prop.name]}
                    propsMeta={propsMeta}
                    activeViewport={activeViewport}
                    activeBreakpoint={activeBreakpoint}
                    onLocal={(next) => setLocal(prop.name, next)}
                    onCommit={(next) => commit(prop.name, next)}
                    onSetAndCommit={(next) => setAndCommit(prop.name, next)}
                    onOpenMediaPicker={() => onOpenMediaPicker(prop.name)}
                    onOpenCropper={() => onOpenCropper(prop.name)}
                  />
                ))}
            </div>
          </Accordion.Panel>
        </Accordion.Item>
      ))}
      </Accordion>
      {canSavePreset && (
        <Button
          variant="light"
          leftSection={<IconDeviceFloppy size={16} />}
          onClick={() => setPresetModalOpened(true)}
        >
          Salva come Preset
        </Button>
      )}
      {canConvertToGlobalSection && (
        <Button
          variant="light"
          color="violet"
          leftSection={<IconWorld size={16} />}
          onClick={() => setConvertModalOpened(true)}
        >
          Converti in Sezione Globale
        </Button>
      )}
      <Modal
        opened={presetModalOpened}
        onClose={() => setPresetModalOpened(false)}
        title="Salva come Preset"
        centered
      >
        <Stack>
          <TextInput
            label="Nome del preset"
            placeholder="Es. Hero aziendale"
            value={presetName}
            onChange={(event) => setPresetName(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') handleSavePreset();
            }}
            data-autofocus
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setPresetModalOpened(false)}>
              Annulla
            </Button>
            <Button onClick={handleSavePreset} disabled={!presetName.trim()}>
              Salva
            </Button>
          </Group>
        </Stack>
      </Modal>
      {/*
        "Converti in Sezione Globale" (ADR-55): stesso `ConvertToGlobalSectionModal.tsx`
        montato anche da `EditorBlockWrapper.tsx` (Floating Toolbar) — un solo componente,
        mai due implementazioni del nome+conferma. `onConfirm` è già chiuso sul nodo
        selezionato da `PropertyInspector.tsx`, questa scheda non conosce l'id del nodo.
      */}
      {convertModalOpened && onConvertToGlobalSection && (
        <ConvertToGlobalSectionModal
          opened
          onClose={() => setConvertModalOpened(false)}
          onConfirm={onConvertToGlobalSection}
          blockLabel={nodeType === 'section' ? 'Sezione' : 'Contenitore'}
        />
      )}
    </Stack>
  );
}
