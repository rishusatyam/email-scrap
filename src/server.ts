import app from './app';
import { config } from './shared/config';
import { startWorkers } from './webhook/workers';
import { startSubscriptionRenewalWorker } from './subscription-renewal';

const PORT = config.port;

// Start background queue workers
startWorkers();
const stopSubscriptionRenewalWorker = startSubscriptionRenewalWorker();

process.on('SIGTERM', () => {
  stopSubscriptionRenewalWorker();
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📧 Gmail OAuth:   http://localhost:${PORT}/auth/gmail/start`);
  console.log(`📧 Outlook OAuth: http://localhost:${PORT}/auth/outlook/start`);
  console.log(`🪝  Gmail Webhook: POST http://localhost:${PORT}/webhook/gmail`);
  console.log(`🪝  Outlook Webhook: POST http://localhost:${PORT}/webhook/outlook`);
});
