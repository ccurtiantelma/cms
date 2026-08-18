interface ErrorDocumentProps {
  status: number;
  message: string;
  cssHref: string;
}

/** Documento minimale per `404`/`500` (ADR-24 § 3: `404` uniforme, nessuna informazione sul motivo). */
export default function ErrorDocument({ status, message, cssHref }: ErrorDocumentProps) {
  return (
    <html lang="it">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{`${status} — ${message}`}</title>
        <link rel="stylesheet" href={cssHref} />
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
