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

/**
 * VARIANT TAXONOMY (Passenger Count + Segment Type):
 * 
 * Passenger Count: 1 = "single", 2+ = "multi"
 * Segment Type: "direct" (1), "roundtrip" (2 outbound+return), "connecting" (2+ with layover)
 * 
 * Valid Variants:
 * - single_direct: 1 passenger, 1 flight segment
 * - multi_direct: 2+ passengers, 1 flight segment
 * - single_roundtrip: 1 passenger, outbound + return flights
 * - multi_roundtrip: 2+ passengers, outbound + return flights
 * - single_connecting: 1 passenger, 2+ segments with connection
 * - multi_connecting: 2+ passengers, 2+ segments with connection
 */
export class MapperService {
  private llmService: LLMService;
  private templateRuleDAO: TemplateRuleDAO;
  private readonly VALID_VARIANTS = [
    'single_direct',
    'multi_direct',
    'single_roundtrip',
    'multi_roundtrip',
    'single_connecting',
    'multi_connecting',
  ];

  constructor() {
    this.llmService = new LLMService();
    this.templateRuleDAO = new TemplateRuleDAO();
  }

  /**
   * Validate if variant is one of the 6 accepted types
   */
  private isValidVariant(variant: string): boolean {
    return this.VALID_VARIANTS.includes(variant);
  }

  private calculateExtractionScore(
    extractedValues: Record<string, string | null>,
    hashTable: Record<string, unknown> | null
  ): number {
    const totalFields = hashTable && Object.keys(hashTable).length > 0
      ? Object.keys(hashTable).length
      : Object.keys(extractedValues).length;

    if (totalFields === 0) {
      return 0;
    }

    const extractedFields = Object.values(extractedValues).filter((value) => value !== null && value !== '').length;
    return (extractedFields / totalFields) * 100;
  }

  async mapEmail(request: MapEmailRequest): Promise<Record<string, any>> {
    const body = this.selectBody(request);
    const normalizedBookingType = this.normalizeBookingType(request.bookingType);

    if (!body) {
      throw new Error('No email body provided');
    }

    const schema = await SchemaLoaderUtil.loadSchema(normalizedBookingType);

    let provider = request.provider;

    // Sanitize provider name for testing purposes - if it looks random/scrambled, treat as unknown
    provider = this.sanitizeProviderName(provider);

    // Step 1: Compete all templates for this provider and select the best by extraction score
    const providerTemplates = await this.templateRuleDAO.findAllByProvider(provider);

    let template: string;
    let variant = 'unknown';
    let extractedValues: Record<string, string | null> = {};
    let selectedScore = 0;

    if (providerTemplates.length > 0) {
      console.log(`[Mapper] Found ${providerTemplates.length} cached templates for provider: ${provider}`);

      let bestTemplate = providerTemplates[0];
      let bestExtractedValues: Record<string, string | null> = {};
      let bestScore = -1;

      for (const candidate of providerTemplates) {
        const candidateExtracted = TemplateMatcherUtil.extractValues(body, candidate.template);
        const candidateScore = this.calculateExtractionScore(candidateExtracted, candidate.hashTable as Record<string, unknown> | null);

        console.log(`[Mapper] Candidate ${provider}/${candidate.variant} score: ${candidateScore.toFixed(1)}%`);

        if (candidateScore > bestScore) {
          bestScore = candidateScore;
          bestTemplate = candidate;
          bestExtractedValues = candidateExtracted;
        }
      }

      if (bestScore >= 75) {
        template = bestTemplate.template;
        variant = bestTemplate.variant;
        extractedValues = bestExtractedValues;
        selectedScore = bestScore;
        console.log(`[Mapper] ✓ Selected best cached template: ${provider}/${variant} (${bestScore.toFixed(1)}%)`);
      } else {
        console.log(`[Mapper] All cached templates scored <75% (best: ${bestScore.toFixed(1)}%). Regenerating...`);

        const generatedTemplate = await this.llmService.generateTemplate(body, schema, provider, normalizedBookingType);
        template = generatedTemplate.template;
        variant = generatedTemplate.variant;

        if (!this.isValidVariant(variant)) {
          console.warn(`[Mapper] ⚠️  Invalid variant returned by LLM: "${variant}". Valid variants are: ${this.VALID_VARIANTS.join(', ')}`);
          throw new Error(`Invalid variant "${variant}" returned by LLM`);
        }

        const hashTable = HashContextUtil.extractHashTable(template);
        const existingVariantTemplate = providerTemplates.find((item) => item.variant === variant);

        if (existingVariantTemplate) {
          await this.templateRuleDAO.update(provider, variant, template, hashTable);
          console.log(`[Mapper] ✓ Updated existing template: ${provider}/${variant}`);
        } else {
          await this.templateRuleDAO.create(provider, variant, template, hashTable);
          console.log(`[Mapper] ✓ Created new template variant: ${provider}/${variant}`);
        }

        extractedValues = TemplateMatcherUtil.extractValues(body, template);
        selectedScore = this.calculateExtractionScore(extractedValues, hashTable as Record<string, unknown>);
      }
    } else {
      console.log(`[Mapper] No template found for provider: ${provider}. Generating first template...`);

      const generatedTemplate = await this.llmService.generateTemplate(body, schema, provider, normalizedBookingType);
      template = generatedTemplate.template;
      variant = generatedTemplate.variant;

      if (!this.isValidVariant(variant)) {
        console.warn(`[Mapper] ⚠️  Invalid variant returned by LLM: "${variant}". Valid variants are: ${this.VALID_VARIANTS.join(', ')}`);
        throw new Error(`Invalid variant "${variant}" returned by LLM`);
      }

      const hashTable = HashContextUtil.extractHashTable(template);
      await this.templateRuleDAO.create(provider, variant, template, hashTable);
      console.log(`[Mapper] ✓ Created first template variant: ${provider}/${variant}`);

      extractedValues = TemplateMatcherUtil.extractValues(body, template);
      selectedScore = this.calculateExtractionScore(extractedValues, hashTable as Record<string, unknown>);
    }

    console.log(`[Mapper] Extracted values with ${provider}/${variant} (score: ${selectedScore.toFixed(1)}%):`);
    console.log(JSON.stringify(extractedValues, null, 2));
    
    /* ========== VALIDATION DISABLED - COMMENTED OUT FOR TEMPLATE COMPETITION SYSTEM ==========
    
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
    
    ========== END COMMENTED VALIDATION ==========
    */
    
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

  /**
   * Sanitize provider name - if it looks random/scrambled, treat as "unknown"
   * Detects: UUIDs, base64 strings, hashes, random character sequences
   */
  private sanitizeProviderName(provider: string): string {
    if (!provider) return 'unknown';

    const cleaned = provider.trim().toLowerCase();

    // Known valid providers - list can be expanded
    const knownProviders = [
      'irctc',
      'cleartrip',
      'makemytrip',
      'goibibo',
      'paytm',
      'yatra',
      'skyscanner',
      'expedia',
      'booking',
      'hoteltonight',
      'airbnb',
      'uber',
      'ola',
    ];

    // If it matches a known provider, return as-is
    if (knownProviders.some((known) => cleaned.includes(known))) {
      return cleaned;
    }

    // Check if it looks like a UUID (8-4-4-4-12 hex pattern)
    if (/^[a-f0-9]{8}-?[a-f0-9]{4}-?[a-f0-9]{4}-?[a-f0-9]{4}-?[a-f0-9]{12}$/i.test(cleaned)) {
      console.warn(`[Mapper] Provider appears to be UUID: "${provider}" - treating as unknown`);
      return 'unknown';
    }

    // Check if it looks like base64 (mostly alphanumeric + special chars, >20 chars)
    if (cleaned.length > 20 && /^[a-zA-Z0-9+/_=-]+$/.test(cleaned)) {
      console.warn(`[Mapper] Provider appears to be base64 encoded: "${provider}" - treating as unknown`);
      return 'unknown';
    }

    // Check if it looks like a hash (hex string, 32+ chars)
    if (cleaned.length >= 32 && /^[a-f0-9]+$/.test(cleaned)) {
      console.warn(`[Mapper] Provider appears to be hash: "${provider}" - treating as unknown`);
      return 'unknown';
    }

    // Check if it has too many numbers or special chars (likely random)
    const specialCharCount = (cleaned.match(/[^a-z0-9]/g) || []).length;
    const numberCount = (cleaned.match(/\d/g) || []).length;
    const letterCount = (cleaned.match(/[a-z]/g) || []).length;

    if (cleaned.length > 10 && specialCharCount > letterCount) {
      console.warn(`[Mapper] Provider appears to be scrambled: "${provider}" - treating as unknown`);
      return 'unknown';
    }

    // If it passes all checks, return the cleaned version
    return cleaned;
  }
}

