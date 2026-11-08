import { supabase } from "./supabase";
import type { Book, BookKind, BookStatus, Collection } from "../types";

interface BookRow {
  id: string;
  kind?: BookKind;
  isbn: string;
  title: string;
  author: string;
  writer?: string;
  artist?: string;
  volume?: string;
  publisher?: string;
  editor_collection?: string;
  original_title?: string;
  year: number;
  status: BookStatus;
  description: string;
  tags: string[];
  cover: string;
  rating: number;
  collection_books?: { collection_id: string }[];
}

interface CollectionRow {
  id: string;
  name: string;
  description: string;
  accent: string;
  type: Collection["type"];
  collection_books?: { book_id: string }[];
}

const toBook = (r: BookRow): Book => ({
  id: r.id,
  kind: r.kind ?? "Book",
  isbn: r.isbn,
  title: r.title,
  author: r.author,
  writer: r.writer ?? "",
  artist: r.artist ?? "",
  volume: r.volume ?? "",
  publisher: r.publisher ?? "",
  editorCollection: r.editor_collection ?? "",
  originalTitle: r.original_title ?? "",
  year: r.year,
  status: r.status,
  description: r.description,
  tags: r.tags ?? [],
  cover: r.cover,
  rating: Number(r.rating),
  collectionIds: (r.collection_books ?? []).map((l) => l.collection_id),
});

const toCollection = (r: CollectionRow): Collection => ({
  id: r.id,
  name: r.name,
  description: r.description,
  accent: r.accent,
  type: r.type,
  bookIds: (r.collection_books ?? []).map((l) => l.book_id),
});

const bookColumns = (b: Partial<Book>) => {
  const row: Record<string, unknown> = {
    kind: b.kind,
    isbn: b.isbn,
    title: b.title,
    author: b.author,
    writer: b.writer,
    artist: b.artist,
    volume: b.volume,
    publisher: b.publisher,
    editor_collection: b.editorCollection,
    original_title: b.originalTitle,
    year: b.year,
    status: b.status,
    description: b.description,
    tags: b.tags,
    cover: b.cover,
    rating: b.rating,
  };
  for (const k of Object.keys(row)) if (row[k] === undefined) delete row[k];
  return row;
};

/* Rows are owned by the signed-in user (user_id defaults to auth.uid(), enforced by Row Level Security). */
export const libraryApi = {
  async getBooks(): Promise<Book[]> {
    const rows = await supabase.rest<BookRow[]>("/books?select=*,collection_books(collection_id)&order=created_at.desc");
    return rows.map(toBook);
  },

  async getCollections(): Promise<Collection[]> {
    const rows = await supabase.rest<CollectionRow[]>("/collections?select=*,collection_books(book_id)&order=created_at.desc");
    return rows.map(toCollection);
  },

  async createBook(book: Book): Promise<void> {
    await supabase.rest("/books", { method: "POST", body: { id: book.id, ...bookColumns(book) } });
    if (book.collectionIds.length > 0) {
      await supabase.rest("/collection_books", {
        method: "POST",
        body: book.collectionIds.map((collection_id) => ({ collection_id, book_id: book.id })),
      });
    }
  },

  /** Inserts many books in a single request (all or nothing). */
  async createBooks(books: Book[]): Promise<void> {
    if (books.length === 0) return;
    await supabase.rest("/books", {
      method: "POST",
      body: books.map((book) => ({ id: book.id, ...bookColumns(book) })),
    });
  },

  async updateBook(id: string, updates: Partial<Book>): Promise<void> {
    const columns = bookColumns(updates);
    if (Object.keys(columns).length === 0) return;
    await supabase.rest(`/books?id=eq.${encodeURIComponent(id)}`, { method: "PATCH", body: columns });
  },

  async deleteBook(id: string): Promise<void> {
    await supabase.rest(`/books?id=eq.${encodeURIComponent(id)}`, { method: "DELETE" });
  },

  async addBooksToCollection(collectionId: string, bookIds: string[]): Promise<void> {
    if (bookIds.length === 0) return;
    await supabase.rest("/collection_books", {
      method: "POST",
      body: bookIds.map((book_id) => ({ collection_id: collectionId, book_id })),
    });
  },

  async createCollection(collection: Collection): Promise<void> {
    await supabase.rest("/collections", {
      method: "POST",
      body: {
        id: collection.id,
        name: collection.name,
        description: collection.description,
        accent: collection.accent,
        type: collection.type,
      },
    });
    if (collection.bookIds.length > 0) {
      await supabase.rest("/collection_books", {
        method: "POST",
        body: collection.bookIds.map((book_id) => ({ collection_id: collection.id, book_id })),
      });
    }
  },
};
