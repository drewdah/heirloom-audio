import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/prisma";

// The /api/test/seed endpoint creates a test user + a fixed "test-session-token"
// session — it must NEVER be reachable in production. It's gated behind the
// ENABLE_TEST_SEED env var (set only in docker-compose.ci.yml). This guards
// against it ever accidentally shipping enabled.
const original = process.env.ENABLE_TEST_SEED;

afterEach(() => {
  if (original === undefined) delete process.env.ENABLE_TEST_SEED;
  else process.env.ENABLE_TEST_SEED = original;
});

function postReq() {
  return new Request("http://localhost/api/test/seed", { method: "POST" }) as never;
}

describe("/api/test/seed guard", () => {
  it("POST returns 404 when ENABLE_TEST_SEED is unset", async () => {
    delete process.env.ENABLE_TEST_SEED;
    const { POST } = await import("@/app/api/test/seed/route");
    const res = await POST(postReq());
    expect(res.status).toBe(404);
    // and it seeds nothing
    expect(await prisma.user.count()).toBe(0);
  });

  it("POST returns 404 when ENABLE_TEST_SEED is any value other than 'true'", async () => {
    process.env.ENABLE_TEST_SEED = "1";
    const { POST } = await import("@/app/api/test/seed/route");
    const res = await POST(postReq());
    expect(res.status).toBe(404);
  });

  it("DELETE returns 404 when ENABLE_TEST_SEED is unset", async () => {
    delete process.env.ENABLE_TEST_SEED;
    const { DELETE } = await import("@/app/api/test/seed/route");
    const res = await DELETE();
    expect(res.status).toBe(404);
  });

  it("POST seeds a test user + session when explicitly enabled", async () => {
    process.env.ENABLE_TEST_SEED = "true";
    const { POST } = await import("@/app/api/test/seed/route");
    const res = await POST(postReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.userId).toBeTruthy();
    const session = await prisma.session.findUnique({ where: { sessionToken: "test-session-token" } });
    expect(session?.userId).toBe(body.userId);
  });
});
