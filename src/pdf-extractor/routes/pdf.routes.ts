import { Router } from 'express';
import { extractPdfHandler } from '../controllers/pdf.controller';

export const pdfRoutes = Router();

/**
 * POST /pdf/extract
 * Extract raw PDF attachment from Gmail
 * 
 * Body:
 * {
 *   messageId: string (Gmail message ID)
 *   attachmentId: string (Gmail attachment ID)
 *   accessToken: string (Gmail API access token)
 * }
 * 
 * Response:
 * {
 *   success: boolean
 *   file?: { originalname: string; mimetype: string; size: number }
 *   debugPath?: string (path where debug PDF was saved)
 *   error?: string (error message if failed)
 * }
 */
pdfRoutes.post('/extract', extractPdfHandler);

export default pdfRoutes;
