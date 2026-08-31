import { AnalyticsService } from '../../../src/analytics/analytics.service';
import { DbService } from '../../../src/db/db.service';
import { analyticsEventEntity } from '../../../src/db/schema';

describe('AnalyticsService (unit/integration)', () => {
  let dbService: DbService;
  let analyticsService: AnalyticsService;

  beforeAll(async () => {
    dbService = new DbService();
    await dbService.onModuleInit();
    analyticsService = new AnalyticsService(dbService);
  });

  afterAll(async () => {
    await dbService.onModuleDestroy();
  });

  beforeEach(async () => {
    await dbService.db.delete(analyticsEventEntity);
  });

  it('builds a valid timeseries for a daily bucket range', async () => {
    await dbService.db.insert(analyticsEventEntity).values({
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
    expect(result.points[0].bucket).toMatch(/^2026-08-14T22:00:00\.000Z|2026-08-15T00:00:00\.000Z$/);
  });
});
