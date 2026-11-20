-- The sidebar is now ordered by the last message instead of updated_at, which also moves on
-- renames.

-- DropIndex
DROP INDEX "conversations_user_id_updated_at_idx";

-- AlterTable
ALTER TABLE "conversations" ADD COLUMN     "last_message_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Backfill: time of the latest message, or the creation time for empty conversations.
UPDATE "conversations" AS c
SET "last_message_at" = COALESCE(
  (SELECT MAX(m."created_at") FROM "messages" AS m WHERE m."conversation_id" = c."id"),
  c."created_at"
);

-- CreateIndex
CREATE INDEX "conversations_user_id_last_message_at_idx" ON "conversations"("user_id", "last_message_at" DESC);
