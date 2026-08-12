import type { Queue } from 'bullmq';

describe('FilesCleanupScheduler (unit)', () => {
  const buildQueue = (repeatableJobs: { key: string; pattern: string }[]): jest.Mocked<Queue> =>
    ({
      getRepeatableJobs: jest.fn().mockResolvedValue(repeatableJobs),
      removeRepeatableByKey: jest.fn().mockResolvedValue(undefined),
      add: jest.fn().mockResolvedValue(undefined),
    }) as unknown as jest.Mocked<Queue>;

  afterEach(() => {
    jest.resetModules();
  });

  it('non registra nulla se il cleanup è disabilitato', async () => {
    jest.doMock('../../../../src/common/app-constants', () => ({
      AppConstants: { filesCleanupEnabled: false, filesCleanupCronPattern: '0 3 * * *' },
    }));
    const { FilesCleanupScheduler } =
      await import('../../../../src/queues/files-cleanup-queue/files-cleanup.scheduler');
    const queue = buildQueue([]);
    const scheduler = new FilesCleanupScheduler(queue);

    await scheduler.onModuleInit();

    expect(queue.getRepeatableJobs).not.toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('registra il repeatable job se abilitato e non ancora presente', async () => {
    jest.doMock('../../../../src/common/app-constants', () => ({
      AppConstants: { filesCleanupEnabled: true, filesCleanupCronPattern: '0 3 * * *' },
    }));
    const { FilesCleanupScheduler } =
      await import('../../../../src/queues/files-cleanup-queue/files-cleanup.scheduler');
    const queue = buildQueue([]);
    const scheduler = new FilesCleanupScheduler(queue);

    await scheduler.onModuleInit();

    expect(queue.add).toHaveBeenCalledWith(
      'purge-orphan-blobs',
      {},
      { repeat: { pattern: '0 3 * * *' }, jobId: 'files-cleanup-repeatable' },
    );
    expect(queue.removeRepeatableByKey).not.toHaveBeenCalled();
  });

  it('non ri-registra il repeatable job se già presente con lo stesso pattern', async () => {
    jest.doMock('../../../../src/common/app-constants', () => ({
      AppConstants: { filesCleanupEnabled: true, filesCleanupCronPattern: '0 3 * * *' },
    }));
    const { FilesCleanupScheduler } =
      await import('../../../../src/queues/files-cleanup-queue/files-cleanup.scheduler');
    const queue = buildQueue([{ key: 'existing-key', pattern: '0 3 * * *' }]);
    const scheduler = new FilesCleanupScheduler(queue);

    await scheduler.onModuleInit();

    expect(queue.add).not.toHaveBeenCalled();
    expect(queue.removeRepeatableByKey).not.toHaveBeenCalled();
  });

  it('rimuove il repeatable job obsoleto e ne registra uno nuovo se il pattern è cambiato', async () => {
    jest.doMock('../../../../src/common/app-constants', () => ({
      AppConstants: { filesCleanupEnabled: true, filesCleanupCronPattern: '0 4 * * *' },
    }));
    const { FilesCleanupScheduler } =
      await import('../../../../src/queues/files-cleanup-queue/files-cleanup.scheduler');
    const queue = buildQueue([{ key: 'old-key', pattern: '0 3 * * *' }]);
    const scheduler = new FilesCleanupScheduler(queue);

    await scheduler.onModuleInit();

    expect(queue.removeRepeatableByKey).toHaveBeenCalledWith('old-key');
    expect(queue.add).toHaveBeenCalledWith(
      'purge-orphan-blobs',
      {},
      { repeat: { pattern: '0 4 * * *' }, jobId: 'files-cleanup-repeatable' },
    );
  });
});
