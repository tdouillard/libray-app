import { afterEach, describe, expect, it, vi } from "vitest";
import { inferKind, refreshBookMetadata } from "./bookLookup";

afterEach(() => vi.unstubAllGlobals());

describe("inferKind", () => {
  it("detects manga and BD, manga first", () => {
    expect(inferKind({ publisher: "Glénat Manga" })).toBe("Manga");
    expect(inferKind({ tags: ["Manga", "Shonen"] })).toBe("Manga");
    expect(inferKind({ tags: ["Bandes dessinées"] })).toBe("BD");
    expect(inferKind({ publisher: "Kana" })).toBe("Manga");
    expect(inferKind({ tags: ["Comics & Graphic Novels"] })).toBe("BD");
  });
  it("stays undefined when inconclusive and ignores partial words", () => {
    expect(inferKind({ title: "Takana story", tags: ["Fiction"] })).toBeUndefined();
    expect(inferKind({})).toBeUndefined();
  });
});

describe("refreshBookMetadata fields", () => {
  const stubCatalogue = () =>
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.includes("openlibrary.org/api")
          ? new Response(
              JSON.stringify({
                "ISBN:9782723492638": {
                  title: "New title",
                  authors: [{ name: "New Author" }],
                  cover: { large: "https://img/c.jpg" },
                  subjects: [{ name: "Manga" }],
                },
              })
            )
          : new Response("", { status: 404 })
      )
    );

  const book = { isbn: "9782723492638", description: "", tags: [], kind: "Book" as const };

  it("updates everything by default", async () => {
    stubCatalogue();
    const { updates } = await refreshBookMetadata(book);
    expect(updates).toMatchObject({ title: "New title", author: "New Author", cover: "https://img/c.jpg", kind: "Manga" });
  });

  it("skips unchecked fields", async () => {
    stubCatalogue();
    const { updates } = await refreshBookMetadata(book, { title: false, author: true, cover: false, category: false });
    expect(updates).toMatchObject({ author: "New Author" });
    expect(updates).not.toHaveProperty("title");
    expect(updates).not.toHaveProperty("cover");
    expect(updates).not.toHaveProperty("kind");
  });
});
