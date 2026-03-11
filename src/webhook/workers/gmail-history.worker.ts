import { Worker, Job } from 'bullmq';
import { redisConnection } from '../../shared/redis';
import { GmailHistoryJobData } from '../queues/queue';
import { processHistoryEvent } from '../services/gmail-history.service';

export const gmailHistoryWorker = new Worker<GmailHistoryJobData>(
  'gmail-history',
  async (job: Job<GmailHistoryJobData>) => {
    const attempt = job.attemptsMade + 1;
    console.log(`[Worker:GmailHistory] Job ${job.id} | attempt=${attempt} | email=${job.data.emailAddress} | historyId=${job.data.historyId}`);
    await processHistoryEvent(job.data);
  },
  { connection: redisConnection, concurrency: 5 }
);

gmailHistoryWorker.on('completed', (job) => {
  console.log(`[Worker:GmailHistory] Job ${job.id} completed`);
});

gmailHistoryWorker.on('failed', (job, err) => {
  console.error(`[Worker:GmailHistory] Job ${job?.id} failed:`, err.message);
});
