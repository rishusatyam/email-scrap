import axios from 'axios';
import * as mailboxDao from '../../auth/dao/mailbox.dao';
import { writeToFile } from '../utils/webhook-logger';

interface FetchEmailData {
  provider: 'gmail' | 'outlook';
  emailAddress: string;
  messageId: string;
}

// Called by the email-fetch worker
// Fetches a single raw email from Gmail or Outlook and logs the response
export const fetchEmail = async ({ provider, emailAddress, messageId }: FetchEmailData) => {
  console.log(`[EmailFetch] Fetching messageId=${messageId} | provider=${provider} | email=${emailAddress}`);

  // 1. Load mailbox from DB
  const mailbox = await mailboxDao.findMailboxByEmail(emailAddress, provider);
  if (!mailbox) {
    console.error(`[EmailFetch] Mailbox not found for ${emailAddress} (${provider})`);
    throw new Error(`[EmailFetch] Mailbox not found for ${emailAddress} (${provider})`);
  }
  console.log(`[EmailFetch] Mailbox loaded | mailboxId=${mailbox.id} | email=${emailAddress}`);

  // 2. Check token expiry before making API call
  if (mailbox.tokenExpiry && mailbox.tokenExpiry < new Date()) {
    console.warn(`[EmailFetch] Access token may be expired for ${emailAddress} | expiry=${mailbox.tokenExpiry.toISOString()}`);
    throw new Error(`[EmailFetch] Token expired for ${emailAddress} — retry later`);
  }

  // 3. Get access token (plain text for now — TODO: decrypt in production)
  const accessToken = mailbox.encryptedAccessToken;

  // 4. Fetch email from provider
  let rawEmail;
  console.log(`[EmailFetch] Calling ${provider} API for messageId=${messageId}`);

  try {
    if (provider === 'gmail') {
      rawEmail = await fetchFromGmail(accessToken, messageId);
    } else if (provider === 'outlook') {
      rawEmail = await fetchFromOutlook(accessToken, messageId);
    } else {
      throw new Error(`[EmailFetch] Unknown provider: ${provider}`);
    }

    // 5. Save raw email to file
    console.log(`[EmailFetch] Successfully fetched email | messageId=${messageId} | provider=${provider}`);
    const fileName = `${provider}_${emailAddress.replace('@', '_')}_${messageId}.json`;
    writeToFile(fileName, rawEmail);
  } catch (error: any) {
    console.error(`[EmailFetch] Error fetching email: ${error.message}`);
    throw error;
  }
};

// --- Gmail ---
const fetchFromGmail = async (accessToken: string, messageId: string) => {
  try {
    const response = await axios.get(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        params: { format: 'full' }
      }
    );
    return response.data;
  } catch (err: any) {
    const status = err.response?.status;
    const message = err.response?.data?.error?.message || err.message;
    throw new Error(`[EmailFetch] Gmail fetch failed (${status}): ${message}`);
  }
};

// --- Outlook ---
const fetchFromOutlook = async (accessToken: string, messageId: string) => {
  try {
    const response = await axios.get(
      `https://graph.microsoft.com/v1.0/me/messages/${messageId}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );
    return response.data;
  } catch (err: any) {
    const status = err.response?.status;
    const message = err.response?.data?.error?.message || err.message;
    throw new Error(`[EmailFetch] Outlook fetch failed (${status}): ${message}`);
  }
};
