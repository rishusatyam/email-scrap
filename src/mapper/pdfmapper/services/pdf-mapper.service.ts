import { SchemaLoaderUtil } from '../../utils/schema-loader.util';
import { PdfBookingType } from '../types';
import { OutputNormalizerUtil } from '../utils/output-normalizer.util';
import { PdfLlmService } from './pdf-llm.service';

export class PdfMapperService {
  private readonly pdfLlmService: PdfLlmService;

  constructor() {
    this.pdfLlmService = new PdfLlmService();
  }

  /**
   * Orchestrates PDF mapping from schema selection to normalized JSON output.
   */
  async mapPdf(
    fileBuffer: Buffer,
    mimeType: string,
    bookingType: PdfBookingType,
    provider?: string
  ): Promise<Record<string, any>> {
    const schema = await SchemaLoaderUtil.loadSchema(bookingType);
    const extracted = await this.pdfLlmService.extractFromPdf(fileBuffer, mimeType, schema, bookingType, provider);
    return OutputNormalizerUtil.normalizeWithSchema(extracted, schema, bookingType);
  }
}
