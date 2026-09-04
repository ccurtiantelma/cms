/** Formatta una data ISO in locale italiano senza separatore tra data e ora. */
export function formatDate(iso: string): string {
  const date = new Date(iso);
  return `${date.toLocaleDateString('it-IT')} ${date.toLocaleTimeString('it-IT')}`;
}
