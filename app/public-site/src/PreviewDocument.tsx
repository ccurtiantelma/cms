import type { components } from '@api-types';
import { GLOBAL_TOKENS_STYLE_TAG_ID } from '../../frontend/src/libs/globalTokensCompiler';
import PageView from './PageView';

type PagePreviewContentDto = components['schemas']['PagePreviewContentDto'];

interface PreviewDocumentProps {
  page: PagePreviewContentDto;
  cssHref: string;
  /** Blocco `:root { ... }` compilato dai Global Design Tokens, vedi `App.tsx`. */
  globalTokensCss: string;
}

/**
 * Documento HTML dell'anteprima di una bozza non pubblicata (ADR-25 § 4).
 * Riusa lo stesso `PageView`/gli stessi componenti blocco della pagina
 * pubblica (`App.tsx`): l'anteprima mostra esattamente il markup che la
 * pubblicazione produrrebbe, non una versione approssimata.
 *
 * Unica differenza rispetto ad `App.tsx`: il meta `robots` è sempre presente
 * qui, mai sulla pagina pubblica — l'anteprima non è indicizzabile per
 * costruzione, non per convenzione (ADR-25 § 4).
 */
export default function PreviewDocument({ page, cssHref, globalTokensCss }: PreviewDocumentProps) {
  return (
    <html lang={page.locale}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex,nofollow" />
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
