import { MapEmailRequest } from '../types';
import { LLMService } from './llm.service';
import { TemplateRuleDAO } from '../dao/template-rule.dao';
import { TemplateMatcherUtil } from '../utils/template-matcher.util';
import { SchemaLoaderUtil } from '../utils/schema-loader.util';
import { TypeConverterUtil } from '../utils/type-converter.util';
import { DataCleanerUtil } from '../utils/data-cleaner.util';
import { HashContextUtil } from '../utils/hash-context.util';
import { BusPassengerExtractor, RailPassengerExtractor } from '../extractors';
import { logMappedEmail } from '../utils/mapper-logger';
export class MapperService {
  private llmService: LLMService;
  private templateRuleDAO: TemplateRuleDAO;

  constructor() {
    this.llmService = new LLMService();
    this.templateRuleDAO = new TemplateRuleDAO();
  }

  async mapEmail(request: MapEmailRequest): Promise<Record<string, any>> {
    const body = this.selectBody(request);
    const normalizedBookingType = this.normalizeBookingType(request.bookingType);

    if (!body) {
      throw new Error('No email body provided');
    }

    const schema = await SchemaLoaderUtil.loadSchema(normalizedBookingType);

    const provider = request.provider;

    // Step 1: Get or generate template
    const templateData = await this.templateRuleDAO.findByProvider(provider);

    let template: string;
    if (!templateData) {
      console.log(`[Mapper] No template found for provider: ${provider}. Calling LLM...`);
      const generatedTemplate = await this.llmService.generateTemplate(body, schema, provider, normalizedBookingType);
      template = generatedTemplate.template;
      
      // Extract hashTable from generated template
      const hashTable = HashContextUtil.extractHashTable(template);
      console.log(`[Mapper] Generated template with ${Object.keys(hashTable).length} field contexts`);
      
      // Save template with hashTable
      await this.templateRuleDAO.create(provider, template, hashTable);
      console.log('[Mapper] Template and hashTable cached for future use');
    } else {
      console.log(`[Mapper] Using cached template for provider: ${provider}`);
      template = templateData.template;
    }

    // Step 2: Extract values using template matcher
    const extractedValues = TemplateMatcherUtil.extractValues(body, template);
    console.log('[Mapper] Extracted values:');
    console.log(JSON.stringify(extractedValues, null, 2));
    
    // Validation: Check how many values were successfully extracted
    if (templateData?.hashTable && Object.keys(templateData.hashTable).length > 0) {
      const totalFields = Object.keys(templateData.hashTable).length;
      const extractedFields = Object.values(extractedValues).filter(v => v !== null && v !== '').length;
      const successRate = extractedFields / totalFields;
      
      console.log(`\n[Validation] Extraction success rate: ${extractedFields}/${totalFields} (${(successRate * 100).toFixed(1)}%)`);
      
      if (successRate < 0.8) {
        // Extraction rate too low - email format has changed, regenerate immediately
        console.log('[Validation] ✗ Extraction rate <80% - Email format has changed');
        console.log('[Mapper] Regenerating template...');
        
        const generatedTemplate = await this.llmService.generateTemplate(body, schema, provider, normalizedBookingType);
        template = generatedTemplate.template;
        
        const newHashTable = HashContextUtil.extractHashTable(template);
        console.log(`[Mapper] Generated new template with ${Object.keys(newHashTable).length} field contexts`);
        
        await this.templateRuleDAO.create(provider, template, newHashTable);
        console.log('[Mapper] Updated template and hashTable in database');
        
        const newExtractedValues = TemplateMatcherUtil.extractValues(body, template);
        console.log('[Mapper] Extracted values with new template:');
        console.log(JSON.stringify(newExtractedValues, null, 2));
        
        return this.finalizeMappedResult(newExtractedValues, body, normalizedBookingType, schema, provider);
      }
      
      // Extraction rate ≥80% - proceed to word validation
      console.log('[Validation] ✓ Extraction rate ≥80% - Checking prev/next words...');
      
      // Create annotated email by replacing values with placeholders
      let annotatedEmail = body;
      for (const [fieldPath, value] of Object.entries(extractedValues)) {
        if (value) {
          annotatedEmail = annotatedEmail.replace(value, `{${fieldPath}}`);
        }
      }
      
      // Use same function to extract hashTable from annotated email
      console.log('\n[Validation] Extracting prev/next words from email...');
      const emailHashTable = HashContextUtil.extractHashTable(annotatedEmail);
      
      // Compare with stored hashTable
      let matchCount = 0;
      let totalCount = 0;
      
      for (const [fieldPath, storedContext] of Object.entries(templateData.hashTable)) {
        const emailContext = emailHashTable[fieldPath];
        if (!emailContext) continue;
        
        totalCount++;
        
        const prevMatch = emailContext.prevWords === storedContext.prevWords;
        const nextMatch = emailContext.nextWords === storedContext.nextWords;
        
        if (prevMatch && nextMatch) {
          matchCount++;
          console.log(`[Validation]   ${fieldPath}: ✓ Match`);
        } else {
          console.log(`[Validation]   ${fieldPath}: ✗ Mismatch`);
          if (!prevMatch) {
            console.log(`[Validation]     Prev - Stored: "${storedContext.prevWords}" | Email: "${emailContext.prevWords}"`);
          }
          if (!nextMatch) {
            console.log(`[Validation]     Next - Stored: "${storedContext.nextWords}" | Email: "${emailContext.nextWords}"`);
          }
        }
      }
      
      if (totalCount > 0) {
        const matchRate = (matchCount / totalCount) * 100;
        console.log(`\n[Validation] Word match: ${matchCount}/${totalCount} (${matchRate.toFixed(1)}%)`);
        
        if (matchRate < 90) {
          console.log('[Validation] ✗ Word match rate <90% - Email format has changed');
          console.log('[Mapper] Regenerating template...');
          
          // Call LLM to regenerate template
          const generatedTemplate = await this.llmService.generateTemplate(body, schema, provider, normalizedBookingType);
          template = generatedTemplate.template;
          
          // Extract new hashTable
          const newHashTable = HashContextUtil.extractHashTable(template);
          console.log(`[Mapper] Generated new template with ${Object.keys(newHashTable).length} field contexts`);
          
          // Update database with new template and hashTable
          await this.templateRuleDAO.create(provider, template, newHashTable);
          console.log('[Mapper] Updated template and hashTable in database');
          
          // Re-extract values with new template
          const newExtractedValues = TemplateMatcherUtil.extractValues(body, template);
          console.log('[Mapper] Extracted values with new template:');
          console.log(JSON.stringify(newExtractedValues, null, 2));
          
          // Use new extracted values
          return this.finalizeMappedResult(newExtractedValues, body, normalizedBookingType, schema, provider);
        } else {
          console.log('[Validation] ✓ Word match rate ≥90% - Template is valid');
        }
      }
    }
    console.log('');

    // Step 3: Build nested object from flat extracted values
    return this.finalizeMappedResult(extractedValues, body, normalizedBookingType, schema, provider);
  }

  private normalizeBookingType(bookingType: MapEmailRequest['bookingType']): 'bus' | 'flight' | 'hotel' | 'car' | 'rail' {
    return bookingType === 'train' ? 'rail' : bookingType;
  }

  private finalizeMappedResult(
    extractedValues: Record<string, string | null>,
    body: string,
    bookingType: string,
    schema: Record<string, any>,
    provider: string
  ): Record<string, any> {
    const nextExtractedValues = { ...extractedValues };
    let passengers: Array<{
      name?: string;
      seatNumber?: string;
      ticketNumber?: string;
      passengerType?: string;
      coach?: string;
      class?: string;
      seatType?: string;
    }> = [];

    if (bookingType === 'bus') {
      passengers = BusPassengerExtractor.extract(body);

      // Passenger array is extracted separately to avoid flattening repeated values.
      for (const key of Object.keys(nextExtractedValues)) {
        if (key.startsWith('passenger.') || key.startsWith('passengers[].')) {
          delete nextExtractedValues[key];
        }
      }
    }

    if (bookingType === 'rail') {
      passengers = RailPassengerExtractor.extract(body);

      // Passenger array is extracted separately to avoid flattening repeated values.
      for (const key of Object.keys(nextExtractedValues)) {
        if (key.startsWith('passenger.') || key.startsWith('passengers[].')) {
          delete nextExtractedValues[key];
        }
      }
    }

    const mappedData = TemplateMatcherUtil.buildNestedObject(nextExtractedValues);

    if (bookingType === 'bus') {
      if (passengers.length > 0) {
        mappedData.passengers = passengers;
      } else if (mappedData.passenger && typeof mappedData.passenger === 'object') {
        mappedData.passengers = [mappedData.passenger];
      }

      if (mappedData.passenger) {
        delete mappedData.passenger;
      }
    }

    if (bookingType === 'rail') {
      if (passengers.length > 0) {
        mappedData.passengers = passengers;
      } else if (mappedData.passenger && typeof mappedData.passenger === 'object') {
        mappedData.passengers = [mappedData.passenger];
      }

      if (mappedData.passenger) {
        delete mappedData.passenger;
      }
    }

    // Step 4: Clean extracted values
    const cleanedData = DataCleanerUtil.cleanAllValues(mappedData);

    // Step 5: Apply type conversion based on schema
    const typedData = TypeConverterUtil.applyTypeConversion(cleanedData, schema);

    // Step 6: Fill missing required fields with defaults
    const finalData = SchemaLoaderUtil.fillMissingFields(typedData, schema);

    // Fire-and-forget logging; never block mapper response path
    const fileName = this.buildMappedLogFileName(bookingType, provider);
    void logMappedEmail(fileName, {
      timestamp: new Date().toISOString(),
      mapper: 'htmltext-mapper',
      bookingType,
      provider,
      data: finalData,
    }).catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[Mapper] Failed to persist mapped log: ${message}`);
    });

    return finalData;
  }

  private buildMappedLogFileName(bookingType: string, provider: string): string {
    const safeProvider = provider.toLowerCase().replace(/[^a-z0-9_-]+/g, '_').slice(0, 80);
    return `mapped_${bookingType}_${safeProvider}_${Date.now()}.json`;
  }

  private selectBody(request: MapEmailRequest): string | null {
    if (request.cleanedHtmlBody) {
      console.log('[Mapper] Using cleaned HTML body');
      return request.cleanedHtmlBody;
    }

    if (request.cleanedTextBody) {
      console.log('[Mapper] Using cleaned text body');
      return request.cleanedTextBody;
    }

    return null;
  }
}
