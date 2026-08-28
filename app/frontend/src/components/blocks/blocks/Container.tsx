/**
 * Blocco `container`: sesto tipo del registro (ADR-39, approvata 2026-08-27), contenitore
 * generico a layout flex con nesting ricorsivo (`children.allow: '*'`, incluso
 * container-in-container). `display` (`enum` non responsive, un solo valore
 * `'flex'` in questo round — nessun `'grid'`, ADR-39 § 2 punto 1), `flexDirection`/
 * `justifyContent`/`alignItems`/`wrap`/`gap` (`enum` responsive, stesso schema
 * `{ default, tablet?, mobile? }` di ADR-29), `customCssClass`/`customElementId`
 * (ADR-38 § 6), più `styleFlexBasis` (`kind: 'unitValue'`, unità `%`): unica prop di stile
 * del tipo, ora dichiarata dal registro (`container.block.ts`) — l'eccezione a "container è
 * layout puro" di ADR-39 § 2. Il rendering dei figli è delegato al chiamante
 * (`BlockRenderer`), che ricorre e applica il proprio Error Boundary a ciascuno — stesso
 * principio di `Section`.
 */
import type { CSSProperties, ReactNode } from 'react';
import styles from './Container.module.css';
import tokenStyles from '../style-tokens.module.css';
import { resolveResponsiveClassNames } from '../style-tokens';

interface ContainerProps {
  children: ReactNode;
  display?: unknown;
  flexDirection?: unknown;
  justifyContent?: unknown;
  alignItems?: unknown;
  wrap?: unknown;
  gap?: unknown;
  styleFlexBasis?: unknown;
  styleBackgroundColor?: unknown;
  styleColor?: unknown;
  customCssClass?: unknown;
  customElementId?: unknown;
}

/** Forma runtime del valore persistito per `styleFlexBasis` (`kind: 'unitValue'`, ADR-38 § 2). */
interface FlexBasisValue {
  value: number;
  unit: string;
}

function isFlexBasisValue(value: unknown): value is FlexBasisValue {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as FlexBasisValue).value === 'number' &&
    typeof (value as FlexBasisValue).unit === 'string'
  );
}

export default function Container({
  children,
  flexDirection,
  justifyContent,
  alignItems,
  wrap,
  gap,
  styleFlexBasis,
  styleBackgroundColor,
  styleColor,
  customCssClass,
  customElementId,
}: ContainerProps) {
  // `display` non compare qui: un solo valore possibile (`'flex'`, ADR-39 § 2 punto 1),
  // già impostato staticamente da `.container` in `Container.module.css` — un token
  // dedicato per un enum a valore singolo sarebbe codice speculativo per un requisito
  // ipotetico (CLAUDE.md), aggiunto solo se una futura ADR introduce un secondo valore.
  const className = [
    styles.container,
    resolveResponsiveClassNames(tokenStyles, 'flexDirection', flexDirection),
    resolveResponsiveClassNames(tokenStyles, 'justifyContent', justifyContent),
    resolveResponsiveClassNames(tokenStyles, 'alignItems', alignItems),
    resolveResponsiveClassNames(tokenStyles, 'wrap', wrap),
    resolveResponsiveClassNames(tokenStyles, 'gap', gap),
    typeof customCssClass === 'string' && customCssClass ? customCssClass : '',
  ]
    .filter(Boolean)
    .join(' ');

  /**
   * `flexGrow: 0` accompagna sempre `flexBasis`: senza, il default `flex-grow: 0` di un
   * container non basterebbe da solo a impedire che la riga lo riespanda oltre la larghezza
   * scelta appena c'è spazio residuo — stesso motivo per cui il canvas dell'editor applica
   * `flexGrow`/`flexShrink` insieme (`EditorBlockWrapper.tsx`).
   */
  const flexBasisValue = isFlexBasisValue(styleFlexBasis) ? styleFlexBasis : undefined;
  const style: CSSProperties = {
    ...(flexBasisValue
      ? { flexBasis: `${flexBasisValue.value}${flexBasisValue.unit}`, flexGrow: 0 }
      : {}),
    ...(typeof styleBackgroundColor === 'string' && styleBackgroundColor
      ? { backgroundColor: styleBackgroundColor }
      : {}),
    ...(typeof styleColor === 'string' && styleColor ? { color: styleColor } : {}),
  };

  return (
    <div
      className={className}
      id={typeof customElementId === 'string' && customElementId ? customElementId : undefined}
      style={Object.keys(style).length > 0 ? style : undefined}
    >
      {children}
    </div>
  );
}
