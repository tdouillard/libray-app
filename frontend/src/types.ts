export type BookStatus = "owned" | "wishlist" | "reading" | "borrowed";

export type BookKind = "Book" | "BD" | "Manga";
export const BOOK_KINDS: readonly BookKind[] = ["Book", "BD", "Manga"];

export interface Book {
  id: string;
  kind: BookKind;
  title: string;
  author: string;
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
