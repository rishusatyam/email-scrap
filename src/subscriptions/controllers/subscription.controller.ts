import { Request, Response } from 'express';
import { findMailboxById } from '../../auth/dao/mailbox.dao';
import { createGmailWatch } from '../services/gmail-watch.service';
import { createOutlookSubscription } from '../services/outlook-subscription.service';

export const createSubscriptionHandler = async (req: Request, res: Response): Promise<void> => {
  const { mailboxId } = req.params;

  console.log(`[SubscriptionController] POST /subscriptions/${mailboxId} received`);

  // Load mailbox from DB
  const mailbox = await findMailboxById(mailboxId);
  if (!mailbox) {
    console.warn(`[SubscriptionController] Mailbox not found id=${mailboxId}`);
    res.status(404).json({ error: 'Mailbox not found' });
    return;
  }

  console.log(`[SubscriptionController] Mailbox found id=${mailbox.id} provider=${mailbox.provider} email=${mailbox.emailAddress}`);

  try {
    if (mailbox.provider === 'gmail') {
      const result = await createGmailWatch(mailbox);
      res.status(201).json({
        success: true,
        data: {
          provider: result.provider,
          historyId: result.historyId,
          expiryTime: result.expiryTime,
        },
      });
      return;
    }

    if (mailbox.provider === 'outlook') {
      const result = await createOutlookSubscription(mailbox);
      res.status(201).json({
        success: true,
        data: {
          provider: result.provider,
          subscriptionId: result.subscriptionId,
          expiryTime: result.expiryTime,
        },
      });
      return;
    }

    // Unknown provider
    console.warn(`[SubscriptionController] Unknown provider=${mailbox.provider} for mailbox=${mailboxId}`);
    res.status(400).json({ error: `Unsupported provider: ${mailbox.provider}` });
  } catch (err: any) {
    console.error(`[SubscriptionController] Subscription creation failed for mailbox=${mailboxId}:`, err.message);
    res.status(500).json({ error: err.message ?? 'Internal server error' });
  }
};
