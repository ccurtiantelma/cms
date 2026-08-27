import { GLOBAL_TOKENS_STYLE_TAG_ID } from '../../frontend/src/libs/globalTokensCompiler';

interface ErrorDocumentProps {
  status: number;
  message: string;
  cssHref: string;
  /** Blocco `:root { ... }` compilato dai Global Design Tokens, vedi `App.tsx`. */
  globalTokensCss: string;
}

/** Documento minimale per `404`/`500` (ADR-24 § 3: `404` uniforme, nessuna informazione sul motivo). */
export default function ErrorDocument({ status, message, cssHref, globalTokensCss }: ErrorDocumentProps) {
  return (
    <html lang="it">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{`${status} — ${message}`}</title>
        <link rel="stylesheet" href={cssHref} />
        {globalTokensCss && (
          <style id={GLOBAL_TOKENS_STYLE_TAG_ID} dangerouslySetInnerHTML={{ __html: globalTokensCss }} />
        )}
      </head>
      <body>
        <main>
          <h1>{status}</h1>
          <p>{message}</p>
        </main>
      </body>
    </html>
  );
}
