import { gmailHistoryWorker } from './gmail-history.worker';
import { emailFetchWorker } from './email-fetch.worker';
import { backfillWorker } from '../../backfill/workers/backfill.worker';

// Start all background workers
export const startWorkers = () => {
  console.log('[Workers] Gmail history worker started');
  console.log('[Workers] Email fetch worker started');
  console.log('[Workers] Backfill worker started');

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    console.log('[Workers] Shutting down workers...');
    await gmailHistoryWorker.close();
    await emailFetchWorker.close();
    await backfillWorker.close();
    process.exit(0);
  });
};
