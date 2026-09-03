/**
 * Scheda "Contenuto" dell'ispettore (ADR-30 § 1): le props già filtrate da
 * `groupPropsByTab` per `tab: 'content'`, raggruppate in sezioni Accordion stile Elementor
 * (`groupPropsBySection`/`contentSectionFor`, T-inspector-elementor-parity) — "Testo /
 * Media" e "Allineamento". Tutte le sezioni popolate restano aperte di default
 * (`Accordion` `multiple` + `defaultValue`): nessun campo esistente finisce dietro un click
 * extra rispetto a prima di questo restyle. Ogni prop resta resa da `PropField` (unico punto
 * di dispaccio per `kind`, vedi il suo commento di testa) — questo file decide solo *in
 * quale sezione* mostrarla, mai un ramo diverso per tipo di blocco.
 */
import type { BlockPropDescriptor } from '../../../../types/blocks.types';
import type { EditorViewport } from '../../../../hooks/useBlockEditorStore';
import { Accordion } from '@mantine/core';
import PropField from './PropField';
import styles from './inspector.module.css';
import {
  breakpointKey,
  CONTENT_SECTION_ORDER,
  contentSectionFor,
  groupPropsBySection,
  type PropsMeta,
} from './inspector.utils';

export interface PropertyTabProps {
  fields: readonly BlockPropDescriptor[];
  /** Bozza locale del form (`PropertyForm.draft`): unica fonte di verità, mai duplicata qui. */
  draft: Record<string, unknown>;
  propsMeta: PropsMeta;
  activeViewport: EditorViewport;
  setLocal: (name: string, value: unknown) => void;
  commit: (name: string, value: unknown) => void;
  setAndCommit: (name: string, value: unknown) => void;
  onOpenMediaPicker: (propName: string) => void;
  /** Apre `MediaCropperModal` sul `guid` corrente della prop (solo `kind: 'mediaRef'`). */
  onOpenCropper: (propName: string) => void;
  nodeType?: string;
  onSavePreset?: (name: string) => void;
}

export default function ContentTab({
  fields,
  draft,
  propsMeta,
  activeViewport,
  setLocal,
  commit,
  setAndCommit,
  onOpenMediaPicker,
  onOpenCropper,
}: PropertyTabProps): JSX.Element {
  const activeBreakpoint = breakpointKey(activeViewport);

  function renderField(prop: BlockPropDescriptor): JSX.Element {
    return (
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
    );
  }

  const sections = groupPropsBySection(fields, contentSectionFor, CONTENT_SECTION_ORDER);

  return (
    <Accordion
      multiple
      defaultValue={sections.map((section) => section.section)}
      variant="separated"
    >
      {sections.map((section) => (
        <Accordion.Item key={section.section} value={section.section}>
          <Accordion.Control>{section.section}</Accordion.Control>
          <Accordion.Panel>
            <div className={styles.fieldList}>{section.items.map(renderField)}</div>
          </Accordion.Panel>
        </Accordion.Item>
      ))}
    </Accordion>
  );
}
