-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "completion_tokens" INTEGER,
ADD COLUMN     "prompt_tokens" INTEGER,
ADD COLUMN     "tokens_estimated" BOOLEAN;
