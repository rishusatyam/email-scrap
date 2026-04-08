import { PdfBookingType } from '../types';

export class OutputNormalizerUtil {
  /**
   * Normalizes extracted data to enforce schema shape and default null/array behavior.
   */
  static normalizeWithSchema(
    data: Record<string, any> | null | undefined,
    schema: Record<string, any>,
    bookingType: PdfBookingType
  ): Record<string, any> {
    return this.normalizeNode(data, schema, bookingType, '') as Record<string, any>;
  }

  /**
   * Normalizes a single schema node recursively.
   */
  private static normalizeNode(
    value: any,
    schemaNode: Record<string, any>,
    bookingType: PdfBookingType,
    fieldName: string
  ): any {
    const nodeType = this.resolveSchemaType(schemaNode);

    if (nodeType === 'object') {
      const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
      const properties = schemaNode?.properties || {};
      const output: Record<string, any> = {};

      for (const [key, childSchema] of Object.entries(properties)) {
        output[key] = this.normalizeNode((source as Record<string, any>)[key], childSchema as Record<string, any>, bookingType, key);
      }

      return output;
    }

    if (nodeType === 'array') {
      const itemSchema = schemaNode?.items || {};

      if (Array.isArray(value)) {
        return value.map((item) => this.normalizeNode(item, itemSchema, bookingType, fieldName));
      }

      if (fieldName === 'segments' && bookingType === 'flight') {
        return [];
      }

      if (fieldName === 'passengers') {
        return [];
      }

      return [];
    }

    if (value === undefined || value === null || value === '') {
      return null;
    }

    return value;
  }

  /**
   * Resolves schema type when JSON schema uses either string type or union type array.
   */
  private static resolveSchemaType(schemaNode: Record<string, any>): string | undefined {
    const rawType = schemaNode?.type;

    if (typeof rawType === 'string') {
      return rawType;
    }

    if (Array.isArray(rawType)) {
      return rawType.find((t) => t !== 'null');
    }

    return undefined;
  }
}
