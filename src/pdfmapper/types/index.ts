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

/**
 * Represents a single PDF file with metadata
 */
export interface PdfFileData {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
}
