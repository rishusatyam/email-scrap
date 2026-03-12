import { GmailMessagePart } from '../types/email.types';
import { decodeBase64, isQuotedPrintable, decodeQuotedPrintable } from './base64-decoder';

interface ExtractedBodies {
  textBody?: string;
  htmlBody?: string;
}

export const extractBodies = (parts?: GmailMessagePart[]): ExtractedBodies => {
  const result: ExtractedBodies = {};

  if (!parts || parts.length === 0) {
    return result;
  }

  const traverse = (part: GmailMessagePart) => {
    if (part.mimeType === 'text/plain' && part.body?.data && !result.textBody) {
      let decoded = decodeBase64(part.body.data);
      
      if (isQuotedPrintable(part.headers)) {
        decoded = decodeQuotedPrintable(decoded);
      }
      
      result.textBody = decoded;
    }

    if (part.mimeType === 'text/html' && part.body?.data && !result.htmlBody) {
      let decoded = decodeBase64(part.body.data);
      
      if (isQuotedPrintable(part.headers)) {
        decoded = decodeQuotedPrintable(decoded);
      }
      
      result.htmlBody = decoded;
    }

    if (part.parts && part.parts.length > 0) {
      for (const subPart of part.parts) {
        traverse(subPart);
      }
    }
  };

  for (const part of parts) {
    traverse(part);
  }

  return result;
};
