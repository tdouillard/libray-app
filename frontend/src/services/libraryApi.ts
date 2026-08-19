import { books as mockBooks, collections as mockCollections } from "../data/mockData";
import type { Book, Collection } from "../types";

const BOOKS_STORAGE_KEY = "libray-books";
const COLLECTIONS_STORAGE_KEY = "libray-collections";

function readStorage<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") {
    return fallback;
  }

  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeStorage<T>(key: string, value: T) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(key, JSON.stringify(value));
}

export const libraryApi = {
  async getBooks(): Promise<Book[]> {
    const storedBooks = readStorage<Book[]>(BOOKS_STORAGE_KEY, []);
    if (storedBooks.length > 0) {
      return storedBooks;
    }

    writeStorage(BOOKS_STORAGE_KEY, mockBooks);
    return mockBooks;
  },

  async getCollections(): Promise<Collection[]> {
    const storedCollections = readStorage<Collection[]>(COLLECTIONS_STORAGE_KEY, []);
    if (storedCollections.length > 0) {
      return storedCollections;
    }

    writeStorage(COLLECTIONS_STORAGE_KEY, mockCollections);
    return mockCollections;
  },

  async saveBooks(books: Book[]) {
    writeStorage(BOOKS_STORAGE_KEY, books);
  },

  async saveCollections(collections: Collection[]) {
    writeStorage(COLLECTIONS_STORAGE_KEY, collections);
  },
};
