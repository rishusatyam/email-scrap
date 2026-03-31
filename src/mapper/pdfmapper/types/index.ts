export type PdfBookingType = 'flight' | 'bus' | 'rail' | 'car' | 'hotel';

export interface MapPdfPayload {
  bookingType: PdfBookingType;
  provider?: string;
}

export interface MapPdfResult {
  success: boolean;
  data?: Record<string, any>;
  error?: string;
}
