/**
 * Toggle Normal/Hover per i controlli che dichiarano `prop.stateful === true` (ADR-75).
 *
 * Scope minimo dichiarato dal Sub-Task S2.3 (nessun documento firmato specifica una chrome
 * per lo *state switcher*, solo che debba esistere — ADR-75 § "Conseguenze": "l'inspector
 * introduce lo state switcher come componente condiviso da ogni sezione Stile che dichiara
 * almeno una prop stateful"): un piccolo `SegmentedControl` a 2 voci DENTRO ciascun field
 * component (`ColorField`/`TypographyField`/`BorderField`/`ShadowField`), non una chrome
 * globale a livello di `PropertyInspector.tsx`/`StyleTab.tsx` — nessun punto di innesto
 * naturale per una chrome unica è stato trovato senza introdurre uno stato condiviso fra
 * campi che oggi non esiste (ogni prop `stateful` può avere il proprio stato in editing in un
 * dato momento, coerente con ADR-75 § "Decisione" punto 6: la combinazione è una proprietà
 * del descrittore, non del pannello). Solo Normal/Hover: `focus`/`active` restano riservati a
 * un round futuro (ADR-75 § "Decisione" punto 3) e non sono mai scritti da questo switcher —
 * chi costruisce la patch (`buildStatefulResponsivePropPatch`/`buildTypographyFieldPatch`,
 * `inspector.utils.ts`) preserva quei rami con lo spread dell'envelope corrente, mai un
 * sovrascrittura totale.
 */
import { SegmentedControl } from '@mantine/core';

/** I due soli stati che questo switcher espone (vedi il commento di testa del file). */
export type EditableStateName = 'normal' | 'hover';

export interface StateSwitcherProps {
  value: EditableStateName;
  onChange: (state: EditableStateName) => void;
}

/** `SegmentedControl` Normal/Hover, compatto (`size="xs"`) per stare accanto all'etichetta del campo. */
export default function StateSwitcher({ value, onChange }: StateSwitcherProps): JSX.Element {
  return (
    <SegmentedControl
      size="xs"
      value={value}
      onChange={(next) => onChange(next as EditableStateName)}
      data={[
        { value: 'normal', label: 'Normal' },
        { value: 'hover', label: 'Hover' },
      ]}
    />
  );
}
