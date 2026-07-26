import { MetricsService } from '../../../src/metrics/metrics.service';

describe('MetricsService (unit, ADR-15)', () => {
  let service: MetricsService;

  beforeEach(() => {
    service = new MetricsService();
  });

  afterEach(() => {
    service.onModuleDestroy();
  });

  it('espone il Content-Type standard Prometheus', () => {
    expect(service.contentType).toBe('text/plain; version=0.0.4; charset=utf-8');
  });

  it('getMetrics include le metriche di default del processo (collectDefaultMetrics)', async () => {
    const metrics = await service.getMetrics();

    expect(metrics).toContain('process_cpu_user_seconds_total');
    expect(metrics).toContain('nodejs_eventloop_lag_seconds');
  });

  it("observeHttpRequest registra una osservazione con le label attese nell'istogramma", async () => {
    service.observeHttpRequest('GET', '/app/users', 200, 0.042);

    const metrics = await service.getMetrics();

    expect(metrics).toContain('http_request_duration_seconds_count');
    expect(metrics).toContain('method="GET"');
    expect(metrics).toContain('route="/app/users"');
    expect(metrics).toContain('status_code="200"');
  });
});
