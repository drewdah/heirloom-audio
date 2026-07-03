-- Add off-site backup tracking to Take
ALTER TABLE "Take" ADD COLUMN "backupStatus" TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE "Take" ADD COLUMN "backupError" TEXT;

-- Existing takes that already have a Drive file are already backed up
UPDATE "Take" SET "backupStatus" = 'backed_up' WHERE "audioDriveId" IS NOT NULL;
