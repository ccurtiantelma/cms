/**
 * Scheda "Avanzato" dell'ispettore (ADR-37 § 5): le props filtrate da `groupPropsByTab` per
 * `tab: 'advanced'` (`styleLayer`, `styleHideDesktop/Tablet/Mobile`), ciascuna resa da
 * `PropField` come in `ContentTab.tsx` — nessun raggruppamento speciale come in
 * `StyleTab.tsx`, perché queste quattro props sono indipendenti fra loro (ADR-37 § 3).
 */
import PropField from './PropField';
import styles from './inspector.module.css';
import { breakpointKey } from './inspector.utils';
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
  return (
    <div className={styles.fieldList}>
      {fields.map((prop) => (
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
  );
}
