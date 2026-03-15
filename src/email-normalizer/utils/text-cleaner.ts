export const cleanTextBody = (text: string): string => {
  if (!text) return '';

  let cleaned = text;

  cleaned = cleaned.replace(/&nbsp;/g, ' ');
  cleaned = cleaned.replace(/&amp;/g, '&');
  cleaned = cleaned.replace(/&lt;/g, '<');
  cleaned = cleaned.replace(/&gt;/g, '>');
  cleaned = cleaned.replace(/&quot;/g, '"');

  const forwardedPatterns = [
    /[-]{5,}\s*Forwarded message\s*[-]{5,}/gi,
    /[-]{5,}\s*Original Message\s*[-]{5,}/gi,
    /Begin forwarded message/gi,
    /^From:\s*[\w\s<>@.-]+$/gm
  ];

  let lastForwardedIndex = -1;
  let lastPattern = '';

  for (const pattern of forwardedPatterns) {
    const matches = [...cleaned.matchAll(pattern)];
    if (matches.length > 0) {
      const lastMatch = matches[matches.length - 1];
      if (lastMatch.index !== undefined && lastMatch.index > lastForwardedIndex) {
        lastForwardedIndex = lastMatch.index;
        lastPattern = lastMatch[0];
      }
    }
  }

  if (lastForwardedIndex !== -1) {
    cleaned = cleaned.substring(lastForwardedIndex);
  }

  const footerPatterns = [
    /unsubscribe/gi,
    /privacy\s+(policy|notice)/gi,
    /terms\s+apply/gi,
    /copyright\s+©/gi,
    /do\s+not\s+reply/gi
  ];

  const lines = cleaned.split('\n');
  const cleanedLines: string[] = [];
  let skipBlock = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    const hasFooterPattern = footerPatterns.some(pattern => pattern.test(line));
    
    if (hasFooterPattern) {
      skipBlock = true;
    }
    
    if (!skipBlock) {
      cleanedLines.push(line);
    }
    
    if (skipBlock && line.trim() === '' && i < lines.length - 1) {
      const nextLine = lines[i + 1];
      if (nextLine.trim() !== '' && !footerPatterns.some(p => p.test(nextLine))) {
        skipBlock = false;
      }
    }
  }

  cleaned = cleanedLines.join('\n');

  const stopPhrases = [
    'Online Cancellation',
    'Important Terms',
    'Terms & Conditions',
    'Terms and Conditions',
    'Cancellation Policy'
  ];

  for (const phrase of stopPhrases) {
    const index = cleaned.indexOf(phrase);
    if (index !== -1) {
      cleaned = cleaned.substring(0, index);
      break;
    }
  }

  cleaned = cleaned.replace(/\r\n/g, '\n');
  cleaned = cleaned.replace(/\r/g, '\n');
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
  cleaned = cleaned.split('\n').map(line => line.trim()).filter(line => line.length > 0).join('\n');

  cleaned = cleaned.replace(/data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/g, '');
  cleaned = cleaned.replace(/cid:[^\s]+/g, '');
  cleaned = cleaned.replace(/utm_[a-z]+=[^\s&]+/g, '');
  cleaned = cleaned.replace(/\[image:[^\]]+\]/gi, '[image]');

  cleaned = cleaned.trim();

  return cleaned;
};
