import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BarcodeScannerModal } from "../components/BarcodeScannerModal";
import { BookCard } from "../components/BookCard";
import { BookDetailModal } from "../components/BookDetailModal";
import { BookRow } from "../components/BookRow";
import { STATUS_META, STATUS_ORDER } from "../bookStatus";
import { useLibraryData } from "../hooks/useLibraryData";
import { hasNoCover, useMetadataRefresh } from "../hooks/useMetadataRefresh";
import { RefreshFieldsPicker } from "../components/RefreshFieldsPicker";
import { ALL_REFRESH_FIELDS, buildBookFormFromMetadata, lookupBookByIsbn } from "../services/bookLookup";
import type { RefreshFields } from "../services/bookLookup";
import { normalizeIsbn } from "../services/isbn";
import { BOOK_KINDS } from "../types";
import type { Book, BookKind, BookStatus } from "../types";

type StatusFilter = "all" | BookStatus;
type KindFilter = "all" | BookKind;
type SortKey = "recent" | "title" | "author" | "rating";
type ViewMode = "grid" | "list";

const VIEW_STORAGE_KEY = "library.books.view";

const initialForm: Omit<Book, "id" | "rating" | "collectionIds"> = {
  kind: "Book",
  title: "",
  author: "",
  isbn: "",
  year: new Date().getFullYear(),
  status: "owned",
  description: "",
  tags: ["New"],
  cover: "",
};

const inputClass =
  "mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 outline-none transition focus:border-indigo-400 focus:bg-white";

function readStoredView(): ViewMode {
  try {
    return window.localStorage.getItem(VIEW_STORAGE_KEY) === "list" ? "list" : "grid";
  } catch {
    return "grid";
  }
}

export function BooksPage() {
  const { books: bookList, collections, isLoading, addBook, updateBook, deleteBook } = useLibraryData();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [kind, setKind] = useState<KindFilter>("all");
  const [sort, setSort] = useState<SortKey>("recent");
  const [view, setView] = useState<ViewMode>(readStoredView);
  const [showForm, setShowForm] = useState(false);
  const [formValues, setFormValues] = useState(initialForm);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [isLookingUpMetadata, setIsLookingUpMetadata] = useState(false);
  const [lookupMessage, setLookupMessage] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const { progress, refreshOne, refreshMany, cancel, dismiss } = useMetadataRefresh(updateBook);
  const refreshRunning = progress?.running === true;
  const [refreshFields, setRefreshFields] = useState<RefreshFields>(ALL_REFRESH_FIELDS);
  const noFieldSelected = !Object.values(refreshFields).some(Boolean);

  const exitSelectionMode = () => {
    setSelectionMode(false);
    setCheckedIds(new Set());
  };

  const toggleChecked = (id: string) =>
    setCheckedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const handleBookClick = (book: Book) => (selectionMode ? toggleChecked(book.id) : setSelectedId(book.id));

  const changeView = (next: ViewMode) => {
    setView(next);
    try {
      window.localStorage.setItem(VIEW_STORAGE_KEY, next);
    } catch {
      // Preference just won't persist.
    }
  };

  // "/" focuses the search box, like most catalogue UIs.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
      if (event.key === "/" && !typing && !selectedId && !showForm) {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedId, showForm]);

  const handleMetadataLookup = useCallback(async (isbn: string) => {
    const normalizedIsbn = normalizeIsbn(isbn);
    if (!normalizedIsbn) {
      setLookupMessage("This is not a valid ISBN (13 digits starting with 978/979, or 10 digits).");
      return;
    }

    setIsLookingUpMetadata(true);
    setLookupMessage("Looking up book details...");

    try {
      const metadata = await lookupBookByIsbn(normalizedIsbn, { kind: formValues.kind });

      if (!metadata) {
        setFormValues((current) => ({ ...current, isbn: normalizedIsbn }));
        setLookupMessage("No book found for this ISBN in Open Library or the BnF. You can fill the form by hand.");
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
  }, [formValues.kind]);

  const handleDetectedIsbn = useCallback(
    (isbn: string) => {
      setScannerOpen(false);
      setShowForm(true);
      setFormValues((current) => ({ ...current, isbn }));
      void handleMetadataLookup(isbn);
    },
    [handleMetadataLookup]
  );

  const matchesSearch = useCallback(
    (book: Book) => {
      const query = search.trim().toLowerCase();
      return query.length === 0 || `${book.title} ${book.author} ${book.tags.join(" ")}`.toLowerCase().includes(query);
    },
    [search]
  );

  // Tab counts follow the search + type filters, so they always add up to what the list can show.
  const statusCounts = useMemo(() => {
    const scoped = bookList.filter((book) => (kind === "all" || book.kind === kind) && matchesSearch(book));
    const counts: Record<StatusFilter, number> = { all: scoped.length, owned: 0, reading: 0, borrowed: 0, wishlist: 0 };
    scoped.forEach((book) => {
      counts[book.status] += 1;
    });
    return counts;
  }, [bookList, kind, matchesSearch]);

  const filteredBooks = useMemo(() => {
    const result = bookList.filter(
      (book) =>
        (status === "all" || book.status === status) && (kind === "all" || book.kind === kind) && matchesSearch(book)
    );

    // "recent" keeps the order returned by the API (newest first).
    const comparators: Partial<Record<SortKey, (a: Book, b: Book) => number>> = {
      title: (a, b) => a.title.localeCompare(b.title),
      author: (a, b) => a.author.localeCompare(b.author),
      rating: (a, b) => b.rating - a.rating,
    };
    const comparator = comparators[sort];
    return comparator ? [...result].sort(comparator) : result;
  }, [bookList, status, kind, sort, matchesSearch]);

  const selectedBook = useMemo(
    () => bookList.find((book) => book.id === selectedId) ?? null,
    [bookList, selectedId]
  );

  const navigateSelected = (direction: -1 | 1) => {
    if (filteredBooks.length === 0) return;
    const index = filteredBooks.findIndex((book) => book.id === selectedId);
    if (index < 0) return;
    setSelectedId(filteredBooks[(index + direction + filteredBooks.length) % filteredBooks.length].id);
  };

  const missingCoverBooks = useMemo(() => bookList.filter(hasNoCover), [bookList]);
  const checkedBooks = useMemo(() => bookList.filter((book) => checkedIds.has(book.id)), [bookList, checkedIds]);

  const hasActiveFilters = status !== "all" || kind !== "all" || search.trim().length > 0;
  const clearFilters = () => {
    setSearch("");
    setStatus("all");
    setKind("all");
  };

  const closeForm = () => {
    setShowForm(false);
    setLookupMessage("");
  };

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
      kind: formValues.kind,
      title: formValues.title,
      author: formValues.author,
      isbn: formValues.isbn,
      year: formValues.year,
      status: formValues.status,
      description: formValues.description || "A newly added title to your library.",
      tags: formValues.tags.length > 0 ? formValues.tags : ["New"],
      // Empty on purpose: the UI falls back to the Open Library cover, then a per-kind placeholder.
      cover: formValues.cover || "",
      rating: 4.5,
      collectionIds: [],
    };

    await addBook(newBook);
    setFormValues(initialForm);
    closeForm();
  };

  const isEmptyLibrary = !isLoading && bookList.length === 0;

  return (
    <>
      <div>
        {/* Toolbar: floating pill at the top of the page (scrolls with the content) */}
        <div className="rounded-3xl border border-slate-200 bg-slate-50/90 p-2.5 shadow-sm">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[200px] flex-1">
              <svg
                className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <circle cx="11" cy="11" r="7" />
                <path d="m21 21-4.3-4.3" />
              </svg>
              <input
                ref={searchRef}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search title, author or tag…"
                aria-label="Search books"
                className="w-full rounded-full border border-slate-200 bg-white py-2.5 pl-10 pr-10 text-sm outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
              />
              <kbd
                aria-hidden="true"
                className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded border border-slate-200 px-1.5 font-mono text-[11px] text-slate-400"
              >
                /
              </kbd>
            </div>

            <select
              value={sort}
              onChange={(event) => setSort(event.target.value as SortKey)}
              aria-label="Sort books"
              className="rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 outline-none focus:border-indigo-400"
            >
              <option value="recent">Recently added</option>
              <option value="title">Title A–Z</option>
              <option value="author">Author A–Z</option>
              <option value="rating">Rating</option>
            </select>

            <div className="flex rounded-full border border-slate-200 bg-white p-0.5" role="group" aria-label="View">
              {(["grid", "list"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => changeView(mode)}
                  aria-pressed={view === mode}
                  aria-label={`${mode} view`}
                  title={`${mode} view`}
                  className={`rounded-full px-3 py-1.5 text-sm ${view === mode ? "bg-slate-900 text-white" : "text-slate-500"}`}
                >
                  {mode === "grid" ? "▦" : "☰"}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => (selectionMode ? exitSelectionMode() : setSelectionMode(true))}
              aria-pressed={selectionMode}
              aria-label="Refresh metadata"
              title="Refresh metadata"
              disabled={refreshRunning || bookList.length === 0}
              className={`flex h-10 w-10 items-center justify-center rounded-full border text-base hover:bg-slate-100 disabled:opacity-60 ${
                selectionMode ? "border-indigo-300 bg-indigo-50 text-indigo-700" : "border-slate-200 bg-white text-slate-700"
              }`}
            >
              ↻
            </button>
            <button
              type="button"
              onClick={() => setScannerOpen(true)}
              aria-label="Scan a book"
              title="Scan a book"
              className="flex h-10 w-10 items-center justify-center rounded-full border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
            >
              <svg className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 7V5a1 1 0 0 1 1-1h2M17 4h2a1 1 0 0 1 1 1v2M20 17v2a1 1 0 0 1-1 1h-2M7 20H5a1 1 0 0 1-1-1v-2M8 9v6M12 9v6M16 9v6" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="rounded-full bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-700"
            >
              + Add a book
            </button>
          </div>

          <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-dashed border-slate-200 pt-2.5">
            {/* Status tabs: the active one takes its own colour */}
            <div className="flex items-center gap-0.5 overflow-x-auto" role="tablist" aria-label="Filter by status">
              {(["all", ...STATUS_ORDER] as const).map((option) => {
                const active = status === option;
                const activeTone = option === "all" ? "bg-slate-900 text-white" : STATUS_META[option].chip;
                return (
                  <button
                    key={option}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setStatus(option)}
                    className={`flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-sm transition ${
                      active ? `${activeTone} font-bold` : "font-medium text-slate-600 hover:bg-slate-200/70"
                    }`}
                  >
                    {option !== "all" && (
                      <span aria-hidden="true" className={`h-2 w-2 rounded-full ${STATUS_META[option].dot}`} />
                    )}
                    <span>
                      {option === "all" ? "All" : STATUS_META[option].label}{" "}
                      <span className={active ? "opacity-70" : "text-slate-400"}>{statusCounts[option]}</span>
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Type chips */}
            <div className="ml-auto flex items-center gap-1.5" role="group" aria-label="Type">
              {(["all", ...BOOK_KINDS] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={kind === option}
                  onClick={() => setKind(option)}
                  className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                    kind === option
                      ? "border-indigo-300 bg-indigo-50 text-indigo-700"
                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  {option === "all" ? "Any" : option}
                </button>
              ))}
            </div>
          </div>

          {(selectionMode || progress) && (
            <div className="mt-3 rounded-2xl border border-indigo-200 bg-indigo-50 p-3 text-sm" role="region" aria-label="Refresh metadata">
              {progress ? (
                <div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-2 font-medium text-indigo-900" role="status">
                      {progress.running && (
                        <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.25" />
                          <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                        </svg>
                      )}
                      {progress.running
                        ? `Refreshing ${progress.done} / ${progress.total}… (${progress.refreshed} refreshed, ${progress.changed} changed)`
                        : `${progress.cancelled ? "Cancelled" : "Done"}: ${progress.refreshed} refreshed, ${progress.changed} changed${
                            progress.failed ? `, ${progress.failed} not found or failed` : ""
                          }`}
                    </span>
                    {progress.running ? (
                      <button type="button" onClick={cancel} className="rounded-full border border-indigo-300 px-3 py-1 font-semibold text-indigo-700 hover:bg-indigo-100">
                        Cancel
                      </button>
                    ) : (
                      <button type="button" onClick={dismiss} className="rounded-full border border-indigo-300 px-3 py-1 font-semibold text-indigo-700 hover:bg-indigo-100">
                        Dismiss
                      </button>
                    )}
                  </div>
                  {Object.keys(progress.providers).length > 0 && (
                    <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-indigo-900" aria-label="Sources queried">
                      {Object.entries(progress.providers).map(([name, stats]) => (
                        <li key={name}>
                          <span className="font-semibold">{name}</span>: {stats.found} found, {stats.notFound} not found
                          {stats.error > 0 && <span className="text-red-700">, {stats.error} error</span>}
                        </li>
                      ))}
                    </ul>
                  )}
                  <div
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={progress.total}
                    aria-valuenow={progress.done}
                    aria-label="Metadata refresh progress"
                    className="mt-2 h-2 overflow-hidden rounded-full bg-indigo-100"
                  >
                    <div
                      className="h-full rounded-full bg-indigo-600 transition-all"
                      style={{ width: `${(progress.done / progress.total) * 100}%` }}
                    />
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="mr-auto text-indigo-900">
                    Select books to refresh ({checkedBooks.length} selected)
                  </span>
                  <div className="w-full">
                    <RefreshFieldsPicker value={refreshFields} onChange={setRefreshFields} />
                  </div>
                  <button
                    type="button"
                    onClick={() => setCheckedIds(new Set(filteredBooks.map((book) => book.id)))}
                    className="rounded-full border border-indigo-300 px-3 py-1 font-semibold text-indigo-700 hover:bg-indigo-100"
                  >
                    Select all shown
                  </button>
                  <button
                    type="button"
                    disabled={checkedBooks.length === 0 || noFieldSelected}
                    onClick={() => {
                      const targets = checkedBooks;
                      exitSelectionMode();
                      void refreshMany(targets, refreshFields);
                    }}
                    className="rounded-full bg-indigo-600 px-3 py-1 font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
                  >
                    Refresh selected ({checkedBooks.length})
                  </button>
                  <button
                    type="button"
                    disabled={missingCoverBooks.length === 0 || noFieldSelected}
                    onClick={() => {
                      const targets = missingCoverBooks;
                      exitSelectionMode();
                      void refreshMany(targets, refreshFields);
                    }}
                    className="rounded-full bg-indigo-600 px-3 py-1 font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
                  >
                    Refresh without cover ({missingCoverBooks.length})
                  </button>
                  <button type="button" onClick={exitSelectionMode} className="rounded-full px-3 py-1 font-semibold text-indigo-700 hover:bg-indigo-100">
                    Close
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {!isLoading && !isEmptyLibrary && (
          <p className="mt-5 text-sm text-slate-500">
            {filteredBooks.length} of {bookList.length} items
          </p>
        )}

        <section className="mt-4" aria-busy={isLoading}>
          {isLoading ? (
            <div className="grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
              {Array.from({ length: 12 }, (_, index) => (
                <div key={index} className="animate-pulse">
                  <div className="aspect-[2/3] rounded-xl bg-slate-200" />
                  <div className="mt-2 h-3 w-4/5 rounded bg-slate-200" />
                  <div className="mt-1.5 h-3 w-1/2 rounded bg-slate-200" />
                </div>
              ))}
              <span className="sr-only">Loading library data…</span>
            </div>
          ) : isEmptyLibrary ? (
            <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-14 text-center">
              <p className="text-lg font-semibold text-slate-900">Your library is empty</p>
              <p className="mt-1 text-sm text-slate-500">Scan a barcode or add your first book by hand.</p>
              <div className="mt-5 flex justify-center gap-3">
                <button
                  type="button"
                  onClick={() => setScannerOpen(true)}
                  className="rounded-full border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-100"
                >
                  Scan a book
                </button>
                <button
                  type="button"
                  onClick={() => setShowForm(true)}
                  className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
                >
                  Add manually
                </button>
              </div>
            </div>
          ) : filteredBooks.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-14 text-center">
              <p className="text-lg font-semibold text-slate-900">No books match</p>
              <p className="mt-1 text-sm text-slate-500">Try another search or clear the filters.</p>
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="mt-4 rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
                >
                  Clear filters
                </button>
              )}
            </div>
          ) : view === "grid" ? (
            <div className="grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
              {filteredBooks.map((book) => (
                <BookCard
                  key={book.id}
                  book={book}
                  onSelectBook={handleBookClick}
                  selectionMode={selectionMode}
                  selected={checkedIds.has(book.id)}
                />
              ))}
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
              {filteredBooks.map((book) => (
                <BookRow
                  key={book.id}
                  book={book}
                  onSelectBook={handleBookClick}
                  selectionMode={selectionMode}
                  selected={checkedIds.has(book.id)}
                />
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Add-book drawer */}
      {showForm && (
        <div
          className="fixed inset-0 z-40 flex justify-end bg-slate-950/50"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeForm();
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") closeForm();
          }}
        >
          <aside
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-book-title"
            className="flex h-full w-full max-w-md flex-col bg-white shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <h3 id="add-book-title" className="text-xl font-semibold text-slate-900">
                Add a new book
              </h3>
              <button
                type="button"
                onClick={closeForm}
                aria-label="Close"
                className="flex h-9 w-9 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100"
              >
                ✕
              </button>
            </div>

            <form className="flex flex-1 flex-col overflow-hidden" onSubmit={handleSubmit}>
              <div className="flex-1 space-y-4 overflow-y-auto p-6">
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
                  {lookupMessage && <p className="mt-2 text-xs text-slate-500">{lookupMessage}</p>}
                </label>

                <label className="block text-sm text-slate-700">
                  Title
                  <input
                    name="title"
                    value={formValues.title}
                    onChange={handleInputChange}
                    className={inputClass}
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
                    className={inputClass}
                    placeholder="Patrick Rothfuss"
                    required
                  />
                </label>

                <div className="grid grid-cols-2 gap-4">
                  <label className="block text-sm text-slate-700">
                    Type
                    <select name="kind" value={formValues.kind} onChange={handleInputChange} className={inputClass}>
                      {BOOK_KINDS.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block text-sm text-slate-700">
                    Year
                    <input
                      name="year"
                      type="number"
                      value={formValues.year}
                      onChange={handleInputChange}
                      className={inputClass}
                      required
                    />
                  </label>
                </div>

                <label className="block text-sm text-slate-700">
                  Status
                  <select name="status" value={formValues.status} onChange={handleInputChange} className={inputClass}>
                    {STATUS_ORDER.map((option) => (
                      <option key={option} value={option}>
                        {STATUS_META[option].label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block text-sm text-slate-700">
                  Description
                  <textarea
                    name="description"
                    value={formValues.description}
                    onChange={handleInputChange}
                    rows={4}
                    className={inputClass}
                    placeholder="Short description or notes..."
                  />
                </label>
              </div>

              <div className="flex justify-end gap-3 border-t border-slate-200 px-6 py-4">
                <button
                  type="button"
                  onClick={closeForm}
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
          </aside>
        </div>
      )}

      {scannerOpen && (
        <BarcodeScannerModal onClose={() => setScannerOpen(false)} onIsbn={handleDetectedIsbn} />
      )}

      <BookDetailModal
        book={selectedBook}
        collections={collections}
        onClose={() => setSelectedId(null)}
        onNavigate={filteredBooks.length > 1 ? navigateSelected : undefined}
        onRefreshMetadata={refreshOne}
        onEdit={(bookId, updates) => updateBook(bookId, updates)}
        onStatusChange={(bookId, next) => void updateBook(bookId, { status: next })}
        onRatingChange={(bookId, rating) => void updateBook(bookId, { rating })}
        onDelete={async (bookId) => {
          await deleteBook(bookId);
          setSelectedId(null);
        }}
      />
    </>
  );
}
