import OpenAI from 'openai';
import { PromptFactory } from '../prompts';

export class LLMService {
  private client: OpenAI;

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

  async generateTemplate(
    body: string,
    schema: Record<string, any>,
    provider: string,
    bookingType: string
  ): Promise<{ provider: string; variant: string; template: string }> {
    const prompt = this.buildPrompt(body, schema, provider, bookingType);
    const response = await this.callLLMAPI(prompt);

    return {
      provider,
      variant: response.variant, // NEW: Return variant classification
      template: response.template,
    };
  }

  private buildPrompt(body: string, schema: Record<string, any>, provider: string, bookingType: string): string {
    // Get booking-type-specific prompt
    const promptTemplate = PromptFactory.getPrompt(bookingType);
    const schemaFields = this.formatSchemaFields(schema);
    
    // Generate booking-type-aware variant classification instruction
    const variantInstruction = this.buildVariantInstruction(bookingType);
    
    return promptTemplate.getPrompt(schemaFields, body) + variantInstruction;
  }

  /**
   * Generate variant classification instruction based on booking type
   * All booking types use 6 variants: single_direct, multi_direct, single_roundtrip, multi_roundtrip, single_connecting, multi_connecting
   */
  private buildVariantInstruction(bookingType: string): string {
    const segmentType = this.getSegmentTerminology(bookingType);
    
    return `
IMPORTANT: First, classify this booking variant based on BOTH passenger count AND ${segmentType} structure:

PASSENGER COUNT: Count all passengers (check for multiple names/IDs)
${segmentType.toUpperCase()} STRUCTURE:
  - Direct: Only 1 ${segmentType}
  - Roundtrip: 2 ${segmentType}s (outbound + return, same route reversed)
  - Connecting: 2+ ${segmentType}s with connection/layover (different routes)

VARIANT CLASSIFICATION (Passenger Count + ${segmentType} Type):
1. "single_direct" - 1 passenger, 1 ${segmentType}
2. "multi_direct" - 2+ passengers, 1 ${segmentType}
3. "single_roundtrip" - 1 passenger, outbound + return ${segmentType}s
4. "multi_roundtrip" - 2+ passengers, outbound + return ${segmentType}s
5. "single_connecting" - 1 passenger, 2+ ${segmentType}s with connection
6. "multi_connecting" - 2+ passengers, 2+ ${segmentType}s with connection

Return BOTH variant and template in your JSON response:
{
  "variant": "single_direct|multi_direct|single_roundtrip|multi_roundtrip|single_connecting|multi_connecting",
  "template": "field1 = value1, field2 = value2, ..."
}`;
  }

  /**
   * Map booking type to segment/leg terminology
   */
  private getSegmentTerminology(bookingType: string): string {
    const terminology: Record<string, string> = {
      flight: 'flight',
      bus: 'journey',
      rail: 'journey',
      car: 'rental',
      hotel: 'stay',
    };
    return terminology[bookingType] || 'segment';
  }

  private formatSchemaFields(schema: Record<string, any>, prefix = ''): string {
    const fields: string[] = [];
    
    for (const [key, value] of Object.entries(schema.properties || {})) {
      const fieldPath = prefix ? `${prefix}.${key}` : key;
      const fieldValue = value as any;
      
      if (fieldValue.type === 'object' && fieldValue.properties) {
        fields.push(...this.formatSchemaFields(fieldValue, fieldPath).split('\n'));
      } else if (fieldValue.type === 'array') {
        fields.push(`${fieldPath} (${fieldValue.description || fieldValue.type})`);
      } else {
        fields.push(`${fieldPath} (${fieldValue.description || fieldValue.type})`);
      }
    }
    
    return fields.join('\n');
  }

  private async callLLMAPI(prompt: string, maxRetries: number = 3): Promise<Record<string, any>> {
    let lastError: any;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await this.client.chat.completions.create({
          model: 'gpt-5.2-chat',
          messages: [{ role: 'user', content: prompt }],
        });

        const text = response.choices[0].message.content;
        const parsed = JSON.parse(text ?? '{}');
        
        if (!parsed.template) {
          throw new Error('LLM response missing template field');
        }
        if (!parsed.variant) {
          throw new Error('LLM response missing variant field');
        }
        
        console.log(`[LLM] Template generated successfully (variant: ${parsed.variant})`);
        return parsed;
      } catch (error: any) {
        lastError = error;

        if (error.status === 429) {
          const retryAfter = error.headers?.['retry-after'] || 60;
          const waitTime = typeof retryAfter === 'string' ? parseInt(retryAfter) : retryAfter;

          if (attempt < maxRetries) {
            console.log(`[LLM] Rate limit hit. Retrying after ${waitTime}s (attempt ${attempt + 1}/${maxRetries})`);
            await this.sleep(waitTime * 1000);
            continue;
          }
        }

        throw error;
      }
    }

    throw lastError;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
