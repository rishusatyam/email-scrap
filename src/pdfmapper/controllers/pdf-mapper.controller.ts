import { Request, Response } from 'express';
import { PdfMapperService } from '../services/pdf-mapper.service';
import { PdfBookingType, PdfFileData } from '../types';

const SUPPORTED_TYPES: PdfBookingType[] = ['flight', 'bus', 'rail', 'car', 'hotel'];
const MAX_FILES = 10;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export class PdfMapperController {
  private readonly pdfMapperService: PdfMapperService;

  constructor() {
    this.pdfMapperService = new PdfMapperService();
  }

  /**
   * Test endpoint for mapping one or multiple PDFs.
   * For production, email-normalizer calls PdfMapperService.mapPdfs() directly.
   */
  mapPdfs = async (req: Request, res: Response): Promise<void> => {
    try {
      const bookingType = String(req.body?.bookingType || '').toLowerCase();
      const provider = req.body?.provider ? String(req.body.provider) : undefined;

      // Validate booking type
      if (!SUPPORTED_TYPES.includes(bookingType as PdfBookingType)) {
        res.status(400).json({
          success: false,
          error: `Unsupported bookingType. Supported: ${SUPPORTED_TYPES.join(', ')}`,
        });
        return;
      }

      // Validate files exist
      if (!req.files || !Array.isArray(req.files) || req.files.length === 0) {
        res.status(400).json({
          success: false,
          error: 'At least one file required in "file" field (multipart/form-data)',
        });
        return;
      }

      // Validate file count
      if (req.files.length > MAX_FILES) {
        res.status(400).json({
          success: false,
          error: `Maximum ${MAX_FILES} files allowed, received ${req.files.length}`,
        });
        return;
      }

      // Convert Express files to PdfFileData
      const files: PdfFileData[] = req.files.map((f: Express.Multer.File) => ({
        buffer: f.buffer,
        mimetype: f.mimetype,
        originalname: f.originalname,
        size: f.size,
      }));

      // Call service with files array
      const result = await this.pdfMapperService.mapPdfs(
        files,
        bookingType as PdfBookingType,
        provider
      );

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[PDF Mapper Controller] Error:', message);
      res.status(500).json({
        success: false,
        error: message,
      });
    }
  };
}
