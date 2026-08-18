import { BlockDefinition } from '../block-definition.types';

/**
 * `heading` — titolo (SPEC-F02-blocchi.md § 3.3). `level` esclude `h1`:
 * l'unico `h1` del documento appartiene al template del consumer HTML, mai
 * a un blocco. Foglia (`children.allow: []`).
 */
export const headingBlock: BlockDefinition = {
  type: 'heading',
  v: 1,
  props: {
    level: {
      kind: 'enum',
      required: true,
      values: ['h2', 'h3', 'h4', 'h5', 'h6'],
    },
    text: {
      kind: 'plainText',
      required: true,
      maxLength: 200,
    },
  },
  children: { allow: [] },
  migrations: [],
  enabled: true,
  meta: { label: 'Titolo', category: 'testo' },
};
