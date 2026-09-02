import { BlockDefinition } from '../block-definition.types';

/**
 * `form-submit` — nono tipo del registro (ADR-46 § 1, RFC-46 D1): pulsante di
 * invio di un `form`. Tipo a sé, **non** riuso di `button` — `button.href` è
 * obbligatoria (ADR-21 § 5) e un submit non collega a nessuna URL: forzare
 * `href` opzionale su `button` significherebbe incrementare il `v` di un
 * tipo già in produzione (deploy a senso unico, ADR-21 § 1) per ogni nodo
 * `button` mai scritto, per un beneficio nullo (RFC-46 D1). Foglia.
 */
export const formSubmitBlock: BlockDefinition = {
  type: 'form-submit',
  v: 1,
  props: {
    label: {
      kind: 'plainText',
      required: false,
      maxLength: 80,
      default: 'Invia',
    },
  },
  children: { allow: [] },
  migrations: [],
  enabled: true,
  meta: {
    label: 'Pulsante invio modulo',
    category: 'form',
    icon: 'send',
    props: {
      label: { label: 'Etichetta', order: 1 },
    },
  },
};
