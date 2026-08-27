import type { components } from '@api-types';
import { GLOBAL_TOKENS_STYLE_TAG_ID } from '../../frontend/src/libs/globalTokensCompiler';
import PageView from './PageView';

type PublicPageDto = components['schemas']['PublicPageDto'];

interface AppProps {
  page: PublicPageDto;
  cssHref: string;
  /**
   * Blocco `:root { ... }` già compilato da `compileTokensToCss` (o
   * stringa vuota se non disponibile). Nessuna stringa utente non fidata:
   * i valori vengono dai Global Design Tokens di backend, già vincolati a
   * hex/whitelist/numero+unità (vedi `globalTokensCompiler.ts`).
   */
  globalTokensCss: string;
}

/**
 * Documento HTML completo di una Pagina pubblicata. Solo `title`, `slug`,
 * `locale` e `content` sono usati: `seo` è il contratto di F07/F08, fuori dal
 * perimetro di F03 (PLAN-F03 § "Il percorso che F03 deve chiudere").
 */
export default function App({ page, cssHref, globalTokensCss }: AppProps) {
  return (
    <html lang={page.locale}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{page.title}</title>
        <link rel="stylesheet" href={cssHref} />
        {globalTokensCss && (
          <style id={GLOBAL_TOKENS_STYLE_TAG_ID} dangerouslySetInnerHTML={{ __html: globalTokensCss }} />
        )}
      </head>
      <body>
        <PageView content={page.content} />
      </body>
    </html>
  );
}
