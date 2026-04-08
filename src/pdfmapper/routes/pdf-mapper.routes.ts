import { Router } from 'express';
import multer from 'multer';
import { PdfMapperController } from '../controllers/pdf-mapper.controller';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB per file
  },
});
const controller = new PdfMapperController();

/**
 * Defines multipart endpoint for mapping PDFs into booking JSON.
 * Accepts 1 or multiple PDFs and aggregates them into a single unified booking object.
 */
router.post('/map', upload.array('file', 10), controller.mapPdfs);

export default router;
