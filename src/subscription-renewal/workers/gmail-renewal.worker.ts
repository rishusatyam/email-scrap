import { renewExpiringGmailSubscriptions } from '../services/gmail-renewal.service';

const DEFAULT_GMAIL_RENEW_INTERVAL_MINUTES = 5;
const DEFAULT_GMAIL_RENEW_WINDOW_MINUTES = 24 * 60;

let isWorkerRunning = false;

const readMinutesFromEnv = (name: string, defaultValue: number): number => {
  const raw = process.env[name];
  if (!raw) {
    return defaultValue;
  }

  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    console.warn(`[GmailRenewal] Invalid ${name}=${raw}. Using default=${defaultValue}`);
    return defaultValue;
  }

  return value;
};

export const startGmailRenewalWorker = () => {
  const intervalMinutes = readMinutesFromEnv(
    'GMAIL_RENEW_INTERVAL_MINUTES',
    DEFAULT_GMAIL_RENEW_INTERVAL_MINUTES
  );
  const renewWindowMinutes = readMinutesFromEnv(
    'GMAIL_RENEW_WINDOW_MINUTES',
    DEFAULT_GMAIL_RENEW_WINDOW_MINUTES
  );

  const run = async () => {
    if (isWorkerRunning) {
      console.log('[GmailRenewal] Skipping run because previous run is still in progress');
      return;
    }

    isWorkerRunning = true;

    try {
      await renewExpiringGmailSubscriptions({
        renewWindowMinutes,
      });
    } catch (error: any) {
      console.error(`[GmailRenewal] Worker execution failed: ${error.message}`);
    } finally {
      isWorkerRunning = false;
    }
  };

  console.log(
    `[GmailRenewal] Starting worker interval=${intervalMinutes}m renewWindow=${renewWindowMinutes}m`
  );

  // Run once on startup, then periodically.
  void run();

  const intervalMs = intervalMinutes * 60 * 1000;
  const timer = setInterval(() => {
    void run();
  }, intervalMs);

  return () => {
    clearInterval(timer);
    console.log('[GmailRenewal] Worker stopped');
  };
};
