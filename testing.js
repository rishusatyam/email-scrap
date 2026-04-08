function extractWithTemplateEngine({
  text,
  fieldRules,
  schema
}) {

  const result = {};

  // ===============================
  // 🔹 Helper: set nested value
  // ===============================
  function setNested(obj, path, value) {
    const keys = path.split(".");
    let curr = obj;

    keys.forEach((key, i) => {
      if (i === keys.length - 1) {
        curr[key] = value;
      } else {
        if (!curr[key]) curr[key] = {};
        curr = curr[key];
      }
    });
  }

  // ===============================
  // 🔹 Flatten schema paths
  // ===============================
//   function flattenSchema(obj, prefix = "") {
//     let paths = [];

//     for (const key in obj) {
//       const newPath = prefix ? `${prefix}.${key}` : key;

//       if (
//         typeof obj[key] === "object" &&
//         obj[key] !== null &&
//         !Array.isArray(obj[key])
//       ) {
//         paths = paths.concat(flattenSchema(obj[key], newPath));
//       } else {
//         paths.push(newPath);
//       }
//     }

//     return paths;
//   }
function flattenSchema(obj, prefix = "") {
  let paths = [];

  for (const key in obj) {
    const field = obj[key];
    const newPath = prefix ? `${prefix}.${key}` : key;

    // If it's an object with properties → go deeper
    if (field && typeof field === "object" && field.properties) {
      paths = paths.concat(flattenSchema(field.properties, newPath));
    } else {
      paths.push(newPath);
    }
  }

  return paths;
}

  const schemaPaths = flattenSchema(schema.properties);
  // ===============================
  // 🔹 Normalize text
  // ===============================
  const cleanText = text.replace(/\n+/g, " ").toLowerCase();

  // ===============================
  // 🔥 Core extraction (same as before)
  // ===============================
  function extractField(rule) {
    if (!rule) return null;

    const { prev = [], next = [], regex, type, enum: enumVals } = rule;

    for (const p of prev) {
      const idx = cleanText.indexOf(p.toLowerCase());
      if (idx !== -1) {

        let start = idx + p.length;
        let sub = cleanText.slice(start);

        for (const n of next) {
          const nIdx = sub.indexOf(n.toLowerCase());
          if (nIdx !== -1) {
            sub = sub.slice(0, nIdx);
            break;
          }
        }

        if (regex) {
          const match = sub.match(new RegExp(regex, "i"));
          if (match) return match[0];
        }

        return sub.trim().split(" ")[0];
      }
    }

    for (const p of prev) {
      const pattern = new RegExp(
        `${p}[:\\s₹-]*(${regex || ".+?"})`,
        "i"
      );
      const match = cleanText.match(pattern);
      if (match) return match[1];
    }

    if (enumVals) {
      for (const val of enumVals) {
        if (cleanText.includes(val.toLowerCase())) {
          return val;
        }
      }
    }

    if (type === "time") {
      const match = cleanText.match(/\d{1,2}:\d{2}/);
      return match ? match[0] : null;
    }

    if (type === "currency") {
      const match = cleanText.match(/₹\s?(\d+)/);
      return match ? match[1] : null;
    }

    if (type === "name") {
      const match = text.match(/(Mr\.|Ms\.|Mrs\.)\s+[A-Z\s]+/i);
      return match ? match[0].trim() : null;
    }

    if (type === "alphanumeric") {
      const match = cleanText.match(/[A-Z0-9]{5,}/i);
      return match ? match[0] : null;
    }

    return null;
  }

  // ===============================
  // 🔥 MAIN LOOP (SCHEMA DRIVEN)
  // ===============================
  for (const path of schemaPaths) {
    const rule = fieldRules[path]; // map rule to schema field

    const value = extractField(rule);

    setNested(result, path, value !== null ? value : null);
  }

  return result;
}
const fieldRules = {

  // =========================
  // 🔹 BOOKING
  // =========================
  "bookingId": {
    prev: ["booking id"],
    next: [",", "booked on"],
    regex: "[A-Z0-9]{10,}"
  },

  "bookingReference": {
    prev: ["pnr"],
    regex: "[A-Z0-9]{5,}"
  },

  "status": {
    prev: ["booking"],
    enum: ["confirmed", "pending", "cancelled"]
  },

  // =========================
  // 🔹 FLIGHT
  // =========================
  "flight.airline": {
    prev: ["on"],
    next: ["\n"],
    fallbackRegex: "(AIR INDIA|INDIGO|SPICE JET|VISTARA)"
  },

  "flight.flightNumber": {
    regex: "[A-Z]{2}-\\d{2,4}"
  },

  "flight.airlineCode": {
    prev: ["flight"],
    regex: "[A-Z]{2}"
  },

  // =========================
  // 🔹 DEPARTURE
  // =========================
  "departure.airportCode": {
    prev: ["chandigarh"],
    regex: "\\b[A-Z]{3}\\b"
  },

  "departure.scheduledTime": {
    prev: ["ixc"],
    next: ["hrs"],
    regex: "\\d{1,2}:\\d{2}"
  },

  "departure.airport": {
    prev: ["chandigarh airport"],
    next: ["\n"],
    type: "text"
  },

  // =========================
  // 🔹 ARRIVAL
  // =========================
  "arrival.airportCode": {
    prev: ["hrs"],
    regex: "\\b[A-Z]{3}\\b"
  },

  "arrival.scheduledTime": {
    prev: ["delhi"],
    regex: "\\d{1,2}:\\d{2}"
  },

  "arrival.airport": {
    prev: ["indira gandhi international airport"],
    type: "text"
  },

  // =========================
  // 🔹 PASSENGER
  // =========================
  "passenger.name": {
    type: "name"
  },

  "passenger.type": {
    enum: ["Adult", "Child", "Infant"]
  },

  "passenger.ticketNumber": {
    regex: "\\d{3}-\\d{10}"
  },

  "passenger.cabin": {
    enum: ["economy", "business", "first"]
  },

  // =========================
  // 🔹 FARE
  // =========================
  "fare.amount": {
    prev: ["total price"],
    next: ["paid"],
    type: "currency"
  },

  "fare.currency": {
    fallbackRegex: "₹|INR"
  },

  // =========================
  // 🔹 BAGGAGE
  // =========================
  "baggage.checked.weight": {
    prev: ["check-in"],
    next: ["kgs"],
    regex: "\\d+"
  },

  "baggage.cabin.allowance": {
    prev: ["cabin"],
    next: ["kgs"],
    regex: "\\d+"
  },

  // =========================
  // 🔹 METADATA
  // =========================
  "metadata.bookingDate": {
    prev: ["booked on"],
    next: [")"],
    type: "date"
  }
};

const emailText = "Ticket\nHi Ayush, thank you for booking with us. We wish you a pleasant journey!\nBooking Confirmed\nChandigarh - Delhi\nOne way • Wed, 14 August\nBooking ID: NF7A9FMG85274435863, (Booked on 14 August 2024)\nBarcode(s) for your journey Chandigarh-Delhi on AIR INDIA\nAyush Ayush\nWeb Check-in\nManage Booking\nBOOKING DETAILS\nChandigarh - Delhi\nWed, 14 Aug 2024 • Non stop • 1h 0m duration\nAIR INDIA\nAI-464\nPNR64ZGHG\nChandigarh\nIXC 22:45 hrs\nWed, 14 Aug\nChandigarh Airport\n1h 0m\nDelhi\n23:45 hrs DEL\nWed, 14 Aug\nIndira Gandhi International Airport Terminal 3\nComfort\nEconomy\nRegular Fare\nCheck-in: 15 Kgs per Adult\nCabin: 7 Kgs per Adult\nTRAVELLERSEATMEALE-TICKET NO\nMR. AYUSH AYUSH Adult\n098-3300205657\n098-3300205657\nPAYMENT INFORMATION\nTotal Price₹ 3631Paid by kotak811₹ 3631\nYour invoice will be available after your travel on My Trips\nDIGI YATRA\nAvoid Long Queues at the Airport with Digi\nYatra\nUse Digi\nYatra — the Ministry of Civil Aviation’s mobile app to enjoy a hassle-free airport experience, for your upcoming flight. It enables you to activate face scan for check-in at the airport with 2 easy steps: Step 1: Pre-verifying your identity using Aadhaar Card details\nStep 2: Updating your upcoming flight’s boarding pass\nKnow More\nIMPORTANT INFORMATION\nFor a convenient travel, follow these guidelines\n•Check-in Time : We advise you to reach the airport atleast 3 hours before departure. Check-in counter generally closes 60 minutes before scheduled departure. It may vary from airline to airline and so it is advisable to check with the airline once.•DGCA passenger charter : Please refer to passenger charter by clicking Here•Check travel guidelines and baggage information below: : Carry no more than 1 check-in baggage and 1 hand baggage per passenger. If violated, airline may levy extra charges.•Unaccompanied Minors Travelling: : An unaccompanied minor usually refers to a child traveling without an adult aged 18 or older.Please check with the airline for their rules and regulations regarding unaccompanied minors, as these can differ between airlines.•Valid ID proof needed : Carry a valid photo identification proof (Driver Licence, Aadhar Card, Pan Card or any other Government recognised photo identification)•Please do not share your personal banking and security details like passwords, CVV, etc. with any third person or party claiming to represent Make\nMy\nTrip. For any query, please reach out to Make\nMy\nTrip on our official customer care number.\nYou can view all cancellation, date change and baggage related information here , If you want to manage your booking, you visit My\nTrips section using this link\nCONTACT US\nMake\nMy\nTrip Support:\n+91124 4628747 / +91124 5045105 (India Number)\nAIR INDIA Support:\n18602331407\nFollow us: Note: Please do not reply to this e-mail. This was sent from an automated mail service that cannot accept incoming e-mails."

const schema = {
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "https://schemas.travlrid.com/flight-booking/v1",
  "title": "Flight Booking",
  "description": "Flight booking with complete travel details",
  "type": "object",
  "required": ["bookingId", "bookingType", "profile_id"],
  "properties": {
    "profile_id": {
      "type": "string",
      "description": "Profile ID this segment belongs to"
    },
    "bookingId": {
      "type": "string",
      "description": "Unique identifier for the flight booking"
    },
    "bookingType": {
      "type": "string",
      "enum": ["flight"],
      "default": "flight"
    },
    "bookingReference": {
      "type": "string",
      "description": "Booking confirmation number (PNR)"
    },
    "status": {
      "type": "string",
      "enum": ["confirmed", "pending", "cancelled", "completed"],
      "default": "confirmed"
    },
    "flight": {
      "type": "object",
      "properties": {
        "airline": {
          "type": "string",
          "description": "Airline name"
        },
        "airlineCode": {
          "type": "string",
          "description": "IATA airline code"
        },
        "flightNumber": {
          "type": "string"
        },
        "operatingAirline": {
          "type": "string",
          "description": "Operating carrier if codeshare"
        }
      },
      "required": ["airline", "airlineCode", "flightNumber"]
    },
    "departure": {
      "type": "object",
      "properties": {
        "airport": {
          "type": "string",
          "description": "Airport name"
        },
        "airportCode": {
          "type": "string",
          "description": "IATA airport code"
        },
        "terminal": {
          "type": "string"
        },
        "gate": {
          "type": "string"
        },
        "scheduledTime": {
          "type": "string",
          "format": "date-time"
        },
        "actualTime": {
          "type": "string",
          "format": "date-time"
        }
      },
      "required": ["airport", "airportCode", "scheduledTime"]
    },
    "arrival": {
      "type": "object",
      "properties": {
        "airport": {
          "type": "string",
          "description": "Airport name"
        },
        "airportCode": {
          "type": "string",
          "description": "IATA airport code"
        },
        "terminal": {
          "type": "string"
        },
        "gate": {
          "type": "string"
        },
        "scheduledTime": {
          "type": "string",
          "format": "date-time"
        },
        "actualTime": {
          "type": "string",
          "format": "date-time"
        }
      },
      "required": ["airport", "airportCode", "scheduledTime"]
    },
    "passenger": {
      "type": "object",
      "properties": {
        "name": {
          "type": "string"
        },
        "ticketNumber": {
          "type": "string"
        },
        "seatNumber": {
          "type": "string"
        },
        "cabin": {
          "type": "string",
          "enum": ["economy", "premium_economy", "business", "first"]
        },
        "boardingGroup": {
          "type": "string"
        }
      }
    },
    "fare": {
      "type": "object",
      "properties": {
        "amount": {
          "type": "number"
        },
        "currency": {
          "type": "string"
        },
        "fareClass": {
          "type": "string"
        },
        "fareType": {
          "type": "string",
          "enum": ["economy", "business", "first", "premium_economy"]
        },
        "taxes": {
          "type": "number"
        },
        "fees": {
          "type": "number"
        }
      }
    },
    "baggage": {
      "type": "object",
      "properties": {
        "checked": {
          "type": "object",
          "properties": {
            "allowance": {
              "type": "integer",
              "description": "Number of bags"
            },
            "weight": {
              "type": "integer",
              "description": "Weight limit in kg"
            }
          }
        },
        "cabin": {
          "type": "object",
          "properties": {
            "allowance": {
              "type": "integer"
            },
            "dimensions": {
              "type": "string"
            }
          }
        }
      }
    },
    "services": {
      "type": "object",
      "properties": {
        "meal": {
          "type": "string"
        },
        "entertainment": {
          "type": "boolean"
        },
        "wifi": {
          "type": "boolean"
        },
        "specialRequests": {
          "type": "array",
          "items": {
            "type": "string"
          }
        }
      }
    },
    "metadata": {
      "type": "object",
      "properties": {
        "source": {
          "type": "string",
          "description": "Booking source (GDS, OBT, direct)"
        },
        "bookingDate": {
          "type": "string",
          "format": "date-time"
        },
        "tags": {
          "type": "array",
          "items": {
            "type": "string"
          }
        }
      },
      "additionalProperties": true
    },
    "createdAt": {
      "type": "string",
      "format": "date-time"
    },
    "updatedAt": {
      "type": "string",
      "format": "date-time"
    }
  },
  "additionalProperties": false
}

const output = extractWithTemplateEngine({
  text: emailText,
//   template: template, // optional (not heavily used yet)
  fieldRules: fieldRules,
  schema: schema
});

console.log(output);