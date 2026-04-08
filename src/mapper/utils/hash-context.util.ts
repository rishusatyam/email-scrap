import crypto from 'crypto';

export interface FieldHashContext {
  prevWords: string;
  nextWords: string;
  hash: string;
}

export interface HashTable {
  [fieldPath: string]: FieldHashContext;
}

export class HashContextUtil {
  /**
   * Canonicalizes text by:
   * - Converting to lowercase
   * - Removing extra whitespace
   * - Removing special characters (keeping only alphanumeric and spaces)
   * - Trimming
   */
  static canonicalize(text: string): string {
    return text
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/[^a-z0-9\s]/g, '')
      .trim();
  }

  /**
   * Extracts N words from text
   * @param text - Input text
   * @param count - Number of words to extract
   * @param fromStart - If true, extract from start; if false, extract from end
   */
  static extractWords(text: string, count: number, fromStart: boolean = true): string {
    const words = text.split(/\s+/).filter(w => w.length > 0);
    
    if (fromStart) {
      return words.slice(0, count).join(' ');
    } else {
      return words.slice(-count).join(' ');
    }
  }

  /**
   * Generates SHA-256 hash from canonicalized context
   */
  static generateHash(prevWords: string, fieldPath: string, nextWords: string): string {
    const canonicalPrev = this.canonicalize(prevWords);
    const canonicalNext = this.canonicalize(nextWords);
    const signature = `${canonicalPrev}|${fieldPath}|${canonicalNext}`;
    
    return crypto.createHash('sha256').update(signature).digest('hex');
  }

  /**
   * Extracts hash contexts for all placeholders in a template
   * Returns a hash table mapping field paths to their contexts
   */
  static extractHashTable(template: string): HashTable {
    const hashTable: HashTable = {};
    const normalizedTemplate = template.replace(/\s+/g, ' ').trim();
    
    // Split template into segments (text and placeholders)
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
        content: match[1],
      });
      
      lastIndex = match.index + match[0].length;
    }
    
    // Add remaining text
    if (lastIndex < normalizedTemplate.length) {
      segments.push({
        type: 'text',
        content: normalizedTemplate.substring(lastIndex),
      });
    }
    
    // Extract context for each placeholder
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      
      if (segment.type === 'placeholder') {
        const fieldPath = segment.content;
        
        // Find previous text segment (skip other placeholders)
        let prevText = '';
        for (let j = i - 1; j >= 0; j--) {
          if (segments[j].type === 'text') {
            prevText = segments[j].content.trim();
            break;
          }
        }
        
        // Find next text segment (skip other placeholders)
        let nextText = '';
        for (let j = i + 1; j < segments.length; j++) {
          if (segments[j].type === 'text') {
            nextText = segments[j].content.trim();
            break;
          }
        }
        
        // Extract last 3 words from prev and first 3 words from next
        const prevWords = this.extractWords(prevText, 3, false);
        const nextWords = this.extractWords(nextText, 3, true);
        
        // Canonicalize before storing
        const canonicalPrev = this.canonicalize(prevWords);
        const canonicalNext = this.canonicalize(nextWords);
        
        // Generate hash from canonicalized context
        const hash = this.generateHash(prevWords, fieldPath, nextWords);
        
        hashTable[fieldPath] = {
          prevWords: canonicalPrev,
          nextWords: canonicalNext,
          hash,
        };
      }
    }
    
    return hashTable;
  }

  /**
   * Validates if stored hash table matches current email context
   * @returns true if hashes match, false otherwise
   */
  static validateHashTable(
    emailBody: string,
    storedHashTable: HashTable
  ): boolean {
    const normalizedEmail = emailBody.replace(/\s+/g, ' ').trim();
    
    for (const [fieldPath, context] of Object.entries(storedHashTable)) {
      // Check if prev and next words exist in email
      const prevExists = normalizedEmail.includes(context.prevWords);
      const nextExists = normalizedEmail.includes(context.nextWords);
      
      if (!prevExists || !nextExists) {
        console.log(`[HashContext] Context not found for field: ${fieldPath}`);
        return false;
      }
      
      // Verify hash matches
      const emailHash = this.generateHash(context.prevWords, fieldPath, context.nextWords);
      
      if (emailHash !== context.hash) {
        console.log(`[HashContext] Hash mismatch for field: ${fieldPath}`);
        return false;
      }
    }
    
    return true;
  }
}
