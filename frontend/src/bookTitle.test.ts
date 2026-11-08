import { displayTitle } from "./bookTitle";

describe("displayTitle", () => {
  it("appends the volume", () => {
    expect(displayTitle({ title: "Vagabond", volume: "7" })).toBe("Vagabond Vol.7");
    expect(displayTitle({ title: "Monster", volume: "Intégrale" })).toBe("Monster Intégrale");
  });
  it("leaves titles without a volume alone", () => {
    expect(displayTitle({ title: "Dune", volume: "" })).toBe("Dune");
  });
  it("does not repeat a volume the title already carries", () => {
    expect(displayTitle({ title: "Vagabond VIZBIG Edition, Vol. 7", volume: "7" })).toBe("Vagabond VIZBIG Edition, Vol. 7");
    expect(displayTitle({ title: "Naruto 12", volume: "12" })).toBe("Naruto 12");
    expect(displayTitle({ title: "Apollo 13", volume: "3" })).toBe("Apollo 13 Vol.3");
  });
});
