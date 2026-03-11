/*
  Warnings:

  - Added the required column `client_state` to the `subscriptions` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "mailboxes" ADD COLUMN     "last_history_id" TEXT,
ADD COLUMN     "needs_backfill" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "subscriptions" ADD COLUMN     "client_state" TEXT NOT NULL;
