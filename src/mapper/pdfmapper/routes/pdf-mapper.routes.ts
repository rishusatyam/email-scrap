import { Router } from 'express';
import multer from 'multer';
import { PdfMapperController } from '../controllers/pdf-mapper.controller';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });
const controller = new PdfMapperController();

/**
 * Defines multipart endpoint for mapping a PDF into booking JSON.
 */
router.post('/map', upload.single('file'), controller.mapPdf);

export default router;
