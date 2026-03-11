# 📧 Email Ingestion — Phase 1 & Phase 2

This document explains the initial integration flow for connecting user mailboxes and enabling real-time email notifications.

---

# 🧭 Overview

The email ingestion system begins with two foundational phases:

1️⃣ **Phase 1 — Mailbox Authentication (OAuth / SSO)**
2️⃣ **Phase 2 — Mailbox Subscription Setup (Webhook / Push Notifications)**

These phases allow our backend to securely access user mailboxes and receive notifications when new emails arrive.

---

# 🟢 Phase 1 — Mailbox Authentication (OAuth)

## 🎯 Objective

Obtain secure permission to access a user’s mailbox (Gmail or Outlook) without storing credentials.

## 🪜 Flow

1. User installs the browser extension or opens the web app.
2. User clicks **Connect Gmail** or **Connect Outlook**.
3. User is redirected to the provider’s OAuth consent screen.
4. User logs in and grants permissions.
5. Provider redirects back to our backend callback URL with an **authorization code**.
6. Backend exchanges the code for:

   * Access token
   * Refresh token
7. Tokens are encrypted and stored securely in the database.

## 🔐 Stored Data

* `tenantId`
* `userId`
* `provider` (gmail / outlook)
* `mailboxId`
* `encryptedAccessToken`
* `encryptedRefreshToken`
* `tokenExpiry`

## 🧠 Result

Our backend now has permission to:

* Read emails
* Fetch attachments
* Create subscriptions

No user password is stored.

---

# 🔵 Phase 2 — Mailbox Subscription Setup

## 🎯 Objective

Enable real-time notifications when new emails arrive in the connected mailbox.

Without this phase, the system would need to poll the mailbox repeatedly.

## 🪜 Flow

1. After OAuth completes, the backend calls the provider API to create a subscription.

2. The request instructs the provider:

   > “Notify our webhook when a new email arrives in this mailbox.”

3. Provider validates:

   * Access token
   * Permissions
   * Webhook URL (must be HTTPS)

4. Provider stores subscription internally with:

   * Mailbox reference
   * Webhook URL
   * Event type (new email)
   * Expiration timestamp
   * Subscription ID

5. Provider returns subscription details to backend.

6. Backend stores subscription info in database.

## 🗄️ Stored Subscription Data

* `subscriptionId`
* `mailboxId`
* `provider`
* `expiryTime`
* `status`

---

# 🔔 What Happens After Setup

When a new email arrives:

1. Provider detects active subscription.
2. Provider sends an HTTP POST request to our webhook endpoint.
3. Notification contains:

   * `messageId`
   * `mailboxId`
   * `subscriptionId`

⚠️ The notification does NOT include the full email content.
The backend must fetch the email separately using the message ID.

---

# ⏳ Subscription Expiration & Renewal

Subscriptions are temporary:

* Gmail: ~7 days
* Outlook: 1–3 days

A background job automatically renews subscriptions before expiry.

---

# 🔐 Security Considerations

* Tokens are encrypted at rest.
* Webhook endpoints must be HTTPS.
* Requests from providers are validated.
* Only required OAuth scopes are requested.

---

# ✅ Phase Completion Criteria

Phase 1 and Phase 2 are considered complete when:

✔ Users can connect their mailbox
✔ Tokens are securely stored
✔ Subscription is successfully created
✔ Provider can send webhook notifications

---

# 🧱 Next Phase (Phase 3)

After these phases, the system proceeds to:

➡️ Email ingestion and processing pipeline
➡️ Fetching email content
➡️ Booking data extraction

---

# 📌 Summary

Phase 1 establishes **secure access** to the mailbox.
Phase 2 establishes **real-time communication** between provider and backend.

Together, they form the foundation of the email ingestion platform.

---
