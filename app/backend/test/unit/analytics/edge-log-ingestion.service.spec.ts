import { appendFileSync, existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const mockAppConstants = { edgeAccessLogDir: '', analyticsSaltSecret: 'sale-di-test' };
jest.mock('../../../src/common/app-constants', () => ({ AppConstants: mockAppConstants }));

import { EdgeLogIngestionService } from '../../../src/queues/edge-log-ingestion-queue/edge-log-ingestion.service';
import type { DbService } from '../../../src/db/db.service';
import type { RedisService } from '../../../src/redis/redis.service';

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128.0 Safari/537.36';

function logLine(uri: string, time: string, ua = BROWSER_UA): string {
  return `${JSON.stringify({ time, method: 'GET', uri, status: 200, ip: '198.51.100.4', ua, referer: '', purpose: '' })}\n`;
}

interface InsertedRow {
  guid: string;
  path: string;
  visitorHash: string;
  createdAt: Date;
}

describe('EdgeLogIngestionService (ADR-68)', () => {
  let dir: string;
  let stored: Map<string, InsertedRow>;
  let redisStore: Map<string, string>;
  let service: EdgeLogIngestionService;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'edge-logs-'));
    mockAppConstants.edgeAccessLogDir = dir;
    stored = new Map();
    redisStore = new Map();

    // Finto `insert().values().onConflictDoNothing().returning()`: il guid è la chiave unica.
    const db = {
      db: {
        insert: () => ({
          values: (rows: InsertedRow[]) => ({
            onConflictDoNothing: () => ({
              returning: async () => {
                const fresh = rows.filter((row) => !stored.has(row.guid));
                fresh.forEach((row) => stored.set(row.guid, row));
                return fresh.map((_row, id) => ({ id }));
              },
            }),
          }),
        }),
      },
    };
    const redis = {
      get: async (key: string) => redisStore.get(key) ?? null,
      set: async (key: string, value: string) => void redisStore.set(key, value),
      del: async (key: string) => (redisStore.delete(key) ? 1 : 0),
    };
    service = new EdgeLogIngestionService(
      db as unknown as DbService,
      redis as unknown as RedisService,
    );
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  const now = new Date('2026-09-13T12:00:00Z');

  it('registra le visite di oggi e riparte dalla riga successiva al giro dopo', async () => {
    const file = join(dir, 'access-2026-09-13.log');
    writeFileSync(file, logLine('/chi-siamo', '2026-09-13T10:00:00+00:00'));

    const first = await service.ingest(now);
    appendFileSync(file, logLine('/contatti', '2026-09-13T10:05:00+00:00'));
    const second = await service.ingest(now);

    expect(first.eventsInserted).toBe(1);
    expect(second).toMatchObject({ linesRead: 1, eventsInserted: 1 });
    expect([...stored.values()].map((row) => row.path)).toEqual(['/chi-siamo', '/contatti']);
    expect(existsSync(file)).toBe(true);
  });

  it("non salva mai l'IP: solo un hash di 64 caratteri", async () => {
    writeFileSync(
      join(dir, 'access-2026-09-13.log'),
      logLine('/chi-siamo', '2026-09-13T10:00:00+00:00'),
    );

    await service.ingest(now);

    const [row] = [...stored.values()];
    expect(row.visitorHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(row)).not.toContain('198.51.100.4');
  });

  it('cancella il file di un giorno concluso dopo averlo letto', async () => {
    const file = join(dir, 'access-2026-09-12.log');
    writeFileSync(file, logLine('/chi-siamo', '2026-09-12T23:59:00+00:00'));

    const result = await service.ingest(now);

    expect(result).toMatchObject({ eventsInserted: 1, filesDeleted: 1 });
    expect(existsSync(file)).toBe(false);
  });

  it('una riga ancora in scrittura, senza a capo, resta per il giro successivo', async () => {
    const file = join(dir, 'access-2026-09-13.log');
    writeFileSync(file, logLine('/chi-siamo', '2026-09-13T10:00:00+00:00') + '{"time":"2026-09');

    const result = await service.ingest(now);

    expect(result).toMatchObject({ linesRead: 1, eventsInserted: 1 });
  });

  it('rileggere un file con la posizione persa non duplica le visite', async () => {
    writeFileSync(
      join(dir, 'access-2026-09-13.log'),
      logLine('/chi-siamo', '2026-09-13T10:00:00+00:00'),
    );

    await service.ingest(now);
    redisStore.clear();
    const again = await service.ingest(now);

    expect(again).toMatchObject({ linesRead: 1, eventsInserted: 0 });
    expect(stored.size).toBe(1);
  });

  it('i bot vengono letti ma non registrati', async () => {
    writeFileSync(
      join(dir, 'access-2026-09-13.log'),
      logLine('/chi-siamo', '2026-09-13T10:00:00+00:00', 'Mozilla/5.0 (compatible; bingbot/2.0)'),
    );

    const result = await service.ingest(now);

    expect(result).toMatchObject({ linesRead: 1, eventsInserted: 0 });
  });

  it('senza directory dei log non fa nulla', async () => {
    mockAppConstants.edgeAccessLogDir = join(dir, 'non-esiste');

    await expect(service.ingest(now)).resolves.toMatchObject({ filesRead: 0 });
  });
});
