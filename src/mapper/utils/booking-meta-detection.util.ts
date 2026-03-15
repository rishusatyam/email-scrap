export interface BookingMeta {
  bookingType: string;
  provider: string;
}

export function detectBookingMeta(
  subject?: string,
  from?: string,
  cleanedHtmlBody?: string,
  cleanedTextBody?: string
): BookingMeta {
  // Build combined text from all sources
  const text =
    (cleanedHtmlBody || '') +
    ' ' +
    (cleanedTextBody || '') +
    ' ' +
    (subject || '') +
    ' ' +
    (from || '');

  const t = text.toLowerCase();

  // Detect booking type with strict priority order
  const bookingType = detectBookingType(t);

  // Detect provider
  const provider = detectProvider(from, t);

  return {
    bookingType,
    provider,
  };
}

function detectBookingType(text: string): string {
  // Strict priority order: flight → train → bus → hotel → cab

  if (text.includes('flight')) {
    return 'flight';
  }

  if (text.includes('train') || text.includes('coach') || text.includes('berth')) {
    return 'train';
  }

  if (text.includes('bus operator') || text.includes('boarding point')) {
    return 'bus';
  }

  if (text.includes('hotel') || text.includes('check-in')) {
    return 'hotel';
  }

  if (
    text.includes('cab') ||
    text.includes('car') ||
    text.includes('driver') ||
    text.includes('pickup')
  ) {
    return 'cab';
  }

  return 'unknown';
}

function getDomain(from?: string): string {
  if (!from) return '';

  // Extract domain from email using regex
  // Matches: anything@domain.com or anything@domain.co.in
  const match = from.match(/@([a-zA-Z0-9.-]+)/);
  return match ? match[1].toLowerCase() : '';
}

function detectProvider(from?: string, text?: string): string {
  // STEP-1: Detect from email domain (PRIMARY)
  const domain = getDomain(from);

  if (domain) {
    // Check domain rules
    if (domain.includes('makemytrip')) {
      return 'makemytrip';
    }
    if (domain.includes('irctc')) {
      return 'irctc';
    }
    if (domain.includes('redbus')) {
      return 'redbus';
    }
    if (domain.includes('indigo')) {
      return 'indigo';
    }
    if (domain.includes('airindia')) {
      return 'airindia';
    }

    // Domain detected but not in known providers - return cleaned domain
    return cleanDomain(domain);
  }

  // STEP-2: Fallback using subject + cleaned text
  if (text) {
    if (text.includes('makemytrip')) {
      return 'makemytrip';
    }
    if (text.includes('irctc')) {
      return 'irctc';
    }
    if (text.includes('redbus')) {
      return 'redbus';
    }
  }

  // STEP-3: Final fallback
  return 'unknown';
}

function cleanDomain(domain: string): string {
  // Remove common TLDs and extensions
  // Examples: makemytrip.com → makemytrip, abc-travel.co.in → abc-travel
  return domain
    .replace(/\.(com|co|in|org|net|co\.in|com\.in)$/i, '')
    .toLowerCase();
}
