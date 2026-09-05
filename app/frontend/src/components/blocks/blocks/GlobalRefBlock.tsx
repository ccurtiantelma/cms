/**
 * Blocco `globalRef` (ADR-55, estende ADR-40): nodo puntatore, foglia (`children: []`),
 * unica prop `globalSectionGuid` — referenzia una riga `global_sections` esistente (CRUD
 * `app/global-sections`). La risoluzione nel contenuto vero avviene a monte, nel job di
 * export lato server (`ExportService`): questo componente non la effettua mai, e non deve
 * comparire nell'HTML pubblico servito (`app/public-site` riceve già l'albero risolto, o —
 * in un contenuto pre-risoluzione mai dovrebbe capitare — questo segnaposto resta l'unico
 * fallback grazioso, mai un errore che abbatte la pagina).
 *
 * Markup semantico, nessuna dipendenza Mantine (CLAUDE.md § confine Mantine/blocchi): il
 * bordo/badge viola distintivo dell'editor (`EditorBlockWrapper.tsx`/
 * `EditorBlockWrapper.module.css`, chrome ammessa a Mantine) resta un livello sopra questo
 * componente, non duplicato qui.
 */
import styles from './GlobalRefBlock.module.css';

interface GlobalRefBlockProps {
  globalSectionGuid: string;
}

export default function GlobalRefBlock({ globalSectionGuid }: GlobalRefBlockProps) {
  return (
    <div className={styles.placeholder} data-global-section-guid={globalSectionGuid || undefined}>
      <span>Sezione Globale collegata — il contenuto reale viene risolto in pubblicazione.</span>
    </div>
  );
}
