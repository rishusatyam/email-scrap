import { Router } from 'express';
import { createSubscriptionHandler } from './controllers/subscription.controller';

const router = Router();

// POST /subscriptions/:mailboxId
// Creates a Gmail watch or Outlook Graph subscription for the given mailbox
router.post('/:mailboxId', createSubscriptionHandler);

export { router as subscriptionRoutes };
