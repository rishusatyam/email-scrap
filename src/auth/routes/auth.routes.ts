import { Router } from 'express';
import { startOAuth, handleCallback } from '../controllers/oauth.controller';

const router = Router();

// Start OAuth flow
router.get('/:provider/start', startOAuth);

// OAuth callback
router.get('/:provider/callback', handleCallback);

export default router;
