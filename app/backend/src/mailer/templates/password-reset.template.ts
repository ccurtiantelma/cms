/**
 * Template email "reimposta password".
 */
export function buildPasswordResetEmailHtml(params: {
  recipientName: string;
  resetUrl: string;
}): string {
  const { recipientName, resetUrl } = params;

  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>Reimposta la tua password</h2>
      <p>Ciao ${recipientName},</p>
      <p>Abbiamo ricevuto una richiesta di reimpostazione della password per il tuo account. Clicca sul link qui sotto per impostarne una nuova:</p>
      <p>
        <a href="${resetUrl}" target="_blank" style="display:inline-block;padding:10px 20px;background-color:#2563eb;color:#ffffff;text-decoration:none;border-radius:4px;">
          Reimposta password
        </a>
      </p>
      <p>Se il pulsante non funziona, copia e incolla questo link nel browser:</p>
      <p><a href="${resetUrl}" target="_blank">${resetUrl}</a></p>
      <p>Il link è valido per 1 ora. Se non hai richiesto tu questa operazione, ignora questa email.</p>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;" />
      <p style="color:#6b7280;font-size:12px;">Starter Kit</p>
    </div>
  `;
}
