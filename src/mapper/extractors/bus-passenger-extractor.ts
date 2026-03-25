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
    // "1 Ms. Nisha 21 Seater" or "2 Mr. Rahul L5 Sleeper"
    const rowRegex = /(\d+)\s*(Mr\.?|Ms\.?|Mrs\.?|Miss\.?|Mstr\.?)\s*([A-Za-z][A-Za-z\s'.-]{1,60}?)\s+([A-Za-z]?\d{1,3}[A-Za-z]?)\s*(Seater|Sleeper|Lower\s*Berth|Upper\s*Berth|Berth)?(?=\s*\d+\s*(?:Mr\.?|Ms\.?|Mrs\.?|Miss\.?|Mstr\.?)|\s*$)/gi;

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
        seatNumber,
        ticketNumber: ticketNumber || undefined,
        passengerType,
      });
    }

    return passengers;
  }

  private static normalizeWhitespace(text: string): string {
    return text.replace(/\s+/g, ' ').trim();
  }

  private static extractPassengerSection(text: string): string | null {
    const startMatch = text.match(/Passenger\s+Details/i);
    if (!startMatch || startMatch.index === undefined) {
      return null;
    }

    const startIndex = startMatch.index + startMatch[0].length;
    const remaining = text.substring(startIndex);
    const endMatch = remaining.match(/Boarding\s+and\s+Drop\s+Point\s+Details|Boarding\s+Point\s+Details|Online\s+Cancellation\s+and\s+Rules/i);
    const endIndex = endMatch && endMatch.index !== undefined ? endMatch.index : remaining.length;

    return remaining.substring(0, endIndex).trim() || null;
  }

  private static extractTicketNumber(text: string): string | null {
    const ticketMatch = text.match(/(?:MakeMyTrip\s*Bus\s*ID|Booking\s*(?:ID|Id|Reference))\s*[:\-]?\s*([A-Z0-9\/-]{6,})/i)
      || text.match(/(?:Ticket\s*Number|Operator\s*PNR|PNR)\s*[:\-]?\s*([A-Z0-9\/-]{6,})/i);
    return ticketMatch?.[1] || null;
  }

  private static mapPassengerType(title: string, seatType: string): string | undefined {
    if (title === 'mstr') {
      return 'child';
    }

    if (seatType.toLowerCase().includes('senior')) {
      return 'senior';
    }

    return 'adult';
  }
}
