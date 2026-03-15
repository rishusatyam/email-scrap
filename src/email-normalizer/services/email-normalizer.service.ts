import { GmailMessage, NormalizedEmail } from '../types/email.types';
import { extractHeaders } from '../utils/header-extractor';
import { extractBodies } from '../utils/body-extractor';
import { extractAttachments } from '../utils/attachment-extractor';
import { cleanEmailBodies } from './email-cleaner.service';

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
