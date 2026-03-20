import { Request, Response } from 'express';
import { getGmailAuthUrl, getGmailTokens, getGmailUserInfo } from '../services/gmail.service';
import { getOutlookAuthUrl, getOutlookTokens, getOutlookUserInfo } from '../services/outlook.service';
import { saveMailbox } from '../services/mailbox.service';
import { findMailboxById } from '../dao/mailbox.dao';
import { createGmailWatch } from '../../subscriptions/services/gmail-watch.service';
import { createOutlookSubscription } from '../../subscriptions/services/outlook-subscription.service';

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
    const mailbox = await saveMailbox({
      provider: provider as 'gmail' | 'outlook',
      emailAddress,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresIn: tokens.expires_in
    });

    console.log(`[OAuthController] Mailbox saved | id=${mailbox.id} | provider=${provider} | email=${emailAddress}`);

    // Auto-create subscription immediately
    console.log(`[OAuthController] Creating subscription for mailbox=${mailbox.id}`);
    let subscriptionData: any;

    try {
      if (provider === 'gmail') {
        const result = await createGmailWatch(mailbox);
        subscriptionData = {
          provider: result.provider,
          historyId: result.historyId,
          expiryTime: result.expiryTime,
        };
      } else if (provider === 'outlook') {
        const result = await createOutlookSubscription(mailbox);
        subscriptionData = {
          provider: result.provider,
          subscriptionId: result.subscriptionId,
          expiryTime: result.expiryTime,
        };
      }

      console.log(`[OAuthController] Subscription created successfully | mailboxId=${mailbox.id}`);
    } catch (subscriptionError: any) {
      console.warn(`[OAuthController] Subscription creation failed: ${subscriptionError.message} - but mailbox connection succeeded`);
      // Don't fail OAuth if subscription fails - mailbox is still connected
      subscriptionData = {
        error: `Subscription creation failed: ${subscriptionError.message}`,
      };
    }
    
    // Return success response with mailbox and subscription data
    return res.json({
      status: 'connected',
      provider,
      email: emailAddress,
      mailboxId: mailbox.id,
      subscription: subscriptionData,
    });
  } catch (error) {
    console.error('OAuth callback error:', error);
    return res.status(500).json({ error: 'Failed to complete OAuth' });
  }
};
