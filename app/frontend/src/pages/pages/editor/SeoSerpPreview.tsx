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
import { Group, Stack, Text } from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';
import styles from './SeoSerpPreview.module.css';

/** Lunghezza oltre la quale Google tronca visivamente il titolo nello snippet reale. */
const TITLE_WARNING_THRESHOLD = 60;

/** Lunghezza oltre la quale Google tronca visivamente la description nello snippet reale. */
const DESCRIPTION_WARNING_THRESHOLD = 160;

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

/** Indicatore "N/soglia caratteri", in rosso solo oltre soglia — mai bloccante. */
function LengthIndicator({ length, threshold }: { length: number; threshold: number }): JSX.Element {
  const overThreshold = length > threshold;
  return (
    <Group gap={4} wrap="nowrap">
      {overThreshold && <IconAlertTriangle size={14} color="var(--mantine-color-orange-6)" />}
      <Text size="xs" c={overThreshold ? 'orange' : 'dimmed'}>
        {length}/{threshold} caratteri
        {overThreshold ? ' — verrà troncato nello snippet reale' : ''}
      </Text>
    </Group>
  );
}

/** Anteprima dello snippet di ricerca Google per la Pagina in editing. */
export default function SeoSerpPreview({ title, description, url }: SeoSerpPreviewProps): JSX.Element {
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
      <Group gap="lg">
        <LengthIndicator length={title.length} threshold={TITLE_WARNING_THRESHOLD} />
        <LengthIndicator length={description.length} threshold={DESCRIPTION_WARNING_THRESHOLD} />
      </Group>
    </Stack>
  );
}
