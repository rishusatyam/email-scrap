import { Queue } from 'bullmq';
import { redisConnection } from '../../shared/redis';

// Job payload types
export interface GmailHistoryJobData {
  emailAddress: string;
  mailboxId: string;
  historyId: string;
}

export interface EmailFetchJobData {
  provider: 'gmail' | 'outlook';
  emailAddress: string;
  messageId: string;
}

// Queue: processes Gmail historyId → resolves to messageIds
// jobId = emailAddress:historyId → prevents duplicate processing of same history event
export const gmailHistoryQueue = new Queue<GmailHistoryJobData>('gmail-history', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: 100,
    removeOnFail: 200
  }
});

// Queue: fetches a single email by messageId from Gmail or Outlook
// jobId = provider:emailAddress:messageId → prevents duplicate fetching of same message
export const emailFetchQueue = new Queue<EmailFetchJobData>('email-fetch', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: 100,
    removeOnFail: 200
  }
});

// Helper: enqueue a Gmail history job with deduplication
export const enqueueGmailHistory = async (data: GmailHistoryJobData) => {
  const jobId = `gmail-history#${data.mailboxId}#${data.historyId}`;
  await gmailHistoryQueue.add('process-history', data, { jobId });
  return jobId;
};

// Helper: enqueue an email fetch job with deduplication
export const enqueueEmailFetch = async (data: EmailFetchJobData) => {
  const email = data.emailAddress.replace('@', '_');
  const jobId = `email-fetch#${data.provider}#${email}#${data.messageId}`;
  await emailFetchQueue.add('fetch-email', data, { jobId });
  return jobId;
};
