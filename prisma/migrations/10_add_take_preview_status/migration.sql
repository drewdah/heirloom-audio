-- Add A/B preview render status to Take
ALTER TABLE "Take" ADD COLUMN "previewStatus" TEXT NOT NULL DEFAULT 'idle';
