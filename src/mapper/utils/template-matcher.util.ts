export class TemplateMatcherUtil {
  /**
   * Extracts values from email by matching against annotated template
   * @param emailBody - Original email text
   * @param template - Annotated template with {fieldPath} placeholders
   * @returns Object with field paths as keys and extracted values
   */
  static extractValues(emailBody: string, template: string): Record<string, string | null> {
    const extractedValues: Record<string, string | null> = {};

    // Normalize whitespace for both email and template
    const normalizedEmail = this.normalizeWhitespace(emailBody);
    const normalizedTemplate = this.normalizeWhitespace(template);

    // Split template into segments by placeholders
    const segments: Array<{ type: 'text' | 'placeholder'; content: string }> = [];
    const placeholderRegex = /\{([^}]+)\}/g;
    let lastIndex = 0;
    let match;

    while ((match = placeholderRegex.exec(normalizedTemplate)) !== null) {
      // Add text before placeholder
      if (match.index > lastIndex) {
        segments.push({
          type: 'text',
          content: normalizedTemplate.substring(lastIndex, match.index),
        });
      }

      // Add placeholder
      segments.push({
        type: 'placeholder',
        content: match[1], // field name
      });

      lastIndex = match.index + match[0].length;
    }

    // Add remaining text after last placeholder
    if (lastIndex < normalizedTemplate.length) {
      segments.push({
        type: 'text',
        content: normalizedTemplate.substring(lastIndex),
      });
    }

    // Extract values by matching segments
    let emailPosition = 0;

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];

      if (segment.type === 'text') {
        // Find this text segment in the email
        const foundIndex = normalizedEmail.indexOf(segment.content, emailPosition);
        if (foundIndex === -1) {
          console.warn(`[TemplateMatcher] Could not find text segment: "${segment.content.substring(0, 50)}..."`);
          // Try to continue from current position
          continue;
        }
        emailPosition = foundIndex + segment.content.length;
      } else {
        // This is a placeholder - extract the value
        const fieldName = segment.content;
        const nextSegment = segments[i + 1];

        let valueEndIndex: number;

        if (nextSegment && nextSegment.type === 'text') {
          // Find where the next text segment starts
          const nextTextIndex = normalizedEmail.indexOf(nextSegment.content, emailPosition);
          if (nextTextIndex !== -1) {
            valueEndIndex = nextTextIndex;
          } else {
            // Fallback: extract until next space or line break
            const nextSpace = normalizedEmail.indexOf(' ', emailPosition);
            const nextLine = normalizedEmail.indexOf('\n', emailPosition);
            valueEndIndex = Math.min(
              nextSpace !== -1 ? nextSpace : normalizedEmail.length,
              nextLine !== -1 ? nextLine : normalizedEmail.length
            );
          }
        } else {
          // Last placeholder or followed by another placeholder
          // Extract until next space, line break, or end
          const nextSpace = normalizedEmail.indexOf(' ', emailPosition);
          const nextLine = normalizedEmail.indexOf('\n', emailPosition);
          valueEndIndex = Math.min(
            nextSpace !== -1 ? nextSpace : normalizedEmail.length,
            nextLine !== -1 ? nextLine : normalizedEmail.length
          );
        }

        // Extract and clean the value
        const rawValue = normalizedEmail.substring(emailPosition, valueEndIndex);
        const cleanedValue = this.cleanValue(rawValue);

        extractedValues[fieldName] = cleanedValue;
        emailPosition = valueEndIndex;
      }
    }

    return extractedValues;
  }

  /**
   * Normalizes whitespace: converts multiple spaces/tabs/newlines to single space
   */
  private static normalizeWhitespace(text: string): string {
    return text.replace(/\s+/g, ' ').trim();
  }

  /**
   * Cleans extracted value by removing extra whitespace and unwanted characters
   */
  private static cleanValue(value: string): string | null {
    if (!value) return null;

    // Trim whitespace
    let cleaned = value.trim();

    // Remove leading/trailing punctuation that might be part of template
    cleaned = cleaned.replace(/^[:\-|,]+/, '').replace(/[:\-|,]+$/, '');

    // Trim again after punctuation removal
    cleaned = cleaned.trim();

    return cleaned || null;
  }

  /**
   * Sets a nested value in an object using dot notation path
   */
  static setNestedValue(obj: Record<string, any>, path: string, value: any): void {
    const keys = path.split('.');
    let current = obj;

    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];
      if (!current[key] || typeof current[key] !== 'object') {
        current[key] = {};
      }
      current = current[key];
    }

    current[keys[keys.length - 1]] = value;
  }

  /**
   * Converts flat extracted values to nested object structure
   */
  static buildNestedObject(extractedValues: Record<string, string | null>): Record<string, any> {
    const result: Record<string, any> = {};

    for (const [path, value] of Object.entries(extractedValues)) {
      if (value !== null) {
        this.setNestedValue(result, path, value);
      }
    }

    return result;
  }
}
