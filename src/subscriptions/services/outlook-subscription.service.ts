import axios from 'axios';
import { randomUUID } from 'crypto';
import { Mailbox } from '@prisma/client';
import {
  cancelActiveSubscriptionsByMailboxId,
  createSubscription,
} from '../../webhook/dao/subscription.dao';

const GRAPH_SUBSCRIPTIONS_URL = 'https://graph.microsoft.com/v1.0/subscriptions';

export interface OutlookSubscriptionResult {
  provider: 'outlook';
  subscriptionId: string;
  expiryTime: Date;
}

export const createOutlookSubscription = async (mailbox: Mailbox): Promise<OutlookSubscriptionResult> => {
  const notificationUrl = process.env.OUTLOOK_WEBHOOK_URL;
  if (!notificationUrl) {
    throw new Error('OUTLOOK_WEBHOOK_URL is not set in environment variables');
  }

  console.log(`[OutlookSub] Starting subscription for mailbox=${mailbox.id} email=${mailbox.emailAddress}`);

  // Generate a secret clientState — stored in DB and validated on every incoming notification
  const clientState = randomUUID();

  // Read subscription duration from environment, default to 60 minutes
  const durationMinutes = Number(process.env.OUTLOOK_SUB_DURATION_MINUTES) || 60;
  const expirationDateTime = new Date(Date.now() + durationMinutes * 60 * 1000).toISOString();

  console.log(`[OutlookSub] Requesting subscription with expirationDateTime=${expirationDateTime}`);

  // Call Microsoft Graph POST /subscriptions
  let graphResponse: { id: string; expirationDateTime: string };
  try {
    const response = await axios.post(
      GRAPH_SUBSCRIPTIONS_URL,
      {
        changeType: 'created',
        notificationUrl,
        resource: 'me/messages',
        expirationDateTime,
        clientState,
      },
      {
        headers: {
          Authorization: `Bearer ${mailbox.encryptedAccessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    graphResponse = response.data;
    console.log(`[OutlookSub] Provider response for email=${mailbox.emailAddress}:`, {
      id: graphResponse.id,
      expirationDateTime: graphResponse.expirationDateTime,
    });
  } catch (err: any) {
    const status = err.response?.status;
    const message = err.response?.data?.error?.message ?? err.message;
    console.error(`[OutlookSub] Graph API error status=${status} message=${message}`);
    throw new Error(`Outlook subscription API failed: ${message}`);
  }

  const subscriptionId = graphResponse.id;
  const expiryTime = new Date(graphResponse.expirationDateTime);

  // Cancel any existing active subscriptions before creating new one
  const cancelled = await cancelActiveSubscriptionsByMailboxId(mailbox.id);
  if (cancelled > 0) {
    console.log(`[OutlookSub] Cancelled ${cancelled} existing active subscription(s) for mailbox=${mailbox.id}`);
  }

  // Persist the new subscription record with clientState for webhook validation
  const record = await createSubscription({
    provider: 'outlook',
    mailboxId: mailbox.id,
    subscriptionId,
    clientState,
    expiryTime,
    status: 'active',
  });

  console.log(`[OutlookSub] Subscription saved id=${record.id} subscriptionId=${subscriptionId} expiryTime=${expiryTime.toISOString()}`);

  return { provider: 'outlook', subscriptionId, expiryTime };
};
