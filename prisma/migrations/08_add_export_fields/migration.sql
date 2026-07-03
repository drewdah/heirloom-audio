-- Add export status tracking to Book
ALTER TABLE "Book" ADD COLUMN "exportStatus" TEXT NOT NULL DEFAULT 'idle';

-- Extend Export with file URL and status
ALTER TABLE "Export" ADD COLUMN "exportFileUrl" TEXT;
ALTER TABLE "Export" ADD COLUMN "exportStatus"  TEXT NOT NULL DEFAULT 'pending';
