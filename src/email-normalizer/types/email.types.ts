export interface NormalizedEmail {
  messageId: string;
  threadId: string;
  subject: string;
  from: string;
  to: string;
  date: string;
  textBody?: string;
  htmlBody?: string;
  cleanedTextBody?: string;
  cleanedHtmlBody?: string;
  attachments: NormalizedAttachment[];
  raw?: any;
}

export interface NormalizedAttachment {
  filename: string;
  mimeType: string;
  attachmentId: string;
  size?: number;
}

export interface GmailHeader {
  name: string;
  value: string;
}

export interface GmailMessagePart {
  partId: string;
  mimeType: string;
  filename?: string;
  headers?: GmailHeader[];
  body?: {
    size?: number;
    data?: string;
    attachmentId?: string;
  };
  parts?: GmailMessagePart[];
}

export interface GmailMessage {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet?: string;
  payload: {
    partId?: string;
    mimeType: string;
    filename?: string;
    headers: GmailHeader[];
    body?: {
      size?: number;
      data?: string;
      attachmentId?: string;
    };
    parts?: GmailMessagePart[];
  };
  sizeEstimate?: number;
  historyId?: string;
  internalDate?: string;
}
