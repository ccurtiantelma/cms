/**
 * Blocco `button`: `label` (plainText) e `href` (url, già validato
 * server-side contro lo schema ammesso, SPEC-F02-blocchi.md § 3.6). `label`
 * è interpolato come contenuto JSX, mai `dangerouslySetInnerHTML`.
 */
import styles from './Button.module.css';

interface ButtonProps {
  label: string;
  href: string;
}

export default function Button({ label, href }: ButtonProps) {
  return (
    <a className={styles.button} href={href}>
      {label}
    </a>
  );
}
