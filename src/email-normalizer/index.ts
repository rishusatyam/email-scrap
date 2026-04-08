export {
	normalizeGmailEmail,
	normalizeGmailEmailWithRaw,
	processGmailEmail,
	normalizeOutlookEmail,
	normalizeOutlookEmailWithRaw,
	processOutlookEmail,
} from './services/email-normalizer.service';
export { normalizerRoutes } from './routes/normalizer.routes';
export type { NormalizedEmail, NormalizedAttachment, GmailMessage, OutlookMessage } from './types/email.types';
export type { ProcessedNormalizedEmail } from './services/email-normalizer.service';
