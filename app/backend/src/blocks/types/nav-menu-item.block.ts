import { BlockDefinition } from '../block-definition.types';

/**
 * `navMenuItem` — undicesimo tipo del registro (ADR-52 § 1/§ 2): una singola
 * voce dentro un `navMenu`. Foglia (`children.allow: []`), **non** ammessa a
 * `ROOT_ALLOWED` — stesso trattamento di `form-field`/`form-submit`
 * (ADR-46 § 1).
 *
 * `pageGuid` (nuovo `kind: 'pageRef'`, ADR-52 § 3) e `url` (`kind: 'url'`
 * esistente) sono entrambi opzionali: nessuno dei due è obbligatorio da
 * solo, una voce senza link plausibile resta un'etichetta senza `href`, mai
 * un nodo respinto (ADR-52 § 2). Quale dei due vince quando entrambi sono
 * presenti (`url` vince su `pageGuid`, link esterno esplicito) è
 * comportamento del **consumer** (renderer), non del registro — qui si
 * dichiarano solo le due prop, entrambe opzionali. Il registro non persiste
 * mai a scrittura la verifica di esistenza/stato di `pageGuid`: la
 * risoluzione `pageGuid → slug` + il filtro "solo `published`" avvengono
 * nella pipeline SSR di `app/public-site` (ADR-52 § 4), stesso principio di
 * `mediaRef`.
 */
export const navMenuItemBlock: BlockDefinition = {
  type: 'navMenuItem',
  v: 1,
  props: {
    label: {
      kind: 'plainText',
      required: true,
      maxLength: 80,
    },
    pageGuid: {
      kind: 'pageRef',
      required: false,
    },
    url: {
      kind: 'url',
      required: false,
      maxLength: 2048,
    },
    target: {
      kind: 'enum',
      required: false,
      values: ['_self', '_blank'],
      default: '_self',
    },
  },
  children: { allow: [] },
  migrations: [],
  enabled: true,
  meta: {
    label: 'Voce di menu',
    category: 'navigazione',
    icon: 'link',
    props: {
      label: { label: 'Etichetta', order: 1 },
      pageGuid: {
        label: 'Pagina collegata',
        order: 2,
        help:
          'Pagina interna a cui la voce rimanda. Se è impostato anche un URL, l\'URL vince.',
      },
      url: {
        label: 'URL',
        order: 3,
        help: 'Link esterno o assoluto. Se presente, vince sulla Pagina collegata.',
      },
      target: { label: 'Apertura link', order: 4 },
    },
  },
};
