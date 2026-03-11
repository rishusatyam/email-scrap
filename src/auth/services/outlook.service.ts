import axios from 'axios';
import { config } from '../../shared/config';

// Generate Outlook OAuth URL
export const getOutlookAuthUrl = (): string => {
  const params = new URLSearchParams({
    client_id: config.outlook.clientId,
    redirect_uri: config.outlook.redirectUri,
    response_type: 'code',
    scope: config.outlook.scopes.join(' '),
    response_mode: 'query'
  });
  
  return `${config.outlook.authUrl}?${params.toString()}`;
};

// Exchange code for tokens
export const getOutlookTokens = async (code: string) => {
  const params = new URLSearchParams({
    code,
    client_id: config.outlook.clientId,
    client_secret: config.outlook.clientSecret,
    redirect_uri: config.outlook.redirectUri,
    grant_type: 'authorization_code'
  });
  
  const response = await axios.post(config.outlook.tokenUrl, params.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  });
  
  console.log('✅ [Outlook] Tokens extracted successfully');
  console.log('   Access Token:', response.data.access_token?.substring(0, 20) + '...');
  console.log('   Refresh Token:', response.data.refresh_token?.substring(0, 20) + '...');
  console.log('   Expires In:', response.data.expires_in, 'seconds');
  console.log('📧 [Outlook] Full Response:', JSON.stringify(response.data, null, 2));
  
  return response.data;
};

// Get user email
export const getOutlookUserInfo = async (accessToken: string) => {
  const response = await axios.get(config.outlook.userInfoUrl, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  
  return response.data.mail || response.data.userPrincipalName;
};
