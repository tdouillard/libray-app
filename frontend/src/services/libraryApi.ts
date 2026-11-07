import { supabase } from "./supabase";
import type { Book, BookStatus, Collection } from "../types";

interface BookRow {
  id: string;
  isbn: string;
  title: string;
  author: string;
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
  isbn: r.isbn,
  title: r.title,
  author: r.author,
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
    isbn: b.isbn,
    title: b.title,
    author: b.author,
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

  async updateBook(id: string, updates: Partial<Book>): Promise<void> {
    const columns = bookColumns(updates);
    if (Object.keys(columns).length === 0) return;
    await supabase.rest(`/books?id=eq.${encodeURIComponent(id)}`, { method: "PATCH", body: columns });
  },

  async deleteBook(id: string): Promise<void> {
    await supabase.rest(`/books?id=eq.${encodeURIComponent(id)}`, { method: "DELETE" });
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
