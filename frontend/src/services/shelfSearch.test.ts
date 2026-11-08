import { afterEach, describe, expect, it, vi } from "vitest";
import { findIsbnByText, scoreCatalogueTitle, textSimilarity } from "./shelfSearch";

afterEach(() => vi.unstubAllGlobals());

const answer = (docs: unknown[]) =>
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ docs }) }));

describe("textSimilarity", () => {
  it("ignores case, accents and punctuation", () => {
    expect(textSimilarity("Les Misérables", "les miserables!")).toBe(1);
  });
  it("is 0 for unrelated text", () => {
    expect(textSimilarity("Dragon Ball", "Astérix")).toBe(0);
  });
});

describe("findIsbnByText", () => {
  it("returns the first valid ISBN of the best matching title", async () => {
    answer([
      { title: "Something else entirely", isbn: ["9782344059487"] },
      { title: "Dragon Ball, Vol. 12", isbn: ["not-an-isbn", "9782723448314"] },
    ]);
    const match = await findIsbnByText({ title: "Dragon Ball", volume: 12 });
    expect(match).toEqual({ isbn: "9782723448314", title: "Dragon Ball, Vol. 12" });
  });

  it("returns null when nothing is similar enough", async () => {
    answer([{ title: "Cooking for beginners", isbn: ["9782723448314"] }]);
    expect(await findIsbnByText({ title: "Berserk" })).toBeNull();
  });

  it("throws on an HTTP error so the caller can tell it from 'not found'", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    await expect(findIsbnByText({ title: "Berserk" })).rejects.toThrow("HTTP 503");
  });
});

describe("scoreCatalogueTitle", () => {
  const wanted = { title: "Vagabond", volume: 3, hint: "VIZBIG" };
  it("prefers the right edition and volume over look-alikes", () => {
    const right = scoreCatalogueTitle(wanted, "Vagabond VIZBIG Edition, Vol. 3");
    expect(right).toBeGreaterThan(scoreCatalogueTitle(wanted, "Midlife Vagabond 3"));
    expect(right).toBeGreaterThan(0.5);
  });
  it("rejects another volume of the series", () => {
    expect(scoreCatalogueTitle(wanted, "Vagabond VIZBIG Edition, Vol. 4")).toBe(0);
  });
});
