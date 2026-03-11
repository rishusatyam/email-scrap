# 🔐 Redirect URI Cheat Sheet

## 📌 What You Need to Fill In

### Google Redirect URI
```
LOCAL:  http://localhost:3000/auth/gmail/callback
PROD:   https://your-domain.com/auth/gmail/callback
```

### Microsoft Redirect URI
```
LOCAL:  http://localhost:3000/auth/outlook/callback
PROD:   https://your-domain.com/auth/outlook/callback
```

---

## 🟢 Step-by-Step: Add to Google Console

### 1. Go to Google Cloud Console
```
https://console.cloud.google.com/
```

### 2. Select/Create Project
```
Project Selector (top left) → NEW PROJECT
Name: "Email Scraping"
```

### 3. Enable Gmail API
```
Left Menu → APIs & Services → Library
Search "Gmail API"
Click → ENABLE
```

### 4. Create OAuth Credentials
```
Left Menu → APIs & Services → Credentials
+ CREATE CREDENTIALS → OAuth 2.0 Client ID
```

### 5. Configure Consent Screen (if first time)
```
Choose: External
CREATE
App name: "Email Scraping"
User support email: your-email@gmail.com
Developer contact: your-email@gmail.com
SAVE AND CONTINUE → Skip scopes
Add Test User: your-email@gmail.com
SAVE AND CONTINUE
```

### 6. Add Redirect URI
```
Back to Credentials
+ CREATE CREDENTIALS → OAuth 2.0 Client ID
Application type: Web application
Name: "Email Scraping Backend"

AUTHORIZED REDIRECT URIs:
Click ADD URI → paste:
http://localhost:3000/auth/gmail/callback
```

### 7. Copy to .env
```
✓ GMAIL_CLIENT_ID=1234567890-xxxx.apps.googleusercontent.com
✓ GMAIL_CLIENT_SECRET=GOCSPX-xxxx
```

---

## 🔵 Step-by-Step: Add to Microsoft/Azure Portal

### 1. Go to Azure Portal
```
https://entra.microsoft.com/
```

### 2. Register New Application
```
Left Menu → Applications → App registrations
+ New registration
Name: "Email Scraping"
Supported account types: [Select all options]
REGISTER
```

### 3. Add Redirect URI
```
Left Menu → Authentication
+ Add a platform
Choose: Web
Redirect URIs: click ADD URI → paste:
http://localhost:3000/auth/outlook/callback

SAVE
```

### 4. Create Client Secret
```
Left Menu → Certificates & secrets
+ New client secret
Description: "Email Scraping Secret"
Expires: 24 months
ADD

⚠️ IMMEDIATELY COPY THE VALUE
(If you leave, you can't see it again)
```

### 5. Add Permissions
```
Left Menu → API permissions
+ Add a permission
Choose: Microsoft Graph
Select: Delegated permissions

Search and add:
✓ Mail.Read
✓ offline_access

SAVE
```

### 6. Copy to .env
```
✓ OUTLOOK_CLIENT_ID=12345678-1234-1234-1234-123456789012
✓ OUTLOOK_CLIENT_SECRET=abc~xyz~... (the value you copied)
```

---

## ✅ Verify in .env

```env
# Gmail
GMAIL_CLIENT_ID=1234567890-xxxx.apps.googleusercontent.com
GMAIL_CLIENT_SECRET=GOCSPX-xxxx
GMAIL_REDIRECT_URI=http://localhost:3000/auth/gmail/callback

# Outlook
OUTLOOK_CLIENT_ID=12345678-1234-1234-1234-123456789012
OUTLOOK_CLIENT_SECRET=abc~xyz~...
OUTLOOK_REDIRECT_URI=http://localhost:3000/auth/outlook/callback

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/email_scraping

# Encryption
TOKEN_ENCRYPTION_KEY=12345678901234567890123456789012
```

---

## ⚠️ Common Mistakes

### ❌ Wrong Redirect URI
```
❌ http://localhost:3000/auth/gmail/callback/
❌ http://localhost:3000/auth/gmail/callback?state=
❌ https://localhost:3000/auth/gmail/callback
❌ http://127.0.0.1:3000/auth/gmail/callback
```

### ✅ Correct Format
```
✅ http://localhost:3000/auth/gmail/callback
✅ http://localhost:3000/auth/outlook/callback
```

---

## 🧪 Test It Works

### 1. Start Backend
```bash
npm run dev
# Backend on http://localhost:3000
```

### 2. Load Extension
```
chrome://extensions/ → Load unpacked → extension/
```

### 3. Test Gmail
```
Click extension → Connect Gmail
↓
Popup opens Google login
↓
Enter credentials
↓
Click ALLOW
↓
Popup closes
↓
Extension shows "Connected!" ✓
```

### 4. Test Outlook
```
Click extension → Disconnect
Click extension → Connect Outlook
↓
Popup opens Microsoft login
↓
Enter credentials
↓
Click ALLOW
↓
Popup closes
↓
Extension shows "Connected!" ✓
```

### 5. Verify Database
```bash
npm run prisma:studio
# Opens: http://localhost:5555
# See mailbox record with encrypted tokens
```

---

## 📱 Production Checklist

When deploying to production, update:

### Google Console
```
AUTHORIZED REDIRECT URIs:
✓ http://localhost:3000/auth/gmail/callback       (keep for dev)
✓ https://your-domain.com/auth/gmail/callback     (add)
```

### Microsoft Portal
```
Redirect URIs:
✓ http://localhost:3000/auth/outlook/callback      (keep for dev)
✓ https://your-domain.com/auth/outlook/callback    (add)
```

### Backend .env
```
GMAIL_REDIRECT_URI=https://your-domain.com/auth/gmail/callback
OUTLOOK_REDIRECT_URI=https://your-domain.com/auth/outlook/callback
```

### Extension (popup.js)
```javascript
const BACKEND_URL = 'https://your-domain.com';  // Change from localhost
```

---

## 🎯 That's It!

Once you:
1. ✅ Add redirect URIs to Google & Microsoft
2. ✅ Copy credentials to `.env`
3. ✅ Start backend: `npm run dev`
4. ✅ Load extension in Chrome
5. ✅ Test OAuth flow

Everything should work! 🚀

**Redirect URIs are the KEY** - they tell OAuth providers where to send users back after login.

---

## 📞 Still Confused?

1. **Check logs:**
   ```bash
   npm run dev
   # Look for errors in console
   ```

2. **Check console:**
   ```
   chrome://extensions/ → Details → Background page
   Look for errors in DevTools
   ```

3. **Check redirect URI exactly:**
   - No trailing slash
   - No extra query params
   - Matches EXACTLY what's in Google/Microsoft

That fixes 90% of OAuth issues! ✅
