import { BlockDefinition } from '../block-definition.types';

/**
 * `form-field` — ottavo tipo del registro (ADR-46 § 1, RFC-46 D1): un singolo
 * campo di input dentro un `form`. Un solo tipo per tutti i `fieldType`
 * (`text`/`email`/`textarea`/`select`/`checkbox`) invece di cinque tipi
 * quasi identici — stesso principio di `container` al posto di N tipi di
 * layout (ADR-39), scartato in RFC-46 § Alternative valutate. `name` è
 * l'identificatore stabile del campo nel payload di sottomissione
 * (`form_submissions.payload`, chiave = `name`) — **non** l'`id` del nodo.
 * `options` non ha un `kind` array dedicato nel registro (`prop-spec.types.ts`
 * non ne dichiara uno): si riusa `plainText` con una singola stringa
 * CSV-separata da virgola, stesso principio "un `kind` in più è un `kind`
 * per sempre" di ADR-21 § 4 — il parsing/split è responsabilità del
 * consumer (renderer di F04/F10 e `FormsService` lato validazione
 * dell'Invio), non del registro. Foglia (`children.allow: []`): un
 * `form-field` non contiene altri blocchi.
 *
 * `colSpan` (ADR-51): larghezza del campo nella griglia a 12 colonne del `form`
 * che lo contiene, riuso di `enum`+`responsive` (ADR-29 §2/§3) — nessun nuovo
 * `kind`. Additiva con `default` dichiarato, `v` resta 1.
 */
export const formFieldBlock: BlockDefinition = {
  type: 'form-field',
  v: 1,
  props: {
    fieldType: {
      kind: 'enum',
      required: true,
      values: ['text', 'email', 'textarea', 'select', 'checkbox'],
    },
    name: {
      kind: 'plainText',
      required: true,
      maxLength: 100,
      nonEmpty: true,
    },
    label: {
      kind: 'plainText',
      required: true,
      maxLength: 200,
    },
    required: {
      kind: 'boolean',
      required: false,
      default: false,
    },
    placeholder: {
      kind: 'plainText',
      required: false,
      maxLength: 200,
    },
    /**
     * Usato solo quando `fieldType: 'select'`: stringa CSV di opzioni
     * (es. "Nord,Centro,Sud"), non un array — vedi JSDoc di classe.
     */
    options: {
      kind: 'plainText',
      required: false,
      maxLength: 1000,
    },
    colSpan: {
      kind: 'enum',
      required: false,
      responsive: true,
      values: ['6', '12'],
      default: { default: '12' },
    },
  },
  children: { allow: [] },
  migrations: [],
  enabled: true,
  meta: {
    label: 'Campo modulo',
    category: 'form',
    icon: 'input-search',
    props: {
      fieldType: { label: 'Tipo campo', order: 1 },
      name: {
        label: 'Nome campo',
        order: 2,
        help: 'Identificatore stabile nel payload di sottomissione: non cambia duplicando il blocco.',
      },
      label: { label: 'Etichetta', order: 3 },
      required: { label: 'Obbligatorio', order: 4 },
      placeholder: { label: 'Placeholder', order: 5 },
      options: {
        label: 'Opzioni (solo per "Select")',
        order: 6,
        help: 'Elenco separato da virgola, es. "Nord,Centro,Sud".',
      },
      colSpan: {
        label: 'Larghezza campo',
        order: 7,
        help: "50% per affiancare due campi sulla stessa riga, 100% per occupare l'intera larghezza.",
      },
    },
  },
};
