import { MapEmailRequest } from '../types';
import { LLMService } from './llm.service';
import { TemplateRuleDAO } from '../dao/template-rule.dao';
import { TemplateMatcherUtil } from '../utils/template-matcher.util';
import { SchemaLoaderUtil } from '../utils/schema-loader.util';
import { TypeConverterUtil } from '../utils/type-converter.util';
import { DataCleanerUtil } from '../utils/data-cleaner.util';
import { HashContextUtil } from '../utils/hash-context.util';

export class MapperService {
  private llmService: LLMService;
  private templateRuleDAO: TemplateRuleDAO;

  constructor() {
    this.llmService = new LLMService();
    this.templateRuleDAO = new TemplateRuleDAO();
  }

  async mapEmail(request: MapEmailRequest): Promise<Record<string, any>> {
    const body = this.selectBody(request);

    if (!body) {
      throw new Error('No email body provided');
    }

    const schema = await SchemaLoaderUtil.loadSchema(request.bookingType);

    // Step 1: Get or generate template
    const templateData = await this.templateRuleDAO.findByProvider(request.provider);

    let template: string;
    if (!templateData) {
      console.log(`[Mapper] No template found for provider: ${request.provider}. Calling LLM...`);
      const generatedTemplate = await this.llmService.generateTemplate(body, schema, request.provider, request.bookingType);
      template = generatedTemplate.template;
      
      // Extract hashTable from generated template
      const hashTable = HashContextUtil.extractHashTable(template);
      console.log(`[Mapper] Generated template with ${Object.keys(hashTable).length} field contexts`);
      
      // Save template with hashTable
      await this.templateRuleDAO.create(request.provider, template, hashTable);
      console.log('[Mapper] Template and hashTable cached for future use');
    } else {
      console.log(`[Mapper] Using cached template for provider: ${request.provider}`);
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
        
        const generatedTemplate = await this.llmService.generateTemplate(body, schema, request.provider, request.bookingType);
        template = generatedTemplate.template;
        
        const newHashTable = HashContextUtil.extractHashTable(template);
        console.log(`[Mapper] Generated new template with ${Object.keys(newHashTable).length} field contexts`);
        
        await this.templateRuleDAO.create(request.provider, template, newHashTable);
        console.log('[Mapper] Updated template and hashTable in database');
        
        const newExtractedValues = TemplateMatcherUtil.extractValues(body, template);
        console.log('[Mapper] Extracted values with new template:');
        console.log(JSON.stringify(newExtractedValues, null, 2));
        
        const mappedData = TemplateMatcherUtil.buildNestedObject(newExtractedValues);
        const cleanedData = DataCleanerUtil.cleanAllValues(mappedData);
        const typedData = TypeConverterUtil.applyTypeConversion(cleanedData, schema);
        return SchemaLoaderUtil.fillMissingFields(typedData, schema);
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
          const generatedTemplate = await this.llmService.generateTemplate(body, schema, request.provider, request.bookingType);
          template = generatedTemplate.template;
          
          // Extract new hashTable
          const newHashTable = HashContextUtil.extractHashTable(template);
          console.log(`[Mapper] Generated new template with ${Object.keys(newHashTable).length} field contexts`);
          
          // Update database with new template and hashTable
          await this.templateRuleDAO.create(request.provider, template, newHashTable);
          console.log('[Mapper] Updated template and hashTable in database');
          
          // Re-extract values with new template
          const newExtractedValues = TemplateMatcherUtil.extractValues(body, template);
          console.log('[Mapper] Extracted values with new template:');
          console.log(JSON.stringify(newExtractedValues, null, 2));
          
          // Use new extracted values
          const mappedData = TemplateMatcherUtil.buildNestedObject(newExtractedValues);
          const cleanedData = DataCleanerUtil.cleanAllValues(mappedData);
          const typedData = TypeConverterUtil.applyTypeConversion(cleanedData, schema);
          return SchemaLoaderUtil.fillMissingFields(typedData, schema);
        } else {
          console.log('[Validation] ✓ Word match rate ≥90% - Template is valid');
        }
      }
    }
    console.log('');

    // Step 3: Build nested object from flat extracted values
    const mappedData = TemplateMatcherUtil.buildNestedObject(extractedValues);

    // Step 4: Clean extracted values
    const cleanedData = DataCleanerUtil.cleanAllValues(mappedData);

    // Step 5: Apply type conversion based on schema
    const typedData = TypeConverterUtil.applyTypeConversion(cleanedData, schema);

    // Step 6: Fill missing required fields with defaults
    return SchemaLoaderUtil.fillMissingFields(typedData, schema);
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
