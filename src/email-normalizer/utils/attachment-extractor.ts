import { GmailMessagePart, NormalizedAttachment } from '../types/email.types';

export const extractAttachments = (parts?: GmailMessagePart[]): NormalizedAttachment[] => {
  const attachments: NormalizedAttachment[] = [];

  if (!parts || parts.length === 0) {
    return attachments;
  }

  const traverse = (part: GmailMessagePart) => {
    const isTextContent = part.mimeType === 'text/plain' || part.mimeType === 'text/html';
    const hasFilename = part.filename && part.filename.trim() !== '';
    const hasAttachmentId = part.body?.attachmentId;

    if (!isTextContent && hasFilename && hasAttachmentId) {
      attachments.push({
        filename: part.filename!,
        mimeType: part.mimeType,
        attachmentId: part.body!.attachmentId!,
        size: part.body?.size,
      });
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

  return attachments;
};
