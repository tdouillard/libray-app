import { useCallback, useEffect, useState } from "react";
import { libraryApi } from "../services/libraryApi";
import type { Book, Collection } from "../types";

export function useLibraryData() {
  const [books, setBooks] = useState<Book[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [isLoading, setIsLoading] = useState(true);

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
  }, []);

  const addBook = useCallback(async (book: Book) => {
    await libraryApi.createBook(book);
    setBooks((current) => [book, ...current]);
  }, []);

  const addCollection = useCallback(async (collection: Collection) => {
    await libraryApi.createCollection(collection);
    setCollections((current) => [collection, ...current]);
  }, []);

  const updateBook = useCallback(async (bookId: string, updates: Partial<Book>) => {
    await libraryApi.updateBook(bookId, updates);
    setBooks((current) => current.map((book) => (book.id === bookId ? { ...book, ...updates } : book)));
  }, []);

  const deleteBook = useCallback(async (bookId: string) => {
    await libraryApi.deleteBook(bookId);
    setBooks((current) => current.filter((book) => book.id !== bookId));
  }, []);

  useEffect(() => {
    void refreshLibrary();
  }, [refreshLibrary]);

  return {
    books,
    collections,
    isLoading,
    addBook,
    addCollection,
    updateBook,
    deleteBook,
    refreshLibrary,
    setBooks,
    setCollections,
  };
}
