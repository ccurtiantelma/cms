/**
 * Scheda "Stile" dell'ispettore (ADR-30 § 1): le props filtrate da `groupPropsByTab` per
 * `tab: 'style'`. Stessa base di `ContentTab.tsx` (un `PropField` per prop), con un'unica
 * eccezione: le otto prop di spaziatura per lato (`stylePaddingTop/Right/Bottom/Left`,
 * `styleMarginTop/Right/Bottom/Left`, ADR-33 § 4) si raggruppano in un solo
 * `VisualBoxModelInspector` **quando il tipo in editing le dichiara tutte e otto** — un
 * tipo futuro con solo alcune di quelle otto (oggi non reale) ricade sul rendering
 * individuale via `PropField`, mai un'assunzione che siano sempre tutte presenti. L'ordine
 * delle altre prop di stile resta quello dichiarato dal registro; il box model prende il
 * posto della prima prop di spaziatura incontrata, le successive vengono saltate (già rese
 * lì dentro).
 */
import type { BlockPropDescriptor } from '../../../../types/blocks.types';
import VisualBoxModelInspector from '../VisualBoxModelInspector';
import PropField from './PropField';
import styles from './inspector.module.css';
import { breakpointKey, SPACING_SLIDER_PROPS } from './inspector.utils';
import type { PropertyTabProps } from './ContentTab';

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
  const spacingByName = new Map(
    fields
      .filter((field) => SPACING_SLIDER_PROPS.has(field.name))
      .map((field) => [field.name, field]),
  );
  const hasFullBoxModel = spacingByName.size === SPACING_SLIDER_PROPS.size;

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

  if (!hasFullBoxModel) {
    return <div className={styles.fieldList}>{fields.map(renderPropField)}</div>;
  }

  const rendered: JSX.Element[] = [];
  let boxModelInserted = false;
  for (const field of fields) {
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
