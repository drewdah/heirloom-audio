import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTestUser, createTestBook, createTestChapter } from "../../helpers/fixtures";

const mockSession = vi.hoisted(() => ({ value: null as any }));
vi.mock("@/lib/auth", () => ({
  auth: vi.fn(() => Promise.resolve(mockSession.value)),
  handlers: { GET: vi.fn(), POST: vi.fn() },
  signIn: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("@/lib/google-drive", () => ({
  uploadAudioToDrive: vi.fn(() => Promise.resolve({ fileId: "drive-xyz" })),
}));

// The tracked Drive backup has its own test suite; stub it here so it doesn't
// run real filesystem/DB work in the background during these route tests.
vi.mock("@/lib/take-backup", () => ({ backupTakeInBackground: vi.fn() }));

// The atomic write is exercised in its own unit test; here we drive the route's
// success/failure branches by toggling what the mocked writer does.
const atomic = vi.hoisted(() => ({ impl: async (_p: string, _d: Buffer) => {} }));
vi.mock("@/lib/atomic-file", () => ({
  writeFileAtomic: vi.fn((p: string, d: Buffer) => atomic.impl(p, d)),
}));

function setAuth(id: string) { mockSession.value = { user: { id, email: "t@t.com", name: "T" } }; }
function clearAuth() { mockSession.value = null; }

// jsdom's File/FormData don't implement arrayBuffer()/preserve non-string values,
// so stub the minimal surface the route actually touches: formData.get() plus a
// File-like with type/size/arrayBuffer.
function fakeFile(bytes: Uint8Array, type = "audio/webm") {
  return {
    name: "take.webm",
    type,
    size: bytes.byteLength,
    arrayBuffer: async () =>
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  };
}

function uploadReq(fields: Record<string, string> = {}, file: unknown = fakeFile(new Uint8Array([1, 2, 3, 4, 5]))) {
  const map = new Map<string, unknown>(Object.entries(fields));
  if (file !== null) map.set("audio", file);
  return {
    formData: async () => ({ get: (k: string) => (map.has(k) ? map.get(k) : null) }),
  } as any;
}

let userId: string;
let chapterId: string;

describe("POST /api/chapters/[chapterId]/takes", () => {
  beforeEach(async () => {
    atomic.impl = async () => {};
    const u = await createTestUser(); userId = u.id;
    const b = await createTestBook(userId);
    const ch = await createTestChapter(b.id); chapterId = ch.id;
    setAuth(userId);
  });

  it("persists the take with a local URL when the write succeeds", async () => {
    const { POST } = await import("@/app/api/chapters/[chapterId]/takes/route");
    const res = await POST(uploadReq({ duration: "12.5" }), { params: Promise.resolve({ chapterId }) });
    expect(res.status).toBe(200);
    const take = (await res.json()).take;
    expect(take.audioFileUrl).toBe(`/takes/${take.id}.webm`);
    expect(take.fileSizeBytes).toBe(5);
    expect(await prisma.take.count({ where: { chapterId } })).toBe(1);
  });

  it("returns 500 and leaves NO orphan take when the write fails", async () => {
    atomic.impl = async () => { throw new Error("disk full"); };
    const { POST } = await import("@/app/api/chapters/[chapterId]/takes/route");
    const res = await POST(uploadReq(), { params: Promise.resolve({ chapterId }) });
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("save_failed");
    // The placeholder row must be gone — a failed save must not leave a take
    // that claims audio it doesn't have.
    expect(await prisma.take.count({ where: { chapterId } })).toBe(0);
  });

  it("returns 400 when no audio file is provided", async () => {
    const { POST } = await import("@/app/api/chapters/[chapterId]/takes/route");
    const res = await POST(uploadReq({}, null), { params: Promise.resolve({ chapterId }) });
    expect(res.status).toBe(400);
    expect(await prisma.take.count({ where: { chapterId } })).toBe(0);
  });

  it("returns 401 when not authenticated", async () => {
    clearAuth();
    const { POST } = await import("@/app/api/chapters/[chapterId]/takes/route");
    const res = await POST(uploadReq(), { params: Promise.resolve({ chapterId }) });
    expect(res.status).toBe(401);
  });
});
