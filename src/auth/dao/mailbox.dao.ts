import prisma from '../../shared/db';

interface CreateMailboxData {
  provider: string;
  emailAddress: string;
  encryptedAccessToken: string;
  encryptedRefreshToken: string;
  iv: string;
  authTag: string;
  tokenExpiry: Date | null;
  tenantId?: string;
  userId?: string;
}

interface UpdateMailboxData {
  encryptedAccessToken: string;
  encryptedRefreshToken: string;
  iv: string;
  authTag: string;
  tokenExpiry: Date | null;
}

// Find mailbox by internal DB id
export const findMailboxById = async (id: string) => {
  return await prisma.mailbox.findUnique({
    where: { id }
  });
};

// Find mailbox by email and provider
export const findMailboxByEmail = async (emailAddress: string, provider: string) => {
  return await prisma.mailbox.findFirst({
    where: { emailAddress, provider }
  });
};

// Create new mailbox
export const createMailbox = async (data: CreateMailboxData) => {
  return await prisma.mailbox.create({
    data
  });
};

// Update existing mailbox
export const updateMailbox = async (id: string, data: UpdateMailboxData) => {
  return await prisma.mailbox.update({
    where: { id },
    data
  });
};

// Update Gmail history tracking fields
export const updateMailboxHistoryTracking = async (
  id: string,
  data: { lastHistoryId?: string; needsBackfill?: boolean }
) => {
  return await prisma.mailbox.update({
    where: { id },
    data
  });
};
