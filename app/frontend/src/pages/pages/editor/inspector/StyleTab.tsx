/**
 * Scheda "Stile" dell'ispettore (ADR-30 § 1): le props filtrate da `groupPropsByTab` per
 * `tab: 'style'`, raggruppate in sezioni Accordion stile Elementor (`groupPropsBySection`/
 * `styleSectionFor`, T-inspector-elementor-parity) — "Tipografia & Colori", "Bordo",
 * "Ombra", "Spaziatura`. Tutte le sezioni popolate restano aperte di default (`Accordion`
 * `multiple` + `defaultValue`).
 *
 * Un'unica eccezione dentro la sezione "Spaziatura": le otto prop di spaziatura per lato
 * (`stylePaddingTop/Right/Bottom/Left`, `styleMarginTop/Right/Bottom/Left`, ADR-33 § 4) si
 * raggruppano in un solo `VisualBoxModelInspector` **quando il tipo in editing le dichiara
 * tutte e otto** — un tipo futuro con solo alcune di quelle otto (oggi non reale) ricade sul
 * rendering individuale via `PropField`, mai un'assunzione che siano sempre tutte presenti.
 * Stessa logica di prima di questo restyle, solo spostata dentro la sezione invece che
 * sull'intera scheda.
 */
import type { BlockPropDescriptor } from '../../../../types/blocks.types';
import { Accordion } from '@mantine/core';
import VisualBoxModelInspector from '../VisualBoxModelInspector';
import PropField from './PropField';
import styles from './inspector.module.css';
import {
  breakpointKey,
  groupPropsBySection,
  SPACING_SLIDER_PROPS,
  STYLE_SECTION_ORDER,
  styleSectionFor,
} from './inspector.utils';
import type { PropertyTabProps } from './ContentTab';

/** Nome della sezione Accordion che riceve il trattamento speciale del box model. */
const SPACING_SECTION_NAME = 'Spaziatura';

export default function StyleTab({
  fields,
  draft,
  propsMeta,
  activeViewport,
  setLocal,
  commit,
  setAndCommit,
  onOpenMediaPicker,
}: PropertyTabProps): JSX.Element {
  const activeBreakpoint = breakpointKey(activeViewport);

  function renderPropField(prop: BlockPropDescriptor): JSX.Element {
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
      />
    );
  }

  /** Rende il contenuto della sezione "Spaziatura": box model se completa, altrimenti campi singoli. */
  function renderSpacingSection(sectionFields: readonly BlockPropDescriptor[]): JSX.Element {
    const spacingByName = new Map(
      sectionFields
        .filter((field) => SPACING_SLIDER_PROPS.has(field.name))
        .map((field) => [field.name, field]),
    );
    const hasFullBoxModel = spacingByName.size === SPACING_SLIDER_PROPS.size;

    if (!hasFullBoxModel) {
      return <div className={styles.fieldList}>{sectionFields.map(renderPropField)}</div>;
    }

    const rendered: JSX.Element[] = [];
    let boxModelInserted = false;
    for (const field of sectionFields) {
      if (SPACING_SLIDER_PROPS.has(field.name)) {
        if (!boxModelInserted) {
          rendered.push(
            <VisualBoxModelInspector
              key="visual-box-model"
              spacingProps={{
                stylePaddingTop: spacingByName.get('stylePaddingTop')!,
                stylePaddingRight: spacingByName.get('stylePaddingRight')!,
                stylePaddingBottom: spacingByName.get('stylePaddingBottom')!,
                stylePaddingLeft: spacingByName.get('stylePaddingLeft')!,
                styleMarginTop: spacingByName.get('styleMarginTop')!,
                styleMarginRight: spacingByName.get('styleMarginRight')!,
                styleMarginBottom: spacingByName.get('styleMarginBottom')!,
                styleMarginLeft: spacingByName.get('styleMarginLeft')!,
              }}
              draft={draft}
              propsMeta={propsMeta}
              activeViewport={activeViewport}
              setAndCommit={setAndCommit}
            />,
          );
          boxModelInserted = true;
        }
        continue;
      }
      rendered.push(renderPropField(field));
    }
    return <div className={styles.fieldList}>{rendered}</div>;
  }

  const sections = groupPropsBySection(fields, styleSectionFor, STYLE_SECTION_ORDER);

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
            {section.section === SPACING_SECTION_NAME ? (
              renderSpacingSection(section.items)
            ) : (
              <div className={styles.fieldList}>{section.items.map(renderPropField)}</div>
            )}
          </Accordion.Panel>
        </Accordion.Item>
      ))}
    </Accordion>
  );
}
