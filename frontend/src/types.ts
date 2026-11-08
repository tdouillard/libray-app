export type BookStatus = "owned" | "wishlist" | "reading" | "borrowed";

export type BookKind = "Book" | "BD" | "Manga";
export const BOOK_KINDS: readonly BookKind[] = ["Book", "BD", "Manga"];

export interface Book {
  id: string;
  kind: BookKind;
  title: string;
  /** Display line for every kind. For BD / Manga it is derived from `writer` + `artist` when those are set. */
  author: string;
  /** BD / Manga: who writes the story (scénariste). Empty for books. */
  writer: string;
  /** BD / Manga: who draws it (dessinateur). Empty for books. */
  artist: string;
  /** Volume / tome number, free text ("6", "2.5", "Intégrale"). Empty for one-shots. */
  volume: string;
  /** Editor / publisher. */
  publisher: string;
  /** Imprint / series line of the editor ("Big Kana"). */
  editorCollection: string;
  /** Title in the original language, romanised for manga ("Kujou no Taizai"). */
  originalTitle: string;
  isbn: string;
  year: number;
  status: BookStatus;
  description: string;
  tags: string[];
  cover: string;
  rating: number;
  collectionIds: string[];
}

export interface Collection {
  id: string;
  name: string;
  description: string;
  accent: string;
  type: "Default" | "Series" | "Author" | "Theme" | "Wishlist";
  bookIds: string[];
}
