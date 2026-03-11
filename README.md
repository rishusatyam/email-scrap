# Email Scraping Backend - Phase 1 (OAuth Authentication)

Clean, simple backend for connecting Gmail and Outlook mailboxes via OAuth.

## 📁 Project Structure

```
src/
├── auth/                      # Phase 1: OAuth authentication
│   ├── controllers/
│   │   └── oauth.controller.ts    # Handle OAuth start & callback
│   ├── services/
│   │   ├── gmail.service.ts       # Gmail OAuth logic
│   │   ├── outlook.service.ts     # Outlook OAuth logic
│   │   └── mailbox.service.ts     # Save/retrieve mailboxes
│   ├── routes/
│   │   └── auth.routes.ts         # Auth endpoints
│   └── index.ts
│
├── shared/                    # Common utilities
│   ├── db.ts                  # Prisma client (single instance)
│   ├── encryption.ts          # Encrypt/decrypt tokens
│   └── config.ts              # Environment config
│
├── app.ts                     # Express app setup
└── server.ts                  # Entry point
```

## 🚀 Setup

### 1. Install dependencies
```bash
npm install
```

### 2. Configure environment
Copy `.env.example` to `.env` and fill in your OAuth credentials:

```bash
cp .env.example .env
```

Required variables:
- `DATABASE_URL` - PostgreSQL connection string
- `TOKEN_ENCRYPTION_KEY` - 32-character encryption key
- Gmail OAuth: `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REDIRECT_URI`
- Outlook OAuth: `OUTLOOK_CLIENT_ID`, `OUTLOOK_CLIENT_SECRET`, `OUTLOOK_REDIRECT_URI`

### 3. Setup database
```bash
npm run prisma:generate
npm run prisma:migrate
```

### 4. Run server
```bash
npm run dev
```

## 📡 API Endpoints

### Start OAuth Flow
```
GET /auth/gmail/start
GET /auth/outlook/start
```
Redirects user to provider OAuth consent screen.

### OAuth Callback
```
GET /auth/gmail/callback?code=...
GET /auth/outlook/callback?code=...
```
Handles OAuth callback, exchanges code for tokens, saves encrypted tokens to database.

**Response:**
```json
{
  "status": "connected",
  "provider": "gmail",
  "email": "user@example.com"
}
```

## 🔐 Security

- Tokens encrypted with **AES-256-GCM** before storage
- Single Prisma instance for database
- Minimal OAuth scopes requested
- HTTPS required for production

## 🗄️ Database Schema

**mailboxes** table stores:
- `provider` - gmail or outlook
- `emailAddress` - user's email
- `encryptedAccessToken` - encrypted OAuth access token
- `encryptedRefreshToken` - encrypted OAuth refresh token
- `iv` - initialization vector for decryption
- `authTag` - authentication tag for decryption
- `tokenExpiry` - when token expires

## 🛠️ Development Commands

```bash
npm run dev              # Start dev server with hot reload
npm run build            # Build for production
npm run start            # Run production build
npm run prisma:studio    # Open Prisma Studio (DB GUI)
```

## ✅ Phase 1 Complete When

- ✔ Users can connect Gmail/Outlook
- ✔ Tokens stored encrypted
- ✔ Success response returned

## 🔜 Next Phases

- Phase 2: Webhook subscriptions
- Phase 3: Email ingestion & parsing
