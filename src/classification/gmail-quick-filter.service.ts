import { GmailMessage } from '../email-normalizer/types/email.types';

export interface QuickFilterResult {
  isBooking: boolean;
  score: number;
  reasons: string[];
}

const SUBJECT_KEYWORDS = [
  'booking',
  'reservation',
  'ticket',
  'itinerary',
  'confirmation',
];

const TRUSTED_SENDER_PATTERNS = [
  'makemytrip',
  'booking.com',
  'expedia',
  'airindia',
  'indigo',
  'goindigo',
  'spicejet',
  'vistara',
  'airasia',
  'emirates',
  'lufthansa',
  'qatarairways',
  'marriott',
  'hilton',
  'oyo',
];

const DEFAULT_THRESHOLD = 5;

const getGmailThreshold = () => {
  const raw = process.env.GMAIL_QUICK_FILTER_THRESHOLD;
  if (!raw) {
    return DEFAULT_THRESHOLD;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return DEFAULT_THRESHOLD;
  }

  return parsed;
};

const extractSenderDomain = (sender?: string): string => {
  if (!sender) {
    return '';
  }

  const emailMatch = sender.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  const email = (emailMatch?.[0] || sender).trim().toLowerCase();

  const atIndex = email.indexOf('@');
  if (atIndex === -1) {
    return '';
  }

  return email.slice(atIndex + 1).trim().toLowerCase();
};

const getGmailHeaderValue = (email: GmailMessage, headerName: string): string => {
  const headers = email.payload?.headers || [];
  const header = headers.find((item: any) => item.name?.toLowerCase() === headerName.toLowerCase());
  return header?.value || '';
};

export const quickFilterGmail = (email: GmailMessage): QuickFilterResult => {
  const reasons: string[] = [];
  let score = 0;

  // Subject check
  const subject = getGmailHeaderValue(email, 'Subject').toLowerCase();
  const subjectHit = SUBJECT_KEYWORDS.find((keyword) => subject.includes(keyword));
  if (subjectHit) {
    score += 3;
    reasons.push(`subject keyword: ${subjectHit}`);
  }

  // Sender domain check
  const fromHeader = getGmailHeaderValue(email, 'From');
  const senderDomain = extractSenderDomain(fromHeader);
  const senderHit = TRUSTED_SENDER_PATTERNS.find(
    (pattern) => senderDomain.includes(pattern) || senderDomain.endsWith(pattern)
  );
  if (senderHit) {
    score += 4;
    reasons.push(`trusted sender: ${senderDomain}`);
  }

  const threshold = getGmailThreshold();
  const isBooking = score >= threshold;

  if (!isBooking) {
    reasons.push(`score below threshold (${score}/${threshold})`);
  }

  return { isBooking, score, reasons };
};
