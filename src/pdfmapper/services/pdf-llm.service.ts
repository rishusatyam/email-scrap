import OpenAI from 'openai';
import { PdfFileData } from '../types';

export class PdfLlmService {
  private readonly client: OpenAI;

  constructor() {
    const apiKey = process.env.AZURE_OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('AZURE_OPENAI_API_KEY not set');
    }

    const endpoint = 'https://ayush-mjprwu4d-eastus2.cognitiveservices.azure.com/openai/v1/';

    this.client = new OpenAI({
      apiKey,
      baseURL: endpoint,
      defaultHeaders: {
        'api-key': apiKey,
      },
    });
  }

  /**
   * Extracts booking data from a single PDF.
   * Optimized for single-file processing.
   */
  async extractFromPdf(
    pdfBuffer: Buffer,
    mimeType: string,
    schema: Record<string, any>,
    bookingType: string,
    provider?: string
  ): Promise<Record<string, any>> {
    const prompt = this.buildSinglePrompt(schema, bookingType);
    console.log(`[PDF LLM Service] Extracting single PDF for ${bookingType}`);

    const response = await this.callMultimodalLlm(pdfBuffer, mimeType, prompt, provider);
    const text = this.extractTextFromResponse(response);

    try {
      const parsed = JSON.parse(text || '{}');
      console.log('[PDF LLM Service] Successfully parsed single PDF response');
      return parsed;
    } catch {
      console.error('[PDF LLM Service] Failed to parse single PDF response');
      throw new Error('LLM returned invalid JSON');
    }
  }

  /**
   * Aggregates booking data from multiple PDFs in a single call.
   * Intelligently merges passengers, segments, and handles conflicts.
   */
  async extractFromPdfs(
    files: PdfFileData[],
    schema: Record<string, any>,
    bookingType: string,
    provider?: string
  ): Promise<Record<string, any>> {
    if (!files || files.length === 0) {
      throw new Error('At least one file is required for aggregation');
    }

    const prompt = this.buildAggregationPrompt(schema, bookingType, files.length);
    console.log(`[PDF LLM Service] Aggregating ${files.length} PDFs for ${bookingType}`);

    const response = await this.callMultimodalLlmWithFiles(files, prompt, provider);
    const text = this.extractTextFromResponse(response);

    try {
      const parsed = JSON.parse(text || '{}');
      console.log(`[PDF LLM Service] Successfully parsed aggregated response from ${files.length} PDFs`);
      return parsed;
    } catch {
      console.error('[PDF LLM Service] Failed to parse aggregated PDF response');
      throw new Error('LLM returned invalid JSON for multi-PDF aggregation');
    }
  }

  /**
   * Builds extraction prompt for a single PDF.
   */
  private buildSinglePrompt(schema: Record<string, any>, bookingType: string): string {
    const schemaProperties = schema?.properties || {};

    return `You are a data extraction engine for ${bookingType} bookings.

Extract booking details from the provided PDF.

Rules:
- Return ONLY a raw JSON object (no markdown, no code fences)
- Follow the schema strictly
- Do not add extra keys
- If a field is missing, set it to null
- For array fields, return empty array [] if no data

Schema fields:
${JSON.stringify(schemaProperties, null, 2)}`;
  }

  /**
   * Builds intelligent aggregation prompt for multiple PDFs.
   * Instructs LLM to merge data, deduplicate, and handle conflicts.
   */
  private buildAggregationPrompt(
    schema: Record<string, any>,
    bookingType: string,
    fileCount: number
  ): string {
    const schemaProperties = schema?.properties || {};

    return `You are an intelligent data aggregation engine for ${bookingType} bookings.

You are given ${fileCount} PDF document(s) related to a single booking. These may include confirmations, amendments, receipts, or related documents.

YOUR TASK:
1. Extract ${bookingType} booking details from ALL PDFs
2. MERGE all data into ONE unified booking object
3. Intelligently combine arrays (passengers, segments, services, etc.):
   - Remove duplicate entries (same person appears in multiple PDFs)
   - Combine all unique records from all documents
   - Keep all valid data points
4. Handle conflicts:
   - If the same field has different values in different documents, use the most recent or authoritative version
   - Preserve timestamps or document order if available

CRITICAL RULES:
- Return ONLY a raw JSON object (no markdown, no code fences, no explanations)
- Do not add keys beyond the schema
- If a field cannot be extracted, set it to null
- For arrays: merge and deduplicate across all ${fileCount} PDFs, return [] if empty
- Ensure the final result represents the complete, merged booking state

DEDUPLICATION STRATEGY (for arrays):
- For passengers: deduplicate by name, email, or ID if present
- For segments: deduplicate by reference number or journey identifier
- For services: deduplicate by service type and provider

Schema fields:
${JSON.stringify(schemaProperties, null, 2)}`;
  }

  /**
   * Calls LLM with a single PDF file.
   */
  private async callMultimodalLlm(
    pdfBuffer: Buffer,
    mimeType: string,
    prompt: string,
    provider?: string
  ): Promise<any> {
    const model = process.env.AZURE_OPENAI_MODEL || 'gpt-5.2-chat';
    const fileData = `data:${mimeType || 'application/pdf'};base64,${pdfBuffer.toString('base64')}`;

    return (this.client as any).responses.create({
      model,
      input: [
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: provider ? `${prompt}\n\nProvider context: ${provider}` : prompt,
            },
            {
              type: 'input_file',
              filename: 'booking.pdf',
              file_data: fileData,
            },
          ],
        },
      ],
    });
  }

  /**
   * Calls LLM with multiple PDF files in a single request.
   * All PDFs are processed together for coherent aggregation.
   */
  private async callMultimodalLlmWithFiles(
    files: PdfFileData[],
    prompt: string,
    provider?: string
  ): Promise<any> {
    const model = process.env.AZURE_OPENAI_MODEL || 'gpt-5.2-chat';

    // Build content array: prompt + all file blocks
    const contentArray: any[] = [
      {
        type: 'input_text',
        text: provider ? `${prompt}\n\nProvider context: ${provider}` : prompt,
      },
    ];

    // Add each PDF as a separate input file block
    for (const file of files) {
      const fileData = `data:${file.mimetype || 'application/pdf'};base64,${file.buffer.toString('base64')}`;
      contentArray.push({
        type: 'input_file',
        filename: file.originalname,
        file_data: fileData,
      });
    }

    return (this.client as any).responses.create({
      model,
      input: [
        {
          role: 'user',
          content: contentArray,
        },
      ],
    });
  }

  /**
   * Extracts text from LLM response payload.
   */
  private extractTextFromResponse(response: any): string {
    // Handle direct text response
    if (typeof response?.output_text === 'string') {
      return response.output_text;
    }

    // Handle structured response with output array
    if (Array.isArray(response?.output)) {
      const chunks: string[] = [];

      for (const item of response.output) {
        if (!Array.isArray(item?.content)) {
          continue;
        }

        for (const content of item.content) {
          if (typeof content?.text === 'string') {
            chunks.push(content.text);
          }
        }
      }

      return chunks.join('\n').trim();
    }

    return '';
  }
}
