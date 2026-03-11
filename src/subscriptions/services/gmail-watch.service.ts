import axios from 'axios';
import { Mailbox } from '@prisma/client';
import { updateMailboxHistoryTracking } from '../../auth/dao/mailbox.dao';
import {
  cancelActiveSubscriptionsByMailboxId,
  createSubscription,
} from '../../webhook/dao/subscription.dao';

const GMAIL_WATCH_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/watch';

export interface GmailWatchResult {
  provider: 'gmail';
  historyId: string;
  expiryTime: Date;
}

export const createGmailWatch = async (mailbox: Mailbox): Promise<GmailWatchResult> => {
  const topic = process.env.GMAIL_PUBSUB_TOPIC;
  if (!topic) {
    throw new Error('GMAIL_PUBSUB_TOPIC is not set in environment variables');
  }

  console.log(`[GmailWatch] Starting watch for mailbox=${mailbox.id} email=${mailbox.emailAddress}`);

  // Call Gmail users.watch
  let watchResponse: { historyId: string; expiration: string };
  try {
    const response = await axios.post(
      GMAIL_WATCH_URL,
      { topicName: topic },
      {
        headers: {
          Authorization: `Bearer ${mailbox.encryptedAccessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    watchResponse = response.data;
    console.log(`[GmailWatch] Provider response for email=${mailbox.emailAddress}:`, {
      historyId: watchResponse.historyId,
      expiration: watchResponse.expiration,
    });
  } catch (err: any) {
    const status = err.response?.status;
    const message = err.response?.data?.error?.message ?? err.message;
    console.error(`[GmailWatch] Gmail API error status=${status} message=${message}`);
    throw new Error(`Gmail watch API failed: ${message}`);
  }

  const historyId = watchResponse.historyId;
  // Gmail returns expiration as a Unix timestamp in milliseconds (string)
  const expiryTime = new Date(Number(watchResponse.expiration));

  // Update mailbox cursor so history worker knows where to start
  console.log(`[GmailWatch] Updating lastHistoryId=${historyId} for mailbox=${mailbox.id}`);
  await updateMailboxHistoryTracking(mailbox.id, { lastHistoryId: historyId });

  // Cancel any existing active subscriptions before creating new one
  const cancelled = await cancelActiveSubscriptionsByMailboxId(mailbox.id);
  if (cancelled > 0) {
    console.log(`[GmailWatch] Cancelled ${cancelled} existing active subscription(s) for mailbox=${mailbox.id}`);
  }

  // Persist the new subscription record
  // Gmail's watch API does not return a subscription ID — stored as null
  const record = await createSubscription({
    provider: 'gmail',
    mailboxId: mailbox.id,
    subscriptionId: null,
    clientState: null,
    expiryTime,
    status: 'active',
  });

  console.log(`[GmailWatch] Subscription saved id=${record.id} expiryTime=${expiryTime.toISOString()}`);

  return { provider: 'gmail', historyId, expiryTime };
};
