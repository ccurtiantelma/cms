import {
  detectRasterMimeType,
  readRasterDimensions,
} from '../../../../src/files/public-media/raster-mime-sniffer';

/**
 * Costruttori di header raster minimi. Ogni funzione produce **solo** i byte di
 * intestazione che il parser legge davvero: se un test passasse con un'immagine
 * reale ma fallisse con questi buffer, il parser starebbe decodificando più di
 * quanto RFC-F09 N2 gli concede (« dai soli header, nessuna decodifica »).
 */
function buildPng(width: number, height: number): Buffer {
  const buffer = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buffer, 0);
  buffer.writeUInt32BE(13, 8);
  buffer.write('IHDR', 12, 'ascii');
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  return buffer;
}

function buildGif(width: number, height: number): Buffer {
  const buffer = Buffer.alloc(13);
  buffer.write('GIF89a', 0, 'ascii');
  buffer.writeUInt16LE(width, 6);
  buffer.writeUInt16LE(height, 8);
  return buffer;
}

/** JPEG con un segmento APP0 da saltare prima del SOF0: verifica che lo skip funzioni. */
function buildJpeg(width: number, height: number): Buffer {
  const app0 = Buffer.alloc(18);
  app0.writeUInt16BE(0xffe0, 0);
  app0.writeUInt16BE(16, 2);
  app0.write('JFIF\0', 4, 'ascii');

  const sof0 = Buffer.alloc(11);
  sof0.writeUInt16BE(0xffc0, 0);
  sof0.writeUInt16BE(9, 2);
  sof0.writeUInt8(8, 4);
  sof0.writeUInt16BE(height, 5);
  sof0.writeUInt16BE(width, 7);

  return Buffer.concat([Buffer.from([0xff, 0xd8]), app0, sof0]);
}

function buildWebpLossy(width: number, height: number): Buffer {
  const buffer = Buffer.alloc(30);
  buffer.write('RIFF', 0, 'ascii');
  buffer.write('WEBP', 8, 'ascii');
  buffer.write('VP8 ', 12, 'ascii');
  Buffer.from([0x9d, 0x01, 0x2a]).copy(buffer, 23);
  buffer.writeUInt16LE(width, 26);
  buffer.writeUInt16LE(height, 28);
  return buffer;
}

function buildWebpLossless(width: number, height: number): Buffer {
  const buffer = Buffer.alloc(30);
  buffer.write('RIFF', 0, 'ascii');
  buffer.write('WEBP', 8, 'ascii');
  buffer.write('VP8L', 12, 'ascii');
  buffer.writeUInt8(0x2f, 20);
  buffer.writeUInt32LE(((height - 1) << 14) | (width - 1), 21);
  return buffer;
}

function buildWebpExtended(width: number, height: number): Buffer {
  const buffer = Buffer.alloc(30);
  buffer.write('RIFF', 0, 'ascii');
  buffer.write('WEBP', 8, 'ascii');
  buffer.write('VP8X', 12, 'ascii');
  buffer.writeUIntLE(width - 1, 24, 3);
  buffer.writeUIntLE(height - 1, 27, 3);
  return buffer;
}

/** AVIF: `ftyp` di primo livello, poi una box `meta` che contiene la `ispe`. */
function buildAvif(width: number, height: number): Buffer {
  const ftyp = Buffer.alloc(16);
  ftyp.writeUInt32BE(16, 0);
  ftyp.write('ftyp', 4, 'ascii');
  ftyp.write('avif', 8, 'ascii');
  ftyp.write('mif1', 12, 'ascii');

  const ispe = Buffer.alloc(20);
  ispe.writeUInt32BE(20, 0);
  ispe.write('ispe', 4, 'ascii');
  ispe.writeUInt32BE(width, 12);
  ispe.writeUInt32BE(height, 16);

  const meta = Buffer.alloc(8);
  meta.writeUInt32BE(8 + ispe.length, 0);
  meta.write('meta', 4, 'ascii');

  return Buffer.concat([ftyp, meta, ispe]);
}

describe('raster-mime-sniffer (unit)', () => {
  describe('detectRasterMimeType', () => {
    it.each([
      ['image/png', buildPng(1, 1)],
      ['image/gif', buildGif(1, 1)],
      ['image/jpeg', buildJpeg(1, 1)],
      ['image/webp', buildWebpLossy(1, 1)],
      ['image/avif', buildAvif(1, 1)],
    ])('riconosce %s dalla firma sui byte reali', (expected, buffer) => {
      expect(detectRasterMimeType(buffer)).toBe(expected);
    });

    it('rifiuta un SVG: è testuale, nessuna firma raster corrisponde (ADR-27 § 4)', () => {
      expect(
        detectRasterMimeType(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')),
      ).toBeNull();
    });

    it("rifiuta un SVG anche quando il nome del file finge un PNG: vale il contenuto, non l'estensione", () => {
      expect(
        detectRasterMimeType(Buffer.from('<?xml version="1.0"?><svg onload="alert(1)"/>')),
      ).toBeNull();
    });
  });

  describe('readRasterDimensions (RFC-F09 N2)', () => {
    it('legge le dimensioni di un PNG dal chunk IHDR', () => {
      expect(readRasterDimensions(buildPng(1920, 1080))).toEqual({ width: 1920, height: 1080 });
    });

    it('legge le dimensioni di un GIF dal logical screen descriptor (little-endian)', () => {
      expect(readRasterDimensions(buildGif(640, 480))).toEqual({ width: 640, height: 480 });
    });

    it('legge le dimensioni di un JPEG saltando i segmenti fino al SOF0', () => {
      expect(readRasterDimensions(buildJpeg(800, 600))).toEqual({ width: 800, height: 600 });
    });

    it('legge le dimensioni di un WebP lossy (VP8 , interi a 14 bit)', () => {
      expect(readRasterDimensions(buildWebpLossy(300, 200))).toEqual({ width: 300, height: 200 });
    });

    it('legge le dimensioni di un WebP lossless (VP8L, 28 bit impacchettati)', () => {
      expect(readRasterDimensions(buildWebpLossless(300, 200))).toEqual({
        width: 300,
        height: 200,
      });
    });

    it('legge le dimensioni di un WebP esteso (VP8X, interi a 24 bit decrementati)', () => {
      expect(readRasterDimensions(buildWebpExtended(4000, 3000))).toEqual({
        width: 4000,
        height: 3000,
      });
    });

    it('legge le dimensioni di un AVIF dalla box ispe annidata in meta', () => {
      expect(readRasterDimensions(buildAvif(2048, 1536))).toEqual({ width: 2048, height: 1536 });
    });

    it('restituisce null su un header troncato: "non misurato", mai zero', () => {
      expect(readRasterDimensions(buildPng(100, 100).subarray(0, 18))).toBeNull();
    });

    it('restituisce null su un formato non raster (SVG), senza lanciare', () => {
      expect(readRasterDimensions(Buffer.from('<svg/>'))).toBeNull();
    });

    it('restituisce null su un buffer vuoto', () => {
      expect(readRasterDimensions(Buffer.alloc(0))).toBeNull();
    });

    it('restituisce null se le dimensioni dichiarate sono zero (header corrotto)', () => {
      expect(readRasterDimensions(buildPng(0, 0))).toBeNull();
    });
  });
});
