import { describe, it, expect } from "vitest";
import { COVER_IMAGE, AUDIO_UPLOAD, AUDIO_EXPORT } from "@/lib/validations";

describe("COVER_IMAGE", () => {
  it("requires 3000x3000 minimum", () => {
    expect(COVER_IMAGE.minWidth).toBe(3000);
    expect(COVER_IMAGE.minHeight).toBe(3000);
  });
  it("caps file size at 5MB", () => { expect(COVER_IMAGE.maxBytes).toBe(5 * 1024 * 1024); });
  it("accepts only JPEG and PNG", () => {
    expect(COVER_IMAGE.acceptedTypes).toContain("image/jpeg");
    expect(COVER_IMAGE.acceptedTypes).toContain("image/png");
    expect(COVER_IMAGE.acceptedTypes).toHaveLength(2);
  });
});

describe("AUDIO_UPLOAD", () => {
  it("caps at 500MB", () => { expect(AUDIO_UPLOAD.maxBytes).toBe(500 * 1024 * 1024); });
  it("accepts WAV and MP3 variants", () => {
    expect(AUDIO_UPLOAD.acceptedTypes).toContain("audio/wav");
    expect(AUDIO_UPLOAD.acceptedTypes).toContain("audio/mpeg");
    expect(AUDIO_UPLOAD.acceptedTypes).toContain("audio/mp3");
  });
});

describe("AUDIO_EXPORT", () => {
  it("uses 128k bitrate", () => { expect(AUDIO_EXPORT.bitrate).toBe("128k"); });
  it("uses 44100 Hz", () => { expect(AUDIO_EXPORT.sampleRate).toBe(44100); });
  it("outputs mono", () => { expect(AUDIO_EXPORT.channels).toBe(1); });
  it("targets -18 LUFS", () => { expect(AUDIO_EXPORT.lufs).toBe(-18); });
  it("targets -3 dBFS peak", () => { expect(AUDIO_EXPORT.truePeak).toBe(-3); });
});
