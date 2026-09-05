import { BlockDefinition } from '../block-definition.types';

/**
 * `tabs` — quindicesimo tipo del registro (ADR-57 § Decisione punto 1/2):
 * contenitore dedicato, ammette solo `tabPanel` come figlio diretto. Nessuna
 * prop propria: il renderer CSS-only (radio-hack, `<input type="radio">`
 * nascosti + `<label>` + `:checked ~ .panel`) genera da sé il nome del
 * gruppo radio a partire dall'`id` del nodo — stato non indirizzabile via
 * URL e non persistente al reload (ADR-57 § 4), limite dichiarato, non un
 * difetto da correggere in questo tipo.
 *
 * Ammesso a `ROOT_ALLOWED` e a `section.children.allow` (ADR-57 § 3), stesso
 * trattamento di `accordion`/`carousel`/`modalTrigger`.
 */
export const tabsBlock: BlockDefinition = {
  type: 'tabs',
  v: 1,
  props: {},
  children: { allow: ['tabPanel'] },
  migrations: [],
  enabled: true,
  meta: {
    label: 'Tabs',
    category: 'interattivo',
    icon: 'layout-navbar',
  },
};
