import { describe, it, expect } from "vitest";
import {
  formatTimecode,
  formatDuration,
  generateVersionTag,
  getBookStatusLabel,
  getSpineColor,
} from "@/lib/utils";

describe("formatTimecode", () => {
  it("formats zero as 00:00.000", () => {
    expect(formatTimecode(0)).toBe("00:00.000");
  });

  it("formats seconds under a minute", () => {
    expect(formatTimecode(45.5)).toBe("00:45.500");
  });

  it("formats minutes and seconds", () => {
    expect(formatTimecode(125.5)).toBe("02:05.500");
  });

  it("includes hours when >= 3600", () => {
    expect(formatTimecode(3661.5)).toBe("1:01:01.500");
  });

  it("pads minutes and seconds but not hours", () => {
    expect(formatTimecode(7384.0)).toBe("2:03:04.000");
  });

  it("handles fractional milliseconds via floor", () => {
    expect(formatTimecode(0.9999)).toBe("00:00.999");
  });
});

describe("formatDuration", () => {
  it("shows only seconds for < 60s", () => {
    expect(formatDuration(45)).toBe("45s");
  });

  it("shows zero correctly", () => {
    expect(formatDuration(0)).toBe("0s");
  });

  it("shows minutes and padded seconds", () => {
    expect(formatDuration(125)).toBe("2m 05s");
  });

  it("shows hours, padded minutes, padded seconds", () => {
    expect(formatDuration(7384)).toBe("2h 03m 04s");
  });

  it("handles exactly 1 hour", () => {
    expect(formatDuration(3600)).toBe("1h 00m 00s");
  });
});

describe("generateVersionTag", () => {
  it("starts with v{version}-", () => {
    expect(generateVersionTag(1)).toMatch(/^v1-/);
  });

  it("includes the current date in YYYY-MM-DD format", () => {
    const tag = generateVersionTag(3);
    const today = new Date().toISOString().split("T")[0];
    expect(tag).toContain(today);
  });

  it("matches the full pattern v{n}-YYYY-MM-DD-HHhMMm", () => {
    expect(generateVersionTag(42)).toMatch(/^v42-\d{4}-\d{2}-\d{2}-\d{2}h\d{2}m$/);
  });
});

describe("getBookStatusLabel", () => {
  it("maps IN_PROGRESS", () => { expect(getBookStatusLabel("IN_PROGRESS")).toBe("In Progress"); });
  it("maps COMPLETE", () => { expect(getBookStatusLabel("COMPLETE")).toBe("Complete"); });
  it("maps ARCHIVED", () => { expect(getBookStatusLabel("ARCHIVED")).toBe("Archived"); });
  it("returns raw value for unknown", () => { expect(getBookStatusLabel("DRAFT")).toBe("DRAFT"); });
});

describe("getSpineColor", () => {
  it("returns bg, spine, and text", () => {
    const c = getSpineColor(0);
    expect(c).toHaveProperty("bg");
    expect(c).toHaveProperty("spine");
    expect(c).toHaveProperty("text");
  });

  it("returns valid hex colors", () => {
    const c = getSpineColor(0);
    const hex = /^#[0-9a-f]{6}$/i;
    expect(c.bg).toMatch(hex);
    expect(c.spine).toMatch(hex);
    expect(c.text).toMatch(hex);
  });

  it("wraps around the palette", () => {
    expect(getSpineColor(8)).toEqual(getSpineColor(0));
    expect(getSpineColor(9)).toEqual(getSpineColor(1));
  });
});
