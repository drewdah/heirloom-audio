import { vi } from "vitest";

export function mockAuthAs(userId: string, email = "testuser@example.com") {
  vi.doMock("@/lib/auth", () => ({
    auth: vi.fn().mockResolvedValue({
      user: { id: userId, email, name: "Test User" },
      expires: new Date(Date.now() + 86400000).toISOString(),
    }),
    handlers: { GET: vi.fn(), POST: vi.fn() },
    signIn: vi.fn(),
    signOut: vi.fn(),
  }));
}

export function mockAuthUnauthenticated() {
  vi.doMock("@/lib/auth", () => ({
    auth: vi.fn().mockResolvedValue(null),
    handlers: { GET: vi.fn(), POST: vi.fn() },
    signIn: vi.fn(),
    signOut: vi.fn(),
  }));
}
