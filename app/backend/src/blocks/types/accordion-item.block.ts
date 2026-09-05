import { BlockDefinition } from '../block-definition.types';

/**
 * `accordionItem` — quattordicesimo tipo del registro (ADR-57 § Decisione
 * punto 1/2): una singola voce dentro un `accordion`. Non in `ROOT_ALLOWED`
 * (stesso trattamento di `navMenuItem`/`form-field`, ADR-52 § 1/ADR-46 § 1):
 * un pannello isolato senza il proprio `accordion` non ha senso CSS-only
 * (nessun `<details>` che lo ospiti).
 *
 * `children.allow` limitato per v1 a `['heading','richText','image','button',
 * 'container']` — mai un altro widget interattivo di questo gruppo
 * (`accordion`/`tabs`/`carousel`/`modalTrigger`/le rispettive voci), per
 * evitare conflitti CSS-only da annidamento (name-space condivisi, target
 * `:target` multipli — ADR-57 § 2).
 *
 * `title` (`plainText`, obbligatoria, `maxLength: 120`): l'etichetta mostrata
 * nel `<summary>` nativo — testo semplice, mai rich text (coerente con
 * `navMenuItem.label`).
 */
export const accordionItemBlock: BlockDefinition = {
  type: 'accordionItem',
  v: 1,
  props: {
    title: {
      kind: 'plainText',
      required: true,
      maxLength: 120,
    },
  },
  children: { allow: ['heading', 'richText', 'image', 'button', 'container'] },
  migrations: [],
  enabled: true,
  meta: {
    label: 'Voce accordion',
    category: 'interattivo',
    icon: 'chevron-down',
    props: {
      title: { label: 'Titolo', order: 1 },
    },
  },
};
