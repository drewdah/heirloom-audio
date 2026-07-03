-- Add recordingComplete flag to Chapter
ALTER TABLE "Chapter" ADD COLUMN "recordingComplete" BOOLEAN NOT NULL DEFAULT false;

-- Create Take model
CREATE TABLE "Take" (
  "id"              TEXT NOT NULL PRIMARY KEY,
  "chapterId"       TEXT NOT NULL,
  "label"           TEXT NOT NULL,
  "audioFileUrl"    TEXT,
  "audioDriveId"    TEXT,
  "audioFileName"   TEXT,
  "fileSizeBytes"   INTEGER,
  "durationSeconds" REAL,
  "regionStart"     REAL,
  "regionEnd"       REAL,
  "isActive"        BOOLEAN NOT NULL DEFAULT true,
  "recordedAt"      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt"       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Take_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
