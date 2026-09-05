import { BlockDefinition } from '../block-definition.types';

/**
 * `tabPanel` — sedicesimo tipo del registro (ADR-57 § Decisione punto 1/2):
 * un singolo pannello dentro un `tabs`. Non in `ROOT_ALLOWED` (stesso
 * trattamento di `navMenuItem`/`accordionItem`): un pannello isolato senza
 * il proprio `tabs` non ha senso CSS-only (nessun radio-hack che lo ospiti).
 *
 * `children.allow` limitato per v1 a `['heading','richText','image','button',
 * 'container']`, stesso principio e stesso motivo di `accordionItem`
 * (ADR-57 § 2): mai un altro widget interattivo di questo gruppo annidato.
 *
 * `label` (`plainText`, obbligatoria, `maxLength: 60`): l'etichetta mostrata
 * sul `<label>` del radio-hack — testo semplice, breve per restare leggibile
 * come tab.
 */
export const tabPanelBlock: BlockDefinition = {
  type: 'tabPanel',
  v: 1,
  props: {
    label: {
      kind: 'plainText',
      required: true,
      maxLength: 60,
    },
  },
  children: { allow: ['heading', 'richText', 'image', 'button', 'container'] },
  migrations: [],
  enabled: true,
  meta: {
    label: 'Pannello tab',
    category: 'interattivo',
    icon: 'square',
    props: {
      label: { label: 'Etichetta', order: 1 },
    },
  },
};
