import type { ThemeConfigDto } from '../../frontend/src/utils/theme-css.utils';
import ThemeStyleTag from './ThemeStyleTag';

interface ErrorDocumentProps {
  status: number;
  message: string;
  cssHref: string;
  /** Tema dell'installazione, `null` se il backend non ha risposto (vedi `ThemeStyleTag`). */
  themeConfig: ThemeConfigDto | null;
}

/** Documento minimale per `404`/`500` (ADR-24 § 3: `404` uniforme, nessuna informazione sul motivo). */
export default function ErrorDocument({ status, message, cssHref, themeConfig }: ErrorDocumentProps) {
  return (
    <html lang="it">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{`${status} — ${message}`}</title>
        <link rel="stylesheet" href={cssHref} />
        <ThemeStyleTag themeConfig={themeConfig} />
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
