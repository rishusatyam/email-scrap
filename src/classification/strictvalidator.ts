export type StrictDecision = 'ALLOW' | 'BLOCK';

export interface StrictValidationInput {
  subject?: string;
  body?: string;
  cleanedHtmlBody?: string;
  cleanedTextBody?: string;
  pdfText?: string;
  attachments?: Array<{
    filename?: string;
    mimeType?: string;
  }>;
}

export interface StrictValidationResult {
  decision: StrictDecision;
  reason: string;
}

interface StrictSignals {
  hasBookingId: boolean;
  hasPNR: boolean;
  hasItinerary: boolean;
  hasPassenger: boolean;
  hasPdf: boolean;
  hasPdfBookingData: boolean;
  isPromo: boolean;
  isSupport: boolean;
  isLifecycle: boolean;
  isFeedback: boolean;
  hasSupportId: boolean;
  hasStrongBookingSubject: boolean;
  detectedTypes: string[];
}

const BOOKING_TYPE_KEYWORDS: Record<string, string[]> = {
  flight: ['flight', 'airline', 'boarding pass', 'e-ticket', 'terminal', 'gate', 'departure', 'arrival'],
  train: ['train', 'rail', 'irctc', 'coach', 'berth', 'platform', 'pnr'],
  bus: ['bus', 'boarding point', 'drop point', 'operator', 'seat'],
  hotel: ['hotel', 'check-in', 'check-out', 'room', 'stay', 'reservation'],
  car: ['car', 'cab', 'driver', 'pickup', 'dropoff', 'drop-off', 'rental'],
};

const BOOKING_ID_REGEX = /\b(?:booking\s*(?:id|reference|ref|number|no\.?|#)\s*[:#-]?\s*[a-z0-9-]{6,}|(?:trip\s*id|reservation\s*id)\s*[:#-]?\s*[a-z0-9-]{6,})\b/i;
const PNR_REGEX = /\b(?:pnr|operator\s*pnr)\s*[:#-]?\s*[a-z0-9]{5,10}\b/i;
const SUPPORT_ID_REGEX = /\b(?:ticket\s*id|case\s*id|service\s*request\s*id)\s*[:#-]?\s*[a-z0-9-]{4,}\b/i;

const ITINERARY_FROM_TO_REGEX = /\bfrom\b[\s\S]{0,80}\bto\b/i;
const ITINERARY_DATE_REGEX = /\b(?:date|departure|arrival|check-?in|check-?out|journey|travel\s*date|time)\b/i;
const HOTEL_ITINERARY_REGEX = /\b(?:check-?in|check-?out|room\s*type|nights?|property|stay)\b/i;
const CAB_ITINERARY_REGEX = /\b(?:pickup|pick-up|drop-?off|driver|ride\s*details?)\b/i;
const PASSENGER_REGEX = /\b(?:passenger|traveller|traveler|guest|seat|berth)\b/i;
const STRONG_SUBJECT_REGEX = /\b(?:e-?ticket|booking\s*confirmed|booking\s*confirmation|itinerary|tax\s*invoice|confirmed\s*booking)\b/i;

const MARKETING_REGEX = /\b(?:sale|offer|discount|coupon|promo|limited\s*time|exclusive\s*deal|deal)\b/i;
const FOOTER_REGEX = /\b(?:unsubscribe|privacy\s*policy|download\s*app|follow\s*us|all\s*rights\s*reserved)\b/i;
const SUPPORT_REGEX = /\b(?:support\s*ticket|ticket\s*id|case\s*id|service\s*request|complaint|warranty|help\s*center)\b/i;
const LIFECYCLE_REGEX = /\b(?:expired|pending|verification\s*required|request\s*expired|reminder|payment\s*pending|awaiting\s*payment)\b/i;
const FEEDBACK_REGEX = /\b(?:rate\s+your|review\s+your|feedback|journey\s+experience|how\s+was\s+your|share\s+your\s+experience|survey)\b/i;

const toLower = (value?: string): string => (value || '').toLowerCase();

const hasPdfAttachment = (attachments?: StrictValidationInput['attachments']): boolean => {
  if (!attachments || attachments.length === 0) {
    return false;
  }

  return attachments.some((attachment) => {
    const mimeType = toLower(attachment.mimeType);
    const filename = toLower(attachment.filename);
    return mimeType === 'application/pdf' || filename.endsWith('.pdf');
  });
};

const detectTypes = (text: string): string[] => {
  const detected: string[] = [];

  for (const [type, keywords] of Object.entries(BOOKING_TYPE_KEYWORDS)) {
    if (keywords.some((keyword) => text.includes(keyword))) {
      detected.push(type);
    }
  }

  return detected;
};

const extractSignals = (input: StrictValidationInput): StrictSignals => {
  const subject = toLower(input.subject);
  const body = toLower(input.body);
  const cleanedHtmlBody = toLower(input.cleanedHtmlBody);
  const cleanedTextBody = toLower(input.cleanedTextBody);
  const pdfText = toLower(input.pdfText);

  const combinedText = `${subject} ${body} ${cleanedHtmlBody} ${cleanedTextBody}`.trim();
  const textWithPdf = `${combinedText} ${pdfText}`.trim();

  const hasBookingId = BOOKING_ID_REGEX.test(textWithPdf);
  const hasPNR = PNR_REGEX.test(textWithPdf);
  const hasSupportId = SUPPORT_ID_REGEX.test(textWithPdf);

  const hasItinerary =
    ITINERARY_FROM_TO_REGEX.test(textWithPdf) ||
    ITINERARY_DATE_REGEX.test(textWithPdf) ||
    HOTEL_ITINERARY_REGEX.test(textWithPdf) ||
    CAB_ITINERARY_REGEX.test(textWithPdf);

  const hasPassenger = PASSENGER_REGEX.test(textWithPdf);
  const hasPdf = hasPdfAttachment(input.attachments);

  const hasPdfBookingData =
    pdfText.length > 0 && (BOOKING_ID_REGEX.test(pdfText) || PNR_REGEX.test(pdfText));

  const isPromo = MARKETING_REGEX.test(textWithPdf) && FOOTER_REGEX.test(textWithPdf);
  const isSupport = SUPPORT_REGEX.test(textWithPdf);
  const isLifecycle = LIFECYCLE_REGEX.test(textWithPdf);
  const isFeedback = FEEDBACK_REGEX.test(textWithPdf);
  const hasStrongBookingSubject = STRONG_SUBJECT_REGEX.test(subject);

  return {
    hasBookingId,
    hasPNR,
    hasItinerary,
    hasPassenger,
    hasPdf,
    hasPdfBookingData,
    isPromo,
    isSupport,
    isLifecycle,
    isFeedback,
    hasSupportId,
    hasStrongBookingSubject,
    detectedTypes: detectTypes(textWithPdf),
  };
};

export const validateStrictBooking = (
  input: StrictValidationInput
): StrictValidationResult => {
  const signals = extractSignals(input);
  const hasProof = signals.hasBookingId || signals.hasPNR || signals.hasPdfBookingData;
  const hasStructure = signals.hasItinerary || signals.hasPassenger || signals.hasPdf;

  // Rule 1: Hard block when noisy intent has no booking proof.
  if (
    (signals.isPromo || signals.isSupport || signals.isLifecycle || signals.isFeedback) &&
    !hasProof
  ) {
    return {
      decision: 'BLOCK',
      reason: `Hard block: negative intent without proof (promo=${signals.isPromo}, support=${signals.isSupport}, lifecycle=${signals.isLifecycle}, feedback=${signals.isFeedback})`,
    };
  }

  // Guardrail: support-id context should not pass on weak proof alone.
  if (signals.isSupport && signals.hasSupportId && !signals.hasPdfBookingData) {
    return {
      decision: 'BLOCK',
      reason: 'Hard block: support/case context detected without PDF-backed booking proof',
    };
  }

  // Subject fast-path: strong transactional subject + proof.
  if (signals.hasStrongBookingSubject && hasProof && !signals.isSupport) {
    const typeInfo = signals.detectedTypes.length > 0 ? signals.detectedTypes.join(',') : 'unknown';
    return {
      decision: 'ALLOW',
      reason: `Fast allow: strong booking subject with proof (types=${typeInfo})`,
    };
  }

  // Rule 2: Hard allow when proof + structure exists.
  if (
    hasProof &&
    hasStructure &&
    !signals.isSupport
  ) {
    const typeInfo = signals.detectedTypes.length > 0 ? signals.detectedTypes.join(',') : 'unknown';
    return {
      decision: 'ALLOW',
      reason: `Hard allow: booking proof and structure present (types=${typeInfo})`,
    };
  }

  // Rule 3: Default deny.
  return {
    decision: 'BLOCK',
    reason: 'Fallback block: insufficient booking proof',
  };
};

export { BOOKING_TYPE_KEYWORDS };
