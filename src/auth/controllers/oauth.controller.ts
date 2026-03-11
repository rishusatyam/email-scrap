import { Request, Response } from 'express';
import { getGmailAuthUrl, getGmailTokens, getGmailUserInfo } from '../services/gmail.service';
import { getOutlookAuthUrl, getOutlookTokens, getOutlookUserInfo } from '../services/outlook.service';
import { saveMailbox } from '../services/mailbox.service';

// Start OAuth flow - redirect to provider
export const startOAuth = async (req: Request, res: Response) => {
  try {
    const { provider } = req.params;
    
    if (provider === 'gmail') {
      const authUrl = getGmailAuthUrl();
      return res.redirect(authUrl);
    }
    
    if (provider === 'outlook') {
      const authUrl = getOutlookAuthUrl();
      return res.redirect(authUrl);
    }
    
    return res.status(400).json({ error: 'Invalid provider' });
  } catch (error) {
    console.error('OAuth start error:', error);
    return res.status(500).json({ error: 'Failed to start OAuth' });
  }
};

// Handle OAuth callback
export const handleCallback = async (req: Request, res: Response) => {
  try {
    const { provider } = req.params;
    const { code } = req.query;
    
    if (!code || typeof code !== 'string') {
      return res.status(400).json({ error: 'No authorization code' });
    }
    
    let tokens, emailAddress;
    
    if (provider === 'gmail') {
      tokens = await getGmailTokens(code);
      emailAddress = await getGmailUserInfo(tokens.access_token);
    } else if (provider === 'outlook') {
      tokens = await getOutlookTokens(code);
      emailAddress = await getOutlookUserInfo(tokens.access_token);
    } else {
      return res.status(400).json({ error: 'Invalid provider' });
    }
    
    // Save mailbox with encrypted tokens
    await saveMailbox({
      provider: provider as 'gmail' | 'outlook',
      emailAddress,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresIn: tokens.expires_in
    });
    
    // Return success response
    return res.json({
      status: 'connected',
      provider,
      email: emailAddress
    });
  } catch (error) {
    console.error('OAuth callback error:', error);
    return res.status(500).json({ error: 'Failed to complete OAuth' });
  }
};
