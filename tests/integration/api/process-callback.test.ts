import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTestUser, createTestBook, createTestChapter, createTestTake } from "../../helpers/fixtures";

// Mock Drive upload
const mockUploadProcessed = vi.hoisted(() => vi.fn());
vi.mock("@/lib/google-drive", () => ({
  uploadProcessedTakeToDrive: mockUploadProcessed,
  uploadExportToDrive: vi.fn(),
  getOrCreateBookFolder: vi.fn(),
}));

// Mock fs/promises so tests don't need real WAV files on disk
const mockReadFile = vi.hoisted(() => vi.fn().mockResolvedValue(Buffer.from("fake-wav")));
vi.mock("fs/promises", () => ({
  readFile: mockReadFile,
  default: { readFile: mockReadFile },
}));

const SECRET = "test-secret";

function makeReq(body: Record<string, unknown>) {
  return new Request("http://localhost", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as any;
}

let userId: string, bookId: string, chapterId: string, takeId: string;

describe("POST /api/chapters/[chapterId]/process/callback", () => {
  beforeEach(async () => {
    mockUploadProcessed.mockReset();
    mockUploadProcessed.mockResolvedValue(undefined);
    const u = await createTestUser();
    userId = u.id;
    const b = await createTestBook(userId);
    bookId = b.id;
    const ch = await createTestChapter(bookId, { processStatus: "processing" });
    chapterId = ch.id;
    const t = await createTestTake(chapterId);
    takeId = t.id;
  });

  it("saves processedFileUrl and marks chapter done on success", async () => {
    const { POST } = await import("@/app/api/chapters/[chapterId]/process/callback/route");
    const res = await POST(
      makeReq({
        secret: SECRET,
        status: "ok",
        takes: [{ takeId, processedFileUrl: "/takes/take-abc_processed.wav" }],
      }),
      { params: Promise.resolve({ chapterId }) }
    );
    expect(res.status).toBe(200);
    const take = await prisma.take.findUnique({ where: { id: takeId } });
    expect(take?.processedFileUrl).toBe("/takes/take-abc_processed.wav");
    const ch = await prisma.chapter.findUnique({ where: { id: chapterId } });
    expect(ch?.processStatus).toBe("done");
    expect(ch?.processedAt).not.toBeNull();
  });

  it("calls Drive upload for each processed take", async () => {
    const t2 = await createTestTake(chapterId, { label: "Take 2", audioFileUrl: "/takes/take2.webm" });
    const { POST } = await import("@/app/api/chapters/[chapterId]/process/callback/route");
    await POST(
      makeReq({
        secret: SECRET,
        status: "ok",
        takes: [
          { takeId, processedFileUrl: "/takes/take1_processed.wav" },
          { takeId: t2.id, processedFileUrl: "/takes/take2_processed.wav" },
        ],
      }),
      { params: Promise.resolve({ chapterId }) }
    );
    expect(mockUploadProcessed).toHaveBeenCalledTimes(2);
    const firstCall = mockUploadProcessed.mock.calls[0];
    expect(firstCall[0]).toBe(userId);
    expect(firstCall[1]).toBe(bookId);
    expect(firstCall[2]).toBe("take1_processed.wav");
  });

  it("still marks chapter done when Drive upload throws (non-fatal)", async () => {
    mockUploadProcessed.mockRejectedValue(new Error("Drive auth expired"));
    const { POST } = await import("@/app/api/chapters/[chapterId]/process/callback/route");
    const res = await POST(
      makeReq({
        secret: SECRET,
        status: "ok",
        takes: [{ takeId, processedFileUrl: "/takes/take-abc_processed.wav" }],
      }),
      { params: Promise.resolve({ chapterId }) }
    );
    expect(res.status).toBe(200);
    const ch = await prisma.chapter.findUnique({ where: { id: chapterId } });
    expect(ch?.processStatus).toBe("done");
  });

  it("marks chapter as error on worker failure", async () => {
    const { POST } = await import("@/app/api/chapters/[chapterId]/process/callback/route");
    const res = await POST(
      makeReq({ secret: SECRET, status: "error", error: "ffmpeg timeout" }),
      { params: Promise.resolve({ chapterId }) }
    );
    expect(res.status).toBe(200);
    const ch = await prisma.chapter.findUnique({ where: { id: chapterId } });
    expect(ch?.processStatus).toBe("error");
    expect(mockUploadProcessed).not.toHaveBeenCalled();
  });

  it("returns 401 for invalid secret", async () => {
    const { POST } = await import("@/app/api/chapters/[chapterId]/process/callback/route");
    const res = await POST(
      makeReq({ secret: "bad-secret", status: "ok", takes: [] }),
      { params: Promise.resolve({ chapterId }) }
    );
    expect(res.status).toBe(401);
    const ch = await prisma.chapter.findUnique({ where: { id: chapterId } });
    expect(ch?.processStatus).toBe("processing");
  });
});
