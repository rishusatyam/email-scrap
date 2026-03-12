import { Router } from 'express';
import { normalizeEmailHandler } from '../controllers/normalizer.controller';

const router = Router();

router.post('/normalize', normalizeEmailHandler);

export { router as normalizerRoutes };
