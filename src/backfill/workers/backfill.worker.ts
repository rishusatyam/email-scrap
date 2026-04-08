import { Job, Worker } from 'bullmq';
import { redisConnection } from '../../shared/redis';
import { BackfillJobData } from '../queues/backfill.queue';
import { processOutlookBackfill } from '../services/outlook-backfill.service';
import { processGmailBackfill } from '../services/gmail-backfill.service';

export const backfillWorker = new Worker<BackfillJobData>(
  'backfill',
  async (job: Job<BackfillJobData>) => {
    const attempt = job.attemptsMade + 1;
    console.log(
      `[Worker:Backfill] Job ${job.id} | attempt=${attempt} | provider=${job.data.provider} | mailboxId=${job.data.mailboxId}`
    );

    if (job.data.provider === 'outlook') {
      await processOutlookBackfill(job.data.mailboxId);
      return;
    }

    if (job.data.provider === 'gmail') {
      await processGmailBackfill(job.data.mailboxId);
      return;
    }

    throw new Error(`[Worker:Backfill] Unsupported provider=${job.data.provider}`);
  },
  { connection: redisConnection, concurrency: 2 }
);

backfillWorker.on('completed', (job) => {
  console.log(`[Worker:Backfill] Job ${job.id} completed`);
});

backfillWorker.on('failed', (job, err) => {
  console.error(`[Worker:Backfill] Job ${job?.id} failed:`, err.message);
});
