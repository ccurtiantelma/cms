import type { components } from '@api-types';
import type { ThemeConfigDto } from '../../frontend/src/utils/theme-css.utils';
import PageView from './PageView';
import ThemeStyleTag from './ThemeStyleTag';

type PublicPageDto = components['schemas']['PublicPageDto'];
type PublicActiveGlobalSectionsDto = components['schemas']['PublicActiveGlobalSectionsDto'];

interface AppProps {
  page: PublicPageDto;
  /** Tema dell'installazione, `null` se il backend non ha risposto (vedi `ThemeStyleTag`). */
  themeConfig: ThemeConfigDto | null;
  cssHref: string;
  /** Isola JS di submit dei Form (F10-04) — iniettata da `PageView` solo se la Pagina ne ha bisogno. */
  formScriptHref?: string;
  /**
   * Sezioni Globali assegnate a `header`/`footer` (ADR-40), risolte da
   * `entry-server.tsx`. Assenti o con slot `null` ⇒ il documento contiene i soli
   * blocchi della Pagina, senza errori.
   */
  globalSections?: PublicActiveGlobalSectionsDto;
  /** Vedi `PageView.tsx` — pass-through opzionale calcolato da `entry-server.tsx` (ADR-52). */
  resolvePageUrl?: (pageGuid: string) => string | null | undefined;
}

/**
 * Documento HTML completo di una Pagina pubblicata. Solo `title`, `slug`,
 * `locale` e `content` sono usati: `seo` è il contratto di F07/F08, fuori dal
 * perimetro di F03 (PLAN-F03 § "Il percorso che F03 deve chiudere").
 *
 * Il `<style>` del tema è dichiarato **dopo** il `<link>` del foglio dei
 * blocchi: a parità di specificità (il suo `:root` contro il `:root` di
 * `style-tokens.module.css`) vince l'ultima regola dichiarata, quindi il tema
 * dell'Editor sovrascrive i valori statici di fabbrica dei token `--cms-*`.
 */
export default function App({
  page,
  themeConfig,
  cssHref,
  formScriptHref,
  globalSections,
  resolvePageUrl,
}: AppProps) {
  return (
    <html lang={page.locale}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{page.title}</title>
        <link rel="stylesheet" href={cssHref} />
        <ThemeStyleTag themeConfig={themeConfig} />
      </head>
      <body>
        <PageView
          content={page.content}
          globalSections={globalSections}
          formScriptHref={formScriptHref}
          resolvePageUrl={resolvePageUrl}
        />
      </body>
    </html>
  );
}
