-- Add fileOffset to Take for left-trim support
ALTER TABLE "Take" ADD COLUMN "fileOffset" REAL NOT NULL DEFAULT 0;
