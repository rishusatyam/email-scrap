import { convert } from 'html-to-text';

interface CleanedEmailBodies {
  cleanedHtmlBody?: string;
  cleanedTextBody?: string;
}

export const cleanEmailBodies = (htmlBody?: string, textBody?: string): CleanedEmailBodies => {
  const result: CleanedEmailBodies = {};

  if (htmlBody) {
    result.cleanedHtmlBody = cleanHtmlBody(htmlBody);
  }

  if (textBody) {
    result.cleanedTextBody = cleanTextBody(textBody);
  }

  return result;
};

const cleanHtmlBody = (html: string): string => {
  if (!html) return '';

  let cleaned = html;

  // Remove irrelevant sections completely
  const sectionsToRemove = [
    /Online Cancellation and Rules[\s\S]*?(?=<table|<div|$)/gi,
    /Important Terms & Conditions[\s\S]*?(?=<\/table>|<\/div>|$)/gi,
    /Important Terms &amp; Conditions[\s\S]*?(?=<\/table>|<\/div>|$)/gi,
    /Terms & Conditions[\s\S]*?(?=<\/table>|<\/div>|$)/gi,
    /Terms &amp; Conditions[\s\S]*?(?=<\/table>|<\/div>|$)/gi,
    /Cancellation Policy[\s\S]*?(?=<\/table>|<\/div>|$)/gi,
    /<table[^>]*>[\s\S]*?Online Cancellation[\s\S]*?<\/table>/gi,
    /<table[^>]*>[\s\S]*?Important Terms[\s\S]*?<\/table>/gi,
    /<ul[^>]*>[\s\S]*?customer support[\s\S]*?<\/ul>/gi,
    /<ul[^>]*>[\s\S]*?MakeMyTrip would not be able to process[\s\S]*?<\/ul>/gi,
  ];

  for (const pattern of sectionsToRemove) {
    cleaned = cleaned.replace(pattern, '');
  }

  // Convert HTML to plain text using html-to-text
  const plainText = convert(cleaned, {
    wordwrap: false,
    preserveNewlines: true,
    selectors: [
      { selector: 'img', format: 'skip' },
      { selector: 'a', options: { ignoreHref: true } },
      { selector: 'script', format: 'skip' },
      { selector: 'style', format: 'skip' },
      { selector: 'footer', format: 'skip' },
    ],
  });

  // Remove forwarded message chains
  let cleanedText = removeForwardedChains(plainText);

  // Fix spacing issues - add newlines before capital letters when merged
  cleanedText = fixSpacing(cleanedText);

  // Normalize whitespace
  return normalizeWhitespace(cleanedText);
};

const cleanTextBody = (text: string): string => {
  if (!text) return '';

  // Remove forwarded message chains - keep only last/original email
  let cleaned = removeForwardedChains(text);

  // Remove irrelevant sections
  const sectionsToRemove = [
    /Cancellation time[\s\S]*?(?=\n\n|$)/gi,
    /Online Cancellation and Rules[\s\S]*?(?=\n\n|$)/gi,
    /Important Terms & Conditions[\s\S]*?(?=\n\n|$)/gi,
    /Terms & Conditions[\s\S]*?(?=\n\n|$)/gi,
    /Cancellation Policy[\s\S]*?(?=\n\n|$)/gi,
    /How do I cancel my ticket\?[\s\S]*?(?=\n\n|$)/gi,
    /How do I contact MakeMyTrip\.com\?[\s\S]*?(?=\n\n|$)/gi,
    /Please go to customer support[\s\S]*?(?=\n\n|$)/gi,
    /MakeMyTrip would not be able to process[\s\S]*?(?=\n\n|$)/gi,
    /Incase of change in bus type[\s\S]*?(?=\n\n|$)/gi,
    /Agency: MakeMyTrip[\s\S]*?(?=\n\n|$)/gi,
    /The primary passenger is required[\s\S]*?(?=\n\n|$)/gi,
    /The bus e-ticket booked is non transferable[\s\S]*?(?=\n\n|$)/gi,
    /The bus operator reserves[\s\S]*?(?=\n\n|$)/gi,
    /The departure and arrival timings[\s\S]*?(?=\n\n|$)/gi,
    /The bus trips may be delayed[\s\S]*?(?=\n\n|$)/gi,
    /Provision of video\/air conditioning[\s\S]*?(?=\n\n|$)/gi,
    /In the event of cancellation[\s\S]*?(?=\n\n|$)/gi,
    /Any grievances and claims[\s\S]*?(?=\n\n|$)/gi,
    /Customers are advised to reach[\s\S]*?(?=\n\n|$)/gi,
    /Luggage policy:[\s\S]*?(?=\n\n|$)/gi,
    /Please Note: It is mandatory[\s\S]*?(?=\n\n|$)/gi,
  ];

  for (const pattern of sectionsToRemove) {
    cleaned = cleaned.replace(pattern, '');
  }

  // Remove bullet points and list markers
  cleaned = cleaned.replace(/^\s*[-•*]\s+/gm, '');

  // Fix spacing issues - add newlines before capital letters when merged
  cleaned = fixSpacing(cleaned);
 
  // Normalize whitespace
  return normalizeWhitespace(cleaned);
};

const removeForwardedChains = (text: string): string => {
  if (!text) return '';

  // Find all forwarded message markers
  const forwardedMarkers = [
    /[-]{5,}\s*Forwarded message\s*[-]{5,}/gi,
    /[-]{5,}\s*Original Message\s*[-]{5,}/gi,
    /Begin forwarded message/gi,
  ];

  let lastMarkerIndex = -1;
  let lastMarkerEnd = -1;

  // Find the LAST forwarded message marker
  for (const pattern of forwardedMarkers) {
    const matches = [...text.matchAll(pattern)];
    if (matches.length > 0) {
      const lastMatch = matches[matches.length - 1];
      if (lastMatch.index !== undefined && lastMatch.index > lastMarkerIndex) {
        lastMarkerIndex = lastMatch.index;
        lastMarkerEnd = lastMatch.index + lastMatch[0].length;
      }
    }
  }

  // If we found a forwarded marker, extract content after it
  if (lastMarkerIndex !== -1) {
    let content = text.substring(lastMarkerEnd);

    // Remove the forwarded email headers (From:, Date:, Subject:, To:)
    const headerPattern = /^(From:|Date:|Subject:|To:).*$/gm;
    const lines = content.split('\n');
    const cleanedLines: string[] = [];
    let skipHeaders = true;
    let headerCount = 0;

    for (const line of lines) {
      if (skipHeaders && headerPattern.test(line)) {
        headerCount++;
        // Skip first 4 header lines (From, Date, Subject, To)
        if (headerCount >= 4) {
          skipHeaders = false;
        }
        continue;
      }
      cleanedLines.push(line);
    }

    content = cleanedLines.join('\n');

    // Remove any remaining forwarded headers that appear in the middle
    content = content.replace(/^From:.*$/gm, '');
    content = content.replace(/^Date:.*$/gm, '');
    content = content.replace(/^Subject:.*$/gm, '');
    content = content.replace(/^To:.*$/gm, '');

    return content;
  }

  return text;
};

const fixSpacing = (text: string): string => {
  if (!text) return '';

  let fixed = text;

  // Add newline before capital letters that follow lowercase letters (merged text)
  // But avoid breaking acronyms and common patterns
  fixed = fixed.replace(/([a-z])([A-Z])/g, (match, lower, upper) => {
    // Skip if it's a known pattern like "MakeMyTrip", "PNR", etc.
    if (/^[A-Z]{2,}$/.test(upper)) return match;
    return lower + '\n' + upper;
  });

  // Ensure proper spacing after colons
  fixed = fixed.replace(/:\s*([A-Z])/g, ': $1');
  fixed = fixed.replace(/:\s*([a-z])/g, ': $1');

  return fixed;
};


const normalizeWhitespace = (text: string): string => {
  if (!text) return '';

  let normalized = text;

  // Normalize line endings
  normalized = normalized.replace(/\r\n/g, '\n');
  normalized = normalized.replace(/\r/g, '\n');

  // Remove excessive blank lines (more than 2 consecutive)
  normalized = normalized.replace(/\n{3,}/g, '\n\n');

  // Trim each line
  normalized = normalized
    .split('\n')
    .map(line => line.trim())
    .join('\n');

  // Remove lines that are just whitespace
  normalized = normalized
    .split('\n')
    .filter(line => line.length > 0)
    .join('\n');

  // Final trim
  normalized = normalized.trim();

  return normalized;
};
