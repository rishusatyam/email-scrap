import { promises as fs } from 'fs';
import * as path from 'path';

export class SchemaLoaderUtil {
  static async loadSchema(bookingType: string): Promise<Record<string, any>> {
    const schemaPath = path.join(
      __dirname,
      '..',
      '..',
      'schemas',
      `${bookingType}-segment.v1.json`
    );

    const schemaContent = await fs.readFile(schemaPath, 'utf-8');
    return JSON.parse(schemaContent);
  }

  static fillMissingFields(
    data: Record<string, any>,
    schema: Record<string, any>
  ): Record<string, any> {
    const properties = schema.properties || {};
    const result: Record<string, any> = { ...data };

    for (const field in properties) {
      const fieldSchema = properties[field];

      if (!(field in result)) {
        result[field] = null;
      } else if (fieldSchema.type === 'object' && fieldSchema.properties) {
        if (result[field] && typeof result[field] === 'object') {
          result[field] = this.fillMissingFields(result[field], fieldSchema);
        } else {
          result[field] = this.fillMissingFields({}, fieldSchema);
        }
      }
    }

    return result;
  }
}
