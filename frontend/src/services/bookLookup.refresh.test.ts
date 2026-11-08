import { afterEach, describe, expect, it, vi } from "vitest";
import { bnfCreatorRole, extractVolume, inferKind, joinNames, parseBnfTitle, parseBnfUnimarc, refreshBookMetadata } from "./bookLookup";

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

describe("volume and creators", () => {
  it("extracts the volume from a title", () => {
    expect(extractVolume("Monster Intégrale Deluxe - Tome 6 (Big Kana)")).toBe("6");
    expect(extractVolume("Berserk, Vol. 3")).toBe("3");
    expect(extractVolume("Naruto 12")).toBe("12");
    expect(extractVolume("Dune")).toBeUndefined();
  });
  it("reads BnF creator roles", () => {
    expect(bnfCreatorRole("Nagasaki, Takashi. Scénariste")).toBe("writer");
    expect(bnfCreatorRole("Uderzo, Albert (1927-2020). Dessinateur")).toBe("artist");
    expect(bnfCreatorRole("Urasawa, Naoki (1960-....). Auteur")).toBe("author");
  });
  it("keeps only the title from a BnF title statement", () => {
    expect(parseBnfTitle("Kujô l'implacable. 10 / Shôhei Manabe")).toEqual({ title: "Kujô l'implacable", volume: "10" });
    expect(parseBnfTitle("Monster. 6, Intégrale deluxe / Naoki Urasawa")).toEqual({
      title: "Monster - Intégrale deluxe",
      volume: "6",
    });
    expect(parseBnfTitle("Blacksad / Juan Díaz Canales")).toEqual({ title: "Blacksad" });
  });
  it("reads original title and collection from a BnF UNIMARC record", () => {
    const xml = `<r xmlns:mxc="urn:x">
      <mxc:datafield tag="225" ind1="|" ind2=" "><mxc:subfield code="a">Big Kana</mxc:subfield></mxc:datafield>
      <mxc:datafield tag="330" ind1=" " ind2=" "><mxc:subfield code="a">Kujô est derrière les barreaux</mxc:subfield></mxc:datafield>
      <mxc:datafield tag="454" ind1=" " ind2="1"><mxc:subfield code="t">Kujo no taizai</mxc:subfield><mxc:subfield code="h">Vol. 10</mxc:subfield></mxc:datafield>
    </r>`;
    expect(parseBnfUnimarc(xml)).toEqual({
      originalTitle: "Kujo no taizai",
      editorCollection: "Big Kana",
      description: "Kujô est derrière les barreaux",
    });
  });
  it("dedupes names", () => {
    expect(joinNames("Naoki Urasawa, Naoki Urasawa", "Takashi Nagasaki")).toBe("Naoki Urasawa, Takashi Nagasaki");
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

  it("fills volume and editor from the catalogue", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.includes("openlibrary.org/api")
          ? new Response(
              JSON.stringify({
                "ISBN:9782723492638": { title: "Monster - Tome 6", cover: { large: "https://img/c.jpg" }, publishers: [{ name: "Kana" }], authors: [{ name: "Naoki Urasawa" }] },
              })
            )
          : new Response("", { status: 404 })
      )
    );
    const { updates } = await refreshBookMetadata(book);
    expect(updates).toMatchObject({ volume: "6", publisher: "Kana", author: "Naoki Urasawa" });
  });

  it("skips unchecked fields", async () => {
    stubCatalogue();
    const { updates } = await refreshBookMetadata(book, { title: false, author: true, cover: false, category: false, volume: false, publisher: false, editorCollection: false, originalTitle: false });
    expect(updates).toMatchObject({ author: "New Author" });
    expect(updates).not.toHaveProperty("title");
    expect(updates).not.toHaveProperty("cover");
    expect(updates).not.toHaveProperty("kind");
  });
});
