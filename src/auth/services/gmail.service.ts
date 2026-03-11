import axios from 'axios';
import { config } from '../../shared/config';

// Generate Gmail OAuth URL
export const getGmailAuthUrl = (): string => {
  const params = new URLSearchParams({
    client_id: config.gmail.clientId,
    redirect_uri: config.gmail.redirectUri,
    response_type: 'code',
    scope: config.gmail.scopes.join(' '),
    access_type: 'offline',
    prompt: 'consent'
  });
  
  return `${config.gmail.authUrl}?${params.toString()}`;
};

// Exchange code for tokens
export const getGmailTokens = async (code: string) => {
  const response = await axios.post(config.gmail.tokenUrl, {
    code,
    client_id: config.gmail.clientId,
    client_secret: config.gmail.clientSecret,
    redirect_uri: config.gmail.redirectUri,
    grant_type: 'authorization_code'
  });
  
  console.log('✅ [Gmail] Tokens extracted successfully');
  console.log('   Access Token:', response.data.access_token?.substring(0, 20) + '...');
  console.log('   Refresh Token:', response.data.refresh_token?.substring(0, 20) + '...');
  console.log('   Expires In:', response.data.expires_in, 'seconds');
   console.log('📨 [Gmail] Full Response:', JSON.stringify(response.data, null, 2));
  
  return response.data;
};

// Get user email
export const getGmailUserInfo = async (accessToken: string) => {
  const response = await axios.get(config.gmail.userInfoUrl, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  
  return response.data.email;
};
