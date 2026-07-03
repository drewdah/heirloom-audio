-- Per-user audio processing preferences (Mic Check)
ALTER TABLE "User" ADD COLUMN "audioCompression" TEXT NOT NULL DEFAULT 'recommended';
ALTER TABLE "User" ADD COLUMN "audioDenoise" BOOLEAN NOT NULL DEFAULT true;
