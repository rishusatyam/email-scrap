import axios from 'axios';
import { Mailbox } from '@prisma/client';
import { config } from '../../shared/config';
import { updateMailbox } from '../../auth/dao/mailbox.dao';

const TOKEN_REFRESH_BUFFER_MS = 60 * 1000;

const refreshOutlookToken = async (mailbox: Mailbox): Promise<string> => {
  const params = new URLSearchParams({
    client_id: config.outlook.clientId,
    client_secret: config.outlook.clientSecret,
    refresh_token: mailbox.encryptedRefreshToken,
    grant_type: 'refresh_token',
    scope: config.outlook.scopes.join(' '),
  });

  const response = await axios.post(config.outlook.tokenUrl, params.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });

  const accessToken = response.data.access_token as string;
  const refreshToken = (response.data.refresh_token as string | undefined) ?? mailbox.encryptedRefreshToken;
  const expiresIn = (response.data.expires_in as number | undefined) ?? 3600;
  const tokenExpiry = new Date(Date.now() + expiresIn * 1000);

  await updateMailbox(mailbox.id, {
    encryptedAccessToken: accessToken,
    encryptedRefreshToken: refreshToken,
    iv: mailbox.iv,
    authTag: mailbox.authTag,
    tokenExpiry,
  });

  console.log(`[SubRenewal] Refreshed Outlook token for mailbox=${mailbox.id} email=${mailbox.emailAddress}`);

  return accessToken;
};

const refreshGmailToken = async (mailbox: Mailbox): Promise<string> => {
  const params = new URLSearchParams({
    client_id: config.gmail.clientId,
    client_secret: config.gmail.clientSecret,
    refresh_token: mailbox.encryptedRefreshToken,
    grant_type: 'refresh_token',
  });

  const response = await axios.post(config.gmail.tokenUrl, params.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });

  const accessToken = response.data.access_token as string;
  const refreshToken = (response.data.refresh_token as string | undefined) ?? mailbox.encryptedRefreshToken;
  const expiresIn = (response.data.expires_in as number | undefined) ?? 3600;
  const tokenExpiry = new Date(Date.now() + expiresIn * 1000);

  await updateMailbox(mailbox.id, {
    encryptedAccessToken: accessToken,
    encryptedRefreshToken: refreshToken,
    iv: mailbox.iv,
    authTag: mailbox.authTag,
    tokenExpiry,
  });

  console.log(`[SubRenewal] Refreshed Gmail token for mailbox=${mailbox.id} email=${mailbox.emailAddress}`);

  return accessToken;
};

// Reuses mailbox token data and refreshes only when token is near expiry.
export const ensureValidToken = async (mailbox: Mailbox): Promise<string> => {
  const now = Date.now();
  if (mailbox.tokenExpiry && mailbox.tokenExpiry.getTime() > now + TOKEN_REFRESH_BUFFER_MS) {
    return mailbox.encryptedAccessToken;
  }

  if (!mailbox.encryptedRefreshToken) {
    throw new Error(`Missing refresh token for mailbox=${mailbox.id}`);
  }

  if (mailbox.provider === 'outlook') {
    return refreshOutlookToken(mailbox);
  }

  if (mailbox.provider === 'gmail') {
    return refreshGmailToken(mailbox);
  }

  throw new Error(`Unsupported provider for token refresh: ${mailbox.provider}`);
};
