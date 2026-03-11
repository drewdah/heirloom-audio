import { afterEach, afterAll } from "vitest";

afterEach(async () => {
  const { prisma } = await import("../src/lib/prisma");
  await prisma.take.deleteMany();
  await prisma.chapter.deleteMany();
  await prisma.export.deleteMany();
  await prisma.book.deleteMany();
  await prisma.session.deleteMany();
  await prisma.account.deleteMany();
  await prisma.verificationToken.deleteMany();
  await prisma.user.deleteMany();
});

afterAll(async () => {
  const { prisma } = await import("../src/lib/prisma");
  await prisma.$disconnect();
});
