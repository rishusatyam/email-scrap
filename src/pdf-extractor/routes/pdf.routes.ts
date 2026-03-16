import { Router } from 'express';
import { extractPdfHandler } from '../controllers/pdf.controller';

export const pdfRoutes = Router();

/**
 * POST /pdf/extract
 * Extract PDF attachment from Gmail and convert to text
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
 *   text?: string (extracted PDF text)
 *   debugPath?: string (path where debug PDF was saved)
 *   error?: string (error message if failed)
 * }
 */
pdfRoutes.post('/extract', extractPdfHandler);

export default pdfRoutes;
