import { describe, expect, it } from "vitest";
import { epagineCoverUrl, isbnCoverCandidates, isPlaceholderSize } from "./covers";

describe("covers", () => {
  it("builds the Epagine URL from the last 3 digits of the ISBN-13", () => {
    expect(epagineCoverUrl("978-2-385-61140-8")).toBe("https://images.epagine.fr/408/9782385611408_1_75.jpg");
  });

  it("converts an ISBN-10 and rejects invalid ISBNs", () => {
    expect(epagineCoverUrl("2070360024")).toBe("https://images.epagine.fr/024/9782070360024_1_75.jpg");
    expect(epagineCoverUrl("1234567890123")).toBeNull();
  });

  it("orders candidates Epagine first, then Open Library", () => {
    const [first, second] = isbnCoverCandidates("9782385611408");
    expect(first).toContain("images.epagine.fr");
    expect(second).toContain("covers.openlibrary.org");
    expect(isbnCoverCandidates(undefined)).toEqual([]);
  });

  it("detects the Epagine 'no cover' placeholder and 1px stubs", () => {
    expect(isPlaceholderSize(154, 173)).toBe(true);
    expect(isPlaceholderSize(1, 1)).toBe(true);
    expect(isPlaceholderSize(600, 840)).toBe(false);
  });
});
