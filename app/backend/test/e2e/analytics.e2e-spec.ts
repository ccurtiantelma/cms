import { AnalyticsService } from '../../src/analytics/analytics.service';
import { DbService } from '../../src/db/db.service';
import { analyticsEventEntity } from '../../src/db/schema';
import { closeTestDb, getTestDb, runMigrations, truncateAllTables } from './helpers/db-test.helper';

/**
 * Spostato da `test/unit/`: la query bucketizza con `date_trunc(...)
 * at time zone 'UTC'`, valutato dal motore Postgres — non da drizzle in
 * memoria — quindi richiede un Postgres reale e appartiene alla suite e2e,
 * dove quell'infrastruttura è già cablata (`db-test.helper.ts`).
 */
describe('AnalyticsService — bucketing timeseries (Postgres reale)', () => {
  let analyticsService: AnalyticsService;

  beforeAll(async () => {
    await runMigrations();
    analyticsService = new AnalyticsService({ db: getTestDb() } as DbService);
  });

  beforeEach(async () => {
    await truncateAllTables();
  });

  afterAll(async () => {
    await closeTestDb();
  });

  it('builds a valid timeseries for a daily bucket range', async () => {
    await getTestDb()
      .insert(analyticsEventEntity)
      .values({
        path: '/test',
        visitorHash: 'a'.repeat(64),
        device: 'desktop',
        browser: 'chrome',
        os: 'linux',
        referrer: 'https://example.com',
        country: 'IT',
        createdAt: new Date('2026-08-15T10:12:00.000Z'),
      });

    const result = await analyticsService.getTimeseries('2026-08-02', '2026-08-31', 'day');

    expect(result.interval).toBe('day');
    expect(result.points).toHaveLength(1);
    expect(result.points[0]).toMatchObject({
      views: 1,
      uniqueVisitors: 1,
    });
    expect(result.points[0].bucket).toMatch(
      /^2026-08-14T22:00:00\.000Z|2026-08-15T00:00:00\.000Z$/,
    );
  });
});
