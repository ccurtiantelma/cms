/**
 * Blocco `container`: sesto tipo del registro (ADR-39, approvata 2026-08-27), contenitore
 * generico a layout flex con nesting ricorsivo (`children.allow: '*'`, incluso
 * container-in-container). Sei props: `display` (`enum` non responsive, un solo valore
 * `'flex'` in questo round — nessun `'grid'`, ADR-39 § 2 punto 1), `flexDirection`/
 * `justifyContent`/`alignItems`/`wrap`/`gap` (`enum` responsive, stesso schema
 * `{ default, tablet?, mobile? }` di ADR-29), più `customCssClass`/`customElementId`
 * (ADR-38 § 6). Nessuna prop di stile (`styleBorder`/`styleShadow`/`styleSpaceBefore/
 * After` ecc.) in questo round — `container` è layout puro (ADR-39 § 2, "Alternative
 * scartate"). Il rendering dei figli è delegato al chiamante (`BlockRenderer`), che
 * ricorre e applica il proprio Error Boundary a ciascuno — stesso principio di `Section`.
 */
import type { ReactNode } from 'react';
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
  customCssClass?: unknown;
  customElementId?: unknown;
}

export default function Container({
  children,
  flexDirection,
  justifyContent,
  alignItems,
  wrap,
  gap,
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

  return (
    <div
      className={className}
      id={typeof customElementId === 'string' && customElementId ? customElementId : undefined}
    >
      {children}
    </div>
  );
}
