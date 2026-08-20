/**
 * Rileva il `Content-Type` di un blob dai byte reali, contro una tabella
 * chiusa di firme **raster** (ADR-27 § 3, `CLAUDE.md` § Security "MIME da
 * contenuto reale, non estensione"). Scritta in casa, nessuna dipendenza
 * nuova: cinque formati sono cinque confronti di prefisso.
 *
 * L'allowlist è deliberatamente chiusa e raster-only: un SVG (testuale,
 * `<svg`/`<?xml`) non corrisponde a nessuna firma qui sotto e ricade quindi
 * nel `null` — è così che ADR-27 § 4 lo rifiuta "senza eccezioni
 * configurabili", senza bisogno di un controllo dedicato.
 */

const JPEG_SIGNATURE = Buffer.from([0xff, 0xd8, 0xff]);
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const GIF87A_SIGNATURE = Buffer.from('GIF87a', 'ascii');
const GIF89A_SIGNATURE = Buffer.from('GIF89a', 'ascii');

function startsWith(buffer: Buffer, signature: Buffer): boolean {
  return (
    buffer.length >= signature.length && buffer.subarray(0, signature.length).equals(signature)
  );
}

/** ISOBMFF: bytes 4-7 = `ftyp`, brand agli offset 8-11. WebP: `RIFF....WEBP`. */
function isWebp(buffer: Buffer): boolean {
  return (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  );
}

function isAvif(buffer: Buffer): boolean {
  if (buffer.length < 12 || buffer.subarray(4, 8).toString('ascii') !== 'ftyp') return false;
  const brand = buffer.subarray(8, 12).toString('ascii');
  return brand === 'avif' || brand === 'avis';
}

/**
 * Restituisce il MIME type raster rilevato dai byte reali, o `null` se
 * nessuna firma della tabella chiusa corrisponde (SVG compreso).
 */
export function detectRasterMimeType(buffer: Buffer): string | null {
  if (startsWith(buffer, JPEG_SIGNATURE)) return 'image/jpeg';
  if (startsWith(buffer, PNG_SIGNATURE)) return 'image/png';
  if (startsWith(buffer, GIF87A_SIGNATURE) || startsWith(buffer, GIF89A_SIGNATURE))
    return 'image/gif';
  if (isWebp(buffer)) return 'image/webp';
  if (isAvif(buffer)) return 'image/avif';
  return null;
}
