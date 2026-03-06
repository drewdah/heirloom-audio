import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import RecordingStudio from "@/components/studio/RecordingStudio";

export default async function ChapterPage({ params }: { params: Promise<{ bookId: string; chapterId: string }> }) {
  const { bookId, chapterId } = await params;
  const session = await auth();

  const chapter = await prisma.chapter.findUnique({
    where: { id: chapterId },
    include: {
      book: {
        include: { chapters: true },
      },
    },
  });

  if (!chapter || chapter.book.userId !== session!.user.id) notFound();

  return <RecordingStudio chapter={chapter} />;
}
