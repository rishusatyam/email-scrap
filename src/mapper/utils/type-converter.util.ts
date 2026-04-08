// based on schema type, convert the value
export class TypeConverterUtil {
  static convertValue(value: any, schemaType: string): any {
    if (value === null || value === undefined) {
      return null;
    }

    switch (schemaType) {
      case 'number':
      case 'integer':
        const num = parseFloat(value);
        return isNaN(num) ? null : num;

      case 'boolean':
        if (typeof value === 'boolean') return value;
        if (typeof value === 'string') {
          const lower = value.toLowerCase();
          if (lower === 'true' || lower === 'yes' || lower === '1') return true;
          if (lower === 'false' || lower === 'no' || lower === '0') return false;
        }
        return null;

      case 'string':
        return String(value);

      default:
        return value;
    }
  }

  static applyTypeConversion(
    data: Record<string, any>,
    schema: Record<string, any>
  ): Record<string, any> {
    const result: Record<string, any> = {};
    const properties = schema.properties || {};

    for (const field in data) {
      const value = data[field];
      const fieldSchema = properties[field];

      if (!fieldSchema) {
        result[field] = value;
        continue;
      }

      if (fieldSchema.type === 'object' && fieldSchema.properties) {
        result[field] = this.applyTypeConversion(value || {}, fieldSchema);
      } else if (fieldSchema.type === 'array') {
        result[field] = value;
      } else {
        result[field] = this.convertValue(value, fieldSchema.type);
      }
    }

    return result;
  }
}
