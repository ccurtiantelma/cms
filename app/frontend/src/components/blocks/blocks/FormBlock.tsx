/**
 * Blocco `form` (nono... settimo tipo del registro, ADR-46 § 1): contenitore dedicato al
 * Form Builder dinamico, `children.allow: ['form-field', 'form-submit']` (RFC-46 D1). Un
 * elemento `<form>` semantico reale. `formKey` non è interpolato nel markup come testo
 * (nessuna prop di rendering per i destinatari, RFC-46 D2): serve solo come
 * `data-form-key`/`data-form-id` (stesso valore, ADR-46 § 4: "`formId` **è** `formKey`").
 * Nessun import Mantine (i blocchi non ne importano, CLAUDE.md § Regola Mantine): solo CSS
 * Modules e markup semantico, come ogni altro componente di `components/blocks/blocks/`.
 *
 * `submission` (F10-04, RFC-46 § Impatto N8): honeypot/firma/URL di invio, calcolati e
 * passati solo da `app/public-site` (`PageView.tsx` → `BlockRenderer`) — mai dal Canvas
 * admin, che non ha accesso al secret e non deve mai poter inviare un submit reale. Quando
 * assente (Canvas, o un `formKey` mancante) il form resta puramente compositivo, come prima
 * di F10-04: nessun campo aggiuntivo, nessun `action`.
 *
 * Il campo honeypot è un `<input type="text">` reale — mai `type="hidden"` — nascosto solo
 * via CSS fuori schermo (`.honeypot`, mai `display:none`/`opacity:0` letterali,
 * riconoscibili a euristica, ADR-46 § 3/RFC-46 D6.1): un bot che compila alla cieca ogni
 * campo visibile-al-DOM lo valorizza, un utente umano non lo vede mai. Il suo `name` è
 * derivato via HMAC (mai una stringa fissa) — qui è solo iniettato, mai calcolato: nessun
 * secret in questo file, che è condiviso col bundle browser dell'admin (CLAUDE.md, nessuna
 * chiave lato client).
 */
import type { ReactNode } from 'react';
import styles from './FormBlock.module.css';

interface FormSubmissionProps {
  honeypotFieldName: string;
  signature: string;
  submitUrl: string;
}

interface FormBlockProps {
  children: ReactNode;
  formKey?: unknown;
  submission?: FormSubmissionProps;
}

export default function FormBlock({ children, formKey, submission }: FormBlockProps) {
  const formKeyValue = typeof formKey === 'string' && formKey ? formKey : undefined;

  return (
    <form
      className={styles.form}
      data-form-key={formKeyValue}
      data-form-id={formKeyValue}
      data-submit-url={submission?.submitUrl}
    >
      <div className={styles.message} data-form-message hidden />
      {submission ? (
        <>
          <input
            type="text"
            name={submission.honeypotFieldName}
            className={styles.honeypot}
            data-honeypot="true"
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
            defaultValue=""
          />
          <input type="hidden" name="signature" value={submission.signature} />
        </>
      ) : null}
      <div className={styles.fields} data-form-fields>
        {children}
      </div>
    </form>
  );
}
