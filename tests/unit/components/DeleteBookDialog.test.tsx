import { describe, it, expect, vi, beforeEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import DeleteBookDialog from "@/components/book/DeleteBookDialog";

// next/navigation isn't available in jsdom — stub the router the dialog uses.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

const getDeleteButton = () => screen.getByRole("button", { name: /Delete Book/i });

describe("DeleteBookDialog type-to-confirm gate", () => {
  beforeEach(() => {
    // A fetch stub so a successful delete doesn't blow up if it ever fires.
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({}) })));
  });

  it("disables Delete until the exact title is typed", async () => {
    const user = userEvent.setup();
    render(<DeleteBookDialog bookId="b1" bookTitle="To Delete" hasDriveFolder={false} onCancel={() => {}} />);

    expect(getDeleteButton()).toBeDisabled();

    await user.type(screen.getByPlaceholderText("To Delete"), "To Delete");
    expect(getDeleteButton()).toBeEnabled();
  });

  it("keeps Delete disabled when the typed title does not match", async () => {
    const user = userEvent.setup();
    render(<DeleteBookDialog bookId="b1" bookTitle="To Delete" hasDriveFolder={false} onCancel={() => {}} />);

    await user.type(screen.getByPlaceholderText("To Delete"), "To Delet");
    expect(getDeleteButton()).toBeDisabled();
  });

  it("matches case-insensitively and ignores surrounding whitespace", async () => {
    const user = userEvent.setup();
    render(<DeleteBookDialog bookId="b1" bookTitle="My Book" hasDriveFolder={false} onCancel={() => {}} />);

    await user.type(screen.getByPlaceholderText("My Book"), "  my book  ");
    expect(getDeleteButton()).toBeEnabled();
  });

  it("does not fire the delete request while the gate is closed", async () => {
    const user = userEvent.setup();
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    render(<DeleteBookDialog bookId="b1" bookTitle="To Delete" hasDriveFolder={false} onCancel={() => {}} />);

    await user.click(getDeleteButton()); // disabled — should be a no-op
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
