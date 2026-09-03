/**
 * Voce di menu (`navMenuItem`, ADR-52 § 1/§ 2): foglia del contenitore `navMenu`, fuori
 * `ROOT_ALLOWED` — stesso trattamento di `form-field`/`form-submit`. Nessuno stato React
 * proprio: il `<li>` è renderizzato qui (non dal contenitore), stesso pattern di
 * `FormFieldBlock.tsx` dentro `FormBlock.tsx`.
 *
 * Risoluzione dell'URL (ADR-52 § 2/§ 4): `url` esplicito vince sempre su `pageGuid` (link
 * esterno dichiarato). Quando entrambi mancano, o il `pageGuid` non risolve a una Pagina
 * pubblicata, la voce resta un'etichetta senza `href` — mai un link rotto, mai un `<a
 * href="">`. Due contesti distinti risolvono `pageGuid` in modo diverso:
 * - **SSR pubblico** (`app/public-site`, ADR-22 § 3): l'albero non ha JavaScript client
 *   (ADR-22 § 2), quindi la risoluzione `pageGuid → path` avviene prima del render, a monte,
 *   in `entry-server.tsx` (`GET public/pages/by-guid/:guid`). Il risultato arriva già pronto
 *   in `resolvedUrl` — `string` se risolto, `null` se la Pagina non è pubblicata/non esiste.
 *   Quando questa prop è passata esplicitamente (anche `null`) si usa **sempre** quella, mai
 *   `usePublicPageUrl`.
 * - **Canvas dell'editor** (JS attivo): `resolvedUrl` resta `undefined` (mai passato da
 *   `BlockRenderer` fuori dal pass-through SSR pubblico), quindi si risolve lato client via
 *   `usePublicPageUrl` (ADR-24), come ogni altro pulsante "Vedi pagina" del dettaglio.
 *
 * Questo file non importa Mantine (CLAUDE.md § confine Mantine/blocchi).
 */
import styles from './NavMenuBlock.module.css';
import { usePublicPageUrl } from '../../../hooks/usePublicPageUrl';

interface NavMenuItemBlockProps {
  label: string;
  pageGuid?: string;
  url?: string;
  target?: '_self' | '_blank';
  /** Editing in-place (solo editor): il click su una voce non deve navigare via dalla pagina
   *  che si sta componendo — mai valorizzato dal sito pubblico, stesso principio di
   *  `Button.tsx`/`Heading.tsx`. */
  editable?: boolean;
  /**
   * Risoluzione già calcolata lato SSR pubblico. `string` = link pronto, `null` = `pageGuid`
   * non risolvibile (Pagina non pubblicata/inesistente), `undefined` = non passato → risolvi
   * via `usePublicPageUrl` (Canvas editor). Vedi il commento di testa del file.
   */
  resolvedUrl?: string | null;
}

export default function NavMenuItemBlock({
  label,
  pageGuid,
  url,
  target,
  editable = false,
  resolvedUrl,
}: NavMenuItemBlockProps) {
  // L'hook resta chiamato ad ogni render (regola degli hook): quando `resolvedUrl` è già
  // esplicito (SSR pubblico) o `url` è già presente, si passa `null` per evitare una
  // richiesta client inutile — stesso principio già in uso nella versione pre-ADR-52 di
  // questo componente (`NavMenuBlock.tsx`, ora rimosso da lì).
  const clientResolvedUrl = usePublicPageUrl(
    resolvedUrl !== undefined || url ? null : (pageGuid ?? null),
  );
  const effectiveResolvedUrl = resolvedUrl !== undefined ? resolvedUrl : clientResolvedUrl;
  const href = url || effectiveResolvedUrl;

  if (!href) {
    // Nessun link plausibile: l'etichetta resta visibile, senza `href` a vuoto.
    return (
      <li className={styles.item}>
        <span className={styles.link}>{label}</span>
      </li>
    );
  }

  const isBlank = target === '_blank';

  return (
    <li className={styles.item}>
      <a
        className={styles.link}
        href={href}
        target={isBlank ? '_blank' : undefined}
        rel={isBlank ? 'noopener noreferrer' : undefined}
        onClick={(event) => {
          if (editable) event.preventDefault();
        }}
      >
        {label}
      </a>
    </li>
  );
}
