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
  ): Promise<{ provider: string; template: string }> {
    const prompt = this.buildPrompt(body, schema, provider, bookingType);
    const response = await this.callLLMAPI(prompt);

    return {
      provider,
      template: response.template,
    };
  }

  private buildPrompt(body: string, schema: Record<string, any>, provider: string, bookingType: string): string {
    // Get booking-type-specific prompt
    const promptTemplate = PromptFactory.getPrompt(bookingType);
    const schemaFields = this.formatSchemaFields(schema);
    
    return promptTemplate.getPrompt(schemaFields, body);
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
        
        console.log('[LLM] Template generated successfully');
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
