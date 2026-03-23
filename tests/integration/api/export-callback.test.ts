import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTestUser, createTestBook, createTestExport } from "../../helpers/fixtures";

// Mock Drive upload
const mockUploadExport = vi.hoisted(() => vi.fn());
vi.mock("@/lib/google-drive", () => ({
  uploadExportToDrive: mockUploadExport,
  uploadProcessedTakeToDrive: vi.fn(),
  getOrCreateBookFolder: vi.fn(),
}));

// Mock fs/promises so tests don't need real M4B files on disk
const mockReadFile = vi.hoisted(() => vi.fn().mockResolvedValue(Buffer.from("fake-m4b")));
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

let userId: string, bookId: string, exportId: string;

describe("POST /api/books/[bookId]/export/callback", () => {
  beforeEach(async () => {
    mockUploadExport.mockReset();
    mockUploadExport.mockResolvedValue({ fileId: "drive-file-xyz" });
    const u = await createTestUser();
    userId = u.id;
    const b = await createTestBook(userId, { exportStatus: "exporting" });
    bookId = b.id;
    const exp = await createTestExport(bookId, { version: 1, exportStatus: "pending" });
    exportId = exp.id;
  });

  it("marks export done and increments book version on success", async () => {
    const { POST } = await import("@/app/api/books/[bookId]/export/callback/route");
    const res = await POST(
      makeReq({ secret: SECRET, exportId, status: "ok", exportFileUrl: "/exports/MyBook_v2026-03-23-1430.m4b", fileSizeBytes: 12345 }),
      { params: Promise.resolve({ bookId }) }
    );
    expect(res.status).toBe(200);
    const exp = await prisma.export.findUnique({ where: { id: exportId } });
    expect(exp?.exportStatus).toBe("done");
    expect(exp?.exportFileUrl).toBe("/exports/MyBook_v2026-03-23-1430.m4b");
    expect(exp?.fileSizeBytes).toBe(12345);
    const book = await prisma.book.findUnique({ where: { id: bookId } });
    expect(book?.exportStatus).toBe("idle");
    expect(book?.version).toBe(2);
  });

  it("stores Drive fileId when upload succeeds", async () => {
    const { POST } = await import("@/app/api/books/[bookId]/export/callback/route");
    await POST(
      makeReq({ secret: SECRET, exportId, status: "ok", exportFileUrl: "/exports/x.m4b" }),
      { params: Promise.resolve({ bookId }) }
    );
    const exp = await prisma.export.findUnique({ where: { id: exportId } });
    expect(exp?.driveFileId).toBe("drive-file-xyz");
    const book = await prisma.book.findUnique({ where: { id: bookId } });
    expect(book?.exportDriveId).toBe("drive-file-xyz");
  });

  it("still completes export when Drive upload throws (non-fatal)", async () => {
    mockUploadExport.mockRejectedValue(new Error("Drive quota exceeded"));
    const { POST } = await import("@/app/api/books/[bookId]/export/callback/route");
    const res = await POST(
      makeReq({ secret: SECRET, exportId, status: "ok", exportFileUrl: "/exports/x.m4b" }),
      { params: Promise.resolve({ bookId }) }
    );
    expect(res.status).toBe(200);
    const exp = await prisma.export.findUnique({ where: { id: exportId } });
    expect(exp?.exportStatus).toBe("done");
    // Drive ID absent because upload failed
    expect(exp?.driveFileId).toBeNull();
  });

  it("marks export as error on worker failure", async () => {
    const { POST } = await import("@/app/api/books/[bookId]/export/callback/route");
    const res = await POST(
      makeReq({ secret: SECRET, exportId, status: "error", error: "ffmpeg crashed" }),
      { params: Promise.resolve({ bookId }) }
    );
    expect(res.status).toBe(200);
    const exp = await prisma.export.findUnique({ where: { id: exportId } });
    expect(exp?.exportStatus).toBe("error");
    const book = await prisma.book.findUnique({ where: { id: bookId } });
    expect(book?.exportStatus).toBe("idle");
    // Drive upload should NOT be called on error
    expect(mockUploadExport).not.toHaveBeenCalled();
  });

  it("returns 401 for invalid secret", async () => {
    const { POST } = await import("@/app/api/books/[bookId]/export/callback/route");
    const res = await POST(
      makeReq({ secret: "wrong", exportId, status: "ok", exportFileUrl: "/exports/x.m4b" }),
      { params: Promise.resolve({ bookId }) }
    );
    expect(res.status).toBe(401);
    // Export record should remain untouched
    const exp = await prisma.export.findUnique({ where: { id: exportId } });
    expect(exp?.exportStatus).toBe("pending");
  });
});
