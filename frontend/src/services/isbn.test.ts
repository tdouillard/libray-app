import { isbn13To10, isbn10To13, isValidIsbn10, isValidIsbn13, normalizeIsbn } from "./isbn";

describe("isbn helpers", () => {
  it("validates ISBN-13 checksums", () => {
    expect(isValidIsbn13("9782344059487")).toBe(true); // Goetz (Comix Buro)
    expect(isValidIsbn13("9782344059480")).toBe(false);
    expect(isValidIsbn13("978234405948")).toBe(false);
  });

  it("validates ISBN-10 checksums, including X", () => {
    expect(isValidIsbn10("2070612880")).toBe(true);
    expect(isValidIsbn10("080442957X")).toBe(true);
    expect(isValidIsbn10("2070612881")).toBe(false);
  });

  it("converts between ISBN-10 and ISBN-13", () => {
    expect(isbn10To13("2070612880")).toBe("9782070612888");
    expect(isbn13To10("9782070612888")).toBe("2070612880");
    expect(isbn13To10("9791032305669")).toBeNull();
  });

  it("normalizes any valid ISBN to ISBN-13 digits", () => {
    expect(normalizeIsbn("978-2-344-05948-7")).toBe("9782344059487");
    expect(normalizeIsbn(" 978 2344 059487 ")).toBe("9782344059487");
    expect(normalizeIsbn("2-07-061288-0")).toBe("9782070612888");
  });

  it("rejects non book barcodes and bad checksums", () => {
    expect(normalizeIsbn("5901234123457")).toBeNull(); // valid EAN-13, not 978/979
    expect(normalizeIsbn("9782344059480")).toBeNull();
    expect(normalizeIsbn("")).toBeNull();
  });
});
