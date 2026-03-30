import { Request, Response } from 'express';
import { MapperService } from '../services/mapper.service';
import { MapEmailRequest } from '../types';
// Imports canonicalizeWhitespace to normalize Unicode spaces (NBSP, etc.) to plain spaces

import { canonicalizeWhitespace } from '../../email-normalizer/services/email-cleaner.service';

export class MapperController {
  private mapperService: MapperService;

  constructor() {
    this.mapperService = new MapperService();
  }

  mapEmail = async (req: Request, res: Response): Promise<void> => {
    try {
      const request: MapEmailRequest = req.body;

      const validationError = this.validateRequest(request);
      if (validationError) {
        res.status(400).json({
          success: false,
          error: validationError,
        });
        return;
      }

      // Normalize email bodies by converting Unicode spaces to plain spaces
      // This ensures consistent template matching and avoids extraction boundary errors
      request.cleanedHtmlBody = this.normalizeOptionalBody(request.cleanedHtmlBody);
      request.cleanedTextBody = this.normalizeOptionalBody(request.cleanedTextBody);

      const mappedData = await this.mapperService.mapEmail(request);

      res.json({
        success: true,
        data: mappedData,
      });
    } catch (error: any) {
      console.error('[Mapper Controller] Error:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Internal server error',
      });
    }
  };

  private validateRequest(request: MapEmailRequest): string | null {
    if (!request.subject) {
      return 'Subject is required';
    }

    if (!request.provider) {
      return 'Provider is required';
    }

    if (!request.bookingType) {
      return 'Booking type is required';
    }

    const validBookingTypes = ['bus', 'flight', 'hotel', 'car', 'rail'];
    if (!validBookingTypes.includes(request.bookingType)) {
      return `Invalid booking type. Must be one of: ${validBookingTypes.join(', ')}`;
    }

    if (!request.cleanedHtmlBody && !request.cleanedTextBody) {
      return 'Either cleanedHtmlBody or cleanedTextBody is required';
    }

    return null;
  }

  // Helper method to normalize optional body fields by canonicalizing whitespace
  // Converts Unicode space variants (NBSP, figure space, etc.) to plain spaces
  // Returns undefined if value is empty or falsy
  private normalizeOptionalBody(value?: string): string | undefined {
    if (!value) {
      return value;
    }

    return canonicalizeWhitespace(value);
  }
}
