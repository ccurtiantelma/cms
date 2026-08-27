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
import { Accordion } from '@mantine/core';
import PropField from './PropField';
import styles from './inspector.module.css';
import {
  ADVANCED_SECTION_ORDER,
  advancedSectionFor,
  breakpointKey,
  groupPropsBySection,
} from './inspector.utils';
import type { PropertyTabProps } from './ContentTab';

export default function AdvancedTab({
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
  const sections = groupPropsBySection(fields, advancedSectionFor, ADVANCED_SECTION_ORDER);

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
            <div className={styles.fieldList}>
              {section.items.map((prop) => (
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
              ))}
            </div>
          </Accordion.Panel>
        </Accordion.Item>
      ))}
    </Accordion>
  );
}
