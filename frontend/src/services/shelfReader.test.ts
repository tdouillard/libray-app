import { describe, expect, it } from "vitest";
import { parseSpineLine } from "./shelfReader";

describe("parseSpineLine", () => {
  it("splits a trailing volume number", () => {
    expect(parseSpineLine("Dragon Ball 12")).toEqual({ title: "Dragon Ball", volume: 12 });
    expect(parseSpineLine("One Piece - Tome 7")).toEqual({ title: "One Piece", volume: 7 });
  });
  it("keeps a plain title", () => {
    expect(parseSpineLine("Les Misérables")).toEqual({ title: "Les Misérables" });
  });
  it("drops OCR noise", () => {
    expect(parseSpineLine("| ~ 1 l")).toBeNull();
    expect(parseSpineLine("a1 #%&")).toBeNull();
  });
});
