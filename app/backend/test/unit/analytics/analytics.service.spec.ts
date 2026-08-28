import { AnalyticsService } from '../../../src/analytics/analytics.service';
import { AppConstants } from '../../../src/common/app-constants';

describe('AnalyticsService', () => {
  it('accetta solo il secret configurato con la stessa lunghezza', () => {
    Object.defineProperty(AppConstants, 'analyticsIngestSecret', {
      configurable: true,
      value: 'analytics-test-secret',
    });
    const service = new AnalyticsService({} as never, {} as never);
    expect(service.isValidIngestSecret('analytics-test-secret')).toBe(true);
    expect(service.isValidIngestSecret('wrong-secret')).toBe(false);
  });

  it('non conta un percorso che il resolver pubblico non può servire', async () => {
    const db = { db: { insert: jest.fn(), update: jest.fn() } };
    const publicPages = {
      resolveByPath: jest.fn().mockRejectedValue(new Error('not published')),
    };
    const service = new AnalyticsService(db as never, publicPages as never);

    await expect(service.ingestPageview('/draft')).rejects.toThrow('not published');
    expect(db.db.insert).not.toHaveBeenCalled();
  });
});
