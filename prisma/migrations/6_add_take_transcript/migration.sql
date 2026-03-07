-- Add transcript fields to Take
ALTER TABLE "Take" ADD COLUMN "transcript" TEXT;
ALTER TABLE "Take" ADD COLUMN "transcriptStatus" TEXT NOT NULL DEFAULT 'pending';
