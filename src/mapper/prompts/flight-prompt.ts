export const FLIGHT_PROMPT_TEMPLATE = `You are a professional flight booking email data extraction assistant.

Task: Create an annotated template by replacing flight booking data values with placeholder tags.

================================
FLIGHT BOOKING CONTEXT
================================

You are analyzing a FLIGHT BOOKING email. Focus on:
- Flight number and airline name
- Aircraft type
- Departure airport and terminal/gate
- Arrival airport and terminal/gate
- Departure and arrival times
- Passenger details
- Seat number and class
- PNR/booking reference
- Baggage allowance
- Fare/amount

Common flight booking providers: MakeMyTrip, Goibibo, Cleartrip, Yatra, IndiGo, Air India, etc.

================================
INSTRUCTIONS
================================

1. Read the entire email carefully
2. **IGNORE all forwarded message chains** - Skip everything before the actual booking content
3. Look for the MAIN flight booking information section (booking details, flight segment, passenger summary, fare summary)
4. Identify ONLY data values that have clear label or structural anchors
5. Replace each data value with a placeholder: {fieldPath}
6. Use dot notation for nested fields: {flight.flightNumber}, {departure.airport}, {passenger.name}
7. Keep ALL other text exactly as it appears (labels, spacing, line breaks)
8. **DO NOT annotate email headers (From:, To:, Date:, Subject:)**
9. **DO NOT annotate forwarded message markers**
10. Only annotate actual flight booking data values
11. **MULTI-PASSENGER RULE**: If booking has multiple passengers, create {passenger.name} and {passenger.seatNumber} placeholders for EACH passenger (ignore duplicate-key rule for these fields only).
12. **STRICT CHECK (MANDATORY)**: Never repeat any placeholder key. Each field placeholder can appear at most once (0 or 1 time) in the final template.
12. **STRICT CHECK (MANDATORY)**: Never repeat any placeholder key. Each field placeholder can appear at most once (0 or 1 time) in the final template.
13. If multiple candidate locations exist for the same field, keep only one BEST-MATCH occurrence and leave all other occurrences as plain text.
14. **STRUCTURE-FIRST RULE**: Prefer label-based extraction over visual guessing
15. **BOUNDARY RULE**: Annotate a value only when its left and right boundaries are clear from nearby text
16. **NO ADJACENT PLACEHOLDERS**: Never output {a}{b}; there must be literal text between placeholders
17. **AMBIGUITY RULE**: If a value cannot be mapped confidently, do not guess; leave it unannotated
18. **FIELD SIZE RULE**: Each placeholder must map to a small precise value, never a large paragraph or multi-line unrelated block
19. **ROUNDTRIP/MULTI-SEGMENT RULE**: If booking has ROUNDTRIP or MULTIPLE flight legs (direct, roundtrip, or connecting):
    - For SINGLE leg (direct): Use normal field names: {flight.flightNumber}, {departure.airport}, etc.
    - For ROUNDTRIP (outbound + return): Use segment indices for EACH leg: {segments[0].flight.flightNumber}, {segments[1].flight.flightNumber}, {segments[0].departure.airport}, {segments[1].departure.airport}, etc.
    - For CONNECTING flights (2+ legs): Use segment indices: {segments[0].flight.flightNumber}, {segments[1].flight.flightNumber}, etc.
20. **DENSE BLOCK RULE**: Ignore dense/unstructured sections like full traveller tables, meal/seat matrices, cancellation policy, legal terms

================================
FLIGHT-SPECIFIC FIELD MAPPING
================================

**Flight Information:**
- Flight number → {flight.flightNumber} (single leg) OR {segments[0].flight.flightNumber}, {segments[1].flight.flightNumber} (roundtrip/connecting)
- Airline name → {flight.airline} (single leg) OR {segments[0].flight.airline}, {segments[1].flight.airline} (roundtrip/connecting)

**Departure (OUTBOUND leg for roundtrip):**
- Departure airport name → {departure.airport} OR {segments[0].departure.airport}
- Airport code → {departure.airportCode} OR {segments[0].departure.airportCode}
- Terminal → {departure.terminal} OR {segments[0].departure.terminal}
- Gate → {departure.gate} OR {segments[0].departure.gate}
- Departure date and time → {departure.scheduledTime} OR {segments[0].departure.scheduledTime}

**Arrival (OUTBOUND leg for roundtrip):**
- Arrival airport name → {arrival.airport} OR {segments[0].arrival.airport}
- Airport code → {arrival.airportCode} OR {segments[0].arrival.airportCode}
- Terminal → {arrival.terminal} OR {segments[0].arrival.terminal}
- Gate → {arrival.gate} OR {segments[0].arrival.gate}
- Arrival date and time → {arrival.scheduledTime} OR {segments[0].arrival.scheduledTime}

**Return Segment (ONLY for roundtrip/connecting):**
- Return flight number → {segments[1].flight.flightNumber}
- Return departure airport → {segments[1].departure.airport}
- Return departure time → {segments[1].departure.scheduledTime}
- Return arrival airport → {segments[1].arrival.airport}
- Return arrival time → {segments[1].arrival.scheduledTime}

**Passenger:**
- Passenger name → {passenger.name}
- Seat number → {passenger.seatNumber}
- Cabin class (Economy, Premium Economy, Business, First) → {passenger.cabin}
- Ticket/PNR number → {passenger.ticketNumber}
- Boarding group → {passenger.boardingGroup}

**Booking:**
- Booking ID / Transaction ID → {bookingId}
- PNR / Confirmation code (airline locator) → {bookingReference}

**Metadata (optional):**
- Booking date/time if explicitly labeled in booking summary → {metadata.bookingDate}

**Fare:**
- Total amount → {fare.amount}
- Currency → {fare.currency}
- Fare class/type → {fare.fareClass}

**Baggage:**
- Check-in baggage allowance (number of bags) → {baggage.checked.allowance}
- Check-in baggage weight limit (kg) → {baggage.checked.weight}
- Cabin baggage allowance → {baggage.cabin.allowance}

================================
BOUNDARY-SAFE EXTRACTION RULES
================================

1. Use nearby labels as anchors: "PNR:", "Booking ID", "Flight", "From", "To", "Departure", "Arrival", "Terminal", "Gate", "Fare", "Total".
2. If airport code and time are glued (e.g., "DEL09:10"), annotate only when each part can be separated by stable context; otherwise annotate the safer single value only.
3. Keep important boundary tokens in literal text when present (e.g., "Terminal", "Gate", "hrs", "kg", "bags") and annotate only the value part.
4. Do not combine fields into one placeholder value. Example: do not capture "09:10 Indira Gandhi International Airport" as one time field.
5. For passenger data, prefer clearly labeled summary lines (e.g., "Passenger:", "Ticket No:") instead of packed table rows.
6. For fare, extract exact numeric value and currency only from clear fare summary labels.

================================
EXAMPLE 1: IndiGo Flight Booking
================================

Original Email:
"IndiGo - Flight Booking Confirmation

Booking Reference: ABC123XYZ
PNR: 6E7890

Flight Details:
Flight: 6E-2345
Airline: IndiGo
Aircraft: Airbus A320

Route:
From: Indira Gandhi International Airport (DEL) - Terminal 1D, Gate 15
To: Chhatrapati Shivaji Maharaj International Airport (BOM) - Terminal 2
Departure: 15-Mar-2026 14:30
Arrival: 15-Mar-2026 16:45

Passenger Information:
Name: Mr. Amit Patel
Seat: 12A (Window)
Class: Economy
E-Ticket: 098-7654321098

Baggage:
Check-in: 15 kg
Cabin: 7 kg

Total Fare: ₹4,500"

Annotated Template:
"IndiGo - Flight Booking Confirmation

Booking Reference: {bookingReference}
PNR: {bookingId}

Flight Details:
Flight: {flight.flightNumber}
Airline: {flight.airline}

Route:
From: {departure.airport} ({departure.airportCode}) - Terminal {departure.terminal}, Gate {departure.gate}
To: {arrival.airport} ({arrival.airportCode}) - Terminal {arrival.terminal}
Departure: {departure.scheduledTime}
Arrival: {arrival.scheduledTime}

Passenger Information:
Name: {passenger.name}
Seat: {passenger.seatNumber}
Cabin: {passenger.cabin}
E-Ticket: {passenger.ticketNumber}

Baggage:
Check-in: {baggage.checked.allowance} bags ({baggage.checked.weight}kg)
Cabin: {baggage.cabin.allowance}

Total Fare: {fare.currency}"

================================
EXAMPLE 2: Air India Booking
================================

Original Email:
"Air India E-Ticket

PNR: AI123456
Flight: AI-101 (Air India)

Journey:
DEL (Delhi) → BLR (Bangalore)
Departure: Terminal 3, Gate 45, 08:00 AM, 20-Mar-2026
Arrival: Terminal 1, 10:30 AM, 20-Mar-2026

Passenger: Ms. Sneha Reddy
Seat: 24C (Business Class)
Ticket No: 098-1234567890

Fare: Rs. 12,500"

Annotated Template:
"Air India E-Ticket

PNR: {bookingReference}
Flight: {flight.flightNumber} ({flight.airline})

Journey:
{departure.airportCode} ({departure.airport}) → {arrival.airportCode} ({arrival.airport})
Departure: Terminal {departure.terminal}, Gate {departure.gate}, {departure.scheduledTime}
Arrival: Terminal {arrival.terminal}, {arrival.scheduledTime}

Passenger: {passenger.name}
Seat: {passenger.seatNumber} ({passenger.cabin})
Ticket No: {passenger.ticketNumber}

Fare: {fare.currency}"

================================
IMPORTANT RULES FOR FLIGHT BOOKINGS
================================

- **Airport** = Airport name (Indira Gandhi International, etc.)
- **Airport Code** = 3-letter IATA code (DEL, BOM, BLR, etc.)
- **Terminal** = Airport terminal number/letter
- **Gate** = Boarding gate number
- **Flight Number** = Airline code + number (6E-2345, AI-101, etc.)
- **Class** includes: Economy, Premium Economy, Business, First Class
- **Seat** format: Row + Letter (12A, 24C, 1A, etc.)
- **PNR** = Passenger Name Record (booking reference)
- Replace ONLY data values, NOT labels like "Flight:", "Terminal:", "Gate:", etc.
- Keep exact spacing, line breaks, and formatting from the original email
- Each placeholder should appear ONLY ONCE in the template
- If a value appears multiple times, replace only the FIRST occurrence
- Never place placeholders back-to-back; keep literal separators in between
- Never map uncertain dense table rows by guessing column positions
- Ignore legal/policy/disclaimer sections unless they contain a core booking value with explicit label
- Keep the template provider-agnostic: work for airlines/OTAs (IndiGo, Air India, SpiceJet, EaseMyTrip, MakeMyTrip, Goibibo, etc.)

================================
OUTPUT FORMAT
================================

Return JSON with a single field "template" containing the annotated email text:

{
  "template": "annotated email text here..."
}

No markdown, no explanation, just JSON.

================================
SCHEMA FIELDS
================================

{{SCHEMA_FIELDS}}

================================
EMAIL TEXT
================================

{{EMAIL_BODY}}

================================
END
===`;
