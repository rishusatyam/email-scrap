import axios from 'axios';
import { randomUUID } from 'crypto';
import { ensureValidToken } from './token.service';
import {
  cancelActiveSubscriptionsByMailboxId,
  createSubscription,
  findExpiringActiveSubscriptions,
  updateSubscriptionRenewalById,
} from '../../webhook/dao/subscription.dao';

const GRAPH_SUBSCRIPTIONS_URL = 'https://graph.microsoft.com/v1.0/subscriptions';

export const renewExpiringOutlookSubscriptions = async (params: {
  renewWindowMinutes: number;
  durationMinutes: number;
}) => {
  console.log('[SubRenewal] Worker started');

  const expiresBefore = new Date(Date.now() + params.renewWindowMinutes * 60 * 1000);
  const expiringSubscriptions = await findExpiringActiveSubscriptions({
    provider: 'outlook',
    expiresBefore,
  });

  console.log(`[SubRenewal] Expiring outlook subscriptions found: ${expiringSubscriptions.length}`);

  for (const subscription of expiringSubscriptions) {
    if (!subscription.subscriptionId) {
      console.warn(`[SubRenewal] Skipping subscription=${subscription.id} because provider subscriptionId is missing`);
      continue;
    }

    try {
      const accessToken = await ensureValidToken(subscription.mailbox);
      const expirationDateTime = new Date(Date.now() + params.durationMinutes * 60 * 1000).toISOString();

      const response = await axios.patch(
        `${GRAPH_SUBSCRIPTIONS_URL}/${subscription.subscriptionId}`,
        { expirationDateTime },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const renewedExpiry = new Date(response.data.expirationDateTime);
      await updateSubscriptionRenewalById(subscription.id, { expiryTime: renewedExpiry });

      console.log(
        `[SubRenewal] Renewed subscription mailbox=${subscription.mailboxId} oldSubscriptionId=${subscription.subscriptionId} newExpiry=${renewedExpiry.toISOString()}`
      );
    } catch (error: any) {
      const status = error.response?.status as number | undefined;
      const message = error.response?.data?.error?.message ?? error.message;

      if (status === 400 || status === 404) {
        console.warn(
          `[SubRenewal] Renewal failed with status=${status} for subscriptionId=${subscription.subscriptionId}. Recreating subscription.`
        );

        try {
          const recreated = await recreateOutlookSubscription(
            subscription.mailboxId,
            subscription.mailbox.emailAddress,
            await ensureValidToken(subscription.mailbox),
            params.durationMinutes
          );

          console.log(
            `[SubRenewal] Fallback recreate success mailbox=${subscription.mailboxId} newSubscriptionId=${recreated.subscriptionId} newExpiry=${recreated.expiryTime.toISOString()}`
          );
        } catch (recreateError: any) {
          const recreateStatus = recreateError.response?.status;
          const recreateMessage = recreateError.response?.data?.error?.message ?? recreateError.message;
          console.error(
            `[SubRenewal] Fallback recreate failed mailbox=${subscription.mailboxId} status=${recreateStatus} reason=${recreateMessage}`
          );
        }

        continue;
      }

      console.error(
        `[SubRenewal] Renewal failed mailbox=${subscription.mailboxId} subscriptionId=${subscription.subscriptionId} status=${status} reason=${message}`
      );
    }
  }
};

const recreateOutlookSubscription = async (
  mailboxId: string,
  emailAddress: string,
  accessToken: string,
  durationMinutes: number
) => {
  const notificationUrl = process.env.OUTLOOK_WEBHOOK_URL;
  if (!notificationUrl) {
    throw new Error('OUTLOOK_WEBHOOK_URL is not set in environment variables');
  }

  const clientState = randomUUID();
  const expirationDateTime = new Date(Date.now() + durationMinutes * 60 * 1000).toISOString();

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
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    }
  );

  const newSubscriptionId = response.data.id as string;
  const newExpiry = new Date(response.data.expirationDateTime as string);

  await cancelActiveSubscriptionsByMailboxId(mailboxId);
  await createSubscription({
    provider: 'outlook',
    mailboxId,
    subscriptionId: newSubscriptionId,
    clientState,
    expiryTime: newExpiry,
    status: 'active',
  });

  console.log(
    `[SubRenewal] Recreated Graph subscription for email=${emailAddress} subscriptionId=${newSubscriptionId} expiry=${newExpiry.toISOString()}`
  );

  return { subscriptionId: newSubscriptionId, expiryTime: newExpiry };
};
