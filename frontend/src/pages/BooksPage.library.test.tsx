import { fireEvent, render, screen, within } from "@testing-library/react";
import { BooksPage } from "./BooksPage";
import type { Book } from "../types";

const updateBookMock = vi.fn();
const deleteBookMock = vi.fn();

function makeBook(overrides: Partial<Book>): Book {
  return {
    id: "id",
    kind: "Book",
    title: "Title",
    author: "Author",
    writer: "",
    artist: "",
    volume: "",
    publisher: "",
    isbn: "",
    year: 2000,
    status: "owned",
    description: "Description",
    tags: [],
    cover: "",
    rating: 4,
    collectionIds: [],
    ...overrides,
  };
}

const library: Book[] = [
  makeBook({ id: "1", title: "Dune", author: "Frank Herbert", status: "owned" }),
  makeBook({ id: "2", title: "Berserk", author: "Kentaro Miura", kind: "Manga", status: "reading" }),
  makeBook({ id: "3", title: "Blacksad", author: "Díaz Canales", kind: "BD", status: "wishlist" }),
];

vi.mock("../hooks/useLibraryData", () => ({
  useLibraryData: () => ({
    books: library,
    collections: [],
    isLoading: false,
    addBook: vi.fn(),
    updateBook: updateBookMock,
    deleteBook: deleteBookMock,
  }),
}));

vi.mock("barcode-detector/ponyfill", () => ({ prepareZXingModule: vi.fn(), BarcodeDetector: class {} }));
vi.mock("zxing-wasm/reader/zxing_reader.wasm?url", () => ({ default: "/zxing_reader.wasm" }));

describe("BooksPage library view", () => {
  beforeEach(() => {
    updateBookMock.mockReset();
    deleteBookMock.mockReset();
    window.localStorage.clear();
  });

  it("shows live counts on the status tabs", () => {
    render(<BooksPage />);

    expect(screen.getByRole("tab", { name: "All 3" })).not.toBeNull();
    expect(screen.getByRole("tab", { name: "Reading 1" })).not.toBeNull();
    expect(screen.getByRole("tab", { name: "Borrowed 0" })).not.toBeNull();
  });

  it("filters by status and by type, and can clear the filters", () => {
    render(<BooksPage />);

    fireEvent.click(screen.getByRole("tab", { name: /Reading/ }));
    expect(screen.getByRole("button", { name: "Berserk by Kentaro Miura" })).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Dune by Frank Herbert" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "BD" }));
    expect(screen.getByText("No books match")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(screen.getByRole("button", { name: "Dune by Frank Herbert" })).not.toBeNull();
    expect(screen.getByText("3 of 3 items")).not.toBeNull();
  });

  it("falls back to a per-kind placeholder when a book has no cover", () => {
    render(<BooksPage />);

    expect(document.querySelector("img")).toBeNull();
    expect(screen.getAllByText("Manga").length).toBeGreaterThan(0);
  });

  it("opens the detail dialog, changes status and closes on Escape", () => {
    render(<BooksPage />);

    fireEvent.click(screen.getByRole("button", { name: "Dune by Frank Herbert" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "Dune" })).not.toBeNull();

    fireEvent.click(within(dialog).getByRole("button", { name: "Reading" }));
    expect(updateBookMock).toHaveBeenCalledWith("1", { status: "reading" });

    fireEvent.click(within(dialog).getByRole("button", { name: "4 stars" }));
    expect(updateBookMock).toHaveBeenCalledWith("1", { rating: 4 });

    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("asks for confirmation before removing a book", () => {
    render(<BooksPage />);
    fireEvent.click(screen.getByRole("button", { name: "Dune by Frank Herbert" }));
    const dialog = screen.getByRole("dialog");

    fireEvent.click(within(dialog).getByRole("button", { name: "Remove" }));
    expect(deleteBookMock).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole("button", { name: "Yes, remove" }));
    expect(deleteBookMock).toHaveBeenCalledWith("1");
  });

  it("steps through the visible books from the dialog", () => {
    render(<BooksPage />);
    fireEvent.click(screen.getByRole("button", { name: "Dune by Frank Herbert" }));

    fireEvent.click(screen.getByRole("button", { name: "Next book" }));
    expect(within(screen.getByRole("dialog")).getByRole("heading", { name: "Berserk" })).not.toBeNull();
  });
});
