import { Router } from 'express';
import { normalizeEmailHandler, normalizeOutlookEmailHandler } from '../controllers/normalizer.controller';

const router = Router();

router.post('/normalize', normalizeEmailHandler);
router.post('/normalize/outlook', normalizeOutlookEmailHandler);

export { router as normalizerRoutes };
