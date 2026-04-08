export class DataCleanerUtil {
  static cleanExtractedValue(value: string | null): string | null {
    if (!value) return null;

    let cleaned = value;

    cleaned = cleaned.replace(/\n/g, ' ');
    cleaned = cleaned.replace(/\r/g, ' ');
    cleaned = cleaned.replace(/\t/g, ' ');
    cleaned = cleaned.replace(/\s+/g, ' ');
    
    cleaned = cleaned.replace(/^\*+|\*+$/g, '');
    cleaned = cleaned.replace(/^:+|:+$/g, '');
    cleaned = cleaned.replace(/^\|+|\|+$/g, '');
    
    cleaned = cleaned.trim();

    if (cleaned.length === 0) return null;

    return cleaned;
  }

  static cleanAllValues(data: Record<string, any>): Record<string, any> {
    const result: Record<string, any> = {};

    for (const key in data) {
      const value = data[key];

      if (value === null || value === undefined) {
        result[key] = null;
      } else if (typeof value === 'object' && !Array.isArray(value)) {
        result[key] = this.cleanAllValues(value);
      } else if (typeof value === 'string') {
        result[key] = this.cleanExtractedValue(value);
      } else {
        result[key] = value;
      }
    }

    return result;
  }
}
