-- CreateTable
CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "mailbox_id" TEXT NOT NULL,
    "subscription_id" TEXT NOT NULL,
    "expiry_time" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_subscription_id_key" ON "subscriptions"("subscription_id");

-- CreateIndex
CREATE INDEX "subscriptions_subscription_id_idx" ON "subscriptions"("subscription_id");

-- CreateIndex
CREATE INDEX "subscriptions_mailbox_id_idx" ON "subscriptions"("mailbox_id");

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_mailbox_id_fkey" FOREIGN KEY ("mailbox_id") REFERENCES "mailboxes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
