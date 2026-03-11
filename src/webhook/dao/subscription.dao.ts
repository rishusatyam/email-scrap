import prisma from '../../shared/db';

// Find a subscription by provider-side subscriptionId (Outlook webhook lookup)
export const findSubscriptionById = async (subscriptionId: string) => {
  return await prisma.subscription.findUnique({
    where: { subscriptionId },
    include: { mailbox: true }
  });
};

// Find the most recent active subscription for a mailbox
export const findActiveSubscriptionByMailboxId = async (mailboxId: string) => {
  return await prisma.subscription.findFirst({
    where: { mailboxId, status: 'active' },
    orderBy: { createdAt: 'desc' }
  });
};

// Cancel all active subscriptions for a mailbox; returns count of rows updated
export const cancelActiveSubscriptionsByMailboxId = async (mailboxId: string): Promise<number> => {
  const result = await prisma.subscription.updateMany({
    where: { mailboxId, status: 'active' },
    data: { status: 'cancelled' }
  });
  return result.count;
};

// Create a new subscription record
// subscriptionId is null for Gmail (users.watch returns no subscription ID)
// clientState is null for Gmail; required UUID for Outlook
export const createSubscription = async (data: {
  provider: string;
  mailboxId: string;
  subscriptionId?: string | null;
  clientState?: string | null;
  expiryTime?: Date | null;
  status?: string;
}) => {
  return await prisma.subscription.create({ data });
};

// Update subscription status by provider-side subscriptionId
export const updateSubscriptionStatus = async (subscriptionId: string, status: string) => {
  return await prisma.subscription.update({
    where: { subscriptionId },
    data: { status }
  });
};

// Update subscription status by internal DB id (used when subscriptionId is null, e.g. Gmail)
export const updateSubscriptionStatusById = async (id: string, status: string) => {
  return await prisma.subscription.update({
    where: { id },
    data: { status }
  });
};
