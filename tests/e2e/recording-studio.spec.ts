/**
 * E2E: Recording Studio — navigate to studio, upload audio, manage takes.
 *
 * Note: Real microphone recording can't be automated in Playwright.
 * These tests use the file upload path (FileUploader component) instead.
 * The actual MediaRecorder flow should be verified manually.
 */
import { test, expect, seedContent } from "./fixtures/auth";
import path from "path";
import fs from "fs";

// Generate a tiny silent WAV file for upload tests.
// WAV header for 1 second of silence at 44100 Hz, 16-bit mono.
function createSilentWav(): Buffer {
  const sampleRate = 44100;
  const numSamples = sampleRate; // 1 second
  const bytesPerSample = 2;
  const dataSize = numSamples * bytesPerSample;
  const buffer = Buffer.alloc(44 + dataSize);

  // RIFF header
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);

  // fmt chunk
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);       // chunk size
  buffer.writeUInt16LE(1, 20);        // PCM format
  buffer.writeUInt16LE(1, 22);        // mono
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * bytesPerSample, 28); // byte rate
  buffer.writeUInt16LE(bytesPerSample, 32); // block align
  buffer.writeUInt16LE(16, 34);       // bits per sample

  // data chunk (all zeros = silence)
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);

  return buffer;
}

test.describe("Recording Studio", () => {
  let testAudioPath: string;

  test.beforeAll(() => {
    // Write the test audio file to a temp location
    testAudioPath = path.join(__dirname, "fixtures", "test-audio.wav");
    fs.mkdirSync(path.dirname(testAudioPath), { recursive: true });
    fs.writeFileSync(testAudioPath, createSilentWav());
  });

  test.afterAll(() => {
    // Clean up the test audio file
    if (fs.existsSync(testAudioPath)) fs.unlinkSync(testAudioPath);
  });

  test("shows the recording studio for a chapter", async ({ page, request }) => {
    const seed = await seedContent(request, {
      book: true,
      bookTitle: "Bible",
      chapters: 1,
    });

    await page.goto(`/books/${seed.bookId}/chapters/${seed.chapterIds[0]}`);

    // Studio should show the chapter title
    await expect(page.locator("text=Chapter 1")).toBeVisible();

    // Should have a record button or upload area
    await expect(
      page.locator("text=Record").or(page.locator("text=Drop audio file"))
    ).toBeVisible({ timeout: 5_000 });
  });

  test("uploads an audio file as a take", async ({ page, request }) => {
    const seed = await seedContent(request, {
      book: true,
      chapters: 1,
    });

    await page.goto(`/books/${seed.bookId}/chapters/${seed.chapterIds[0]}`);

    // Find the file input and upload
    const fileInput = page.locator('input[type="file"][accept*="audio"]');
    await fileInput.setInputFiles(testAudioPath);

    // After upload, a take/clip should appear in the timeline or clip list
    // Wait for the upload to complete and UI to update
    await expect(
      page.locator("text=Take 1").or(page.locator("[data-take-id]"))
    ).toBeVisible({ timeout: 15_000 });
  });

  test("shows chapter navigation (prev/next)", async ({ page, request }) => {
    const seed = await seedContent(request, {
      book: true,
      chapters: 3,
    });

    // Navigate to the middle chapter
    await page.goto(`/books/${seed.bookId}/chapters/${seed.chapterIds[1]}`);

    // Should have both prev and next navigation
    await expect(page.locator("text=Chapter 2")).toBeVisible();

    // Look for navigation arrows/links
    const prevLink = page.locator('a[href*="chapters"]').filter({ hasText: /prev|chapter 1/i }).or(
      page.locator("svg.lucide-chevron-left").locator("..")
    );
    const nextLink = page.locator('a[href*="chapters"]').filter({ hasText: /next|chapter 3/i }).or(
      page.locator("svg.lucide-chevron-right").locator("..")
    );

    await expect(prevLink.first()).toBeVisible();
    await expect(nextLink.first()).toBeVisible();
  });

  test("navigates back to book page from studio", async ({ page, request }) => {
    const seed = await seedContent(request, {
      book: true,
      bookTitle: "My Book",
      chapters: 1,
    });

    await page.goto(`/books/${seed.bookId}/chapters/${seed.chapterIds[0]}`);

    // Click the "Back to" link
    await page.click("text=Back to");

    await expect(page).toHaveURL(new RegExp(`/books/${seed.bookId}`), { timeout: 5_000 });
    await expect(page.locator("h1")).toContainText("My Book");
  });
});
