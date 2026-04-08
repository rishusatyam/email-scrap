import { SchemaLoaderUtil } from '../../mapper/utils/schema-loader.util';
import { promises as fs } from 'fs';
import * as path from 'path';
import { PdfBookingType, PdfFileData } from '../types';
import { OutputNormalizerUtil } from '../utils/output-normalizer.util';
import { PdfLlmService } from './pdf-llm.service';

export class PdfMapperService {
  private readonly pdfLlmService: PdfLlmService;

  constructor() {
    this.pdfLlmService = new PdfLlmService();
  }

  /**
   * Maps one or multiple PDFs to a unified booking object.
   * Smart routing:
   * - 1 PDF: optimized single-file extraction
   * - 2+ PDFs: intelligent aggregation with merging
   *
   * This is the main public API for email-normalizer and other consumers.
   */
  async mapPdfs(
    files: PdfFileData[],
    bookingType: PdfBookingType,
    provider?: string
  ): Promise<Record<string, any>> {
    // Validate input
    if (!files || !Array.isArray(files) || files.length === 0) {
      throw new Error('At least one file is required');
    }

    // Load schema once for all files
    const schema = await SchemaLoaderUtil.loadSchema(bookingType);

    // Route to appropriate extraction method
    let extracted: Record<string, any>;

    if (files.length === 1) {
      // Single file: optimized path
      const file = files[0];
      console.log(`[PDF Mapper Service] Extracting from 1 PDF: ${file.originalname}`);
      extracted = await this.pdfLlmService.extractFromPdf(
        file.buffer,
        file.mimetype,
        schema,
        bookingType,
        provider
      );
    } else {
      // Multiple files: aggregation path
      console.log(`[PDF Mapper Service] Aggregating ${files.length} PDFs: ${files.map(f => f.originalname).join(', ')}`);
      extracted = await this.pdfLlmService.extractFromPdfs(
        files,
        schema,
        bookingType,
        provider
      );
    }

    // Normalize extracted data against schema (same for both paths)
    const normalized = OutputNormalizerUtil.normalizeWithSchema(extracted, schema, bookingType);

    // Fire-and-forget persistence for mapped output.
    void this.persistMappedOutputLog(normalized, files, bookingType, provider).catch((error) => {
      console.warn('[PDF Mapper Service] Failed to write mapping log:', error);
    });

    return normalized;
  }

  private async persistMappedOutputLog(
    mappedData: Record<string, any>,
    files: PdfFileData[],
    bookingType: PdfBookingType,
    provider?: string
  ): Promise<void> {
    const logsDir = path.join(__dirname, '..', 'logs');
    await fs.mkdir(logsDir, { recursive: true });

    const now = new Date();
    const safeProvider = (provider || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '_');
    const fileName = `mapped_${bookingType}_${safeProvider}_${now.getTime()}.json`;
    const filePath = path.join(logsDir, fileName);

    const payload = {
      timestamp: now.toISOString(),
      bookingType,
      provider: provider || null,
      filesCount: files.length,
      fileNames: files.map((file) => file.originalname),
      data: mappedData,
    };

    await fs.writeFile(filePath, JSON.stringify(payload, null, 2), 'utf-8');
  }
}
