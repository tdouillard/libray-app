import type { Book, Collection } from "../types";

const SERIES_ACCENTS = [
  "from-amber-500 to-orange-500",
  "from-sky-500 to-cyan-500",
  "from-violet-500 to-fuchsia-500",
  "from-emerald-500 to-teal-500",
  "from-pink-500 to-rose-500",
];

/** Case, accent and punctuation insensitive key used to match series names. */
export const seriesKey = (name: string) =>
  name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

export interface SeriesPlan {
  /** Collections to create (already containing their books). */
  create: Collection[];
  /** Existing collections that are missing some books. */
  addBooks: { collectionId: string; bookIds: string[] }[];
}

/**
 * A series is every book sharing the same (volume-less) title. Once it holds more than one
 * volume it gets a "Series" collection: created if missing, otherwise completed.
 */
export function planSeriesCollections(books: Book[], collections: Collection[]): SeriesPlan {
  const groups = new Map<string, { name: string; books: Book[] }>();
  for (const book of books) {
    const key = seriesKey(book.title);
    if (!key) continue;
    const group = groups.get(key) ?? { name: book.title.trim(), books: [] };
    group.books.push(book);
    groups.set(key, group);
  }

  const plan: SeriesPlan = { create: [], addBooks: [] };
  for (const [key, group] of groups) {
    const volumes = new Set(group.books.map((b) => b.volume.trim() || b.isbn || b.id));
    if (volumes.size < 2) continue;

    const existing = collections.find((c) => c.type === "Series" && seriesKey(c.name) === key);
    if (existing) {
      const missing = group.books.filter((b) => !existing.bookIds.includes(b.id)).map((b) => b.id);
      if (missing.length > 0) plan.addBooks.push({ collectionId: existing.id, bookIds: missing });
    } else {
      plan.create.push({
        id: crypto.randomUUID(),
        name: group.name,
        description: "",
        accent: SERIES_ACCENTS[(collections.length + plan.create.length) % SERIES_ACCENTS.length],
        type: "Series",
        bookIds: group.books.map((b) => b.id),
      });
    }
  }
  return plan;
}
