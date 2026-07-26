import { HealthIndicatorService } from '@nestjs/terminus';
import { DrizzleHealthIndicator } from '../../../src/health/indicators/drizzle.health-indicator';
import { DbService } from '../../../src/db/db.service';

describe('DrizzleHealthIndicator (unit)', () => {
  let executeMock: jest.Mock;
  let indicator: DrizzleHealthIndicator;

  beforeEach(() => {
    executeMock = jest.fn();
    const dbService = { db: { execute: executeMock } } as unknown as DbService;
    indicator = new DrizzleHealthIndicator(dbService, new HealthIndicatorService());
  });

  it('restituisce "up" quando la query di ping ha successo', async () => {
    executeMock.mockResolvedValue(undefined);

    const result = await indicator.isHealthy('database');

    expect(result).toEqual({ database: { status: 'up' } });
  });

  it('restituisce "down" con il messaggio d\'errore quando la query fallisce', async () => {
    executeMock.mockRejectedValue(new Error('connect ECONNREFUSED'));

    const result = await indicator.isHealthy('database');

    expect(result).toEqual({
      database: { status: 'down', error: 'connect ECONNREFUSED' },
    });
  });
});
