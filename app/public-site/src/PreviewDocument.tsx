import type { components } from '@api-types';
import type { ThemeConfigDto } from '../../frontend/src/utils/theme-css.utils';
import PageView from './PageView';
import ThemeStyleTag from './ThemeStyleTag';

type PagePreviewContentDto = components['schemas']['PagePreviewContentDto'];
type PublicActiveGlobalSectionsDto = components['schemas']['PublicActiveGlobalSectionsDto'];

interface PreviewDocumentProps {
  page: PagePreviewContentDto;
  /** Tema dell'installazione, `null` se il backend non ha risposto (vedi `ThemeStyleTag`). */
  themeConfig: ThemeConfigDto | null;
  cssHref: string;
  /**
   * Sezioni Globali degli slot di layout (ADR-40) — presenti anche qui, e non
   * solo sulla pagina pubblica: l'anteprima mostra il markup che la pubblicazione
   * produrrebbe, e header/footer ne fanno parte.
   */
  globalSections?: PublicActiveGlobalSectionsDto;
}

/**
 * Documento HTML dell'anteprima di una bozza non pubblicata (ADR-25 § 4).
 * Riusa lo stesso `PageView`/gli stessi componenti blocco della pagina
 * pubblica (`App.tsx`) e lo stesso `ThemeStyleTag`: l'anteprima mostra
 * esattamente il markup **e** il tema che la pubblicazione produrrebbe, non una
 * versione approssimata.
 *
 * Unica differenza rispetto ad `App.tsx`: il meta `robots` è sempre presente
 * qui, mai sulla pagina pubblica — l'anteprima non è indicizzabile per
 * costruzione, non per convenzione (ADR-25 § 4).
 */
export default function PreviewDocument({
  page,
  themeConfig,
  cssHref,
  globalSections,
}: PreviewDocumentProps) {
  return (
    <html lang={page.locale}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex,nofollow" />
        <title>{page.title}</title>
        <link rel="stylesheet" href={cssHref} />
        <ThemeStyleTag themeConfig={themeConfig} />
      </head>
      <body>
        <PageView content={page.content} globalSections={globalSections} />
      </body>
    </html>
  );
}
