import type { Queue } from 'bullmq';
import { QueueHealthTask } from '../../../src/scheduler/tasks/queue-health.task';

describe('QueueHealthTask (unit)', () => {
  const buildQueue = (name: string, counts: Record<string, number>): Queue =>
    ({
      name,
      getJobCounts: jest.fn().mockResolvedValue(counts),
    }) as unknown as Queue;

  it('logga i contatori di entrambe le code registrate', async () => {
    const emailQueue = buildQueue('email-queue', { waiting: 1, active: 0, failed: 2, delayed: 0 });
    const filesCleanupQueue = buildQueue('files-cleanup-queue', {
      waiting: 0,
      active: 0,
      failed: 0,
      delayed: 1,
    });
    const task = new QueueHealthTask(emailQueue, filesCleanupQueue);

    await task.logQueueMetrics();

    expect(emailQueue.getJobCounts).toHaveBeenCalledWith('waiting', 'active', 'failed', 'delayed');
    expect(filesCleanupQueue.getJobCounts).toHaveBeenCalledWith(
      'waiting',
      'active',
      'failed',
      'delayed',
    );
  });
});
