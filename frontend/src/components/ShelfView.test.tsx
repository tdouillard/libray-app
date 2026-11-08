import { fireEvent, render, screen, within } from "@testing-library/react";
import { ShelfView } from "./ShelfView";
import { dominantColor, packRows, parseSeries } from "../services/spines";
import type { Book } from "../types";

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
    editorCollection: "",
    originalTitle: "",
    isbn: "",
    year: 2000,
    status: "owned",
    description: "",
    tags: [],
    cover: "",
    rating: 4,
    collectionIds: [],
    ...overrides,
  };
}

const library: Book[] = [
  makeBook({ id: "1", title: "Dune", author: "Frank Herbert" }),
  makeBook({ id: "2", title: "Berserk 2", author: "Kentaro Miura", kind: "Manga", status: "reading" }),
  makeBook({ id: "3", title: "Berserk 1", author: "Kentaro Miura", kind: "Manga" }),
  makeBook({ id: "4", title: "Blacksad", author: "Díaz Canales", kind: "BD", status: "wishlist" }),
];

describe("ShelfView", () => {
  it("renders one shelf per category with every book on it", () => {
    render(<ShelfView books={library} animate={false} />);

    expect(within(screen.getByRole("region", { name: "Books" })).getByLabelText("Dune by Frank Herbert")).toBeTruthy();
    expect(within(screen.getByRole("region", { name: "BD" })).getByLabelText("Blacksad by Díaz Canales")).toBeTruthy();
    expect(within(screen.getByRole("region", { name: "Manga" })).getAllByRole("button")).toHaveLength(2);
  });

  it("orders volumes of a series on the shelf", () => {
    render(<ShelfView books={library} animate={false} />);
    const labels = within(screen.getByRole("region", { name: "Manga" })).getAllByRole("button").map((b) => b.getAttribute("aria-label"));
    expect(labels).toEqual(["Berserk 1 by Kentaro Miura", "Berserk 2 by Kentaro Miura"]);
  });

  it("hides categories that have no book", () => {
    render(<ShelfView books={[library[0]]} animate={false} />);
    expect(screen.queryByRole("region", { name: "Manga" })).toBeNull();
  });

  it("calls onSelectBook when a spine is clicked", () => {
    const onSelect = vi.fn();
    render(<ShelfView books={library} onSelectBook={onSelect} animate={false} />);
    fireEvent.click(screen.getByLabelText("Dune by Frank Herbert"));
    expect(onSelect).toHaveBeenCalledWith(library[0]);
  });

  it("shows status counts in the category header, not on the spines", () => {
    render(<ShelfView books={library} animate={false} />);
    expect(within(screen.getByRole("region", { name: "Manga" })).getByText("1 owned · 1 reading")).toBeTruthy();
  });
});

describe("spine helpers", () => {
  it("parses series and volume from titles", () => {
    expect(parseSeries("Berserk 12", "Manga")).toEqual({ series: "Berserk", volume: 12 });
    expect(parseSeries("Astérix, tome 3", "BD")).toEqual({ series: "Astérix", volume: 3 });
    expect(parseSeries("Naruto Vol. 7", "Manga")).toEqual({ series: "Naruto", volume: 7 });
    expect(parseSeries("Tintin T5", "BD")).toEqual({ series: "Tintin", volume: 5 });
    expect(parseSeries("Blacksad", "BD")).toEqual({ series: "Blacksad" });
  });

  it("does not read a bare number in a novel title as a volume", () => {
    expect(parseSeries("Fahrenheit 451", "Book")).toEqual({ series: "Fahrenheit 451" });
    expect(parseSeries("1984", "Book")).toEqual({ series: "1984" });
  });

  it("packs spines into rows that fit the width", () => {
    const rows = packRows(Array.from({ length: 10 }, () => ({ width: 18 })), 100);
    expect(rows.map((r) => r.length)).toEqual([5, 5]);
  });

  it("finds the dominant colour of an image buffer", () => {
    const pixels: number[] = [];
    for (let i = 0; i < 100; i++) pixels.push(200, 30, 30, 255); // red
    for (let i = 0; i < 10; i++) pixels.push(250, 250, 250, 255); // a little white
    const color = dominantColor(pixels);
    expect(color).not.toBeNull();
    expect(color!.h === 0 || color!.h > 350).toBe(true);
    expect(color!.s).toBeGreaterThan(50);
  });
});
