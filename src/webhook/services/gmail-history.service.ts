import axios from 'axios';
import * as mailboxDao from '../../auth/dao/mailbox.dao';
import { enqueueEmailFetch } from '../queues/queue';
import { writeToFile } from '../utils/webhook-logger';

interface HistoryEventData {
  emailAddress: string;
  historyId: string;
}

// Called by the Gmail history worker
// Fetches history list → extracts messageIds → enqueues each for fetching
export const processHistoryEvent = async ({ emailAddress, historyId }: HistoryEventData) => {
  console.log(`[GmailHistory] Processing historyId=${historyId} for ${emailAddress}`);

  // 1. Load mailbox from DB
  const mailbox = await mailboxDao.findMailboxByEmail(emailAddress, 'gmail');
  if (!mailbox) {
    console.error(`[GmailHistory] Mailbox not found for ${emailAddress}`);
    throw new Error(`[GmailHistory] Mailbox not found for ${emailAddress}`);
  }
  console.log(`[GmailHistory] Mailbox loaded | mailboxId=${mailbox.id} | email=${emailAddress}`);

  // 2. Check token expiry before making API call
  if (mailbox.tokenExpiry && mailbox.tokenExpiry < new Date()) {
    console.warn(`[GmailHistory] Access token expired for ${emailAddress}`);
    throw new Error(`[GmailHistory] Token expired for ${emailAddress} — retry later`);
  }

  // 3. Get access token (plain text for now — TODO: decrypt in production)
  const accessToken = mailbox.encryptedAccessToken;

  // 4. Get the cursor — use mailbox's STORED lastHistoryId, not the webhook historyId
  const storedHistoryId = mailbox.lastHistoryId;
  if (!storedHistoryId) {
    console.warn(`[GmailHistory] No lastHistoryId in mailbox — this is a fresh subscription`);
    console.warn(`[GmailHistory] Using webhook historyId=${historyId} as starting point`);
    // For fresh subscriptions, there's nothing to catch up on
    await mailboxDao.updateMailboxHistoryTracking(mailbox.id, { lastHistoryId: historyId });
    return;
  }

  // 5. Call Gmail history.list API from stored cursor to webhook historyId
  console.log(`[GmailHistory] Calling Gmail history.list API | from=${storedHistoryId} to=${historyId}`);
  let response;
  try {
    response = await axios.get(
      `https://gmail.googleapis.com/gmail/v1/users/me/history`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        params: {
          startHistoryId: storedHistoryId,  // ✅ Use STORED cursor, not webhook historyId
          historyTypes: 'messageAdded'
        }
      }
    );
  } catch (err: any) {
    const status = err.response?.status;
    const message = err.response?.data?.error?.message || err.message;

    if (status === 404) {
      // historyId is too old (Gmail keeps ~30 days) — retrying is pointless
      console.warn(`[GmailHistory] historyId=${historyId} is too old — Gmail returned 404`);
      console.warn(`[GmailHistory] Marking mailbox for backfill | mailboxId=${mailbox.id} | email=${emailAddress}`);
      await mailboxDao.updateMailboxHistoryTracking(mailbox.id, { needsBackfill: true });
      console.warn(`[GmailHistory] needsBackfill=true saved to DB. Stopping job without retry.`);
      return; // return (not throw) so Bull does NOT retry this job
    }

    if (status === 401) {
      console.error(`[GmailHistory] Token rejected by Gmail (401) for ${emailAddress} — needs refresh`);
    } else {
      console.error(`[GmailHistory] Gmail API error (${status}): ${message}`);
    }
    // For all other errors (500, network, etc.) — throw so Bull retries
    throw new Error(`[GmailHistory] Gmail API error (${status}): ${message}`);
  }

  console.log(`[GmailHistory] Gmail API responded successfully | from=${storedHistoryId} to=${historyId}`);

  const historyList = response.data.history || [];
  console.log(`[GmailHistory] History records returned: ${historyList.length}`);

  // Write history response to file for debugging
  writeToFile(`gmail_history_${emailAddress.replace('@', '_')}_${storedHistoryId}_to_${historyId}.json`, response.data);

  // The webhook historyId becomes our new cursor position
  if (historyList.length === 0) {
    console.log(`[GmailHistory] No history records from ${storedHistoryId} to ${historyId}`);
    // Still update cursor to webhook historyId (advance the pointer)
    await mailboxDao.updateMailboxHistoryTracking(mailbox.id, { lastHistoryId: historyId });
    console.log(`[GmailHistory] Cursor updated to lastHistoryId=${historyId} (no new messages)`);
    return;
  }

  // 5. Extract unique messageIds from all history records
  const messageIds = new Set<string>();
  for (const record of historyList) {
    const added = record.messagesAdded || [];
    for (const msg of added) {
      if (msg.message?.id) {
        messageIds.add(msg.message.id);
      }
    }
  }

  if (messageIds.size === 0) {
    console.log(`[GmailHistory] History records found but no messagesAdded entries — nothing to enqueue`);
    return;
  }

  console.log(`[GmailHistory] Found ${messageIds.size} unique new message(s) for ${emailAddress}`);

  // 6. Enqueue each messageId for fetching with deduplication
  for (const messageId of messageIds) {
    const jobId = await enqueueEmailFetch({ provider: 'gmail', emailAddress, messageId });
    console.log(`[GmailHistory] Enqueued fetch | jobId=${jobId} | messageId=${messageId}`);
  }

  // 7. Update the mailbox history cursor to the webhook historyId (our new position)
  await mailboxDao.updateMailboxHistoryTracking(mailbox.id, { lastHistoryId: historyId });
  console.log(`[GmailHistory] Cursor updated | lastHistoryId=${historyId} | mailboxId=${mailbox.id}`);

  console.log(`[GmailHistory] Done — ${messageIds.size} fetch job(s) enqueued for ${emailAddress}`);
};
