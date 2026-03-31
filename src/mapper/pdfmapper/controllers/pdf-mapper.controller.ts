import { Request, Response } from 'express';
import { PdfMapperService } from '../services/pdf-mapper.service';
import { PdfBookingType } from '../types';

const SUPPORTED_TYPES: PdfBookingType[] = ['flight', 'bus', 'rail', 'car', 'hotel'];

export class PdfMapperController {
  private readonly pdfMapperService: PdfMapperService;

  constructor() {
    this.pdfMapperService = new PdfMapperService();
  }

  /**
   * Handles API request for PDF-to-schema mapping and returns success/data response.
   */
  mapPdf = async (req: Request, res: Response): Promise<void> => {
    try {
      const bookingType = String(req.body?.bookingType || '').toLowerCase();
      const provider = req.body?.provider ? String(req.body.provider) : undefined;

      if (!SUPPORTED_TYPES.includes(bookingType as PdfBookingType)) {
        res.status(400).json({ error: 'Unsupported bookingType' });
        return;
      }

      if (!req.file) {
        res.status(400).json({ error: 'file is required' });
        return;
      }

      const mappedData = await this.pdfMapperService.mapPdf(
        req.file.buffer,
        req.file.mimetype || 'application/pdf',
        bookingType as PdfBookingType,
        provider
      );

      res.status(200).json({
        success: true,
        data: mappedData,
      });
    } catch (error) {
      console.error('[PDF Mapper] Failed:', error);
      res.status(500).json({
        success: false,
        error: 'LLM extraction failed',
      });
    }
  };
}
