import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTestUser } from "../../helpers/fixtures";

const mockSession = vi.hoisted(() => ({ value: null as any }));
vi.mock("@/lib/auth", () => ({
  auth: vi.fn(() => Promise.resolve(mockSession.value)),
  handlers: { GET: vi.fn(), POST: vi.fn() },
  signIn: vi.fn(),
  signOut: vi.fn(),
}));
function setAuth(id: string) { mockSession.value = { user: { id } }; }

let userId: string;

describe("/api/user/audio-settings", () => {
  beforeEach(async () => {
    const u = await createTestUser(); userId = u.id;
    setAuth(userId);
  });

  it("GET returns defaults for a new user", async () => {
    const { GET } = await import("@/app/api/user/audio-settings/route");
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ compression: "recommended", denoise: true });
  });

  it("PUT updates compression and denoise and persists them", async () => {
    const { PUT } = await import("@/app/api/user/audio-settings/route");
    const res = await PUT(
      new Request("http://localhost", { method: "PUT", body: JSON.stringify({ compression: "strong", denoise: false }) }) as never
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ compression: "strong", denoise: false });
    const u = await prisma.user.findUnique({ where: { id: userId } });
    expect(u?.audioCompression).toBe("strong");
    expect(u?.audioDenoise).toBe(false);
  });

  it("PUT rejects an invalid compression value", async () => {
    const { PUT } = await import("@/app/api/user/audio-settings/route");
    const res = await PUT(
      new Request("http://localhost", { method: "PUT", body: JSON.stringify({ compression: "nuclear" }) }) as never
    );
    expect(res.status).toBe(400);
  });

  it("GET returns 401 when unauthenticated", async () => {
    mockSession.value = null;
    const { GET } = await import("@/app/api/user/audio-settings/route");
    expect((await GET()).status).toBe(401);
  });
});
