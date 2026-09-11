import type { ThemeConfigDto } from '../../frontend/src/utils/theme-css.utils';
import ThemeStyleTag from './ThemeStyleTag';

interface ErrorDocumentProps {
  status: number;
  message: string;
  cssHref: string;
  /** Tema dell'installazione, `null` se il backend non ha risposto (vedi `ThemeStyleTag`). */
  themeConfig: ThemeConfigDto | null;
  /** Nonce della risposta HTTP corrente (`security-headers.ts`) — vedi `ThemeStyleTag.tsx`. */
  nonce: string;
}

/** Documento minimale per `404`/`500` (ADR-24 § 3: `404` uniforme, nessuna informazione sul motivo). */
export default function ErrorDocument({ status, message, cssHref, themeConfig, nonce }: ErrorDocumentProps) {
  return (
    <html lang="it">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{`${status} — ${message}`}</title>
        <link rel="stylesheet" href={cssHref} />
        <ThemeStyleTag themeConfig={themeConfig} nonce={nonce} />
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
