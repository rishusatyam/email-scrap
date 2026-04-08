import { OutlookMessage } from '../email-normalizer/types/email.types';

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

const BODY_SIGNAL_PATTERNS = [
  /\bpnr\b/i,
  /\bconfirmation\b/i,
  /\bbooking\s*(id|reference|ref|number|no\.?|#)\b/i,
  /\bitinerary\b/i,
  /\be-?ticket\b/i,
];

const DEFAULT_THRESHOLD = 2;

const getOutlookThreshold = () => {
  const raw = process.env.OUTLOOK_QUICK_FILTER_THRESHOLD;
  if (!raw) {
    return DEFAULT_THRESHOLD;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return DEFAULT_THRESHOLD;
  }

  return parsed;
};

const extractSenderDomain = (email?: string): string => {
  if (!email) {
    return '';
  }

  const atIndex = email.indexOf('@');
  if (atIndex === -1) {
    return '';
  }

  return email.slice(atIndex + 1).trim().toLowerCase();
};

export const quickFilterOutlook = (email: OutlookMessage): QuickFilterResult => {
  const reasons: string[] = [];
  let score = 0;

  // Subject check
  const subject = (email.subject || '').toLowerCase();
  const subjectHit = SUBJECT_KEYWORDS.find((keyword) => subject.includes(keyword));
  if (subjectHit) {
    score += 3;
    reasons.push(`subject keyword: ${subjectHit}`);
  }

  // Sender domain check
  const senderDomain = extractSenderDomain(email.from?.emailAddress?.address);
  const senderHit = TRUSTED_SENDER_PATTERNS.find(
    (pattern) => senderDomain.includes(pattern) || senderDomain.endsWith(pattern)
  );
  if (senderHit) {
    score += 4;
    reasons.push(`trusted sender: ${senderDomain}`);
  }

  // Body check (Outlook-only)
  const body = `${email.bodyPreview || ''} ${email.body?.content || ''}`;
  const bodyHit = BODY_SIGNAL_PATTERNS.find((pattern) => pattern.test(body));
  if (bodyHit) {
    score += 3;
    reasons.push('body signal found');
  }

  const threshold = getOutlookThreshold();
  const isBooking = score >= threshold;

  if (!isBooking) {
    reasons.push(`score below threshold (${score}/${threshold})`);
  }

  return { isBooking, score, reasons };
};
