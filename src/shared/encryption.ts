import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;

// Get encryption key from environment
const getKey = (): Buffer => {
  const key = process.env.TOKEN_ENCRYPTION_KEY;
  if (!key || key.length !== KEY_LENGTH) {
    throw new Error('TOKEN_ENCRYPTION_KEY must be 32 characters long');
  }
  return Buffer.from(key, 'utf-8');
};

// Encrypt token
export const encryptToken = (token: string): { encrypted: string; iv: string; authTag: string } => {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  
  let encrypted = cipher.update(token, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag();
  
  return {
    encrypted,
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex')
  };
};

// Decrypt token
export const decryptToken = (encrypted: string, iv: string, authTag: string): string => {
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    getKey(),
    Buffer.from(iv, 'hex')
  );
  
  decipher.setAuthTag(Buffer.from(authTag, 'hex'));
  
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
};
