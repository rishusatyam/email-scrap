/**
 * Bus-specific passenger extraction from email body.
 * Handles multi-passenger bus bookings where multiple passengers are listed in one email.
 */
export class BusPassengerExtractor {
  static extract(emailBody: string): Array<{
    name?: string;
    seatNumber?: string;
    ticketNumber?: string;
    passengerType?: string;
  }> {
    const normalized = this.normalizeWhitespace(emailBody);
    const passengerSection = this.extractPassengerSection(normalized);
    if (!passengerSection) {
      return [];
    }

    const passengers: Array<{
      name?: string;
      seatNumber?: string;
      ticketNumber?: string;
      passengerType?: string;
    }> = [];

    const ticketNumber = this.extractTicketNumber(normalized);

    // Matches passenger rows like:
    // "1 Ms. Nisha 21 Seater" or "2 Mr. satyam L5 Sleeper"
    const rowRegex = /(\d+)\s*(Mr\.?|Ms\.?|Mrs\.?|Miss\.?|Mstr\.?)\s*([A-Za-z][A-Za-z\s'.-]{1,60}?)\s+([A-Za-z]{0,2}\d{1,3}[A-Za-z]{0,2}|[A-Za-z])\s*(Seater|Sleeper|Lower\s*Berth|Upper\s*Berth|Berth)?(?=\s*\d+\s*(?:Mr\.?|Ms\.?|Mrs\.?|Miss\.?|Mstr\.?)|\s*$)/gi;

    let match: RegExpExecArray | null;
    while ((match = rowRegex.exec(passengerSection)) !== null) {
      const title = (match[2] || '').replace('.', '').toLowerCase();
      const nameCore = (match[3] || '').trim().replace(/\s+/g, ' ');
      const seatNumber = (match[4] || '').trim();
      const seatType = (match[5] || '').trim();

      if (!nameCore || !seatNumber) {
        continue;
      }

      const fullName = `${match[2] ? `${match[2]} ` : ''}${nameCore}`.trim();
      const passengerType = this.mapPassengerType(title, seatType);

      passengers.push({
        name: fullName,
        seatNumber: this.normalizeSeatNumber(seatNumber),
        ticketNumber: ticketNumber || undefined,
        passengerType,
      });
    }

    // Fallback for lines like: "1. Gaurav Sanwal Male Seat No: 5"
    const travellerRegex = /(\d+)[\.)]?\s*([A-Za-z][A-Za-z\s'.-]{1,60})\s+(Male|Female|M|F|Adult|Child|Senior)?\s*(?:Seat\s*No\.?\s*[:\-]?\s*)?([A-Za-z]{0,2}\d{1,3}[A-Za-z]{0,2}|[A-Za-z])\b/gi;
    while ((match = travellerRegex.exec(passengerSection)) !== null) {
      const name = (match[2] || '').trim().replace(/\s+/g, ' ');
      const seatNumber = this.normalizeSeatNumber(match[4] || '');
      if (!name || !seatNumber || !this.isLikelyName(name)) {
        continue;
      }

      passengers.push({
        name,
        seatNumber,
        ticketNumber: ticketNumber || undefined,
        passengerType: this.mapPassengerType((match[3] || '').toLowerCase(), ''),
      });
    }

    // Fallback for compact lines like: "GAURAV SANWAL 21YRS, MALE D"
    const compactRegex = /([A-Z][A-Z\s'.-]{2,60})\s+\d{1,2}YRS?,\s*(MALE|FEMALE|M|F)\s+([A-Za-z]{0,2}\d{1,3}[A-Za-z]{0,2}|[A-Za-z])\b/g;
    while ((match = compactRegex.exec(passengerSection)) !== null) {
      const name = this.toTitleCase((match[1] || '').trim().replace(/\s+/g, ' '));
      const seatNumber = this.normalizeSeatNumber(match[3] || '');
      if (!name || !seatNumber || !this.isLikelyName(name)) {
        continue;
      }

      passengers.push({
        name,
        seatNumber,
        ticketNumber: ticketNumber || undefined,
        passengerType: this.mapPassengerType((match[2] || '').toLowerCase(), ''),
      });
    }

    return this.deduplicatePassengers(passengers);
  }

  private static normalizeWhitespace(text: string): string {
    return text.replace(/\s+/g, ' ').trim();
  }

  private static extractPassengerSection(text: string): string | null {
    const startMatch = text.match(/Passenger\s+Details|Traveller\s+Details|Traveler\s+Details/i);
    if (!startMatch || startMatch.index === undefined) {
      return null;
    }

    const startIndex = startMatch.index + startMatch[0].length;
    const remaining = text.substring(startIndex);
    const endMatch = remaining.match(/Boarding\s+and\s+Drop\s+Point\s+Details|Boarding\s+Point\s+Details|Online\s+Cancellation\s+and\s+Rules|Fare\s+Details|Fare\s*&\s*Payment\s*Details|Additional\s+Services|Contact\s+Details|Terms\s+and\s+conditions/i);
    const endIndex = endMatch && endMatch.index !== undefined ? endMatch.index : remaining.length;

    return remaining.substring(0, endIndex).trim() || null;
  }

  private static extractTicketNumber(text: string): string | null {
    const ticketMatch = text.match(/(?:MakeMyTrip\s*Bus\s*ID|Booking\s*(?:ID|Id|Reference))\s*[:\-]?\s*([A-Z0-9\/-]{6,})/i)
      || text.match(/(?:Ticket\s*Number|Operator\s*PNR|PNR)\s*[:\-]?\s*([A-Z0-9\/-]{6,})/i);
    return ticketMatch?.[1] || null;
  }

  private static mapPassengerType(title: string, seatType: string): string | undefined {
    if (title === 'mstr' || title === 'child') {
      return 'child';
    }

    if (title === 'f' || title === 'female' || title === 'm' || title === 'male' || title === 'adult') {
      return 'adult';
    }

    if (seatType.toLowerCase().includes('senior')) {
      return 'senior';
    }

    return 'adult';
  }

  private static normalizeSeatNumber(value: string): string {
    return value.replace(/\s+/g, '').trim().toUpperCase();
  }

  private static isLikelyName(value: string): boolean {
    if (!value || value.length < 2 || value.length > 70) return false;
    if (!/[A-Za-z]/.test(value)) return false;
    if (/[0-9]/.test(value)) return false;
    return true;
  }

  private static toTitleCase(value: string): string {
    return value
      .toLowerCase()
      .split(' ')
      .map((word) => (word ? `${word[0].toUpperCase()}${word.slice(1)}` : word))
      .join(' ');
  }

  private static deduplicatePassengers(passengers: Array<{
    name?: string;
    seatNumber?: string;
    ticketNumber?: string;
    passengerType?: string;
  }>): Array<{
    name?: string;
    seatNumber?: string;
    ticketNumber?: string;
    passengerType?: string;
  }> {
    const unique = new Map<string, {
      name?: string;
      seatNumber?: string;
      ticketNumber?: string;
      passengerType?: string;
    }>();

    for (const passenger of passengers) {
      const name = (passenger.name || '').trim();
      const seat = (passenger.seatNumber || '').trim();
      if (!name || !seat) continue;

      const key = `${name.toLowerCase()}|${seat.toUpperCase()}`;
      if (!unique.has(key)) {
        unique.set(key, passenger);
      }
    }

    return Array.from(unique.values());
  }
}
