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

/** Dimensioni intrinseche in pixel di un'immagine raster (RFC-F09 N2, ADR-53 § 3). */
export interface RasterDimensions {
  width: number;
  height: number;
}

/** Marker JPEG che portano le dimensioni del frame (SOF0-SOF15, esclusi DHT/JPG/DAC). */
const JPEG_SOF_MARKERS = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
]);

/**
 * JPEG: scorre i segmenti dall'offset 2 fino al primo marker SOF, che porta
 * `precision(1) · height(2) · width(2)` subito dopo la lunghezza del segmento.
 * Nessuna decodifica dell'immagine: si saltano i segmenti leggendone solo la
 * lunghezza dichiarata.
 */
function readJpegDimensions(buffer: Buffer): RasterDimensions | null {
  let offset = 2;
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1; // Byte di riempimento fra segmenti: si avanza di uno, non si abbandona.
      continue;
    }
    const marker = buffer[offset + 1];
    if (marker === 0xff) {
      offset += 1;
      continue;
    }
    if (JPEG_SOF_MARKERS.has(marker)) {
      return {
        height: buffer.readUInt16BE(offset + 5),
        width: buffer.readUInt16BE(offset + 7),
      };
    }
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd9)) {
      offset += 2; // Marker senza payload (SOI, RSTn, EOI).
      continue;
    }
    const segmentLength = buffer.readUInt16BE(offset + 2);
    if (segmentLength < 2) return null; // Lunghezza impossibile: header corrotto.
    offset += 2 + segmentLength;
  }
  return null;
}

/** PNG: chunk IHDR immediatamente dopo la firma, `width`/`height` big-endian agli offset 16 e 20. */
function readPngDimensions(buffer: Buffer): RasterDimensions | null {
  if (buffer.length < 24 || buffer.subarray(12, 16).toString('ascii') !== 'IHDR') return null;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

/** GIF: logical screen descriptor, due interi little-endian a 16 bit agli offset 6 e 8. */
function readGifDimensions(buffer: Buffer): RasterDimensions | null {
  if (buffer.length < 10) return null;
  return { width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8) };
}

/**
 * WebP: tre varianti di chunk, ciascuna con un layout proprio.
 * `VP8 ` (lossy) porta il sync code `9d 01 2a` e due interi a 14 bit;
 * `VP8L` (lossless) impacchetta `width-1`/`height-1` in 28 bit consecutivi;
 * `VP8X` (esteso) usa due interi a 24 bit little-endian, anch'essi decrementati.
 */
function readWebpDimensions(buffer: Buffer): RasterDimensions | null {
  if (buffer.length < 30) return null;
  const chunk = buffer.subarray(12, 16).toString('ascii');

  if (chunk === 'VP8 ') {
    if (buffer.subarray(23, 26).toString('hex') !== '9d012a') return null;
    return {
      width: buffer.readUInt16LE(26) & 0x3fff,
      height: buffer.readUInt16LE(28) & 0x3fff,
    };
  }

  if (chunk === 'VP8L') {
    if (buffer[20] !== 0x2f) return null;
    const bits = buffer.readUInt32LE(21);
    return {
      width: (bits & 0x3fff) + 1,
      height: ((bits >> 14) & 0x3fff) + 1,
    };
  }

  if (chunk === 'VP8X') {
    const width = buffer[24] | (buffer[25] << 8) | (buffer[26] << 16);
    const height = buffer[27] | (buffer[28] << 8) | (buffer[29] << 16);
    return { width: width + 1, height: height + 1 };
  }

  return null;
}

/**
 * AVIF: le dimensioni stanno nella box `ispe`, annidata in `meta > iprp > ipco`.
 * Invece di camminare l'intero albero ISOBMFF si individua la box `meta` di primo
 * livello e si cerca `ispe` **solo dentro la sua estensione**: il confine è reale,
 * non un `indexOf` sull'intero file. Se un'immagine dichiara più item (es. una
 * miniatura incorporata) vince la prima `ispe`, che è quella dell'item primario
 * nei file prodotti dai encoder correnti — un limite accettato e dichiarato, non
 * un'assunzione silenziosa.
 */
function readAvifDimensions(buffer: Buffer): RasterDimensions | null {
  let offset = 0;
  while (offset + 8 <= buffer.length) {
    const boxSize = buffer.readUInt32BE(offset);
    const boxType = buffer.subarray(offset + 4, offset + 8).toString('ascii');
    if (boxSize < 8) return null; // `0` (fino a EOF) e `1` (64 bit) non compaiono prima di `meta`.

    if (boxType === 'meta') {
      const metaEnd = Math.min(offset + boxSize, buffer.length);
      const ispeIndex = buffer.indexOf('ispe', offset, 'ascii');
      if (ispeIndex === -1 || ispeIndex + 16 > metaEnd) return null;
      return {
        width: buffer.readUInt32BE(ispeIndex + 8),
        height: buffer.readUInt32BE(ispeIndex + 12),
      };
    }
    offset += boxSize;
  }
  return null;
}

/**
 * Legge le dimensioni intrinseche di un blob raster **dai soli header**, senza
 * decodificare l'immagine e senza dipendenze npm nuove (RFC-F09 N2, firmata il
 * 2026-09-11). `sharp` non è usato qui di proposito: ADR-49 § Conformità lo
 * confina al worker BullMQ e questo codice sta nel percorso di una richiesta HTTP.
 *
 * Restituisce `null` quando il formato non è riconosciuto o l'header è troncato:
 * un `null` è "non misurato", mai "zero". Il chiamante persiste `null` e la
 * griglia dell'editor regge il caso (PLAN-F09 T4).
 */
export function readRasterDimensions(buffer: Buffer): RasterDimensions | null {
  const mimeType = detectRasterMimeType(buffer);
  const dimensions = ((): RasterDimensions | null => {
    switch (mimeType) {
      case 'image/jpeg':
        return readJpegDimensions(buffer);
      case 'image/png':
        return readPngDimensions(buffer);
      case 'image/gif':
        return readGifDimensions(buffer);
      case 'image/webp':
        return readWebpDimensions(buffer);
      case 'image/avif':
        return readAvifDimensions(buffer);
      default:
        return null;
    }
  })();

  if (!dimensions || dimensions.width <= 0 || dimensions.height <= 0) return null;
  return dimensions;
}
