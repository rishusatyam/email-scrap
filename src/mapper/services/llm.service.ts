import OpenAI from 'openai';

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
    provider: string
  ): Promise<{ provider: string; template: string }> {
    const prompt = this.buildPrompt(body, schema, provider);
    const response = await this.callLLMAPI(prompt);

    return {
      provider,
      template: response.template,
    };
  }

  private buildPrompt(body: string, schema: Record<string, any>, provider: string): string {
    return `You are a professional email data extraction assistant.

Task: Create an annotated template by replacing data values in the email with placeholder tags.

================================
INSTRUCTIONS
================================

1. Read the entire email carefully
2. **IGNORE all forwarded message chains** - Skip everything before the actual booking content
3. Look for the MAIN booking information section (usually starts with "Booking Details" or similar)
4. Identify ALL data values that match the provided schema fields
5. Replace each data value with a placeholder: {fieldPath}
6. Use dot notation for nested fields: {bus.operator}, {departure.city}, {passenger.name}
7. Keep ALL other text exactly as it appears (labels, spacing, line breaks)
8. **DO NOT annotate anything in email headers (From:, To:, Date:, Subject:)**
9. **DO NOT annotate anything in forwarded message markers (---------- Forwarded message ---------)**
10. Only annotate actual booking data values

================================
EXAMPLE 1: Simple Email
================================

Original Email:
"Booking Confirmation
Booking ID: ABC123456789
Provider: TravelCo
From: Mumbai
To: Bangalore
Departure: 20-Mar-2026 14:30
Arrival: 20-Mar-2026 16:45
Passenger: Mr. John Smith
Seat/Room: 12A
Total Amount: 4500.00
Confirmation Code: XYZ789"

Annotated Template:
"Booking Confirmation
Booking ID: {bookingId}
Provider: TravelCo
From: {departure.city}
To: {arrival.city}
Departure: {departure.scheduledTime}
Arrival: {arrival.scheduledTime}
Passenger: {passenger.name}
Seat/Room: 12A
Total Amount: {fare.amount}
Confirmation Code: {bookingReference}"

================================
EXAMPLE 2: Forwarded Email (IMPORTANT)
================================

Original Email:
"---------- Forwarded message ---------
From: user@example.com
Date: Wed, Mar 4, 2026
Subject: Fwd: Booking
To: another@example.com

---------- Forwarded message ---------
From: booking@travel.com
Subject: Your Booking

Booking Details
Booking ID: ABC123
From: Mumbai
To: Delhi"

Annotated Template:
"Booking Details
Booking ID: {bookingId}
From: {departure.city}
To: {arrival.city}"

**NOTICE: All forwarded headers are COMPLETELY REMOVED. Only the actual booking content is kept.**

================================
IMPORTANT RULES
================================

- Replace ONLY data values, NOT labels or column headers
- Use exact schema field paths from the schema below
- Keep exact spacing, line breaks, and formatting from the original email
- For multi-word values, replace the entire value with ONE placeholder
- Table column headers (like "Seat Type", "S.No") are NOT data - keep them as-is
- Row numbers in tables (1, 2, 3) should stay as-is
- Only annotate fields that exist in the schema

**CRITICAL: Each placeholder should appear ONLY ONCE in the template**
- If a field value appears multiple times in the email, replace ONLY the FIRST occurrence
- Do NOT use the same placeholder {fieldPath} multiple times on different lines
- Example: If "Mumbai" appears 3 times, only replace the first "Mumbai" with {departure.city}
- This ensures each field extracts only one value, not multiple conflicting values

================================
OUTPUT FORMAT
================================

Return JSON with a single field "template" containing the annotated email text:

{
  "template": "annotated email text here..."
}

No markdown, no explanation, just JSON.

================================
SCHEMA FIELDS
================================

${this.formatSchemaFields(schema)}

================================
EMAIL TEXT
================================

${body}

================================
END
===`;
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
