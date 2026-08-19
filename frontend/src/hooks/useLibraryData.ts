import { useCallback, useEffect, useState } from "react";
import { libraryApi } from "../services/libraryApi";
import type { Book, Collection } from "../types";

export function useLibraryData() {
  const [books, setBooks] = useState<Book[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refreshLibrary = useCallback(async () => {
    setIsLoading(true);
    const [nextBooks, nextCollections] = await Promise.all([
      libraryApi.getBooks(),
      libraryApi.getCollections(),
    ]);
    setBooks(nextBooks);
    setCollections(nextCollections);
    setIsLoading(false);
  }, []);

  const addBook = useCallback(async (book: Book) => {
    const nextBooks = [book, ...books];
    setBooks(nextBooks);
    await libraryApi.saveBooks(nextBooks);
  }, [books]);

  const addCollection = useCallback(async (collection: Collection) => {
    const nextCollections = [collection, ...collections];
    setCollections(nextCollections);
    await libraryApi.saveCollections(nextCollections);
  }, [collections]);

  const updateBook = useCallback(async (bookId: string, updates: Partial<Book>) => {
    const nextBooks = books.map((book) =>
      book.id === bookId ? { ...book, ...updates } : book
    );
    setBooks(nextBooks);
    await libraryApi.saveBooks(nextBooks);
  }, [books]);

  const deleteBook = useCallback(async (bookId: string) => {
    const nextBooks = books.filter((book) => book.id !== bookId);
    setBooks(nextBooks);
    await libraryApi.saveBooks(nextBooks);
  }, [books]);

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
