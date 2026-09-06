/**
 * Blocco `form-field` (ADR-46 § 1, RFC-46 D1): un solo tipo polimorfico per tutti i
 * `fieldType` (`text`/`email`/`textarea`/`select`/`checkbox`), dispacciati qui per
 * rendering — stesso principio di `container` al posto di N tipi di layout (ADR-39), mai
 * un componente per `fieldType`. `options` è una singola stringa CSV (`kind: 'plainText'`,
 * nessun `kind` array nel registro, vedi il JSDoc di `form-field.block.ts`): il parsing è
 * responsabilità del consumer, qui e non altrove. Foglia: nessun figlio.
 *
 * `colSpan` (ADR-51): risolto con lo stesso `resolveResponsiveClassNames` di
 * `Container.tsx`/`Section.tsx` (vocabolario `colSpan_*` di `style-tokens.module.css`). Un
 * valore assente (contenuto pre-esistente, prop opzionale senza default persistito) ricade
 * su `span 12` — lo stesso "un campo per riga" di quando `.fields` era `flex-direction:
 * column`, mai un campo che collassa a un solo track di griglia per mancanza di classe.
 *
 * `defaultValue`/`defaultChecked`/`validationMessage` (ADR-60): tre prop additive, nessun
 * bump di `v`. `defaultValue` è applicato come `defaultValue` React nativo (non `value`:
 * questi campi restano non controllati, come lo erano già prima di questa ADR — nessuno
 * stato React da sincronizzare) su `text`/`email`/`textarea`/`select`, mai su `checkbox`
 * (stesso pattern di `options`, dichiarata su tutti i `form-field` ma usata solo da
 * `select`). `defaultChecked` è l'equivalente per `checkbox`. `validationMessage`, quando
 * presente, esce come `data-validation-message` sull'elemento di controllo reale — è
 * `app/public-site/src/assets/form-submit.js` (non questo componente) a leggerlo e
 * chiamare `setCustomValidity()` prima del submit: qui è solo markup, nessuna logica di
 * validazione client (CLAUDE.md: "la validazione client è solo UX", e qui non ce n'è
 * proprio, solo un dato passato a valle).
 */
import styles from './FormFieldBlock.module.css';
import tokenStyles from '../style-tokens.module.css';
import { resolveResponsiveClassNames } from '../style-tokens';

interface FormFieldBlockProps {
  fieldType?: unknown;
  name?: unknown;
  label?: unknown;
  required?: unknown;
  placeholder?: unknown;
  options?: unknown;
  colSpan?: unknown;
  defaultValue?: unknown;
  defaultChecked?: unknown;
  validationMessage?: unknown;
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
  colSpan,
  defaultValue,
  defaultChecked,
  validationMessage,
}: FormFieldBlockProps) {
  const fieldName = typeof name === 'string' ? name : '';
  const fieldLabel = typeof label === 'string' ? label : '';
  const isRequired = required === true;
  const fieldPlaceholder = typeof placeholder === 'string' && placeholder ? placeholder : undefined;
  const inputId = `form-field-${fieldName || 'campo'}`;
  // ADR-60: `defaultValue` è ignorato per `checkbox` (usa `defaultChecked` invece), coerente
  // con la dichiarazione della prop nel commento di testa.
  const fieldDefaultValue = typeof defaultValue === 'string' ? defaultValue : undefined;
  const fieldDefaultChecked = defaultChecked === true;
  const fieldValidationMessage =
    typeof validationMessage === 'string' && validationMessage ? validationMessage : undefined;
  const colSpanClassName =
    resolveResponsiveClassNames(tokenStyles, 'colSpan', colSpan) || tokenStyles.colSpan_default_12;
  const fieldClassName = [styles.field, colSpanClassName].filter(Boolean).join(' ');

  const requiredMark = isRequired ? (
    <span className={styles.required} aria-hidden="true">
      {' '}
      *
    </span>
  ) : null;

  if (fieldType === 'checkbox') {
    return (
      <div className={fieldClassName}>
        <label className={styles.checkboxRow} htmlFor={inputId}>
          <input
            type="checkbox"
            id={inputId}
            name={fieldName}
            required={isRequired}
            defaultChecked={fieldDefaultChecked}
            data-validation-message={fieldValidationMessage}
          />
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
          defaultValue={fieldDefaultValue}
          data-validation-message={fieldValidationMessage}
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
          defaultValue={fieldDefaultValue ?? ''}
          data-validation-message={fieldValidationMessage}
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
          defaultValue={fieldDefaultValue}
          data-validation-message={fieldValidationMessage}
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
          defaultValue={fieldDefaultValue}
          data-validation-message={fieldValidationMessage}
        />
      );
      break;
  }

  return (
    <div className={fieldClassName}>
      <label className={styles.label} htmlFor={inputId}>
        {fieldLabel || 'Campo'}
        {requiredMark}
      </label>
      {control}
    </div>
  );
}
