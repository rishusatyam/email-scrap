import axios, { AxiosRequestConfig } from 'axios';
import * as mailboxDao from '../../auth/dao/mailbox.dao';
import { enqueueEmailFetch } from '../../webhook/queues/queue';

interface BackfillMetadataSender {
  emailAddress?: {
    address?: string;
  };
}

interface OutlookMessageMetadata {
  id?: string;
  subject?: string;
  from?: BackfillMetadataSender;
  receivedDateTime?: string;
}

interface OutlookMessageListResponse {
  value?: OutlookMessageMetadata[];
  '@odata.nextLink'?: string;
}

const OUTLOOK_MESSAGES_URL = 'https://graph.microsoft.com/v1.0/me/messages';
const OUTLOOK_BATCH_SIZE = 50;
const DEFAULT_LOOKBACK_DAYS = 60;

const SEARCH_TERMS = [
  'booking',
  'ticket',
  'itinerary',
  'reservation',
  'flight',
  'bus',
  'hotel',
];

const SUBJECT_KEYWORDS = [
  'booking',
  'reservation',
  'ticket',
  'itinerary',
  'confirmation',
  'flight',
  'bus',
  'hotel',
];

const TRUSTED_SENDER_PATTERNS = [
  'makemytrip',
  'booking.com',
  'expedia',
  'airindia',
  'indigo',
  'goindigo',
  'spicejet',
  'vistara',
  'airasia',
  'emirates',
  'lufthansa',
  'qatarairways',
  'marriott',
  'hilton',
  'oyo',
];

const delay = async (ms: number) => {
  await new Promise((resolve) => setTimeout(resolve, ms));
};

const getBackfillStartDateIso = (lookbackDays = DEFAULT_LOOKBACK_DAYS): string => {
  const start = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);
  return start.toISOString();
};

const getSenderDomain = (from?: BackfillMetadataSender): string => {
  const address = from?.emailAddress?.address;
  if (!address) {
    return '';
  }

  const at = address.indexOf('@');
  if (at === -1) {
    return '';
  }

  return address.slice(at + 1).trim().toLowerCase();
};

const isLikelyBookingMetadata = (message: OutlookMessageMetadata): { isRelevant: boolean; reasons: string[] } => {
  const reasons: string[] = [];
  let score = 0;

  const subject = (message.subject || '').toLowerCase();
  const subjectHit = SUBJECT_KEYWORDS.find((keyword) => subject.includes(keyword));
  if (subjectHit) {
    score += 3;
    reasons.push(`subject keyword: ${subjectHit}`);
  }

  const senderDomain = getSenderDomain(message.from);
  const senderHit = TRUSTED_SENDER_PATTERNS.find(
    (pattern) => senderDomain.includes(pattern) || senderDomain.endsWith(pattern)
  );
  if (senderHit) {
    score += 2;
    reasons.push(`sender domain: ${senderDomain}`);
  }

  if (score < 3) {
    reasons.push('metadata quick filter score below threshold');
  }

  return {
    isRelevant: score >= 3,
    reasons,
  };
};

const graphGetWithRetry = async (
  url: string,
  accessToken: string,
  config: AxiosRequestConfig,
  maxAttempts = 3
) => {
  let lastError: any;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await axios.get<OutlookMessageListResponse>(url, {
        ...config,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          ConsistencyLevel: 'eventual',
          ...(config.headers || {}),
        },
      });
    } catch (err: any) {
      lastError = err;
      const status = err.response?.status;

      if ((status === 429 || status === 503) && attempt < maxAttempts) {
        const retryAfterSeconds = Number(err.response?.headers?.['retry-after']);
        const waitMs = Number.isFinite(retryAfterSeconds)
          ? retryAfterSeconds * 1000
          : attempt * 1000;

        console.warn(`[Backfill:Outlook] Rate-limited (status=${status}). Retrying in ${waitMs}ms (attempt ${attempt}/${maxAttempts})`);
        await delay(waitMs);
        continue;
      }

      throw err;
    }
  }

  throw lastError;
};

export const processOutlookBackfill = async (mailboxId: string) => {
  console.log(`[Backfill:Outlook] Starting backfill | mailboxId=${mailboxId}`);

  const mailbox = await mailboxDao.findMailboxById(mailboxId);
  if (!mailbox) {
    throw new Error(`[Backfill:Outlook] No Outlook mailbox found for mailboxId=${mailboxId}`);
  }

  if (mailbox.provider !== 'outlook') {
    throw new Error(`[Backfill:Outlook] Mailbox provider mismatch for mailboxId=${mailboxId}`);
  }

  if (mailbox.tokenExpiry && mailbox.tokenExpiry < new Date()) {
    throw new Error(`[Backfill:Outlook] Token expired for mailbox=${mailbox.id}`);
  }

  const accessToken = mailbox.encryptedAccessToken;
  const startDate = getBackfillStartDateIso();
  const startDateObj = new Date(startDate);

  const firstRequestParams = {
    '$top': OUTLOOK_BATCH_SIZE,
    '$select': 'id,subject,from,receivedDateTime',
    '$search': `"${SEARCH_TERMS.join(' OR ')}"`,
  };

  const seenMessageIds = new Set<string>();
  let nextLink: string | null = OUTLOOK_MESSAGES_URL;
  let firstPage = true;

  let pagesProcessed = 0;
  let scanned = 0;
  let skipped = 0;
  let enqueued = 0;

  while (nextLink) {
    const response = await graphGetWithRetry(
      nextLink,
      accessToken,
      firstPage
        ? { params: firstRequestParams }
        : {}
    );

    pagesProcessed += 1;
    const messages = response.data.value || [];

    for (const message of messages) {
      scanned += 1;

      if (!message.id) {
        skipped += 1;
        console.log('[Backfill:Outlook] Skipped metadata record: missing message id');
        continue;
      }

      // Check date (filter removed from Graph query to avoid 400 errors)
      // if (message.receivedDateTime) {
      //   const receivedDate = new Date(message.receivedDateTime);
      //   if (receivedDate < startDateObj) {
      //     skipped += 1;
      //     console.log(
      //       `[Backfill:Outlook] Skipped by date | messageId=${message.id} | receivedDateTime=${message.receivedDateTime} | before=${startDate}`
      //     );
      //     continue;
      //   }
      // }

      if (seenMessageIds.has(message.id)) {
        skipped += 1;
        console.log(`[Backfill:Outlook] Skipped duplicate metadata | messageId=${message.id}`);
        continue;
      }
      seenMessageIds.add(message.id);

      const filter = isLikelyBookingMetadata(message);
      if (!filter.isRelevant) {
        skipped += 1;
        console.log(
          `[Backfill:Outlook] Skipped by quick filter | messageId=${message.id} | mailboxId=${mailboxId} | reasons=${filter.reasons.join('; ')}`
        );
        continue;
      }

      const fetchJobId = await enqueueEmailFetch({
        provider: 'outlook',
        mailboxId,
        emailAddress: mailbox.emailAddress,
        messageId: message.id,
        source: 'backfill',
      });

      enqueued += 1;
      console.log(
        `[Backfill:Outlook] Enqueued email fetch | mailboxId=${mailboxId} | messageId=${message.id} | jobId=${fetchJobId}`
      );
    }

    nextLink = response.data['@odata.nextLink'] || null;
    firstPage = false;

    if (nextLink) {
      await delay(100);
    }
  }

  console.log(
    `[Backfill:Outlook] Completed | mailboxId=${mailbox.id} | pages=${pagesProcessed} | scanned=${scanned} | enqueued=${enqueued} | skipped=${skipped}`
  );
};
