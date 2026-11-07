import { useCallback, useMemo, useState } from "react";
import { BookCard } from "../components/BookCard";
import { BookDetailModal } from "../components/BookDetailModal";
import { StatsCard } from "../components/StatsCard";
import { useLibraryData } from "../hooks/useLibraryData";
import { buildBookFormFromMetadata, lookupBookByIsbn } from "../services/bookLookup";
import { normalizeIsbn } from "../services/isbn";
import { BarcodeScannerModal } from "../components/BarcodeScannerModal";
import type { Book, BookStatus } from "../types";

const statusFilters = ["all", "owned", "reading", "borrowed", "wishlist"] as const;
type StatusFilter = (typeof statusFilters)[number];

const initialForm: Omit<Book, "id" | "cover" | "rating" | "collectionIds"> & { cover?: string } = {
  title: "",
  author: "",
  isbn: "",
  year: new Date().getFullYear(),
  status: "owned",
  description: "",
  tags: ["New"],
  cover: "https://images.unsplash.com/photo-1512820790803-83ca734da794?auto=format&fit=crop&w=800&q=80",
};

export function BooksPage() {
  const { books: bookList, isLoading, addBook, updateBook, deleteBook } = useLibraryData();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [showForm, setShowForm] = useState(false);
  const [formValues, setFormValues] = useState(initialForm);
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [isLookingUpMetadata, setIsLookingUpMetadata] = useState(false);
  const [lookupMessage, setLookupMessage] = useState("");

  const handleMetadataLookup = useCallback(async (isbn: string) => {
    const normalizedIsbn = normalizeIsbn(isbn);
    if (!normalizedIsbn) {
      setLookupMessage("This is not a valid ISBN (13 digits starting with 978/979, or 10 digits).");
      return;
    }

    setIsLookingUpMetadata(true);
    setLookupMessage("Looking up book details...");

    try {
      const metadata = await lookupBookByIsbn(normalizedIsbn);

      if (!metadata) {
        setFormValues((current) => ({ ...current, isbn: normalizedIsbn }));
        setLookupMessage("No book found for this ISBN in Google Books, Open Library or the BnF. You can fill the form by hand.");
        return;
      }

      setFormValues((current) => ({
        ...current,
        isbn: normalizedIsbn,
        ...buildBookFormFromMetadata(metadata, current),
      }));

      const sources = metadata.sources?.join(", ");
      setLookupMessage(sources ? `Book information imported (${sources}).` : "Book information imported successfully.");
    } finally {
      setIsLookingUpMetadata(false);
    }
  }, []);

  const handleDetectedIsbn = useCallback(
    (isbn: string) => {
      setScannerOpen(false);
      setShowForm(true);
      setFormValues((current) => ({ ...current, isbn }));
      void handleMetadataLookup(isbn);
    },
    [handleMetadataLookup]
  );

  const filteredBooks = useMemo(() => {
    return bookList.filter((book) => {
      const matchesStatus = status === "all" || book.status === status;
      const matchesSearch =
        search.trim().length === 0 ||
        `${book.title} ${book.author} ${book.tags.join(" ")}`.toLowerCase().includes(search.toLowerCase());

      return matchesStatus && matchesSearch;
    });
  }, [bookList, search, status]);

  const totalBooks = bookList.length;
  const ownedBooks = bookList.filter((book) => book.status === "owned").length;
  const readingBooks = bookList.filter((book) => book.status === "reading").length;
  const wishlistBooks = bookList.filter((book) => book.status === "wishlist").length;

  const handleInputChange = (
    event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = event.target;

    setFormValues((current) => ({
      ...current,
      [name]: name === "year" ? Number(value) : value,
    }));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const newBook: Book = {
      id: crypto.randomUUID(),
      title: formValues.title,
      author: formValues.author,
      isbn: formValues.isbn,
      year: formValues.year,
      status: formValues.status as BookStatus,
      description: formValues.description || "A newly added title to your library.",
      tags: formValues.tags.length > 0 ? formValues.tags : ["New"],
      cover: formValues.cover || "https://images.unsplash.com/photo-1512820790803-83ca734da794?auto=format&fit=crop&w=800&q=80",
      rating: 4.5,
      collectionIds: [],
    };

    await addBook(newBook);
    setFormValues(initialForm);
    setShowForm(false);
  };

  return (
    <>
      <div className="space-y-8">
        <section className="flex flex-col gap-5 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-indigo-600">
              Catalogue overview
            </p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-slate-900">
              Your library at a glance
            </h2>
          </div>

          <button
            type="button"
            onClick={() => setShowForm((current) => !current)}
            className="inline-flex items-center justify-center rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700"
          >
            {showForm ? "Close form" : "+ Add a book"}
          </button>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatsCard label="Total books" value={String(totalBooks)} detail="items" />
          <StatsCard label="Owned" value={String(ownedBooks)} detail="in stock" />
          <StatsCard label="Reading" value={String(readingBooks)} detail="active" />
          <StatsCard label="Wishlist" value={String(wishlistBooks)} detail="planned" />
        </section>

        {showForm && (
          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-5 flex items-center justify-between gap-3">
              <h3 className="text-xl font-semibold text-slate-900">Add a new book</h3>
              <span className="text-sm text-slate-500">Quick entry</span>
            </div>

            <form className="grid gap-4 md:grid-cols-2" onSubmit={handleSubmit}>
              <label className="block text-sm text-slate-700">
                Title
                <input
                  name="title"
                  value={formValues.title}
                  onChange={handleInputChange}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 outline-none transition focus:border-indigo-400 focus:bg-white"
                  placeholder="The Name of the Wind"
                  required
                />
              </label>

              <label className="block text-sm text-slate-700">
                Author
                <input
                  name="author"
                  value={formValues.author}
                  onChange={handleInputChange}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 outline-none transition focus:border-indigo-400 focus:bg-white"
                  placeholder="Patrick Rothfuss"
                  required
                />
              </label>

              <label className="block text-sm text-slate-700">
                ISBN
                <div className="mt-1 flex gap-2">
                  <input
                    name="isbn"
                    value={formValues.isbn}
                    onChange={handleInputChange}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 outline-none transition focus:border-indigo-400 focus:bg-white"
                    placeholder="978-..."
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setScannerOpen(true)}
                    className="rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2.5 text-xs font-semibold uppercase tracking-[0.12em] text-indigo-700 transition hover:bg-indigo-100"
                  >
                    Scan
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleMetadataLookup(formValues.isbn)}
                    disabled={isLookingUpMetadata || !formValues.isbn}
                    className="rounded-xl border border-slate-200 bg-slate-100 px-3 py-2.5 text-xs font-semibold uppercase tracking-[0.12em] text-slate-700 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {isLookingUpMetadata ? "Loading..." : "Lookup"}
                  </button>
                </div>
                {lookupMessage && (
                  <p className="mt-2 text-xs text-slate-500">{lookupMessage}</p>
                )}
              </label>

              <label className="block text-sm text-slate-700">
                Year
                <input
                  name="year"
                  type="number"
                  value={formValues.year}
                  onChange={handleInputChange}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 outline-none transition focus:border-indigo-400 focus:bg-white"
                  required
                />
              </label>

              <label className="block text-sm text-slate-700 md:col-span-2">
                Description
                <textarea
                  name="description"
                  value={formValues.description}
                  onChange={handleInputChange}
                  rows={3}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 outline-none transition focus:border-indigo-400 focus:bg-white"
                  placeholder="Short description or notes..."
                />
              </label>

              <label className="block text-sm text-slate-700">
                Status
                <select
                  name="status"
                  value={formValues.status}
                  onChange={handleInputChange}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 outline-none transition focus:border-indigo-400 focus:bg-white"
                >
                  <option value="owned">Owned</option>
                  <option value="reading">Reading</option>
                  <option value="borrowed">Borrowed</option>
                  <option value="wishlist">Wishlist</option>
                </select>
              </label>

              <div className="flex items-end justify-end gap-3 md:col-span-2">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-full bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500"
                >
                  Save book
                </button>
              </div>
            </form>
          </section>
        )}

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
                Book list
              </p>
              <h3 className="mt-2 text-2xl font-bold text-slate-900">Browse your collection</h3>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by title, author or tag"
                className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-700 outline-none transition focus:border-indigo-400 focus:bg-white"
              />

              <select
                value={status}
                onChange={(event) => setStatus(event.target.value as StatusFilter)}
                className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-700 outline-none transition focus:border-indigo-400 focus:bg-white"
              >
                {statusFilters.map((option) => (
                  <option key={option} value={option}>
                    {option === "all" ? "All statuses" : option}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-6">
            {isLoading ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center text-slate-500">
                Loading library data…
              </div>
            ) : filteredBooks.length > 0 ? (
              <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                {filteredBooks.map((book) => (
                  <BookCard key={book.id} book={book} onSelectBook={setSelectedBook} />
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center text-slate-500">
                No books match your current filters.
              </div>
            )}
          </div>
        </section>
      </div>

      {scannerOpen && (
        <BarcodeScannerModal
          onClose={() => setScannerOpen(false)}
          onIsbn={handleDetectedIsbn}
        />
      )}

      <BookDetailModal
        book={selectedBook}
        onClose={() => setSelectedBook(null)}
        onStatusChange={async (bookId, status) => {
          await updateBook(bookId, { status });
          setSelectedBook((current) => (current ? { ...current, status } : current));
        }}
        onDelete={async (bookId) => {
          await deleteBook(bookId);
          setSelectedBook(null);
        }}
      />
    </>
  );
}
