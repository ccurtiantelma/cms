import { BlockDefinition } from '../block-definition.types';

/**
 * `image` — immagine (SPEC-F02-blocchi.md § 3.5). `mediaRef` valida solo la
 * forma del `guid` (16 hex): nessuna verifica di esistenza, la risoluzione è
 * di F09. `alt` è l'unica prop dei cinque tipi con vincolo di non-vuoto
 * (NFR § Accessibilità). Foglia.
 */
export const imageBlock: BlockDefinition = {
  type: 'image',
  v: 1,
  props: {
    mediaRef: {
      kind: 'mediaRef',
      required: true,
    },
    alt: {
      kind: 'plainText',
      required: true,
      nonEmpty: true,
      maxLength: 300,
    },
  },
  children: { allow: [] },
  migrations: [],
  enabled: true,
  meta: { label: 'Immagine', category: 'media' },
};
