-- Add audio file metadata columns to Chapter
ALTER TABLE "Chapter" ADD COLUMN "audioFileName" TEXT;
ALTER TABLE "Chapter" ADD COLUMN "audioFileSizeBytes" INTEGER;
