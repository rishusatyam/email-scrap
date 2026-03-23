import axios from 'axios';
import * as mailboxDao from '../../auth/dao/mailbox.dao';
import { quickFilterGmail } from '../../classification/gmail-quick-filter.service';
import { GmailMessage } from '../../email-normalizer/types/email.types';
import { enqueueEmailFetch } from '../../webhook/queues/queue';

interface GmailListMessageItem {
  id?: string;
  threadId?: string;
}

interface GmailListResponse {
  messages?: GmailListMessageItem[];
  nextPageToken?: string;
  resultSizeEstimate?: number;
}

const GMAIL_MESSAGES_LIST_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/messages';
const GMAIL_BATCH_SIZE = 100;
const DEFAULT_LOOKBACK_DAYS = 300;

const SEARCH_TERMS = [
  'booking',
  'ticket',
  'itinerary',
  'reservation',
  'flight',
  'bus',
  'hotel',
];

const delay = async (ms: number) => {
  await new Promise((resolve) => setTimeout(resolve, ms));
};

const getLookbackUnixSeconds = (lookbackDays = DEFAULT_LOOKBACK_DAYS): number => {
  const millis = Date.now() - lookbackDays * 24 * 60 * 60 * 1000;
  return Math.floor(millis / 1000);
};

const buildGmailQuery = (): string => {
  const after = getLookbackUnixSeconds();
  return `after:${after} (${SEARCH_TERMS.join(' OR ')})`;
};

const getMetadataWithRetry = async (accessToken: string, messageId: string, maxAttempts = 3) => {
  let lastError: any;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await axios.get<GmailMessage>(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          params: {
            format: 'metadata',
            metadataHeaders: ['Subject', 'From'],
          },
        }
      );

      return response.data;
    } catch (err: any) {
      lastError = err;
      const status = err.response?.status;

      if ((status === 429 || status === 503) && attempt < maxAttempts) {
        const retryAfterSeconds = Number(err.response?.headers?.['retry-after']);
        const waitMs = Number.isFinite(retryAfterSeconds) ? retryAfterSeconds * 1000 : attempt * 1000;

        console.warn(`[Backfill:Gmail] Rate-limited for metadata messageId=${messageId}. Retrying in ${waitMs}ms (attempt ${attempt}/${maxAttempts})`);
        await delay(waitMs);
        continue;
      }

      throw err;
    }
  }

  throw lastError;
};

const listWithRetry = async (
  accessToken: string,
  params: Record<string, string | number | undefined>,
  maxAttempts = 3
) => {
  let lastError: any;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await axios.get<GmailListResponse>(GMAIL_MESSAGES_LIST_URL, {
        headers: { Authorization: `Bearer ${accessToken}` },
        params,
      });
    } catch (err: any) {
      lastError = err;
      const status = err.response?.status;

      if ((status === 429 || status === 503) && attempt < maxAttempts) {
        const retryAfterSeconds = Number(err.response?.headers?.['retry-after']);
        const waitMs = Number.isFinite(retryAfterSeconds) ? retryAfterSeconds * 1000 : attempt * 1000;

        console.warn(`[Backfill:Gmail] Rate-limited on list call. Retrying in ${waitMs}ms (attempt ${attempt}/${maxAttempts})`);
        await delay(waitMs);
        continue;
      }

      throw err;
    }
  }

  throw lastError;
};

export const processGmailBackfill = async (mailboxId: string) => {
  console.log(`[Backfill:Gmail] Starting backfill | mailboxId=${mailboxId}`);

  const mailbox = await mailboxDao.findMailboxById(mailboxId);
  if (!mailbox) {
    throw new Error(`[Backfill:Gmail] No mailbox found for mailboxId=${mailboxId}`);
  }

  if (mailbox.provider !== 'gmail') {
    throw new Error(`[Backfill:Gmail] Mailbox provider mismatch for mailboxId=${mailboxId}`);
  }

  if (mailbox.tokenExpiry && mailbox.tokenExpiry < new Date()) {
    throw new Error(`[Backfill:Gmail] Token expired for mailbox=${mailbox.id}`);
  }

  const accessToken = mailbox.encryptedAccessToken;
  const query = buildGmailQuery();

  const seenMessageIds = new Set<string>();
  let nextPageToken: string | undefined;

  let pagesProcessed = 0;
  let scanned = 0;
  let skipped = 0;
  let enqueued = 0;

  while (true) {
    const response = await listWithRetry(accessToken, {
      q: query,
      maxResults: GMAIL_BATCH_SIZE,
      pageToken: nextPageToken,
    });

    pagesProcessed += 1;
    const messages = response.data.messages || [];

    for (const item of messages) {
      scanned += 1;

      if (!item.id) {
        skipped += 1;
        console.log('[Backfill:Gmail] Skipped list record: missing message id');
        continue;
      }

      if (seenMessageIds.has(item.id)) {
        skipped += 1;
        console.log(`[Backfill:Gmail] Skipped duplicate metadata | messageId=${item.id}`);
        continue;
      }
      seenMessageIds.add(item.id);

      const metadata = await getMetadataWithRetry(accessToken, item.id);
      const filterResult = quickFilterGmail(metadata);

      if (!filterResult.isBooking) {
        skipped += 1;
        console.log(
          `[Backfill:Gmail] Skipped by quick filter | mailboxId=${mailboxId} | messageId=${item.id} | score=${filterResult.score} | reasons=${filterResult.reasons.join('; ')}`
        );
        continue;
      }

      const fetchJobId = await enqueueEmailFetch({
        provider: 'gmail',
        mailboxId,
        emailAddress: mailbox.emailAddress,
        messageId: item.id,
        source: 'backfill',
      });

      enqueued += 1;
      console.log(
        `[Backfill:Gmail] Enqueued email fetch | mailboxId=${mailboxId} | messageId=${item.id} | jobId=${fetchJobId}`
      );
    }

    nextPageToken = response.data.nextPageToken;

    if (!nextPageToken) {
      break;
    }

    await delay(100);
  }

  console.log(
    `[Backfill:Gmail] Completed | mailboxId=${mailbox.id} | pages=${pagesProcessed} | scanned=${scanned} | enqueued=${enqueued} | skipped=${skipped}`
  );
};
