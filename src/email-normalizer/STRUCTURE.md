# Email Normalizer - File Structure

```
src/email-normalizer/
│
├── types/
│   └── email.types.ts                    [60 lines]
│       ├── NormalizedEmail interface
│       ├── NormalizedAttachment interface
│       ├── GmailHeader interface
│       ├── GmailMessagePart interface
│       └── GmailMessage interface
│
├── utils/
│   ├── header-extractor.ts               [17 lines]
│   │   └── extractHeaders() - Extract subject, from, to, date
│   │
│   ├── base64-decoder.ts                 [27 lines]
│   │   ├── decodeBase64() - URL-safe base64 decoder
│   │   ├── isQuotedPrintable() - Check encoding type
│   │   └── decodeQuotedPrintable() - Decode quoted-printable
│   │
│   ├── body-extractor.ts                 [49 lines]
│   │   └── extractBodies() - Recursive traversal for text/HTML
│   │
│   ├── html-cleaner.ts                   [19 lines]
│   │   └── cleanHtml() - Remove scripts, styles, Gmail wrappers
│   │
│   └── attachment-extractor.ts           [38 lines]
│       └── extractAttachments() - Collect attachment metadata
│
├── services/
│   └── email-normalizer.service.ts       [30 lines]
│       ├── normalizeGmailEmail() - Main normalization function
│       └── normalizeGmailEmailWithRaw() - Include raw email
│
├── controllers/
│   └── normalizer.controller.ts          [32 lines]
│       └── normalizeEmailHandler() - HTTP request handler
│
├── routes/
│   └── normalizer.routes.ts              [9 lines]
│       └── POST /normalize endpoint
│
├── index.ts                              [4 lines]
│   └── Public exports
│
├── README.md                             [Documentation]
└── STRUCTURE.md                          [This file]
```

## File Responsibilities

### Types Layer
- **email.types.ts**: All TypeScript interfaces and types

### Utils Layer (Pure Functions)
- **header-extractor.ts**: Header parsing logic
- **base64-decoder.ts**: Encoding/decoding utilities
- **body-extractor.ts**: Recursive body extraction
- **html-cleaner.ts**: HTML sanitization
- **attachment-extractor.ts**: Attachment metadata collection

### Service Layer
- **email-normalizer.service.ts**: Orchestrates all utils to normalize email

### Controller Layer
- **normalizer.controller.ts**: Handles HTTP requests/responses

### Route Layer
- **normalizer.routes.ts**: Express route definitions

## Design Principles

✅ **Single Responsibility** - Each file has one clear purpose  
✅ **Small Files** - No file exceeds 60 lines  
✅ **Pure Functions** - Utils have no side effects  
✅ **Type Safety** - Full TypeScript coverage  
✅ **Easy Testing** - Each util can be tested independently  
✅ **No Dependencies** - Only Node.js built-ins used  

## Data Flow

```
Raw Gmail Email (JSON)
    ↓
[header-extractor] → Extract metadata
    ↓
[body-extractor] → Recursively find text/HTML parts
    ↓
[base64-decoder] → Decode content
    ↓
[html-cleaner] → Sanitize HTML
    ↓
[attachment-extractor] → Collect attachment metadata
    ↓
Normalized Email (Clean JSON)
```

## Total Lines of Code

- Types: ~60 lines
- Utils: ~150 lines (5 files)
- Service: ~30 lines
- Controller: ~32 lines
- Routes: ~9 lines
- **Total: ~281 lines** (excluding comments/blank lines)

## Usage Example

```typescript
import { normalizeGmailEmail } from './email-normalizer';

const normalized = normalizeGmailEmail(rawGmailResponse);
// Clean, normalized output ready for downstream processing
```
