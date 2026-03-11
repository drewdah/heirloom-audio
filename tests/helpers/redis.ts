import { vi } from "vitest";

export function mockRedis() {
  const pushed: string[] = [];
  vi.doMock("redis", () => ({
    createClient: () => ({
      connect: vi.fn().mockResolvedValue(undefined),
      rPush: vi.fn().mockImplementation((_key: string, value: string) => {
        pushed.push(value);
        return Promise.resolve(1);
      }),
      quit: vi.fn().mockResolvedValue(undefined),
    }),
  }));

  return {
    getPushedJobs: () => pushed,
    getParsedJobs: () => pushed.map((j) => JSON.parse(j)),
    clear: () => { pushed.length = 0; },
  };
}
