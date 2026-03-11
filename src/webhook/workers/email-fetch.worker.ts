import { Worker, Job } from 'bullmq';
import { redisConnection } from '../../shared/redis';
import { EmailFetchJobData } from '../queues/queue';
import { fetchEmail } from '../services/email-fetch.service';

export const emailFetchWorker = new Worker<EmailFetchJobData>(
  'email-fetch',
  async (job: Job<EmailFetchJobData>) => {
    const attempt = job.attemptsMade + 1;
    console.log(`[Worker:EmailFetch] Job ${job.id} | attempt=${attempt} | provider=${job.data.provider} | email=${job.data.emailAddress} | messageId=${job.data.messageId}`);
    await fetchEmail(job.data);
  },
  { connection: redisConnection, concurrency: 10 }
);

emailFetchWorker.on('completed', (job) => {
  console.log(`[Worker:EmailFetch] Job ${job.id} completed`);
});

emailFetchWorker.on('failed', (job, err) => {
  console.error(`[Worker:EmailFetch] Job ${job?.id} failed:`, err.message);
});
