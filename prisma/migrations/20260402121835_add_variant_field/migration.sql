/*
  Warnings:

  - A unique constraint covering the columns `[provider,variant]` on the table `email_template_rules` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `variant` to the `email_template_rules` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "email_template_rules_provider_key";

-- AlterTable
ALTER TABLE "email_template_rules" ADD COLUMN     "variant" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "email_template_rules_provider_variant_key" ON "email_template_rules"("provider", "variant");
