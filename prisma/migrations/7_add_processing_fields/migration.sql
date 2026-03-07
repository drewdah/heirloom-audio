-- Add audio processing fields to Take and Chapter

ALTER TABLE "Take" ADD COLUMN "processedFileUrl" TEXT;

ALTER TABLE "Chapter" ADD COLUMN "processStatus" TEXT NOT NULL DEFAULT 'idle';
ALTER TABLE "Chapter" ADD COLUMN "processedAt" DATETIME;
