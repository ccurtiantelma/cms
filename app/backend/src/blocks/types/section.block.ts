import { BlockDefinition } from '../block-definition.types';

/**
 * `section` — l'unico contenitore del primo rilascio (ADR-21 § 5,
 * SPEC-F02-blocchi.md § 3.2). Nessuna prop dichiarata: qualunque prop
 * inviata produce `BLOCK_PROP_NOT_DECLARED`. Non contiene se stessa — la
 * profondità è 1 per costruzione nel primo rilascio.
 */
export const sectionBlock: BlockDefinition = {
  type: 'section',
  v: 1,
  props: {},
  children: { allow: ['heading', 'richText', 'image', 'button'] },
  migrations: [],
  enabled: true,
  meta: { label: 'Sezione', category: 'layout' },
};
