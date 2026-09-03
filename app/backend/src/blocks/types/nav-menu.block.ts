import { BlockDefinition } from '../block-definition.types';

/**
 * `navMenu` — decimo tipo del registro (ADR-52 § 1). Contenitore dedicato:
 * ammette solo `navMenuItem` come figlio diretto, stesso principio di `form`
 * per `form-field`/`form-submit` (ADR-46 § 1) — composizione **a children**,
 * non a prop-array, così ogni voce di menu è un nodo con `id` proprio,
 * riordinabile e validabile con path d'errore tramite l'Editor Structure
 * Navigator già esistente. Ammesso a `ROOT_ALLOWED` (ADR-52 § 1): può comporre
 * direttamente una Pagina o una Sezione Globale `header`/`footer` (ADR-40),
 * stesso trattamento di `container`. Non introduce la tabella `menus` di
 * `business-rules.md`/`CLAUDE.md` § Database: resta un blocco componibile a
 * mano, non un'entità condivisa con punto di modifica unico (ADR-52 § 5).
 */
export const navMenuBlock: BlockDefinition = {
  type: 'navMenu',
  v: 1,
  props: {},
  children: { allow: ['navMenuItem'] },
  migrations: [],
  enabled: true,
  meta: {
    label: 'Menu di navigazione',
    category: 'navigazione',
    icon: 'menu-2',
  },
};
