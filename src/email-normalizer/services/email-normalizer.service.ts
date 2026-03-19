import { GmailMessage, NormalizedEmail, OutlookMessage, OutlookRecipient } from '../types/email.types';
import axios from 'axios';
import { extractHeaders } from '../utils/header-extractor';
import { extractBodies } from '../utils/body-extractor';
import { extractAttachments } from '../utils/attachment-extractor';
import { cleanEmailBodies } from './email-cleaner.service';
import { detectBookingMeta } from '../../mapper/utils/booking-meta-detection.util';
import { extractPdfFromGmail, extractPdfFromOutlook } from '../../pdf-extractor/services/pdf.service';
import { MapperService } from '../../mapper/services/mapper.service';
import { logMappedEmail } from '../../mapper/utils/mapper-logger';

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
  const pdfAttachment = normalized.attachments.find(
    (attachment) =>
      attachment.attachmentId &&
      (attachment.mimeType === 'application/pdf' || attachment.filename.toLowerCase().endsWith('.pdf'))
  );

  if (pdfAttachment && options?.accessToken) {
    console.log(`[EmailNormalizer] Attempting Outlook PDF extraction | filename=${pdfAttachment.filename}`);
    const pdfResult = await extractPdfFromOutlook(
      normalized.messageId,
      pdfAttachment.attachmentId,
      options.accessToken
    );

    const { debugPath, ...pdfResponse } = pdfResult;
    pdfData = pdfResponse;
    console.log(`[EmailNormalizer] Outlook PDF extraction completed | success=${pdfData.success}`);
  } else if ((pdfAttachment || rawEmail.hasAttachments) && !options?.accessToken) {
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

  // Link with mapper service - run mapping but don't return it
  try {
    console.log(`[EmailNormalizer] Calling mapper service for Outlook messageId=${rawEmail.id}`);
    const mapperService = new MapperService();
    const mappedData = await mapperService.mapEmail({
      subject: normalized.subject,
      cleanedHtmlBody: normalized.cleanedHtmlBody,
      cleanedTextBody: normalized.cleanedTextBody,
      provider: normalized.from?.split('@')[1]?.split('>')[0] || 'unknown',
      bookingType: bookingMeta.bookingType as 'bus' | 'flight' | 'hotel' | 'car' | 'rail',
    });

    // Log mapped data to mapper's logs folder
    const mappedFileName = `mapped_${rawEmail.id}.json`;
    logMappedEmail(mappedFileName, mappedData);
    console.log(`[EmailNormalizer] Outlook mapping completed and logged | messageId=${rawEmail.id}`);
  } catch (mapperError: any) {
    console.warn(`[EmailNormalizer] Outlook mapper service error: ${mapperError.message} - continuing without mapping`);
  }

  return {
    bookingType: bookingMeta.bookingType,
    provider: bookingMeta.provider,
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

  // Link with mapper service - run mapping but don't return it
  try {
    console.log(`[EmailNormalizer] Calling mapper service for messageId=${rawEmail.id}`);
    const mapperService = new MapperService();
    const mappedData = await mapperService.mapEmail({
      subject: normalized.subject,
      cleanedHtmlBody: normalized.cleanedHtmlBody,
      cleanedTextBody: normalized.cleanedTextBody,
      provider: normalized.from?.split('@')[1]?.split('>')[0] || 'unknown', // Extract domain from email
      bookingType: bookingMeta.bookingType as 'bus' | 'flight' | 'hotel' | 'car' | 'rail',
    });

    // Log mapped data to mapper's logs folder
    const mappedFileName = `mapped_${rawEmail.id}.json`;
    logMappedEmail(mappedFileName, mappedData);
    console.log(`[EmailNormalizer] Mapping completed and logged | messageId=${rawEmail.id}`);
  } catch (mapperError: any) {
    console.warn(`[EmailNormalizer] Mapper service error: ${mapperError.message} - continuing without mapping`);
  }

  return {
    bookingType: bookingMeta.bookingType,
    provider: bookingMeta.provider,
    ...normalized,
    pdfData
  };
};
