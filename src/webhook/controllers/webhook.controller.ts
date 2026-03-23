import { Request, Response } from 'express';
import { enqueueGmailHistory, enqueueEmailFetch } from '../queues/queue';
import { findSubscriptionById } from '../dao/subscription.dao';
import { findMailboxByEmail } from '../../auth/dao/mailbox.dao';

// ─── Gmail Webhook ────────────────────────────────────────────────────────────
// Google Pub/Sub pushes a base64-encoded payload containing emailAddress + historyId
export const handleGmailWebhook = async (req: Request, res: Response) => {
  // Always ack immediately — Pub/Sub will retry if we return non-200
  res.sendStatus(200);

  try {
    console.log('[Webhook:Gmail] Notification received');
    console.log('[Webhook:Gmail] Raw body:', JSON.stringify(req.body, null, 2));

    // 1. Validate request body
    const body = req.body;
    if (!body || typeof body !== 'object') {
      console.warn('[Webhook:Gmail] Empty or invalid request body');
      return;
    }
    if (!body.message) {
      console.warn('[Webhook:Gmail] Missing message object in body');
      return;
    }
    if (!body.message.data || typeof body.message.data !== 'string' || body.message.data.trim() === '') {
      console.warn('[Webhook:Gmail] Missing or empty message.data');
      return;
    }

    console.log(`[Webhook:Gmail] Pub/Sub messageId=${body.message.messageId} | subscription=${body.subscription}`);

    // 2. Base64-decode the Pub/Sub data payload
    let decoded: string;
    try {
      decoded = Buffer.from(body.message.data, 'base64').toString('utf-8');
      console.log(`[Webhook:Gmail] Decoded payload: ${decoded}`);
    } catch {
      console.warn('[Webhook:Gmail] Failed to base64-decode message.data:', body.message.data);
      return;
    }

    // 3. Parse JSON
    let payload: { emailAddress?: string; historyId?: string | number };
    try {
      payload = JSON.parse(decoded);
    } catch {
      console.warn('[Webhook:Gmail] Failed to parse decoded payload as JSON:', decoded);
      return;
    }

    const emailAddress = payload.emailAddress;
    // historyId can come as number from Google — normalize to string
    const historyId = payload.historyId != null ? String(payload.historyId) : undefined;

    // 4. Validate required fields
    if (!emailAddress || typeof emailAddress !== 'string' || !emailAddress.includes('@')) {
      console.warn('[Webhook:Gmail] Invalid or missing emailAddress in payload:', payload);
      return;
    }
    if (!historyId) {
      console.warn('[Webhook:Gmail] Missing historyId in payload:', payload);
      return;
    }

    console.log(`[Webhook:Gmail] emailAddress=${emailAddress} | historyId=${historyId}`);

    // 5. Get mailbox to retrieve mailboxId
    const mailbox = await findMailboxByEmail(emailAddress, 'gmail');
    if (!mailbox) {
      console.warn(`[Webhook:Gmail] No mailbox found for ${emailAddress}`);
      return;
    }

    // 6. Enqueue history processing job with deduplication
    const jobId = await enqueueGmailHistory({ emailAddress, mailboxId: mailbox.id, historyId });
    console.log(`[Webhook:Gmail] Enqueued history job | jobId=${jobId} | historyId=${historyId}`);

  } catch (err: any) {
    // Never let errors bubble up — we already sent 200
    console.error('[Webhook:Gmail] Unexpected error:', err.message);
    console.error(err.stack);
  }
};

// ─── Outlook Webhook ──────────────────────────────────────────────────────────
// Microsoft Graph sends messageId directly inside the notification payload
export const handleOutlookWebhook = async (req: Request, res: Response) => {
  // Microsoft Graph sends a validationToken query param on first subscription setup
  // Must echo it back immediately as plain text
  const validationToken = req.query.validationToken as string | undefined;
  if (validationToken) {
    console.log('[Webhook:Outlook] Validation request received — echoing token');
    res.set('Content-Type', 'text/plain');
    return res.send(validationToken);
  }

  // Always ack immediately
  res.sendStatus(202);

  try {
    console.log('[Webhook:Outlook] Notification received');
    console.log('[Webhook:Outlook] Raw body:', JSON.stringify(req.body, null, 2));

    // 1. Validate body structure
    if (!req.body || typeof req.body !== 'object') {
      console.warn('[Webhook:Outlook] Empty or invalid request body');
      return;
    }
    const notifications = req.body?.value;
    if (!Array.isArray(notifications) || notifications.length === 0) {
      console.warn('[Webhook:Outlook] Missing or empty body.value array');
      return;
    }

    console.log(`[Webhook:Outlook] ${notifications.length} notification(s) received`);

    // Track processed messageIds in this batch to avoid duplicate enqueues
    const processedMessageIds = new Set<string>();

    // 2. Process each notification
    for (let i = 0; i < notifications.length; i++) {
      const notification = notifications[i];
      console.log(`\n[Webhook:Outlook] Processing notification ${i + 1}/${notifications.length}`);

      const subscriptionId = notification.subscriptionId;
      const changeType = notification.changeType;
      const resourceDataType = notification.resourceData?.['@odata.type'];
      const messageId = notification.resourceData?.id;

      // Validate subscriptionId
      if (!subscriptionId || typeof subscriptionId !== 'string') {
        console.warn(`[Webhook:Outlook] [${i + 1}] Missing or invalid subscriptionId`);
        continue;
      }

      // Only process 'created' events — skip updated/deleted
      if (changeType !== 'created') {
        console.log(`[Webhook:Outlook] [${i + 1}] Skipping changeType=${changeType} | subscriptionId=${subscriptionId}`);
        continue;
      }

      // Validate this is a Mail Message (not a calendar event or contact)
      if (resourceDataType && resourceDataType !== '#Microsoft.Graph.Message') {
        console.warn(`[Webhook:Outlook] [${i + 1}] Unexpected odata.type=${resourceDataType} — skipping`);
        continue;
      }

      // Validate messageId
      if (!messageId || typeof messageId !== 'string') {
        console.warn(`[Webhook:Outlook] [${i + 1}] Missing resourceData.id for subscriptionId=${subscriptionId}`);
        continue;
      }

      // Skip duplicate messageId in same batch
      if (processedMessageIds.has(messageId)) {
        console.log(`[Webhook:Outlook] [${i + 1}] Duplicate messageId=${messageId} in batch — skipping`);
        continue;
      }
      processedMessageIds.add(messageId);

      console.log(`[Webhook:Outlook] [${i + 1}] subscriptionId=${subscriptionId} | messageId=${messageId}`);

      // 3. Look up subscription in DB to find which mailbox this belongs to
      const subscription = await findSubscriptionById(subscriptionId);
      if (!subscription) {
        console.warn(`[Webhook:Outlook] [${i + 1}] No subscription record found for subscriptionId=${subscriptionId}`);
        continue;
      }
      console.log(`[Webhook:Outlook] [${i + 1}] Subscription found | status=${subscription.status} | mailboxId=${subscription.mailboxId}`);

      // 4. Validate clientState — prevents spoofed notifications from unknown senders
      const incomingClientState = notification.clientState;
      if (!incomingClientState) {
        console.warn(`[Webhook:Outlook] [${i + 1}] SECURITY: Missing clientState on notification — rejecting`);
        continue;
      }
      if (incomingClientState !== subscription.clientState) {
        console.warn(`[Webhook:Outlook] [${i + 1}] SECURITY: clientState mismatch — expected=${subscription.clientState} received=${incomingClientState} — rejecting`);
        continue;
      }
      console.log(`[Webhook:Outlook] [${i + 1}] clientState validated successfully`);

      // 5. Validate subscription status
      if (subscription.status !== 'active') {
        console.warn(`[Webhook:Outlook] [${i + 1}] Subscription is ${subscription.status} — skipping messageId=${messageId}`);
        continue;
      }
      console.log(`[Webhook:Outlook] [${i + 1}] Subscription status is active`);

      // 6. Validate subscription expiry time (status may still be 'active' but timestamp already passed)
      if (subscription.expiryTime && subscription.expiryTime < new Date()) {
        console.warn(`[Webhook:Outlook] [${i + 1}] Subscription expired at ${subscription.expiryTime.toISOString()} — skipping messageId=${messageId}`);
        console.warn(`[Webhook:Outlook] [${i + 1}] Note: subscription status was still '${subscription.status}' in DB — renewal job may not have run yet`);
        continue;
      }
      console.log(`[Webhook:Outlook] [${i + 1}] Subscription expiry check passed | expiryTime=${subscription.expiryTime?.toISOString() ?? 'none'}`);

      const emailAddress = subscription.mailbox.emailAddress;
      console.log(`[Webhook:Outlook] [${i + 1}] Resolved mailbox: ${emailAddress} | mailboxId=${subscription.mailboxId}`);
      const jobId = await enqueueEmailFetch({
        provider: 'outlook',
        emailAddress,
        mailboxId: subscription.mailbox.id,
        messageId,
        source: 'webhook'
      });
      console.log(`[Webhook:Outlook] [${i + 1}] Enqueued fetch | jobId=${jobId} | messageId=${messageId} | email=${emailAddress}`);
    }

    console.log(`\n[Webhook:Outlook] Finished processing ${notifications.length} notification(s)`);

  } catch (err: any) {
    console.error('[Webhook:Outlook] Unexpected error:', err.message);
    console.error(err.stack);
  }
};
