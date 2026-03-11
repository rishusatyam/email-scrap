import { Router } from 'express';
import { handleGmailWebhook, handleOutlookWebhook } from './controllers/webhook.controller';

const router = Router();

// POST /webhook/gmail  — receives Pub/Sub push notifications from Google
router.post('/gmail', handleGmailWebhook);

// POST /webhook/outlook — receives change notifications from Microsoft Graph
// Also handles GET for subscription validation (validationToken via query param)
router.post('/outlook', handleOutlookWebhook);

export { router as webhookRoutes };
