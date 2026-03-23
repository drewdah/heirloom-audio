import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import RecordingStudio from "@/components/studio/RecordingStudio";
import BookStatusBar from "@/components/book/BookStatusBar";

export default async function ChapterPage({ params }: { params: Promise<{ bookId: string; chapterId: string }> }) {
  const { chapterId } = await params;
  const session = await auth();

  const chapter = await prisma.chapter.findUnique({
    where: { id: chapterId },
    include: {
      book: {
        include: { chapters: true },
      },
      takes: { orderBy: { createdAt: "asc" } },
    },
  });

  if (!chapter || chapter.book.userId !== session!.user.id) notFound();

  const allChapters = chapter.book.chapters;
  const recordedChapters = allChapters.filter(c =>
    c.recordingComplete || c.processStatus === "done" || c.audioFileUrl || c.audioDriveId
  ).length;
  const completedChapters = allChapters.filter(c => c.recordingComplete).length;

  return (
    <>
      <BookStatusBar
        bookTitle={chapter.book.title}
        totalChapters={allChapters.length}
        recordedChapters={recordedChapters}
        completedChapters={completedChapters}
        currentChapter={{ order: chapter.order, title: chapter.title }}
      />
      <RecordingStudio chapter={chapter} />
    </>
  );
}
