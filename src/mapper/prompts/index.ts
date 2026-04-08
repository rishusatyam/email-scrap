import { BUS_PROMPT_TEMPLATE } from './bus-prompt';
import { RAIL_PROMPT_TEMPLATE } from './rail-prompt';
import { FLIGHT_PROMPT_TEMPLATE } from './flight-prompt';
import { CAR_PROMPT_TEMPLATE } from './car-prompt';
import { HOTEL_PROMPT_TEMPLATE } from './hotel-prompt';

export interface PromptTemplate {
  getPrompt(schemaFields: string, emailBody: string): string;
}

class BusPrompt implements PromptTemplate {
  getPrompt(schemaFields: string, emailBody: string): string {
    return BUS_PROMPT_TEMPLATE
      .replace('{{SCHEMA_FIELDS}}', schemaFields)
      .replace('{{EMAIL_BODY}}', emailBody);
  }
}

class RailPrompt implements PromptTemplate {
  getPrompt(schemaFields: string, emailBody: string): string {
    return RAIL_PROMPT_TEMPLATE
      .replace('{{SCHEMA_FIELDS}}', schemaFields)
      .replace('{{EMAIL_BODY}}', emailBody);
  }
}

class FlightPrompt implements PromptTemplate {
  getPrompt(schemaFields: string, emailBody: string): string {
    return FLIGHT_PROMPT_TEMPLATE
      .replace('{{SCHEMA_FIELDS}}', schemaFields)
      .replace('{{EMAIL_BODY}}', emailBody);
  }
}

class CarPrompt implements PromptTemplate {
  getPrompt(schemaFields: string, emailBody: string): string {
    return CAR_PROMPT_TEMPLATE
      .replace('{{SCHEMA_FIELDS}}', schemaFields)
      .replace('{{EMAIL_BODY}}', emailBody);
  }
}

class HotelPrompt implements PromptTemplate {
  getPrompt(schemaFields: string, emailBody: string): string {
    return HOTEL_PROMPT_TEMPLATE
      .replace('{{SCHEMA_FIELDS}}', schemaFields)
      .replace('{{EMAIL_BODY}}', emailBody);
  }
}

export class PromptFactory {
  private static prompts: Map<string, PromptTemplate> = new Map([
    ['bus', new BusPrompt()],
    ['rail', new RailPrompt()],
    ['flight', new FlightPrompt()],
    ['car', new CarPrompt()],
    ['hotel', new HotelPrompt()],
  ]);

  static getPrompt(bookingType: string): PromptTemplate {
    const prompt = this.prompts.get(bookingType);
    
    if (!prompt) {
      throw new Error(`No prompt template found for booking type: ${bookingType}. Supported types: ${this.getSupportedTypes().join(', ')}`);
    }
    
    return prompt;
  }

  static getSupportedTypes(): string[] {
    return Array.from(this.prompts.keys());
  }
}
