import * as mailboxDao from '../dao/mailbox.dao';
// TODO: Import encryptToken when encryption is enabled
// import { encryptToken } from '../../shared/encryption';

interface SaveMailboxParams {
  provider: 'gmail' | 'outlook';
  emailAddress: string;
  accessToken: string;
  refreshToken: string;
  expiresIn?: number;
  tenantId?: string;
  userId?: string;
}

// Save mailbox to database
export const saveMailbox = async (params: SaveMailboxParams) => {
  const { provider, emailAddress, accessToken, refreshToken, expiresIn, tenantId, userId } = params;
  
  console.log('📝 [Mailbox Service] Preparing to save mailbox...');
  console.log('   Provider:', provider);
  console.log('   Email:', emailAddress);
  
  // TODO: Enable encryption for production
  // const encryptedAccess = encryptToken(accessToken);
  // const encryptedRefresh = encryptToken(refreshToken);
  
  // TEMPORARY: Store tokens directly without encryption (for testing only)
  const encryptedAccess = {
    encrypted: accessToken,
    iv: 'temp-iv',
    authTag: 'temp-auth-tag'
  };
  const encryptedRefresh = {
    encrypted: refreshToken,
    iv: 'temp-iv',
    authTag: 'temp-auth-tag'
  };
  
  console.log('🔐 [Token Storage] Tokens prepared for storage (plain-text for testing)');
  console.log('   Access Token length:', accessToken.length, 'characters');
  console.log('   Refresh Token length:', refreshToken.length, 'characters');
  
  // Calculate token expiry
  const tokenExpiry = expiresIn 
    ? new Date(Date.now() + expiresIn * 1000)
    : null;
  
  console.log('⏰ Token Expiry:', tokenExpiry?.toISOString() || 'No expiry set');
  
  // Check if mailbox already exists
  const existing = await mailboxDao.findMailboxByEmail(emailAddress, provider);
  
  if (existing) {
    // Update existing mailbox
    console.log('♻️  [Database] Updating existing mailbox record...');
    const result = await mailboxDao.updateMailbox(existing.id, {
      encryptedAccessToken: encryptedAccess.encrypted,
      encryptedRefreshToken: encryptedRefresh.encrypted,
      iv: encryptedAccess.iv,
      authTag: encryptedAccess.authTag,
      tokenExpiry
    });
    console.log('✅ [Database] Mailbox updated successfully in database');
    return result;
  }
  
  // Create new mailbox
  console.log('✨ [Database] Creating new mailbox record...');
  const result = await mailboxDao.createMailbox({
    provider,
    emailAddress,
    encryptedAccessToken: encryptedAccess.encrypted,
    encryptedRefreshToken: encryptedRefresh.encrypted,
    iv: encryptedAccess.iv,
    authTag: encryptedAccess.authTag,
    tokenExpiry,
    tenantId,
    userId
  });  console.log('✅ [Database] Mailbox created successfully in database');
  console.log('   Mailbox ID:', result.id);
  return result;};

// Get mailbox by email
export const getMailboxByEmail = async (emailAddress: string, provider: string) => {
  return await mailboxDao.findMailboxByEmail(emailAddress, provider);
};
