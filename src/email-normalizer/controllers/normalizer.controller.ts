import { Request, Response } from 'express';
import { normalizeGmailEmail, normalizeGmailEmailWithRaw } from '../services/email-normalizer.service';
import { detectBookingMeta } from '../../mapper/utils/booking-meta-detection.util';
import { GmailMessage } from '../types/email.types';

export const normalizeEmailHandler = async (req: Request, res: Response): Promise<void> => {
  try {
    const { rawEmail, includeRaw } = req.body;

    if (!rawEmail) {
      res.status(400).json({ error: 'Missing rawEmail in request body' });
      return;
    }

    if (!rawEmail.id || !rawEmail.threadId || !rawEmail.payload) {
      res.status(400).json({ error: 'Invalid Gmail message format' });
      return;
    }

    const normalized = includeRaw 
      ? normalizeGmailEmailWithRaw(rawEmail as GmailMessage)
      : normalizeGmailEmail(rawEmail as GmailMessage);

    // Detect booking meta after normalization
    const bookingMeta = detectBookingMeta(
      normalized.subject,
      normalized.from,
      normalized.cleanedHtmlBody,
      normalized.cleanedTextBody
    );

    res.status(200).json({
      success: true,
      data: {
        bookingType: bookingMeta.bookingType,
        provider: bookingMeta.provider,
        ...normalized
      },
    });
  } catch (error: any) {
    console.error('[NormalizerController] Error normalizing email:', error.message);
    res.status(500).json({ 
      error: 'Failed to normalize email',
      message: error.message,
    });
  }
};
