import { describe, expect, it } from "vitest";
import { planSeriesCollections } from "./series";
import type { Book, Collection } from "../types";

const book = (id: string, title: string, volume: string): Book => ({
  id, kind: "Manga", title, author: "", writer: "", artist: "", volume, publisher: "", editorCollection: "",
  originalTitle: "", isbn: `isbn-${id}`, year: 2020, status: "owned", description: "", tags: [], cover: "",
  rating: 0, collectionIds: [],
});

const series = (id: string, name: string, bookIds: string[]): Collection => ({
  id, name, description: "", accent: "", type: "Series", bookIds,
});

describe("planSeriesCollections", () => {
  it("creates a collection once a series has two volumes", () => {
    const plan = planSeriesCollections([book("1", "Berserk", "1"), book("2", "berserk", "2"), book("3", "Akira", "1")], []);
    expect(plan.create).toHaveLength(1);
    expect(plan.create[0]).toMatchObject({ name: "Berserk", type: "Series", bookIds: ["1", "2"] });
  });

  it("does nothing for a single volume", () => {
    expect(planSeriesCollections([book("1", "Akira", "1")], [])).toEqual({ create: [], addBooks: [] });
  });

  it("completes the existing collection instead of creating another", () => {
    const plan = planSeriesCollections(
      [book("1", "Berserk", "1"), book("2", "Berserk", "2"), book("3", "Berserk", "3")],
      [series("c1", "Berserk", ["1", "2"])]
    );
    expect(plan.create).toHaveLength(0);
    expect(plan.addBooks).toEqual([{ collectionId: "c1", bookIds: ["3"] }]);
  });
});
