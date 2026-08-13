/**
 * Template email "attiva account" (creazione utente da parte di un Admin).
 */
export function buildActivationEmailHtml(params: {
  recipientName: string;
  activationUrl: string;
}): string {
  const { recipientName, activationUrl } = params;

  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>Benvenuto/a</h2>
      <p>Ciao ${recipientName},</p>
      <p>È stato creato un account per te. Per attivarlo e impostare la tua password, clicca sul link qui sotto:</p>
      <p>
        <a href="${activationUrl}" target="_blank" style="display:inline-block;padding:10px 20px;background-color:#2563eb;color:#ffffff;text-decoration:none;border-radius:4px;">
          Attiva account
        </a>
      </p>
      <p>Se il pulsante non funziona, copia e incolla questo link nel browser:</p>
      <p><a href="${activationUrl}" target="_blank">${activationUrl}</a></p>
      <p>Il link è valido per 48 ore. Se non hai richiesto tu questo account, ignora questa email.</p>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;" />
      <p style="color:#6b7280;font-size:12px;">CMS</p>
    </div>
  `;
}
