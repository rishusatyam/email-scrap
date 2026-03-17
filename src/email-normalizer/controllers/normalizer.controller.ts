import { Request, Response } from 'express';
import { processGmailEmail } from '../services/email-normalizer.service';
import { GmailMessage } from '../types/email.types';

const TEST_GMAIL_ACCESS_TOKEN = process.env.GMAIL_ACCESS_TOKEN || '';

export const normalizeEmailHandler = async (req: Request, res: Response): Promise<void> => {
  try {
    const { rawEmail, includeRaw, accessToken } = req.body;

    if (!rawEmail) {
      res.status(400).json({ error: 'Missing rawEmail in request body' });
      return;
    }

    if (!rawEmail.id || !rawEmail.threadId || !rawEmail.payload) {
      res.status(400).json({ error: 'Invalid Gmail message format' });
      return;
    }

    const normalized = await processGmailEmail(rawEmail as GmailMessage, {
      includeRaw,
      accessToken: accessToken || TEST_GMAIL_ACCESS_TOKEN,
    });

    console.log(`[NormalizerController] Sending successful response | messageId=${rawEmail.id} | hasPdfData=${!!normalized.pdfData}`);
    res.status(200).json({
      success: true,
      data: normalized,
    });
  } catch (error: any) {
    console.error('[NormalizerController] Error normalizing email:', error.message);
    res.status(500).json({ 
      error: 'Failed to normalize email',
      message: error.message,
    });
  }
};
