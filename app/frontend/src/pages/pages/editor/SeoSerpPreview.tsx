/**
 * Anteprima "fedele" dello snippet Google (chrome dell'editor Pagina, scheda SEO). Puramente
 * presentazionale: nessuna chiamata API, nessuno stato — un componente controllato che
 * ridisegna ad ogni cambio di `title`/`description`/`url`, così il chiamante (`PagePageDetail`)
 * lo alimenta direttamente da `form.values` per un'anteprima live mentre si digita.
 *
 * Le soglie di lunghezza (60/160 caratteri) sono quelle "consigliate" di
 * `docs/business-rules.md` § SEO — un avviso, mai un blocco (business rule 4): il componente
 * non impedisce nulla, segnala solo.
 */
import { Stack, Text } from '@mantine/core';
import styles from './SeoSerpPreview.module.css';

interface SeoSerpPreviewProps {
  /** Titolo già risolto dal chiamante (fallback `metaTitle || titolo Pagina` già applicato). */
  title: string;
  /** Description già risolta dal chiamante (nessun fallback implicito qui). */
  description: string;
  /** URL assoluto da mostrare come breadcrumb (canonica o costruita dallo slug). */
  url: string;
}

/** Spezza un URL assoluto nei segmenti mostrati come breadcrumb Google (dominio › percorso). */
function urlToBreadcrumbSegments(url: string): string[] {
  try {
    const parsed = new URL(url);
    const pathSegments = parsed.pathname.split('/').filter((segment) => segment.length > 0);
    return [parsed.host, ...pathSegments];
  } catch {
    // URL non ancora valido mentre l'utente digita (es. slug vuoto): mostra il testo grezzo
    // invece di far sparire l'anteprima — un breadcrumb approssimativo resta più utile di nulla.
    return url.split('/').filter((segment) => segment.length > 0);
  }
}

/** Anteprima dello snippet di ricerca Google per la Pagina in editing. */
export default function SeoSerpPreview({
  title,
  description,
  url,
}: SeoSerpPreviewProps): JSX.Element {
  const segments = urlToBreadcrumbSegments(url);

  return (
    <Stack gap={6}>
      <Text size="sm" fw={500}>
        Anteprima Google
      </Text>
      <div className={styles.serpCard}>
        <div className={styles.serpUrl}>
          {segments.map((segment, index) => (
            <span key={index}>
              {index > 0 && <span className={styles.serpUrlSegment}> › </span>}
              {segment}
            </span>
          ))}
        </div>
        <div className={styles.serpTitle}>{title}</div>
        <div className={styles.serpDescription}>{description}</div>
      </div>
    </Stack>
  );
}
