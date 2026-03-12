import { GmailMessage, NormalizedEmail } from '../types/email.types';
import { extractHeaders } from '../utils/header-extractor';
import { extractBodies } from '../utils/body-extractor';
import { extractAttachments } from '../utils/attachment-extractor';
import { cleanHtml } from '../utils/html-cleaner';
import { cleanTextBody } from '../utils/text-cleaner';

export const normalizeGmailEmail = (rawEmail: GmailMessage): NormalizedEmail => {
  const { subject, from, to, date } = extractHeaders(rawEmail.payload.headers);

  const { textBody, htmlBody } = extractBodies(rawEmail.payload.parts);

  const cleanedTextBody = textBody ? cleanTextBody(textBody) : undefined;
  const cleanedHtmlBody = htmlBody ? cleanHtml(htmlBody) : undefined;

  const attachments = extractAttachments(rawEmail.payload.parts);

  return {
    messageId: rawEmail.id,
    threadId: rawEmail.threadId,
    subject,
    from,
    to,
    date,
    cleanedTextBody,
    cleanedHtmlBody,
    textBody,
    htmlBody,
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
