/**
 * Rail-specific passenger extraction from email body.
 * Handles both single and multi-passenger layouts across providers.
 */
export class RailPassengerExtractor {
  static extract(emailBody: string): Array<{
    name?: string;
    seatNumber?: string;
    ticketNumber?: string;
    coach?: string;
    class?: string;
    seatType?: string;
  }> {
    const normalized = this.normalizeWhitespace(emailBody);
    const passengerSection = this.extractPassengerSection(normalized);
    const sourceText = passengerSection || normalized;

    const passengers: Array<{
      name?: string;
      seatNumber?: string;
      ticketNumber?: string;
      coach?: string;
      class?: string;
      seatType?: string;
    }> = [];

    const bookingTicketNumber = this.extractBookingTicketNumber(normalized);

    // Pattern: "1. Name: Rajesh Kumar Coach: B3 Seat: 45 Class: 3AC Berth: Lower"
    const labelledRegex = /(\d+)?\s*(?:Name|Passenger|Traveler|Traveller)\s*[:\-]\s*([A-Za-z][A-Za-z\s'.-]{1,80})(?:\s+(?:Coach|Compartment)\s*[:\-]\s*([A-Za-z]{1,3}\d{0,3}|\d{1,3}))?(?:\s+(?:Seat|Berth)\s*(?:No\.?|Number)?\s*[:\-]\s*([A-Za-z]{0,3}\d{1,4}[A-Za-z]{0,2}|LB|UB|SL|SU|WL|RAC|\d{1,4}))?(?:\s+Class\s*[:\-]\s*([A-Za-z0-9\-\/ ]{2,20}))?(?:\s+(?:Berth\s*Type|Berth|Seat\s*Type)\s*[:\-]\s*([A-Za-z ]{3,20}))?/gi;

    let match: RegExpExecArray | null;
    while ((match = labelledRegex.exec(sourceText)) !== null) {
      const name = this.normalizeName(match[2] || '');
      const coach = this.normalizeCoach(match[3] || '');
      const seatNumber = this.normalizeSeatNumber(match[4] || '');
      const travelClass = this.normalizeClass(match[5] || '');
      const seatType = this.normalizeSeatType(match[6] || '');

      if (!name || this.isNoisePassengerName(name)) continue;

      passengers.push({
        name,
        seatNumber: seatNumber || undefined,
        ticketNumber: bookingTicketNumber || undefined,
        coach: coach || undefined,
        class: travelClass || undefined,
        seatType: seatType || undefined,
      });
    }

    // Structured row patterns for line-by-line parsing.
    const directRowRegex = /^(\d+)\s+([A-Za-z][A-Za-z\s'.-]{2,80}?)\s+([A-Za-z0-9]{1,4})\s+([A-Za-z0-9]{1,5})$/i;
    const unnumberedRowRegex = /^([A-Za-z][A-Za-z\s'.-]{2,80}?)\s+(?:\d{1,3}\s+)?(?:(?:Male|Female|M|F)\s+)?([A-Za-z0-9]{1,4})\s+([A-Za-z0-9]{1,5})$/i;
    const irctcRowRegex = /^(\d+)\s+([A-Za-z][A-Za-z\s'.-]{2,80}?)\s+(?:\d{1,3})\s+(?:Male|Female|M|F)\s+(?:[A-Za-z0-9\/\-]+)\s+(?:[A-Za-z]{0,7})\s+([A-Za-z0-9]{1,4})\s+([A-Za-z0-9]{1,5})$/i;

    for (const line of sourceText.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // Try IRCTC format first.
      let rowMatch = irctcRowRegex.exec(trimmed);
      if (rowMatch) {
        const name = this.normalizeName(rowMatch[2] || '');
        const coach = this.normalizeCoach(rowMatch[3] || '');
        const seatNumber = this.normalizeSeatNumber(rowMatch[4] || '');

        if (name && coach && seatNumber && !this.isNoisePassengerName(name)) {
          passengers.push({
            name,
            seatNumber,
            ticketNumber: bookingTicketNumber || undefined,
            coach,
            class: undefined,
          });
          continue;
        }
      }

      // Try direct format.
      rowMatch = directRowRegex.exec(trimmed);
      if (rowMatch) {
        const name = this.normalizeName(rowMatch[2] || '');
        const coach = this.normalizeCoach(rowMatch[3] || '');
        const seatNumber = this.normalizeSeatNumber(rowMatch[4] || '');

        if (name && coach && seatNumber && !this.isNoisePassengerName(name)) {
          passengers.push({
            name,
            seatNumber,
            ticketNumber: bookingTicketNumber || undefined,
            coach,
            class: undefined,
          });
          continue;
        }
      }

      // Try unnumbered format commonly used by provider summaries.
      rowMatch = unnumberedRowRegex.exec(trimmed);
      if (rowMatch) {
        const name = this.normalizeName(rowMatch[1] || '');
        const coach = this.normalizeCoach(rowMatch[2] || '');
        const seatNumber = this.normalizeSeatNumber(rowMatch[3] || '');

        if (name && coach && seatNumber && !this.isNoisePassengerName(name)) {
          passengers.push({
            name,
            seatNumber,
            ticketNumber: bookingTicketNumber || undefined,
            coach,
            class: undefined,
          });
          continue;
        }
      }

      // Fallback for irregular rows where middle columns merge (e.g. N/ACNFC).
      const fallbackPassenger = this.parseStructuredPassengerRow(trimmed, bookingTicketNumber || undefined);
      if (fallbackPassenger) {
        if (fallbackPassenger.name && this.isNoisePassengerName(fallbackPassenger.name)) {
          continue;
        }
        passengers.push(fallbackPassenger);
      }
    }

    // Bus-style global pass for merged table text where rows are concatenated.
    // Example merged chunk: "1 GAURAV SANWAL 22 Male N/ACNFC 1 11 2 PRIYA SHARMA 44 Female ..."
    const mergedSection = sourceText.replace(/\s+/g, ' ').trim();
    const mergedIrctcRegex = /(\d+)\s*([A-Za-z][A-Za-z\s'.-]{1,80}?)\s*(\d{1,3})\s*(Male|Female|M|F)\s*(?:N\/?A|NA)?\s*(?:CNFC|RAC|WL|CAN|CANCL|CONFIRMED|GNWL|PQWL|N\/?ACNFC)?\s*([A-Za-z0-9]{1,4})\s*([A-Za-z0-9]{1,5})(?=\s*(?:\d+\s*[A-Za-z]|Fare\s+Details|Fare\s*&\s*Payment\s*Details|Payment\s+Details|Terms\s+and\s+Conditions|$))/gi;

    while ((match = mergedIrctcRegex.exec(mergedSection)) !== null) {
      const name = this.normalizeName(match[2] || '');
      const coach = this.normalizeCoach(match[5] || '');
      const seatNumber = this.normalizeSeatNumber(match[6] || '');

      if (!name || !coach || !seatNumber || this.isNoisePassengerName(name)) continue;

      passengers.push({
        name,
        seatNumber,
        ticketNumber: bookingTicketNumber || undefined,
        coach,
        class: undefined,
      });
    }

    // Pattern: "Rajesh Kumar, Coach B3, Seat 45"
    const compactRegex = /([A-Za-z][A-Za-z\s'.-]{2,80})\s*,?\s*(?:Coach|Compartment)\s*([A-Za-z]{1,3}\d{0,3}|\d{1,3})\s*,?\s*(?:Seat|Berth)\s*(?:No\.?|Number)?\s*([A-Za-z]{0,3}\d{1,4}[A-Za-z]{0,2}|LB|UB|SL|SU|WL|RAC|\d{1,4})(?:\s*,?\s*(1AC|2AC|3AC|CC|EC|SL|2S|FC|GN))?/gi;
    while ((match = compactRegex.exec(sourceText)) !== null) {
      const name = this.normalizeName(match[1] || '');
      const coach = this.normalizeCoach(match[2] || '');
      const seatNumber = this.normalizeSeatNumber(match[3] || '');
      const travelClass = this.normalizeClass(match[4] || '');

      if (!name || !coach || !seatNumber || this.isNoisePassengerName(name)) continue;

      passengers.push({
        name,
        seatNumber: seatNumber || undefined,
        ticketNumber: bookingTicketNumber || undefined,
        coach: coach || undefined,
        class: travelClass || undefined,
      });
    }

    // Labeled provider fallback for single-passenger bookings:
    // captures blocks like "Passenger Name: X ... Coach: B2 ... Seat: 34".
    const labelledNameRegex = /(?:Passenger\s*Name|Traveller\s*Name|Traveler\s*Name|Name)\s*[:\-]\s*([A-Za-z][A-Za-z\s'.-]{1,80})/gi;
    while ((match = labelledNameRegex.exec(sourceText)) !== null) {
      const blockStart = match.index;
      const lookaheadSlice = sourceText.slice(blockStart, blockStart + 220);
      const name = this.normalizeName(match[1] || '');
      if (!name || this.isNoisePassengerName(name)) continue;

      const coachMatch = lookaheadSlice.match(/(?:Coach|Compartment|Coach\s*No\.?|Coach\s*Number)\s*[:\-]?\s*([A-Za-z0-9]{1,4})/i);
      const seatMatch = lookaheadSlice.match(/(?:Seat|Berth)\s*(?:No\.?|Number)?\s*[:\-]?\s*([A-Za-z0-9]{1,5}|LB|UB|SL|SU|WL|RAC)/i);
      const classMatch = lookaheadSlice.match(/(?:Class|Quota\s*Class|Travel\s*Class)\s*[:\-]?\s*([A-Za-z0-9\-\/ ]{2,20})/i);

      const coach = this.normalizeCoach(coachMatch?.[1] || '');
      const seatNumber = this.normalizeSeatNumber(seatMatch?.[1] || '');
      const travelClass = this.normalizeClass(classMatch?.[1] || '');

      passengers.push({
        name,
        seatNumber: seatNumber || undefined,
        ticketNumber: bookingTicketNumber || undefined,
        coach: coach || undefined,
        class: travelClass || undefined,
      });
    }

    // Last-resort single passenger fallback: keep likely name-only rows inside passenger section.
    if (passengers.length === 0 && passengerSection) {
      for (const line of passengerSection.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        if (/^(sl\.?\s*no|name|age|gender|coach|seat|berth|status|class)\b/i.test(trimmed)) continue;
        if (/(fare\s+details|payment\s+details|terms\s+and\s+conditions|journey\s+details)/i.test(trimmed)) continue;

        const candidate = trimmed.replace(/^\d+[\.)-]?\s*/, '').trim();
        if (!this.isLikelyName(candidate)) continue;
        if (this.isNoisePassengerName(candidate)) continue;
        if (candidate.split(/\s+/).length > 6) continue;

        passengers.push({
          name: candidate,
          ticketNumber: bookingTicketNumber || undefined,
        });
      }
    }

    return this.deduplicatePassengers(passengers);
  }

  private static normalizeWhitespace(text: string): string {
    const normalizedNewlines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    return normalizedNewlines
      .split('\n')
      .map((line) => line.replace(/[ \t\f\v]+/g, ' ').trim())
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  private static extractPassengerSection(text: string): string | null {
    const startMatch = text.match(/Passenger\s+Details|Passengers\s+Details|Passenger\(s\)\s+Details|Traveler\s+Details|Traveller\s+Details|Passenger\s+Information|Traveler\s+Information|Traveller\s+Information/i);
    if (!startMatch || startMatch.index === undefined) {
      return null;
    }

    const startIndex = startMatch.index + startMatch[0].length;
    const remaining = text.substring(startIndex);

    const endMatch = remaining.match(/Fare\s+Details|Fare\s*&\s*Payment\s+Details|Payment\s+Details|Cancellation\s+Rules|Contact\s+Details|Terms\s+and\s+Conditions|Important\s+Instructions|Journey\s+Details|Train\s+Details|Boarding\s+Details|GST\s+Details/i);
    const endIndex = endMatch && endMatch.index !== undefined ? endMatch.index : remaining.length;

    return remaining.substring(0, endIndex).trim() || null;
  }

  private static parseStructuredPassengerRow(
    line: string,
    bookingTicketNumber?: string
  ): {
    name?: string;
    seatNumber?: string;
    ticketNumber?: string;
    coach?: string;
    class?: string;
    seatType?: string;
  } | null {
    const tokens = line.split(/\s+/);
    if (tokens.length < 4) return null;
    if (!/^\d+$/.test(tokens[0])) return null;

    const seatToken = tokens[tokens.length - 1];
    const coachToken = tokens[tokens.length - 2];

    if (!this.isLikelySeatToken(seatToken) || !this.isLikelyCoachToken(coachToken)) {
      return null;
    }

    let nameEnd = tokens.length - 2;
    for (let i = 1; i < tokens.length - 3; i++) {
      if (/^\d{1,3}$/.test(tokens[i]) && /^(male|female|m|f)$/i.test(tokens[i + 1] || '')) {
        nameEnd = i;
        break;
      }
    }

    const name = this.normalizeName(tokens.slice(1, nameEnd).join(' '));
    const coach = this.normalizeCoach(coachToken);
    const seatNumber = this.normalizeSeatNumber(seatToken);

    if (!name || !coach || !seatNumber) return null;

    return {
      name,
      seatNumber,
      ticketNumber: bookingTicketNumber || undefined,
      coach,
      class: undefined,
    };
  }

  private static extractBookingTicketNumber(text: string): string | null {
    const match = text.match(/(?:PNR\s*(?:No\.?|Number)?|Ticket\s*(?:No\.?|Number|ID)|Booking\s*(?:Reference|ID))\s*[:\-]?\s*([A-Z0-9\/-]{5,30})/i);
    const raw = (match?.[1] || '').trim();
    if (!raw) return null;

    const cleaned = raw
      .replace(/(train|passenger|fare|details|journey).*$/i, '')
      .replace(/[^A-Z0-9\/-]/gi, '')
      .trim();

    if (!cleaned) return null;
    if (/^[A-Z0-9\/-]{5,20}$/i.test(cleaned)) {
      return cleaned;
    }

    return null;
  }

  private static normalizeName(value: string): string {
    const clean = value.replace(/\s+/g, ' ').trim();
    if (!this.isLikelyName(clean)) return '';
    return clean;
  }

  private static normalizeCoach(value: string): string {
    const coach = value.replace(/\s+/g, '').trim().toUpperCase();
    if (!coach) return '';
    if (!/^(?:\d{1,3}|[A-Z]{1,3}\d{0,3})$/.test(coach)) return '';
    return coach;
  }

  private static normalizeSeatNumber(value: string): string {
    const seat = value.replace(/\s+/g, '').trim().toUpperCase();
    if (!seat) return '';
    return seat;
  }

  private static normalizeClass(value: string): string {
    const cls = value.replace(/\s+/g, ' ').trim().toUpperCase();
    return cls || '';
  }

  private static normalizeSeatType(value: string): string {
    const clean = value.replace(/\s+/g, ' ').trim();
    return clean || '';
  }

  private static isLikelyCoachToken(value: string): boolean {
    return /^(?:\d{1,3}|[A-Z]{1,3}\d{0,3})$/i.test((value || '').trim());
  }

  private static isLikelySeatToken(value: string): boolean {
    return /^(?:\d{1,4}|[A-Z]{1,3}\d{1,4}|LB|UB|SL|SU|WL|RAC)$/i.test((value || '').trim());
  }

  private static isLikelyName(value: string): boolean {
    if (!value || value.length < 2 || value.length > 90) return false;
    if (!/[A-Za-z]/.test(value)) return false;
    if (/\d/.test(value)) return false;
    return true;
  }

  private static isNoisePassengerName(value: string): boolean {
    const clean = (value || '').trim();
    if (!clean) return true;
    if (clean.length < 3) return true;
    if (/[/\\]/.test(clean)) return true;
    if (/^(n\/a|na|wl|rac|cnfc)$/i.test(clean)) return true;

    const lower = clean.toLowerCase();
    const blockedPhrases = [
      'catering service option',
      'service option',
      'passenger details',
      'fare details',
      'payment details',
      'journey details',
      'terms and conditions',
      'seat berth wl',
      'seat berth',
      'coach seat',
      'status coach',
      'sl no',
      'passenger name',
      'traveller name',
      'traveler name',
    ];

    return blockedPhrases.some((phrase) => lower.includes(phrase));
  }

  private static deduplicatePassengers(passengers: Array<{
    name?: string;
    seatNumber?: string;
    ticketNumber?: string;
    coach?: string;
    class?: string;
    seatType?: string;
  }>): Array<{
    name?: string;
    seatNumber?: string;
    ticketNumber?: string;
    coach?: string;
    class?: string;
    seatType?: string;
  }> {
    const unique = new Map<string, {
      name?: string;
      seatNumber?: string;
      ticketNumber?: string;
      coach?: string;
      class?: string;
      seatType?: string;
    }>();

    for (const passenger of passengers) {
      const name = (passenger.name || '').trim();
      const seat = (passenger.seatNumber || '').trim();
      const coach = (passenger.coach || '').trim();
      if (!name) continue;

      const key = `${name.toLowerCase()}|${coach.toUpperCase()}|${seat.toUpperCase()}`;
      if (!unique.has(key)) {
        unique.set(key, passenger);
      }
    }

    return Array.from(unique.values());
  }
}
