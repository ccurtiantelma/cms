import { RESPONSIVE_BREAKPOINTS } from './types';

/**
 * Compone la lista di classi CSS Module da applicare per una prop di stile
 * responsive (ADR-29 § 2/§ 4). Emette **una classe per ogni breakpoint
 * presente nel valore salvato**, mai solo `default`: un renderer che ignora
 * `tablet`/`mobile` perde silenziosamente contenuto salvato (ADR-29
 * Conseguenza, PLAN-F04c-editor-maturo.md T5).
 *
 * Il valore non è rivalidato qui (resta autorità del server,
 * SPEC-F02-blocchi.md § 5.3): un valore assente, non-oggetto, o con un
 * token sconosciuto produce semplicemente nessuna classe per quella voce —
 * mai un errore che romperebbe il blocco (l'Error Boundary è l'ultima
 * difesa, non la prima).
 *
 * @param styles Oggetto esportato da un import `*.module.css` (nomi già
 *   hashati da Vite).
 * @param slot Prefisso della prop nel foglio dei token (es. `'spaceBefore'`),
 *   coerente con i nomi delle classi in `style-tokens.module.css`.
 * @param value Valore grezzo della prop così come arriva da `node.props`.
 */
export function resolveResponsiveClassNames(
  styles: Record<string, string>,
  slot: string,
  value: unknown,
): string {
  if (typeof value !== 'object' || value === null) {
    return '';
  }
  const envelope = value as Record<string, unknown>;
  const classNames: string[] = [];
  for (const breakpoint of RESPONSIVE_BREAKPOINTS) {
    const token = envelope[breakpoint];
    if (typeof token !== 'string') continue;
    const className = styles[`${slot}_${breakpoint}_${token}`];
    if (className) classNames.push(className);
  }
  return classNames.join(' ');
}

/**
 * Risolve la classe CSS Module per una prop di stile **non responsive** (ADR-33 § 1/§ 2:
 * `contentWidth`/`maxWidth`/`columnRatio` di `section`) — controparte scalare di
 * {@link resolveResponsiveClassNames}, senza breakpoint: il valore salvato è già lo
 * scalare atteso (nessun envelope `{ default, tablet?, mobile? }`).
 *
 * Stessa tolleranza di {@link resolveResponsiveClassNames}: un valore assente, non
 * stringa o con un token sconosciuto produce nessuna classe, mai un errore (l'Error
 * Boundary del blocco è l'ultima difesa, non la prima).
 *
 * @param styles Oggetto esportato da un import `*.module.css` (nomi già hashati da Vite).
 * @param slot Prefisso della prop nel foglio dei token (es. `'contentWidth'`).
 * @param value Valore grezzo della prop così come arriva da `node.props`.
 */
export function resolveScalarClassName(
  styles: Record<string, string>,
  slot: string,
  value: unknown,
): string {
  if (typeof value !== 'string') {
    return '';
  }
  return styles[`${slot}_${value}`] ?? '';
}
