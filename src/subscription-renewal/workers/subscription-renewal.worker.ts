import { renewExpiringOutlookSubscriptions } from '../services/outlook-renewal.service';

const DEFAULT_RENEW_INTERVAL_MINUTES = 5;
const DEFAULT_RENEW_WINDOW_MINUTES = 10;
const DEFAULT_SUB_DURATION_MINUTES = 60;

let isWorkerRunning = false;

const readMinutesFromEnv = (name: string, defaultValue: number): number => {
  const raw = process.env[name];
  if (!raw) {
    return defaultValue;
  }

  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    console.warn(`[SubRenewal] Invalid ${name}=${raw}. Using default=${defaultValue}`);
    return defaultValue;
  }

  return value;
};

export const startSubscriptionRenewalWorker = () => {
  const intervalMinutes = readMinutesFromEnv('SUB_RENEW_INTERVAL_MINUTES', DEFAULT_RENEW_INTERVAL_MINUTES);
  const renewWindowMinutes = readMinutesFromEnv('SUB_RENEW_WINDOW_MINUTES', DEFAULT_RENEW_WINDOW_MINUTES);
  const durationMinutes = readMinutesFromEnv('OUTLOOK_SUB_DURATION_MINUTES', DEFAULT_SUB_DURATION_MINUTES);

  const run = async () => {
    if (isWorkerRunning) {
      console.log('[SubRenewal] Skipping run because previous run is still in progress');
      return;
    }

    isWorkerRunning = true;

    try {
      await renewExpiringOutlookSubscriptions({
        renewWindowMinutes,
        durationMinutes,
      });
    } catch (error: any) {
      console.error(`[SubRenewal] Worker execution failed: ${error.message}`);
    } finally {
      isWorkerRunning = false;
    }
  };

  console.log(
    `[SubRenewal] Starting worker interval=${intervalMinutes}m renewWindow=${renewWindowMinutes}m extendBy=${durationMinutes}m`
  );

  // Run once on startup, then periodically.
  void run();

  const intervalMs = intervalMinutes * 60 * 1000;
  const timer = setInterval(() => {
    void run();
  }, intervalMs);

  return () => {
    clearInterval(timer);
    console.log('[SubRenewal] Worker stopped');
  };
};
