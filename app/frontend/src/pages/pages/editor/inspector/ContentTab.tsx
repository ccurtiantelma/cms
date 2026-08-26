/**
 * Scheda "Contenuto" dell'ispettore (ADR-30 § 1): le props già filtrate da
 * `groupPropsByTab` per `tab: 'content'`, ciascuna resa da `PropField` (unico punto di
 * dispaccio per `kind`, vedi il suo commento di testa). Nessuna logica di dominio qui: solo
 * il ciclo di montaggio e il filo visivo fra un campo e il successivo (`inspector.module.css`).
 */
import type { BlockPropDescriptor } from '../../../../types/blocks.types';
import type { EditorViewport } from '../../../../hooks/useBlockEditorStore';
import PropField from './PropField';
import styles from './inspector.module.css';
import { breakpointKey, type PropsMeta } from './inspector.utils';

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
