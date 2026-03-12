# Email Normalizer Service

A clean, production-ready service that normalizes raw Gmail API responses into a simple, readable structure.

## Purpose

This service **ONLY** performs email cleanup and normalization. It does NOT:
- Extract booking information
- Detect providers
- Download PDF attachments
- Make LLM calls
- Perform any business logic

## Folder Structure

```
src/email-normalizer/
├── types/
│   └── email.types.ts          # TypeScript interfaces
├── utils/
│   ├── header-extractor.ts     # Extract email headers
│   ├── base64-decoder.ts       # Decode base64 & quoted-printable
│   ├── body-extractor.ts       # Recursively extract text/HTML bodies
│   ├── html-cleaner.ts         # Clean HTML (remove scripts, styles, Gmail wrappers)
│   └── attachment-extractor.ts # Extract attachment metadata
├── services/
│   └── email-normalizer.service.ts  # Main normalization logic
├── controllers/
│   └── normalizer.controller.ts     # HTTP request handler
├── routes/
│   └── normalizer.routes.ts         # Express routes
├── index.ts                    # Public exports
└── README.md                   # This file
```

## Usage

### As a Service (Programmatic)

```typescript
import { normalizeGmailEmail } from './email-normalizer';

const rawEmail = /* Gmail API response */;
const normalized = normalizeGmailEmail(rawEmail);

console.log(normalized);
// {
//   messageId: "19cde6a51813da2b",
//   threadId: "19cb55d5e509d84c",
//   subject: "MakeMyTrip bus e-ticket...",
//   from: "khattasatyam@gmail.com",
//   to: "satyamkhatta96@gmail.com",
//   date: "Thu, 12 Mar 2026 01:10:21 +0530",
//   textBody: "Decoded plain text...",
//   htmlBody: "Cleaned HTML...",
//   attachments: [
//     {
//       filename: "ticket.pdf",
//       mimeType: "application/pdf",
//       attachmentId: "ANGjdJ80EQnxv72...",
//       size: 43638
//     }
//   ]
// }
```

### As an API Endpoint

**Endpoint**: `POST /email/normalize`

**Request Body**:
```json
{
  "rawEmail": { /* Gmail API response */ },
  "includeRaw": false  // Optional: include raw email in response
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "messageId": "...",
    "threadId": "...",
    "subject": "...",
    "from": "...",
    "to": "...",
    "date": "...",
    "textBody": "...",
    "htmlBody": "...",
    "attachments": [...]
  }
}
```

## How It Works

### 1. Header Extraction
Extracts key headers (case-insensitive):
- `Subject`
- `From`
- `To`
- `Date`

### 2. Body Extraction (Recursive)
- Traverses nested `payload.parts` structure
- Finds `text/plain` → `textBody`
- Finds `text/html` → `htmlBody`
- Decodes base64 and URL-safe base64
- Handles quoted-printable encoding

### 3. HTML Cleanup
Removes:
- `<style>` tags
- `<script>` tags
- Gmail wrapper classes (`gmail_quote`, `gmail_extra`, etc.)
- Excessive whitespace

### 4. Attachment Extraction
Collects metadata for non-text parts:
- `filename`
- `mimeType`
- `attachmentId` (for later download)
- `size`

## Testing

### Test with your sample email:

```bash
curl -X POST http://localhost:3000/email/normalize \
  -H "Content-Type: application/json" \
  -d @logs/gmail_satyamkhatta96_gmail.com_19cde6a51813da2b.json
```

### Test with includeRaw flag:

```bash
curl -X POST http://localhost:3000/email/normalize \
  -H "Content-Type: application/json" \
  -d '{
    "rawEmail": { /* your email */ },
    "includeRaw": true
  }'
```

## Output Format

```typescript
interface NormalizedEmail {
  messageId: string;
  threadId: string;
  subject: string;
  from: string;
  to: string;
  date: string;
  textBody?: string;
  htmlBody?: string;
  attachments: NormalizedAttachment[];
  raw?: any;  // Only if includeRaw=true
}

interface NormalizedAttachment {
  filename: string;
  mimeType: string;
  attachmentId: string;
  size?: number;
}
```

## Key Features

✅ **Recursive traversal** - Handles deeply nested multipart emails  
✅ **Base64 decoding** - Supports standard and URL-safe base64  
✅ **Quoted-printable** - Decodes quoted-printable encoding  
✅ **HTML cleanup** - Removes scripts, styles, Gmail wrappers  
✅ **Attachment metadata** - Extracts without downloading  
✅ **Type-safe** - Full TypeScript support  
✅ **Clean code** - Small, focused files (~50 lines each)  

## Next Steps

After normalization, you can:
1. **Store** the normalized email in your database
2. **Pass to booking extractor** for travel data extraction
3. **Download attachments** using the `attachmentId`
4. **Parse PDFs** for additional information
5. **Feed to LLM** for intelligent processing

## Notes

- This service is **provider-agnostic** at the output level
- Input is Gmail-specific, but you can create similar adapters for Outlook
- No external dependencies beyond Node.js built-ins
- Production-ready error handling included
