import { GmailMessage, NormalizedEmail, OutlookMessage, OutlookRecipient } from '../types/email.types';
import axios from 'axios';
import { extractHeaders } from '../utils/header-extractor';
import { extractBodies } from '../utils/body-extractor';
import { extractAttachments } from '../utils/attachment-extractor';
import { cleanEmailBodies } from './email-cleaner.service';
import { detectBookingMeta } from '../../mapper/utils/booking-meta-detection.util';
import { extractPdfFromGmail, extractPdfFromOutlook } from '../../pdf-extractor/services/pdf.service';
import { MapperService } from '../../mapper/services/mapper.service';
import { PdfMapperService } from '../../pdfmapper/services/pdf-mapper.service';
import { PdfBookingType, PdfFileData } from '../../pdfmapper/types';
import { validateStrictBooking } from '../../classification/strictvalidator';
import { logNormalizedEmail } from '../utils/normalizer-logger';

export interface ProcessedNormalizedEmail extends NormalizedEmail {
  bookingType: string;
  provider: string;
  structuredBookingData?: Record<string, any>;
  pdfData?: {
    success: boolean;
    files?: PdfFileData[];
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

const formatOutlookParticipant = (participant?: OutlookRecipient): string => {
  const name = participant?.emailAddress?.name?.trim();
  const address = participant?.emailAddress?.address?.trim();

  if (name && address) {
    return `${name} <${address}>`;
  }

  return address || name || '';
};

const getOutlookTo = (recipients?: OutlookRecipient[]): string => {
  if (!recipients || recipients.length === 0) {
    return '';
  }

  return recipients.map((recipient) => formatOutlookParticipant(recipient)).filter(Boolean).join(', ');
};

interface OutlookAttachmentItem {
  id: string;
  name?: string;
  contentType?: string;
  size?: number;
  isInline?: boolean;
}

interface PdfExtractionResult {
  success: boolean;
  files?: PdfFileData[];
  error?: string;
}

const fetchOutlookAttachments = async (messageId: string, accessToken: string) => {
  const response = await axios.get(
    `https://graph.microsoft.com/v1.0/me/messages/${messageId}/attachments?$select=id,name,contentType,size,isInline`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  const items = (response.data?.value || []) as OutlookAttachmentItem[];

  return items
    .filter((item) => item?.id && !item.isInline)
    .map((item) => ({
      filename: item.name || `attachment_${item.id}`,
      mimeType: item.contentType || 'application/octet-stream',
      attachmentId: item.id,
      size: item.size,
    }));
};

const getPdfAttachments = (attachments: NormalizedEmail['attachments']) =>
  attachments.filter(
    (attachment) =>
      attachment.attachmentId &&
      (attachment.mimeType === 'application/pdf' || attachment.filename.toLowerCase().endsWith('.pdf'))
  );

const extractCombinedPdfData = async (
  messageId: string,
  accessToken: string,
  pdfAttachments: NormalizedEmail['attachments'],
  extractOne: (messageId: string, attachmentId: string, accessToken: string) => Promise<{
    success: boolean;
    file?: PdfFileData;
    error?: string;
    debugPath?: string;
  }>,
  providerLabel: 'Gmail' | 'Outlook'
): Promise<PdfExtractionResult> => {
  const files: PdfFileData[] = [];
  const errors: string[] = [];

  for (const [index, attachment] of pdfAttachments.entries()) {
    console.log(
      `[EmailNormalizer] Attempting ${providerLabel} PDF extraction (${index + 1}/${pdfAttachments.length}) | filename=${attachment.filename}`
    );

    const pdfResult = await extractOne(messageId, attachment.attachmentId, accessToken);
    if (pdfResult.success && pdfResult.file) {
      files.push(pdfResult.file);
      console.log(
        `[EmailNormalizer] ${providerLabel} PDF extraction success (${index + 1}/${pdfAttachments.length}) | filename=${attachment.filename}`
      );
    } else {
      errors.push(`${attachment.filename}: ${pdfResult.error || 'Unknown extraction error'}`);
      console.warn(
        `[EmailNormalizer] ${providerLabel} PDF extraction failed (${index + 1}/${pdfAttachments.length}) | filename=${attachment.filename} | error=${pdfResult.error || 'Unknown extraction error'}`
      );
    }
  }

  if (files.length > 0) {
    return {
      success: true,
      files,
      error: errors.length > 0 ? `Partial extraction failure: ${errors.join(' | ')}` : undefined,
    };
  }

  return {
    success: false,
    error: errors.length > 0 ? errors.join(' | ') : 'No PDF files could be extracted',
  };
};

const toPdfBookingType = (bookingType: string): PdfBookingType | null => {
  const normalized = String(bookingType || '').toLowerCase();

  if (normalized === 'train') {
    return 'rail';
  }

  if (normalized === 'flight' || normalized === 'bus' || normalized === 'rail' || normalized === 'car' || normalized === 'hotel') {
    return normalized as PdfBookingType;
  }

  return null;
};

const mapAllowedEmailWithPdfMapper = async (
  pdfData: ProcessedNormalizedEmail['pdfData'],
  bookingType: string,
  provider: string
): Promise<Record<string, any> | undefined> => {
  if (!pdfData?.success || !pdfData.files || pdfData.files.length === 0) {
    return undefined;
  }

  const mappedBookingType = toPdfBookingType(bookingType);
  if (!mappedBookingType) {
    return undefined;
  }

  const pdfMapperService = new PdfMapperService();
  return pdfMapperService.mapPdfs(pdfData.files, mappedBookingType, provider);
};

export const normalizeOutlookEmail = (rawEmail: OutlookMessage): NormalizedEmail => {
  const htmlBody = rawEmail.body?.contentType === 'html' ? rawEmail.body?.content || '' : '';
  const textBody = rawEmail.bodyPreview || '';
  const { cleanedHtmlBody, cleanedTextBody } = cleanEmailBodies(htmlBody, textBody);

  return {
    messageId: rawEmail.id,
    threadId: rawEmail.conversationId || rawEmail.id,
    subject: rawEmail.subject || '',
    from: formatOutlookParticipant(rawEmail.from),
    to: getOutlookTo(rawEmail.toRecipients),
    date: rawEmail.sentDateTime || '',
    textBody,
    htmlBody,
    cleanedHtmlBody,
    cleanedTextBody,
    attachments: [],
  };
};

export const normalizeOutlookEmailWithRaw = (rawEmail: OutlookMessage): NormalizedEmail => {
  const normalized = normalizeOutlookEmail(rawEmail);

  return {
    ...normalized,
    raw: rawEmail,
  };
};

export const processOutlookEmail = async (
  rawEmail: OutlookMessage,
  options?: {
    includeRaw?: boolean;
    accessToken?: string;
  }
): Promise<ProcessedNormalizedEmail> => {
  console.log(`[EmailNormalizer] Starting Outlook normalization for messageId=${rawEmail.id}`);

  const normalized = options?.includeRaw
    ? normalizeOutlookEmailWithRaw(rawEmail)
    : normalizeOutlookEmail(rawEmail);

  if (options?.accessToken) {
    try {
      const attachments = await fetchOutlookAttachments(rawEmail.id, options.accessToken);
      normalized.attachments = attachments;
      console.log(`[EmailNormalizer] Outlook attachments fetched | count=${attachments.length}`);
    } catch (attachmentError: any) {
      console.warn(`[EmailNormalizer] Failed to fetch Outlook attachments: ${attachmentError.message}`);
    }
  }

  let pdfData: ProcessedNormalizedEmail['pdfData'];
  const pdfAttachments = getPdfAttachments(normalized.attachments);

  if (pdfAttachments.length > 0 && options?.accessToken) {
    pdfData = await extractCombinedPdfData(
      normalized.messageId,
      options.accessToken,
      pdfAttachments,
      extractPdfFromOutlook,
      'Outlook'
    );
    console.log(
      `[EmailNormalizer] Outlook PDF extraction completed | success=${pdfData.success} | pdfCount=${pdfAttachments.length}`
    );
  } else if ((pdfAttachments.length > 0 || rawEmail.hasAttachments) && !options?.accessToken) {
    console.warn(`[EmailNormalizer] Outlook attachment found but no accessToken provided - skipping extraction`);
    pdfData = {
      success: false,
      error: 'No accessToken provided for PDF extraction',
    };
  }

  const bookingMeta = detectBookingMeta(
    normalized.subject,
    normalized.from,
    normalized.cleanedHtmlBody,
    normalized.cleanedTextBody
  );

  console.log(`[EmailNormalizer] Outlook booking meta detected | type=${bookingMeta.bookingType} | provider=${bookingMeta.provider}`);

  const strictValidation = validateStrictBooking({
    subject: normalized.subject,
    body: normalized.textBody,
    cleanedHtmlBody: normalized.cleanedHtmlBody,
    cleanedTextBody: normalized.cleanedTextBody,
    attachments: normalized.attachments,
  });

  logNormalizedEmail(`normalized_pre_mapper_outlook_${rawEmail.id}.json`, {
    messageId: rawEmail.id,
    provider: bookingMeta.provider,
    bookingType: bookingMeta.bookingType,
    strictValidation,
    normalized,
    pdfData,
  });

  let structuredBookingData: Record<string, any> | undefined;

  if (strictValidation.decision === 'ALLOW') {
    console.log(
      `[EmailNormalizer] Strict validator passed for Outlook messageId=${rawEmail.id} | reason=${strictValidation.reason}`
    );

    // Clean binary split: PDF path vs Text path (mutually exclusive)
    if (pdfData && pdfData.files && pdfData.files.length > 0) {
      // PDF path: Use PDF mapper only
      try {
        console.log(`[EmailNormalizer] PDF files detected, using PDF mapper for Outlook messageId=${rawEmail.id}`);
        structuredBookingData = await mapAllowedEmailWithPdfMapper(
          pdfData,
          bookingMeta.bookingType,
          bookingMeta.provider
        );

        if (structuredBookingData) {
          console.log(`[EmailNormalizer] Outlook PDF mapper completed | messageId=${rawEmail.id}`);
        } else {
          console.warn(`[EmailNormalizer] Outlook PDF mapper returned no data for messageId=${rawEmail.id}`);
        }
      } catch (pdfMapperError: any) {
        console.error(`[EmailNormalizer] Outlook PDF mapper error for messageId=${rawEmail.id}: ${pdfMapperError.message}`);
      }
    } else {
      // Text path: Use text mapper only (no PDF files)
      try {
        console.log(`[EmailNormalizer] No PDF files detected, using text mapper for Outlook messageId=${rawEmail.id}`);
        const mapperService = new MapperService();
        const mappedData = await mapperService.mapEmail({
          subject: normalized.subject,
          cleanedHtmlBody: normalized.cleanedHtmlBody,
          cleanedTextBody: normalized.cleanedTextBody,
          provider: normalized.from?.split('@')[1]?.split('>')[0] || 'unknown',
          bookingType: bookingMeta.bookingType as 'bus' | 'flight' | 'hotel' | 'car' | 'rail',
        });

        structuredBookingData = mappedData;
        console.log(`[EmailNormalizer] Outlook text mapper completed | messageId=${rawEmail.id}`);
      } catch (mapperError: any) {
        console.error(`[EmailNormalizer] Outlook text mapper error for messageId=${rawEmail.id}: ${mapperError.message}`);
      }
    }
  } else {
    console.log(
      `[EmailNormalizer] Strict validator blocked mapper for Outlook messageId=${rawEmail.id} | reason=${strictValidation.reason}`
    );
  }

  return {
    bookingType: bookingMeta.bookingType,
    provider: bookingMeta.provider,
    structuredBookingData,
    ...normalized,
    pdfData,
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

  const pdfAttachments = getPdfAttachments(normalized.attachments);

  let pdfData: ProcessedNormalizedEmail['pdfData'];

  if (pdfAttachments.length > 0 && options?.accessToken) {
    pdfData = await extractCombinedPdfData(
      normalized.messageId,
      options.accessToken,
      pdfAttachments,
      extractPdfFromGmail,
      'Gmail'
    );
    console.log(
      `[EmailNormalizer] PDF extraction completed | success=${pdfData.success} | pdfCount=${pdfAttachments.length}`
    );
  } else if (pdfAttachments.length > 0 && !options?.accessToken) {
    console.warn(`[EmailNormalizer] PDF attachment found but no accessToken provided - skipping extraction`);
    pdfData = {
      success: false,
      error: 'No accessToken provided for PDF extraction'
    };
  }

  console.log(`[EmailNormalizer] Normalization completed for messageId=${rawEmail.id}`);

  const strictValidation = validateStrictBooking({
    subject: normalized.subject,
    body: normalized.textBody,
    cleanedHtmlBody: normalized.cleanedHtmlBody,
    cleanedTextBody: normalized.cleanedTextBody,
    attachments: normalized.attachments,
  });

  logNormalizedEmail(`normalized_pre_mapper_gmail_${rawEmail.id}.json`, {
    messageId: rawEmail.id,
    provider: bookingMeta.provider,
    bookingType: bookingMeta.bookingType,
    strictValidation,
    normalized,
    pdfData,
  });

  let structuredBookingData: Record<string, any> | undefined;

  if (strictValidation.decision === 'ALLOW') {
    console.log(
      `[EmailNormalizer] Strict validator passed for messageId=${rawEmail.id} | reason=${strictValidation.reason}`
    );

    // Clean binary split: PDF path vs Text path (mutually exclusive)
    if (pdfData && pdfData.files && pdfData.files.length > 0) {
      // PDF path: Use PDF mapper only
      try {
        console.log(`[EmailNormalizer] PDF files detected, using PDF mapper for messageId=${rawEmail.id}`);
        structuredBookingData = await mapAllowedEmailWithPdfMapper(
          pdfData,
          bookingMeta.bookingType,
          bookingMeta.provider
        );

        if (structuredBookingData) {
          console.log(`[EmailNormalizer] PDF mapper completed | messageId=${rawEmail.id}`);
        } else {
          console.warn(`[EmailNormalizer] PDF mapper returned no data for messageId=${rawEmail.id}`);
        }
      } catch (pdfMapperError: any) {
        console.error(`[EmailNormalizer] PDF mapper error for messageId=${rawEmail.id}: ${pdfMapperError.message}`);
      }
    } else {
      // Text path: Use text mapper only (no PDF files)
      try {
        console.log(`[EmailNormalizer] No PDF files detected, using text mapper for messageId=${rawEmail.id}`);
        const mapperService = new MapperService();
        const mappedData = await mapperService.mapEmail({
          subject: normalized.subject,
          cleanedHtmlBody: normalized.cleanedHtmlBody,
          cleanedTextBody: normalized.cleanedTextBody,
          provider: normalized.from?.split('@')[1]?.split('>')[0] || 'unknown',
          bookingType: bookingMeta.bookingType as 'bus' | 'flight' | 'hotel' | 'car' | 'rail',
        });

        structuredBookingData = mappedData;
        console.log(`[EmailNormalizer] Text mapper completed | messageId=${rawEmail.id}`);
      } catch (mapperError: any) {
        console.error(`[EmailNormalizer] Text mapper error for messageId=${rawEmail.id}: ${mapperError.message}`);
      }
    }
  } else {
    console.log(
      `[EmailNormalizer] Strict validator blocked mapper for messageId=${rawEmail.id} | reason=${strictValidation.reason}`
    );
  }

  return {
    bookingType: bookingMeta.bookingType,
    provider: bookingMeta.provider,
    structuredBookingData,
    ...normalized,
    pdfData
  };
};
