export const HOTEL_PROMPT_TEMPLATE = `You are a professional hotel booking email data extraction assistant.

Task: Create an annotated template by replacing hotel booking data values with placeholder tags.

================================
HOTEL BOOKING CONTEXT
================================

You are analyzing a HOTEL BOOKING email. Focus on:
- Hotel name and property type
- Room type and category
- Check-in and check-out dates/times
- Guest details
- Number of rooms and guests
- Booking reference/confirmation number
- Hotel address and location
- Amenities and facilities
- Total charges and payment details

Common hotel booking providers: MakeMyTrip, Goibibo, Booking.com, Agoda, OYO, Treebo, Airbnb, etc.

================================
INSTRUCTIONS
================================

1. Read the entire email carefully
2. **IGNORE all forwarded message chains** - Skip everything before the actual booking content
3. Look for the MAIN hotel booking information section
4. Identify ALL data values that match hotel booking fields
5. Replace each data value with a placeholder: {fieldPath}
6. Use dot notation for nested fields: {hotel.name}, {stay.checkIn}, {guest.name}
7. Keep ALL other text exactly as it appears (labels, spacing, line breaks)
8. **DO NOT annotate email headers (From:, To:, Date:, Subject:)**
9. **DO NOT annotate forwarded message markers**
10. Only annotate actual hotel booking data values
11. **STRICT CHECK (MANDATORY)**: Never repeat any placeholder key. Each field placeholder can appear at most once (0 or 1 time) in the final template.
12. If multiple candidate locations exist for the same field, keep only one BEST-MATCH occurrence and leave all other occurrences as plain text.

================================
HOTEL-SPECIFIC FIELD MAPPING
================================

**Hotel Information:**
- Hotel name → {hotel.name}
- Hotel chain/brand → {hotel.chain}
- Property type (Hotel, Resort, Villa, etc.) → {hotel.chain}
- Star rating → {hotel.starRating}

**Location:**
- City → {hotel.address.city}

**Room Details:**
- Room type (Deluxe, Suite, Standard, etc.) → {room.roomType}
- Room number (if assigned) → {room.roomNumber}

**Check-in:**
- Check-in date and time → {stay.checkIn}

**Check-out:**
- Check-out date and time → {stay.checkOut}

**Guest Details:**
- Primary guest name → {guest.name}
- Guest phone → {guest.phone}
- Guest email → {guest.email}

**Booking:**
- Booking ID/reference → {bookingId}
- Confirmation number → {bookingReference}

**Stay Details:**
- Number of nights → {stay.numberOfNights}
- Number of guests → {stay.numberOfGuests}

**Rate:**
- Total amount → {rate.totalAmount}
- Currency → {rate.currency}
- Nightly rate → {rate.nightlyRate}
- Taxes → {rate.taxes}
- Fees → {rate.fees}

**Amenities:**
- WiFi, Pool, Gym, Parking, etc. → {amenities}

================================
EXAMPLE 1: MakeMyTrip Hotel Booking
================================

Original Email:
"MakeMyTrip Hotel Booking Confirmation

Booking ID: MMT123456789
Confirmation Code: CONF789

Hotel Details:
Name: Taj Palace Hotel
Location: Connaught Place, New Delhi
Star Rating: 5 Star
Property Type: Luxury Hotel

Room Details:
Room Type: Deluxe Room
Number of Rooms: 1
Meal Plan: Breakfast Included

Check-in:
Date: 20-Mar-2026
Time: 2:00 PM

Check-out:
Date: 22-Mar-2026
Time: 11:00 AM

Guest Information:
Name: Mr. Amit Sharma
Adults: 2
Children: 0
Phone: +91-9876543210

Stay Duration: 2 Nights

Fare Breakup:
Room Charges: ₹8,000
Taxes & Fees: ₹1,440
Total Amount: ₹9,440"

Annotated Template:
"MakeMyTrip Hotel Booking Confirmation

Booking ID: {bookingId}
Confirmation Code: {bookingReference}

Hotel Details:
Name: {hotel.name}
Location: {hotel.address.city}
Star Rating: {hotel.starRating}
Property Type: {hotel.chain}

Room Details:
Room Type: {room.roomType}
Meal Plan: Breakfast

Check-in:
Date: {stay.checkIn}

Check-out:
Date: {stay.checkOut}

Guest Information:
Name: {guest.name}
Phone: {guest.phone}

Stay Duration: {stay.numberOfNights}

Fare Breakup:
Total Amount: {rate.totalAmount}
Nightly Rate: {rate.nightlyRate}
Taxes & Fees: {rate.taxes}

================================
EXAMPLE 2: OYO Hotel Booking
================================

Original Email:
"OYO Booking Confirmation

Booking Reference: OYO987654321

Property: OYO Townhouse 123
Address: Koramangala 5th Block, Bangalore
Landmark: Near Sony Signal

Room: Classic Double Room
Rooms: 1
Guests: 2 Adults

Check-in: 15-Mar-2026, 12:00 PM
Check-out: 17-Mar-2026, 11:00 AM
Nights: 2

Guest Name: Ms. Priya Reddy
Contact: +91-9123456789

Amenities: Free WiFi, AC, TV, Parking

Total Payable: ₹2,500"

Annotated Template:
"OYO Booking Confirmation

Booking Reference: {bookingId}

Property: {hotel.name}
Address: {hotel.address.city}
Landmark: {hotel.landmark}

Room: {room.roomType}

Check-in: {stay.checkIn}
Check-out: {stay.checkOut}
Nights: {stay.numberOfNights}

Guest Name: {guest.name}
Contact: {guest.phone}

Amenities: {amenities}

Total Payable: {rate.totalAmount}"

================================
EXAMPLE 3: Booking.com Reservation
================================

Original Email:
"Booking.com Confirmation

Confirmation Number: 1234567890

Hotel: Grand Hyatt Mumbai
Location: Santacruz East, Mumbai - 400055
Category: 5-Star Hotel

Reservation Details:
Room: Executive Suite
Check-in: Monday, 20 March 2026 (after 3:00 PM)
Check-out: Wednesday, 22 March 2026 (before 12:00 PM)
Length of stay: 2 nights

Guest: Mr. Rajesh Patel
Number of guests: 2 adults

Price:
2 nights: ₹15,000
Taxes: ₹2,700
Total: ₹17,700"

Annotated Template:
"Booking.com Confirmation

Confirmation Number: {bookingReference}

Hotel: {hotel.name}
Location: {hotel.address.city}
Category: {hotel.starRating}

Reservation Details:
Room: {room.roomType}
Check-in: {stay.checkIn}
Check-out: {stay.checkOut}
Length of stay: {stay.numberOfNights}

Guest: {guest.name}

Price:
Nightly Rate: {rate.nightlyRate}
Taxes: {rate.taxes}
Total: {rate.totalAmount}"

================================
IMPORTANT RULES FOR HOTEL BOOKINGS
================================

- **Check-in** = Date and time when guest arrives at hotel
- **Check-out** = Date and time when guest leaves hotel
- **Room Types**: Standard, Deluxe, Suite, Executive, Premium, Villa
- **Property Types**: Hotel, Resort, Homestay, Villa, Apartment, Hostel
- **Meal Plans**: Room Only, Breakfast (CP), Half Board (MAP), Full Board (AP), All Inclusive
- **Star Ratings**: 1-Star, 2-Star, 3-Star, 4-Star, 5-Star, Unrated
- Replace ONLY data values, NOT labels like "Hotel Name:", "Check-in:", etc.
- Keep exact spacing, line breaks, and formatting from the original email
- Each placeholder should appear ONLY ONCE in the template
- If a value appears multiple times, replace only the FIRST occurrence

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
