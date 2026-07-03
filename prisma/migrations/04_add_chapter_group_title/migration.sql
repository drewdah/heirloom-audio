-- Add groupTitle to Chapter for M4B two-level chapter hierarchy
-- e.g. groupTitle = "Genesis", title = "Chapter 1"
-- At export these become "Genesis: Chapter 1" in the M4B chapter list
ALTER TABLE "Chapter" ADD COLUMN "groupTitle" TEXT;
