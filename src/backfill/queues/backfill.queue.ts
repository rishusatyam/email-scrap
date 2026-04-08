import { Queue } from 'bullmq';
import { redisConnection } from '../../shared/redis';

export interface BackfillJobData {
  mailboxId: string;
  provider: 'outlook' | 'gmail';
}

export const backfillQueue = new Queue<BackfillJobData>('backfill', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 3000 },
    removeOnComplete: 100,
    removeOnFail: 200,
  },
});

export const enqueueBackfill = async (data: BackfillJobData) => {
  const jobId = `backfill#${data.provider}#${data.mailboxId}`;
  await backfillQueue.add('process-backfill', data, { jobId });
  return jobId;
};
