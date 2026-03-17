import { GmailMessage, NormalizedEmail } from '../types/email.types';
import { extractHeaders } from '../utils/header-extractor';
import { extractBodies } from '../utils/body-extractor';
import { extractAttachments } from '../utils/attachment-extractor';
import { cleanEmailBodies } from './email-cleaner.service';
import { detectBookingMeta } from '../../mapper/utils/booking-meta-detection.util';
import { extractPdfFromGmail } from '../../pdf-extractor/services/pdf.service';

export interface ProcessedNormalizedEmail extends NormalizedEmail {
  bookingType: string;
  provider: string;
  pdfData?: {
    success: boolean;
    text?: string;
    error?: string;
  };
}

export const normalizeGmailEmail = (rawEmail: GmailMessage): NormalizedEmail => {
  const { subject, from, to, date } = extractHeaders(rawEmail.payload.headers);

  const { textBody, htmlBody } = extractBodies(rawEmail.payload.parts);

  const attachments = extractAttachments(rawEmail.payload.parts);

  // Clean email bodies
  const { cleanedHtmlBody, cleanedTextBody } = cleanEmailBodies(htmlBody, textBody);

  return {
    messageId: rawEmail.id,
    threadId: rawEmail.threadId,
    subject,
    from,
    to,
    date,
    textBody,
    htmlBody,
    cleanedHtmlBody,
    cleanedTextBody,
    attachments,
  };
};

export const normalizeGmailEmailWithRaw = (rawEmail: GmailMessage): NormalizedEmail => {
  const normalized = normalizeGmailEmail(rawEmail);
  
  return {
    ...normalized,
    raw: rawEmail,
  };
};

export const processGmailEmail = async (
  rawEmail: GmailMessage,
  options?: {
    includeRaw?: boolean;
    accessToken?: string;
  }
): Promise<ProcessedNormalizedEmail> => {
  console.log(`[EmailNormalizer] Starting normalization for messageId=${rawEmail.id}`);
  
  const normalized = options?.includeRaw
    ? normalizeGmailEmailWithRaw(rawEmail)
    : normalizeGmailEmail(rawEmail);

  console.log(`[EmailNormalizer] Email normalized | subject=${normalized.subject} | attachments=${normalized.attachments.length}`);

  const bookingMeta = detectBookingMeta(
    normalized.subject,
    normalized.from,
    normalized.cleanedHtmlBody,
    normalized.cleanedTextBody
  );

  console.log(`[EmailNormalizer] Booking meta detected | type=${bookingMeta.bookingType} | provider=${bookingMeta.provider}`);

  const pdfAttachment = normalized.attachments.find(
    (attachment) =>
      attachment.attachmentId &&
      (attachment.mimeType === 'application/pdf' || attachment.filename.toLowerCase().endsWith('.pdf'))
  );

  let pdfData: ProcessedNormalizedEmail['pdfData'];

  if (pdfAttachment && options?.accessToken) {
    console.log(`[EmailNormalizer] Attempting PDF extraction | filename=${pdfAttachment.filename}`);
    const pdfResult = await extractPdfFromGmail(
      normalized.messageId,
      pdfAttachment.attachmentId,
      options.accessToken
    );

    const { debugPath, ...pdfResponse } = pdfResult;
    pdfData = pdfResponse;
    console.log(`[EmailNormalizer] PDF extraction completed | success=${pdfData.success}`);
  } else if (pdfAttachment && !options?.accessToken) {
    console.warn(`[EmailNormalizer] PDF attachment found but no accessToken provided - skipping extraction`);
    pdfData = {
      success: false,
      error: 'No accessToken provided for PDF extraction'
    };
  }

  console.log(`[EmailNormalizer] Normalization completed for messageId=${rawEmail.id}`);

  return {
    bookingType: bookingMeta.bookingType,
    provider: bookingMeta.provider,
    ...normalized,
    pdfData
  };
};
