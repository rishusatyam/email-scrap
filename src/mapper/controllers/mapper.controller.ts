import { Request, Response } from 'express';
import { MapperService } from '../services/mapper.service';
import { MapEmailRequest } from '../types';

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
}
