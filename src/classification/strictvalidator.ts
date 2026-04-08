export type StrictDecision = 'ALLOW' | 'BLOCK';

export interface StrictValidationInput {
  subject?: string;
  body?: string;
  cleanedHtmlBody?: string;
  cleanedTextBody?: string;
  // Deprecated: kept for compatibility, intentionally not used by strict validator logic.
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
  isPromo: boolean;
  isSupport: boolean;
  isLifecycle: boolean;
  isFeedback: boolean;
  hasSupportId: boolean;
  hasStrongBookingSubject: boolean;
  detectedTypes: string[];
  score: number;
  scoreBreakdown: string[];
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

const countMatches = (regex: RegExp, texts: string[]): number =>
  texts.reduce((count, text) => count + (regex.test(text) ? 1 : 0), 0);

const extractSignals = (input: StrictValidationInput): StrictSignals => {
  const subject = toLower(input.subject);
  const body = toLower(input.body);
  const cleanedHtmlBody = toLower(input.cleanedHtmlBody);
  const cleanedTextBody = toLower(input.cleanedTextBody);

  const combinedText = `${subject} ${body} ${cleanedHtmlBody} ${cleanedTextBody}`.trim();
  const cleanBodies = [cleanedHtmlBody, cleanedTextBody].filter(Boolean);
  const allBodies = [subject, body, ...cleanBodies].filter(Boolean);

  const bookingIdHits = countMatches(BOOKING_ID_REGEX, allBodies);
  const pnrHits = countMatches(PNR_REGEX, allBodies);

  const hasBookingId = bookingIdHits > 0;
  const hasPNR = pnrHits > 0;
  const hasSupportId = SUPPORT_ID_REGEX.test(combinedText);

  const hasItinerary =
    ITINERARY_FROM_TO_REGEX.test(combinedText) ||
    ITINERARY_DATE_REGEX.test(combinedText) ||
    HOTEL_ITINERARY_REGEX.test(combinedText) ||
    CAB_ITINERARY_REGEX.test(combinedText);

  const hasPassenger = PASSENGER_REGEX.test(combinedText);
  const hasPdf = hasPdfAttachment(input.attachments);

  const isPromo = MARKETING_REGEX.test(combinedText) && FOOTER_REGEX.test(combinedText);
  const isSupport = SUPPORT_REGEX.test(combinedText);
  const isLifecycle = LIFECYCLE_REGEX.test(combinedText);
  const isFeedback = FEEDBACK_REGEX.test(combinedText);
  const hasStrongBookingSubject = STRONG_SUBJECT_REGEX.test(subject);

  // Score model
  // - PDF presence is a positive trust signal (+2)
  // - Clean body evidence has higher weight than raw body
  // - Negative intents reduce score but do not auto-block because PDF may be absent
  let score = 0;
  const scoreBreakdown: string[] = [];

  if (bookingIdHits > 0) {
    const delta = 3;
    score += delta;
    scoreBreakdown.push(`bookingId+${delta}`);
  }

  if (pnrHits > 0) {
    const delta = 3;
    score += delta;
    scoreBreakdown.push(`pnr+${delta}`);
  }

  if (hasItinerary) {
    const delta = 2;
    score += delta;
    scoreBreakdown.push(`itinerary+${delta}`);
  }

  if (hasPassenger) {
    const delta = 1;
    score += delta;
    scoreBreakdown.push(`passenger+${delta}`);
  }

  if (hasStrongBookingSubject) {
    const delta = 2;
    score += delta;
    scoreBreakdown.push(`subject+${delta}`);
  }

  if (hasPdf) {
    const delta = 2;
    score += delta;
    scoreBreakdown.push(`pdf+${delta}`);
  }

  if (isPromo) {
    const delta = -2;
    score += delta;
    scoreBreakdown.push(`promo${delta}`);
  }

  if (isFeedback) {
    const delta = -2;
    score += delta;
    scoreBreakdown.push(`feedback${delta}`);
  }

  if (isLifecycle) {
    const delta = -1;
    score += delta;
    scoreBreakdown.push(`lifecycle${delta}`);
  }

  // Soft-penalize support/case context, but avoid hard block solely due to no PDF.
  if (isSupport && hasSupportId && !hasBookingId && !hasPNR) {
    const delta = -2;
    score += delta;
    scoreBreakdown.push(`supportCase${delta}`);
  }

  return {
    hasBookingId,
    hasPNR,
    hasItinerary,
    hasPassenger,
    hasPdf,
    isPromo,
    isSupport,
    isLifecycle,
    isFeedback,
    hasSupportId,
    hasStrongBookingSubject,
    detectedTypes: detectTypes(combinedText),
    score,
    scoreBreakdown,
  };
};

export const validateStrictBooking = (
  input: StrictValidationInput
): StrictValidationResult => {
  const signals = extractSignals(input);
  const hasProof = signals.hasBookingId || signals.hasPNR;
  const hasStructure = signals.hasItinerary || signals.hasPassenger;
  const typeInfo = signals.detectedTypes.length > 0 ? signals.detectedTypes.join(',') : 'unknown';

  // Fast-allow high confidence transactional signals.
  if (signals.hasStrongBookingSubject && hasProof && hasStructure) {
    return {
      decision: 'ALLOW',
      reason: `Fast allow: strong subject + proof + structure (types=${typeInfo}, score=${signals.score}, breakdown=${signals.scoreBreakdown.join('|')})`,
    };
  }

  // Main score-based allow path.
  if (signals.score >= 4 && (hasProof || hasStructure)) {
    return {
      decision: 'ALLOW',
      reason: `Allow: score threshold met (types=${typeInfo}, score=${signals.score}, breakdown=${signals.scoreBreakdown.join('|')})`,
    };
  }

  // Defensive block for obvious non-transactional noise with weak evidence.
  if ((signals.isPromo || signals.isFeedback) && !hasProof && !signals.hasPdf) {
    return {
      decision: 'BLOCK',
      reason: `Block: promotional/feedback noise with weak evidence (types=${typeInfo}, score=${signals.score}, breakdown=${signals.scoreBreakdown.join('|')})`,
    };
  }

  // Default path: allow when enough structured hints exist, otherwise block.
  if (hasProof || (hasStructure && signals.score >= 2)) {
    return {
      decision: 'ALLOW',
      reason: `Allow: sufficient structured indicators (types=${typeInfo}, score=${signals.score}, breakdown=${signals.scoreBreakdown.join('|')})`,
    };
  }

  return {
    decision: 'BLOCK',
    reason: `Block: insufficient transactional indicators (types=${typeInfo}, score=${signals.score}, breakdown=${signals.scoreBreakdown.join('|')})`,
  };
};

export { BOOKING_TYPE_KEYWORDS };
