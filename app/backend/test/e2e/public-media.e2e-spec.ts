import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import * as request from 'supertest';
import { PublicMediaController } from '../../src/files/public-media/public-media.controller';
import { PublicMediaService } from '../../src/files/public-media/public-media.service';
import { STORAGE_DRIVER, StorageDriver } from '../../src/files/storage/storage-driver.interface';
import { DbService } from '../../src/db/db.service';
import { AllExceptionsFilter } from '../../src/common/filters/all-exceptions.filter';
import { Readable } from 'stream';

/**
 * Test di integrazione di `GET api/v1/public/media/:guid` (ADR-27,
 * PLAN-F04c-editor-maturo.md T4/T8) — nessun test esisteva per questa rotta prima di T8.
 *
 * Stesso pattern di `files.e2e-spec.ts`: `DbService` e `STORAGE_DRIVER` mockati (nessuna
 * connessione reale a Postgres/disco — la logica di riconoscimento MIME dai byte reali è
 * comunque esercitata per intero, non stub). **Nessun `AuthMiddleware` montato**: la rotta
 * è anonima per contratto (esclusa dal prefisso `public/*`, ADR-27 § 1) — la sua assenza
 * qui è essa stessa parte della verifica RBAC (nessun 401 possibile, il middleware non
 * c'è nemmeno).
 */
describe('PublicMediaController (integration) — ADR-27', () => {
  let app: INestApplication;
  let findFirstMock: jest.Mock;
  let storageDownloadMock: jest.Mock;

  const JPEG_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
  // Testuale, non una firma raster: la tabella chiusa di `detectRasterMimeType` non la
  // riconosce mai — è così che ADR-27 § 4 rifiuta SVG "senza eccezioni configurabili".
  const SVG_BYTES = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>', 'utf8');

  const editorialImageRow = {
    id: 1,
    guid: 'a1b2c3d4e5f6a7b8',
    originalName: 'copertina.jpg',
    mimeType: 'image/jpeg', // dichiarato dal client all'upload: MAI la fonte del Content-Type qui
    sizeBytes: JPEG_BYTES.length,
    storageDriver: 'local',
    storageKey: 'k'.repeat(40),
    checksumSha256: 'x'.repeat(64),
    entity: 'page-media',
    entityId: 42,
    isActive: true,
    createdAt: new Date('2026-08-20T10:00:00.000Z'),
    updatedAt: new Date('2026-08-20T10:00:00.000Z'),
    createdBy: 7,
    updatedBy: 7,
  };

  beforeEach(async () => {
    findFirstMock = jest.fn().mockResolvedValue(editorialImageRow);
    storageDownloadMock = jest.fn().mockResolvedValue(Readable.from([JPEG_BYTES]));

    const dbServiceMock = {
      db: { query: { fileEntity: { findFirst: findFirstMock } } },
    };
    const storageDriverMock: StorageDriver = {
      upload: jest.fn().mockResolvedValue(undefined),
      download: storageDownloadMock,
      delete: jest.fn().mockResolvedValue(undefined),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      // `ThrottlerGuard` sulla rotta (stesso registro di `app.module.ts`, throttler
      // "public"): senza questo modulo la DI del guard non risolve, indipendentemente
      // dal fatto che i test qui non esercitino il rate limit stesso.
      imports: [
        ThrottlerModule.forRoot({ throttlers: [{ name: 'public', ttl: 60_000, limit: 300 }] }),
      ],
      controllers: [PublicMediaController],
      providers: [
        PublicMediaService,
        { provide: DbService, useValue: dbServiceMock },
        { provide: STORAGE_DRIVER, useValue: storageDriverMock },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new AllExceptionsFilter());
    // Nessun middleware di autenticazione montato: la rotta è anonima per costruzione.
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('happy path: 200, Content-Type dai byte reali (non da files.mimeType), header di sicurezza e cache immutabile', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/public/media/${editorialImageRow.guid}`)
      .expect(200);

    expect(res.headers['content-type']).toContain('image/jpeg');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-disposition']).toBe('inline');
    expect(res.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    expect(Buffer.isBuffer(res.body) ? res.body : Buffer.from(res.text)).toEqual(JPEG_BYTES);
  });

  it('nessun JWT/Authorization inviato: la rotta risponde comunque (anonima, mai 401)', async () => {
    // Nessun header impostato di proposito: è la verifica RBAC di questa superficie —
    // pubblica per contratto, non "pubblica perché nessuno l'ha protetta".
    await request(app.getHttpServer())
      .get(`/api/v1/public/media/${editorialImageRow.guid}`)
      .expect(200);
  });

  it('entity <> "page-media": 404, mai 403 (ADR-27 § 2, opt-in esplicito)', async () => {
    findFirstMock.mockResolvedValue(undefined); // la query filtra già su entity — non trovata
    const res = await request(app.getHttpServer())
      .get(`/api/v1/public/media/${editorialImageRow.guid}`)
      .expect(404);

    expect(res.body.statusCode).toBe(404);
    expect(res.status).not.toBe(403);
  });

  it('guid inesistente (o soft-eliminato): 404, stesso corpo di errore di un file non editoriale', async () => {
    findFirstMock.mockResolvedValue(undefined);
    await request(app.getHttpServer()).get('/api/v1/public/media/guid-inesistente').expect(404);
  });

  it('SVG (o qualunque byte non raster): 404, senza eccezioni configurabili', async () => {
    storageDownloadMock.mockResolvedValue(Readable.from([SVG_BYTES]));
    const res = await request(app.getHttpServer())
      .get(`/api/v1/public/media/${editorialImageRow.guid}`)
      .expect(404);

    expect(res.status).not.toBe(403);
  });

  it('byte che non corrispondono a nessuna firma raster ammessa (né estensione né MIME dichiarato salvano il file): 404', async () => {
    storageDownloadMock.mockResolvedValue(Readable.from([Buffer.from('contenuto qualunque')]));
    await request(app.getHttpServer())
      .get(`/api/v1/public/media/${editorialImageRow.guid}`)
      .expect(404);
  });

  it('blob assente/illeggibile sul driver di storage: 404, mai un 5xx', async () => {
    storageDownloadMock.mockRejectedValue(new Error('ENOENT'));
    await request(app.getHttpServer())
      .get(`/api/v1/public/media/${editorialImageRow.guid}`)
      .expect(404);
  });
});
