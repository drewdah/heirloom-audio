import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import BookStatusBar from "@/components/book/BookStatusBar";

describe("BookStatusBar", () => {
  it("renders the book title", () => {
    render(<BookStatusBar bookTitle="The Bible" totalChapters={10} recordedChapters={4} completedChapters={2} />);
    expect(screen.getByText("The Bible")).toBeDefined();
  });

  it("renders recorded and total chapter counts", () => {
    render(<BookStatusBar bookTitle="My Book" totalChapters={20} recordedChapters={5} completedChapters={3} />);
    // The component renders recorded / total as separate spans
    expect(screen.getByText("5")).toBeDefined();
    expect(screen.getByText("20")).toBeDefined();
  });

  it("renders completed count", () => {
    render(<BookStatusBar bookTitle="My Book" totalChapters={10} recordedChapters={5} completedChapters={3} />);
    expect(screen.getByText("3")).toBeDefined();
  });

  it("renders remaining count when not all chapters complete", () => {
    render(<BookStatusBar bookTitle="My Book" totalChapters={10} recordedChapters={5} completedChapters={3} />);
    expect(screen.getByText("7")).toBeDefined();
  });

  it("does not render remaining when all chapters complete", () => {
    render(<BookStatusBar bookTitle="My Book" totalChapters={5} recordedChapters={5} completedChapters={5} />);
    expect(screen.queryByText("left")).toBeNull();
  });

  it("renders current chapter breadcrumb when provided", () => {
    render(
      <BookStatusBar
        bookTitle="Genesis"
        totalChapters={50}
        recordedChapters={10}
        completedChapters={5}
        currentChapter={{ order: 3, title: "The Fall" }}
      />
    );
    expect(screen.getByText("Genesis")).toBeDefined();
    expect(screen.getByText("Ch. 3")).toBeDefined();
    expect(screen.getByText("The Fall")).toBeDefined();
  });

  it("does not render breadcrumb when currentChapter is omitted", () => {
    render(<BookStatusBar bookTitle="Genesis" totalChapters={50} recordedChapters={10} completedChapters={5} />);
    expect(screen.queryByText(/Ch\./)).toBeNull();
  });

  it("shows 100% progress when all chapters complete", () => {
    render(<BookStatusBar bookTitle="Done" totalChapters={4} recordedChapters={4} completedChapters={4} />);
    expect(screen.getByText("100%")).toBeDefined();
  });

  it("shows 0% progress when no chapters complete", () => {
    render(<BookStatusBar bookTitle="New" totalChapters={10} recordedChapters={0} completedChapters={0} />);
    expect(screen.getByText("0%")).toBeDefined();
  });
});
