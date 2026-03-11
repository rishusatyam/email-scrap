-- AlterTable
ALTER TABLE "subscriptions" ALTER COLUMN "subscription_id" DROP NOT NULL,
ALTER COLUMN "client_state" DROP NOT NULL;
