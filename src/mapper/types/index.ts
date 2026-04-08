export interface MapEmailRequest {
  subject: string;
  cleanedHtmlBody?: string;
  cleanedTextBody?: string;
  provider: string;
  bookingType: 'bus' | 'flight' | 'hotel' | 'car' | 'rail' | 'train';
}

export interface MapEmailResponse {
  success: boolean;
  data?: Record<string, any>;
  error?: string;
}
