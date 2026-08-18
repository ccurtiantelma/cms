import { BlockDefinition } from '../block-definition.types';

/**
 * `button` — pulsante/link (SPEC-F02-blocchi.md § 3.6). `href` ammette solo
 * `http`/`https`/`mailto`/root-relative (una sola barra iniziale); nessuna
 * prop di rendering (`variant`, `size`, `icon`). Foglia.
 */
export const buttonBlock: BlockDefinition = {
  type: 'button',
  v: 1,
  props: {
    label: {
      kind: 'plainText',
      required: true,
      maxLength: 80,
    },
    href: {
      kind: 'url',
      required: true,
      maxLength: 2048,
    },
  },
  children: { allow: [] },
  migrations: [],
  enabled: true,
  meta: { label: 'Pulsante', category: 'azione' },
};
