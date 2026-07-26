import { MetricsController } from '../../../src/metrics/metrics.controller';
import { MetricsService } from '../../../src/metrics/metrics.service';

describe('MetricsController (unit, ADR-15)', () => {
  it("restituisce l'output serializzato del MetricsService", async () => {
    const getMetrics = jest.fn().mockResolvedValue('# HELP process_cpu_user_seconds_total ...\n');
    const metricsService = { getMetrics } as unknown as MetricsService;
    const controller = new MetricsController(metricsService);

    const result = await controller.getMetrics();

    expect(result).toBe('# HELP process_cpu_user_seconds_total ...\n');
    expect(getMetrics).toHaveBeenCalledTimes(1);
  });
});
