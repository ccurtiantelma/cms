/**
 * Anteprima "fedele" della card OpenGraph (stile Facebook/LinkedIn), chrome dell'editor
 * Pagina scheda SEO. Componente controllato, nessuno stato interno — vedi il commento
 * equivalente in `SeoSerpPreview.tsx`.
 */
import { Text } from '@mantine/core';
import { IconPhoto } from '@tabler/icons-react';
import styles from './SeoSocialPreview.module.css';

interface SeoSocialPreviewProps {
  /** Titolo già risolto dal chiamante (fallback `ogTitle || metaTitle || titolo` applicato). */
  title: string;
  /** Description già risolta dal chiamante. */
  description: string;
  /** URL immagine OpenGraph. Assente/vuota → placeholder grigio, non un asset esterno. */
  image?: string;
  /** Host mostrato come badge dominio (già estratto dal chiamante dall'URL pubblico). */
  domain: string;
}

/** Anteprima della card di condivisione OpenGraph per la Pagina in editing. */
export default function SeoSocialPreview({
  title,
  description,
  image,
  domain,
}: SeoSocialPreviewProps): JSX.Element {
  return (
    <div className={styles.card}>
      <div className={styles.imageBox}>
        {image ? (
          <img src={image} alt="" className={styles.image} />
        ) : (
          <span role="img" aria-label="Nessuna immagine Open Graph">
            <IconPhoto size={48} color="var(--mantine-color-gray-5)" />
          </span>
        )}
      </div>
      <div className={styles.body}>
        <Text className={styles.domain}>{domain}</Text>
        <div className={styles.title}>{title}</div>
        <div className={styles.description}>{description}</div>
      </div>
    </div>
  );
}
