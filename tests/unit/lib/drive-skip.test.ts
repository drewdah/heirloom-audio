import { describe, it, expect, afterEach } from "vitest";
import { isDriveEnabled, getDriveClient, sizeMatches } from "@/lib/google-drive";

describe("sizeMatches (post-upload Drive verification)", () => {
  it("matches numeric and string byte counts", () => {
    expect(sizeMatches(1024, 1024)).toBe(true);
    expect(sizeMatches(1024, "1024")).toBe(true); // Drive reports size as a string
  });
  it("rejects mismatches and missing sizes", () => {
    expect(sizeMatches(1024, 1023)).toBe(false); // truncated upload
    expect(sizeMatches(1024, null)).toBe(false);
    expect(sizeMatches(1024, undefined)).toBe(false);
  });
});

// SKIP_DRIVE genuinely disables all Drive I/O (every call funnels through
// getDriveClient). Guard against it silently reverting to a no-op flag.
const orig = process.env.SKIP_DRIVE;
afterEach(() => {
  if (orig === undefined) delete process.env.SKIP_DRIVE;
  else process.env.SKIP_DRIVE = orig;
});

describe("SKIP_DRIVE gate", () => {
  it("isDriveEnabled reflects the flag (only 'true' disables)", () => {
    delete process.env.SKIP_DRIVE;
    expect(isDriveEnabled()).toBe(true);
    process.env.SKIP_DRIVE = "true";
    expect(isDriveEnabled()).toBe(false);
    process.env.SKIP_DRIVE = "false";
    expect(isDriveEnabled()).toBe(true);
  });

  it("getDriveClient throws when Drive is disabled", async () => {
    process.env.SKIP_DRIVE = "true";
    await expect(getDriveClient("any-user")).rejects.toThrow(/disabled/i);
  });
});
