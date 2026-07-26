import { HealthIndicatorService } from '@nestjs/terminus';
import { RedisHealthIndicator } from '../../../src/health/indicators/redis.health-indicator';
import { RedisService } from '../../../src/redis/redis.service';

describe('RedisHealthIndicator (unit)', () => {
  let pingMock: jest.Mock;
  let indicator: RedisHealthIndicator;

  beforeEach(() => {
    pingMock = jest.fn();
    const redisService = { ping: pingMock } as unknown as RedisService;
    indicator = new RedisHealthIndicator(redisService, new HealthIndicatorService());
  });

  it('restituisce "up" quando il PING risponde PONG', async () => {
    pingMock.mockResolvedValue('PONG');

    const result = await indicator.isHealthy('redis');

    expect(result).toEqual({ redis: { status: 'up' } });
  });

  it('restituisce "down" quando il PING risponde un valore inatteso', async () => {
    pingMock.mockResolvedValue('WAT');

    const result = await indicator.isHealthy('redis');

    expect(result).toEqual({ redis: { status: 'down', reply: 'WAT' } });
  });

  it('restituisce "down" con il messaggio d\'errore quando il PING fallisce/va in timeout', async () => {
    pingMock.mockRejectedValue(new Error('Redis check: timeout dopo 3000ms'));

    const result = await indicator.isHealthy('redis');

    expect(result).toEqual({
      redis: { status: 'down', error: 'Redis check: timeout dopo 3000ms' },
    });
  });
});
