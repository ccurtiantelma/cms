/**
 * Toggle Normal/Hover/Focus per i controlli che dichiarano `prop.stateful === true` (ADR-75).
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
 * del descrittore, non del pannello). Espone Normal/Hover/Focus (
 * l'enum a 4 stati di ADR-75 § "Decisione" punto 3, il validator e `to-css.ts` già li
 * supportano); `active` resta riservato a un round futuro e non è mai scritto da questo
 * switcher — chi costruisce la patch (`buildStatefulResponsivePropPatch`/`buildTypographyFieldPatch`,
 * `inspector.utils.ts`) preserva quei rami con lo spread dell'envelope corrente, mai un
 * sovrascrittura totale.
 */
import type { ReactNode } from 'react';
import { Center, Group, SegmentedControl } from '@mantine/core';
import { IconFocus2, IconHandFinger, IconPointer } from '@tabler/icons-react';

/** Gli stati che questo switcher espone (vedi il commento di testa del file). */
export type EditableStateName = 'normal' | 'hover' | 'focus';

export interface StateSwitcherProps {
  value: EditableStateName;
  onChange: (state: EditableStateName) => void;
  /** Variante di pannello (scheda Stile): larga quanto la colonna, con icona per stato. */
  global?: boolean;
}

const STATE_DEFS: readonly { value: EditableStateName; label: string; icon: ReactNode }[] = [
  { value: 'normal', label: 'Normal', icon: <IconHandFinger size={14} /> },
  { value: 'hover', label: 'Hover', icon: <IconPointer size={14} /> },
  { value: 'focus', label: 'Focus', icon: <IconFocus2 size={14} /> },
];

/** `SegmentedControl` Normal/Hover/Focus, compatto (`size="xs"`) per stare accanto all'etichetta del campo. */
export default function StateSwitcher({
  value,
  onChange,
  global = false,
}: StateSwitcherProps): JSX.Element {
  return (
    <SegmentedControl
      size="xs"
      fullWidth={global}
      value={value}
      onChange={(next) => onChange(next as EditableStateName)}
      data={STATE_DEFS.map((def) => ({
        value: def.value,
        label: global ? (
          <Center>
            <Group gap={6} wrap="nowrap">
              {def.icon}
              <span>{def.label}</span>
            </Group>
          </Center>
        ) : (
          def.label
        ),
      }))}
    />
  );
}
