-- CreateTable
CREATE TABLE "mailboxes" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT,
    "user_id" TEXT,
    "provider" TEXT NOT NULL,
    "email_address" TEXT NOT NULL,
    "encrypted_access_token" TEXT NOT NULL,
    "encrypted_refresh_token" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "auth_tag" TEXT NOT NULL,
    "token_expiry" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mailboxes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "mailboxes_email_address_idx" ON "mailboxes"("email_address");

-- CreateIndex
CREATE INDEX "mailboxes_user_id_idx" ON "mailboxes"("user_id");
