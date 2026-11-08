import { useCallback, useEffect, useRef, useState } from "react";
import { libraryApi } from "../services/libraryApi";
import { planSeriesCollections } from "../services/series";
import type { Book, Collection } from "../types";

/** Fields that can change which series a book belongs to. */
const SERIES_FIELDS: (keyof Book)[] = ["title", "volume", "isbn"];

export function useLibraryData() {
  const [books, setBooksState] = useState<Book[]>([]);
  const [collections, setCollectionsState] = useState<Collection[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  // Always-current copies, so queued series syncs never work on stale data.
  const booksRef = useRef<Book[]>([]);
  const collectionsRef = useRef<Collection[]>([]);
  const syncQueue = useRef<Promise<void>>(Promise.resolve());

  const setBooks = useCallback((next: Book[] | ((current: Book[]) => Book[])) => {
    booksRef.current = typeof next === "function" ? next(booksRef.current) : next;
    setBooksState(booksRef.current);
  }, []);

  const setCollections = useCallback((next: Collection[] | ((current: Collection[]) => Collection[])) => {
    collectionsRef.current = typeof next === "function" ? next(collectionsRef.current) : next;
    setCollectionsState(collectionsRef.current);
  }, []);

  /**
   * Creates a "Series" collection for every series with more than one volume that has none,
   * and completes the existing one otherwise. Runs one at a time; idempotent.
   */
  const syncSeriesCollections = useCallback(() => {
    const run = async () => {
      const plan = planSeriesCollections(booksRef.current, collectionsRef.current);
      for (const collection of plan.create) {
        await libraryApi.createCollection(collection);
        setCollections((current) => [collection, ...current]);
        setBooks((current) =>
          current.map((b) => (collection.bookIds.includes(b.id) ? { ...b, collectionIds: [...b.collectionIds, collection.id] } : b))
        );
      }
      for (const { collectionId, bookIds } of plan.addBooks) {
        await libraryApi.addBooksToCollection(collectionId, bookIds);
        setCollections((current) =>
          current.map((c) => (c.id === collectionId ? { ...c, bookIds: [...c.bookIds, ...bookIds] } : c))
        );
        setBooks((current) =>
          current.map((b) => (bookIds.includes(b.id) ? { ...b, collectionIds: [...b.collectionIds, collectionId] } : b))
        );
      }
    };
    syncQueue.current = syncQueue.current.then(run).catch((error) => {
      console.info("Series collection sync failed", error);
    });
    return syncQueue.current;
  }, [setBooks, setCollections]);

  const refreshLibrary = useCallback(async () => {
    setIsLoading(true);
    try {
      const [nextBooks, nextCollections] = await Promise.all([
        libraryApi.getBooks(),
        libraryApi.getCollections(),
      ]);
      setBooks(nextBooks);
      setCollections(nextCollections);
    } finally {
      setIsLoading(false);
    }
  }, [setBooks, setCollections]);

  const addBook = useCallback(
    async (book: Book) => {
      await libraryApi.createBook(book);
      setBooks((current) => [book, ...current]);
      await syncSeriesCollections();
    },
    [setBooks, syncSeriesCollections]
  );

  const addBooks = useCallback(
    async (newBooks: Book[]) => {
      await libraryApi.createBooks(newBooks);
      setBooks((current) => [...newBooks, ...current]);
      await syncSeriesCollections();
    },
    [setBooks, syncSeriesCollections]
  );

  const addCollection = useCallback(
    async (collection: Collection) => {
      await libraryApi.createCollection(collection);
      setCollections((current) => [collection, ...current]);
    },
    [setCollections]
  );

  const updateBook = useCallback(
    async (bookId: string, updates: Partial<Book>) => {
      await libraryApi.updateBook(bookId, updates);
      setBooks((current) => current.map((book) => (book.id === bookId ? { ...book, ...updates } : book)));
      if (SERIES_FIELDS.some((field) => field in updates)) await syncSeriesCollections();
    },
    [setBooks, syncSeriesCollections]
  );

  const deleteBook = useCallback(
    async (bookId: string) => {
      await libraryApi.deleteBook(bookId);
      setBooks((current) => current.filter((book) => book.id !== bookId));
      setCollections((current) => current.map((c) => ({ ...c, bookIds: c.bookIds.filter((id) => id !== bookId) })));
    },
    [setBooks, setCollections]
  );

  useEffect(() => {
    void refreshLibrary();
  }, [refreshLibrary]);

  return {
    books,
    collections,
    isLoading,
    addBook,
    addBooks,
    addCollection,
    updateBook,
    deleteBook,
    refreshLibrary,
    syncSeriesCollections,
    setBooks,
    setCollections,
  };
}
