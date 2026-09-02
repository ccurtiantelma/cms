/**
 * Blocco `form-field` (ADR-46 § 1, RFC-46 D1): un solo tipo polimorfico per tutti i
 * `fieldType` (`text`/`email`/`textarea`/`select`/`checkbox`), dispacciati qui per
 * rendering — stesso principio di `container` al posto di N tipi di layout (ADR-39), mai
 * un componente per `fieldType`. `options` è una singola stringa CSV (`kind: 'plainText'`,
 * nessun `kind` array nel registro, vedi il JSDoc di `form-field.block.ts`): il parsing è
 * responsabilità del consumer, qui e non altrove. Foglia: nessun figlio.
 */
import styles from './FormFieldBlock.module.css';

interface FormFieldBlockProps {
  fieldType?: unknown;
  name?: unknown;
  label?: unknown;
  required?: unknown;
  placeholder?: unknown;
  options?: unknown;
}

/** Divide la stringa CSV di `options` in valori puliti, scartando le voci vuote. */
function parseOptions(options: unknown): string[] {
  if (typeof options !== 'string' || !options) return [];
  return options
    .split(',')
    .map((option) => option.trim())
    .filter((option) => option.length > 0);
}

export default function FormFieldBlock({
  fieldType,
  name,
  label,
  required,
  placeholder,
  options,
}: FormFieldBlockProps) {
  const fieldName = typeof name === 'string' ? name : '';
  const fieldLabel = typeof label === 'string' ? label : '';
  const isRequired = required === true;
  const fieldPlaceholder = typeof placeholder === 'string' && placeholder ? placeholder : undefined;
  const inputId = `form-field-${fieldName || 'campo'}`;

  const requiredMark = isRequired ? (
    <span className={styles.required} aria-hidden="true">
      {' '}
      *
    </span>
  ) : null;

  if (fieldType === 'checkbox') {
    return (
      <div className={styles.field}>
        <label className={styles.checkboxRow} htmlFor={inputId}>
          <input type="checkbox" id={inputId} name={fieldName} required={isRequired} />
          <span>
            {fieldLabel || 'Campo'}
            {requiredMark}
          </span>
        </label>
      </div>
    );
  }

  let control: JSX.Element;
  switch (fieldType) {
    case 'textarea':
      control = (
        <textarea
          className={styles.textarea}
          id={inputId}
          name={fieldName}
          placeholder={fieldPlaceholder}
          required={isRequired}
          rows={4}
        />
      );
      break;
    case 'select': {
      const values = parseOptions(options);
      control = (
        <select
          className={styles.select}
          id={inputId}
          name={fieldName}
          required={isRequired}
          defaultValue=""
        >
          <option value="" disabled>
            {fieldPlaceholder || 'Seleziona...'}
          </option>
          {values.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      );
      break;
    }
    case 'email':
      control = (
        <input
          className={styles.input}
          type="email"
          id={inputId}
          name={fieldName}
          placeholder={fieldPlaceholder}
          required={isRequired}
        />
      );
      break;
    case 'text':
    default:
      control = (
        <input
          className={styles.input}
          type="text"
          id={inputId}
          name={fieldName}
          placeholder={fieldPlaceholder}
          required={isRequired}
        />
      );
      break;
  }

  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={inputId}>
        {fieldLabel || 'Campo'}
        {requiredMark}
      </label>
      {control}
    </div>
  );
}
