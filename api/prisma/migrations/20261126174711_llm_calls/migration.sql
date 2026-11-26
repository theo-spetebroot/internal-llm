-- CreateEnum
CREATE TYPE "LlmCallOutcome" AS ENUM ('COMPLETED', 'INTERRUPTED', 'ERROR', 'TIMEOUT');

-- CreateTable
CREATE TABLE "llm_calls" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "conversation_id" TEXT,
    "provider" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL,
    "duration_ms" INTEGER NOT NULL,
    "time_to_first_token_ms" INTEGER,
    "outcome" "LlmCallOutcome" NOT NULL,
    "error_code" TEXT,

    CONSTRAINT "llm_calls_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "llm_calls_user_id_started_at_idx" ON "llm_calls"("user_id", "started_at");

-- CreateIndex
CREATE INDEX "llm_calls_started_at_idx" ON "llm_calls"("started_at");

-- AddForeignKey
ALTER TABLE "llm_calls" ADD CONSTRAINT "llm_calls_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "llm_calls" ADD CONSTRAINT "llm_calls_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
