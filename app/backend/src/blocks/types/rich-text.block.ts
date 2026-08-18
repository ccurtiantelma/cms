import { BlockDefinition } from '../block-definition.types';

/**
 * `richText` — frammento di testo formattato (SPEC-F02-blocchi.md § 3.4).
 * `html` usa il profilo `basic` (ADR-20/ADR-21 § 4); la sanitizzazione vera
 * e propria è T3, fuori scope qui. Stringa vuota ammessa. Foglia.
 */
export const richTextBlock: BlockDefinition = {
  type: 'richText',
  v: 1,
  props: {
    html: {
      kind: 'richText',
      profile: 'basic',
      required: true,
      maxLength: 20000,
    },
  },
  children: { allow: [] },
  migrations: [],
  enabled: true,
  meta: { label: 'Testo', category: 'testo' },
};
