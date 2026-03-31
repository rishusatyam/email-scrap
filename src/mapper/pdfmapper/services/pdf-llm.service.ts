import OpenAI from 'openai';

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
   * Sends PDF and schema prompt to LLM and returns parsed structured JSON.
   */
  async extractFromPdf(
    pdfBuffer: Buffer,
    mimeType: string,
    schema: Record<string, any>,
    bookingType: string,
    provider?: string
  ): Promise<Record<string, any>> {
    const prompt = this.buildPrompt(schema, bookingType);
    console.log(`[PDF Mapper LLM] Calling LLM for bookingType=${bookingType}`);
    const response = await this.callMultimodalLlm(pdfBuffer, mimeType, prompt, provider);
    console.log('[PDF Mapper LLM] LLM returned response');
    console.log('[PDF Mapper LLM] Raw LLM response:', JSON.stringify(response, null, 2));
    const text = this.extractTextFromResponse(response);

    try {
      const parsed = JSON.parse(text || '{}');
      console.log('[PDF Mapper LLM] Parsed JSON response successfully');
      return parsed;
    } catch {
      console.log('[PDF Mapper LLM] Failed to parse LLM response as JSON');
      throw new Error('LLM returned non-JSON response');
    }
  }

  /**
   * Builds the small strict extraction prompt for PDF mapping.
   */
  private buildPrompt(schema: Record<string, any>, bookingType: string): string {
    const schemaProperties = schema?.properties || {};

    return `
You are a data extraction engine.

Extract ${bookingType} booking details from the PDF.

Rules:
- Return only a raw JSON object
- Do not wrap JSON in markdown or code fences
- Do not add explanations or extra text
- Follow these fields strictly
- Do not add extra keys
- If a field is missing, set it to null
- For missing arrays, return []

Fields Schema (schema.properties):
${JSON.stringify(schemaProperties)}
`;
  }

  /**
   * Calls the multimodal responses API with PDF file content and extraction prompt.
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
              text: provider
                ? `${prompt}\n\nProvider (optional context, ignore if not useful): ${provider}`
                : prompt,
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
   * Extracts text from SDK response payload variants.
   */
  private extractTextFromResponse(response: any): string {
    if (typeof response?.output_text === 'string') {
      return response.output_text;
    }

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
