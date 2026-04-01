import { findExpiringActiveSubscriptions } from '../../webhook/dao/subscription.dao';
import { createGmailWatch } from '../../subscriptions/services/gmail-watch.service';
import { ensureValidToken } from './token.service';

export const renewExpiringGmailSubscriptions = async (params: {
  renewWindowMinutes: number;
}) => {
  console.log('[GmailRenewal] Worker started');

  const expiresBefore = new Date(Date.now() + params.renewWindowMinutes * 60 * 1000);
  const expiringSubscriptions = await findExpiringActiveSubscriptions({
    provider: 'gmail',
    expiresBefore,
  });

  console.log(`[GmailRenewal] Expiring gmail subscriptions found: ${expiringSubscriptions.length}`);

  for (const subscription of expiringSubscriptions) {
    try {
      const accessToken = await ensureValidToken(subscription.mailbox);
      const mailboxWithFreshToken = {
        ...subscription.mailbox,
        encryptedAccessToken: accessToken,
      };

      const recreated = await createGmailWatch(mailboxWithFreshToken);

      console.log(
        `[GmailRenewal] Recreated watch mailbox=${subscription.mailboxId} oldExpiry=${subscription.expiryTime?.toISOString() ?? 'none'} newExpiry=${recreated.expiryTime.toISOString()}`
      );
    } catch (error: any) {
      const status = error.response?.status;
      const message = error.response?.data?.error?.message ?? error.message;
      console.error(
        `[GmailRenewal] Failed renewal mailbox=${subscription.mailboxId} subscription=${subscription.id} status=${status} reason=${message}`
      );
    }
  }
};
