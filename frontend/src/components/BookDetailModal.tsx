import { useEffect, useRef, useState } from "react";
import { STATUS_META, STATUS_ORDER } from "../bookStatus";
import { ALL_REFRESH_FIELDS } from "../services/bookLookup";
import type { RefreshFields, RefreshOutcome } from "../services/bookLookup";
import type { RefreshOneResult } from "../hooks/useMetadataRefresh";
import { BOOK_KINDS } from "../types";
import type { Book, BookKind, BookStatus, Collection } from "../types";
import { BookCover, resolveCoverUrl } from "./BookCover";
import { RefreshFieldsPicker } from "./RefreshFieldsPicker";

interface BookDetailModalProps {
  book: Book | null;
  collections?: Collection[];
  onClose: () => void;
  onStatusChange?: (bookId: string, status: BookStatus) => void;
  onRatingChange?: (bookId: string, rating: number) => void;
  onDelete?: (bookId: string) => void;
  /** Step through the currently visible books without closing the dialog. */
  onNavigate?: (direction: -1 | 1) => void;
  /** Re-fetches title, cover, etc. from the online catalogues. */
  onRefreshMetadata?: (book: Book, fields: RefreshFields) => Promise<RefreshOneResult>;
  /** Saves manual edits (title, author, category, cover). */
  onEdit?: (bookId: string, updates: Partial<Book>) => Promise<void> | void;
}

const PROVIDER_STATUS_LABEL = { found: "✓ found", "not-found": "✗ not found", error: "⚠ error" } as const;

const REFRESH_MESSAGES: Record<RefreshOutcome, string> = {
  updated: "Metadata updated",
  unchanged: "Already up to date",
  "not-found": "Nothing found for this ISBN",
  "no-isbn": "No valid ISBN on this book",
  error: "Refresh failed, try again",
};

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

export function BookDetailModal(props: BookDetailModalProps) {
  // Re-key on the book so transient state (delete confirmation, copied flag) resets per book.
  return props.book ? <DetailDialog key={props.book.id} {...props} book={props.book} /> : null;
}

function DetailDialog({
  book,
  collections = [],
  onClose,
  onStatusChange,
  onRatingChange,
  onDelete,
  onNavigate,
  onRefreshMetadata,
  onEdit,
}: BookDetailModalProps & { book: Book }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshResult, setRefreshResult] = useState<RefreshOneResult | null>(null);
  const [refreshFields, setRefreshFields] = useState<RefreshFields>(ALL_REFRESH_FIELDS);
  const [showRefreshOptions, setShowRefreshOptions] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState({ title: "", author: "", kind: "Book" as BookKind, cover: "" });

  const startEditing = () => {
    setDraft({ title: book.title, author: book.author, kind: book.kind, cover: book.cover });
    setEditing(true);
  };

  const saveEdit = async () => {
    if (!onEdit || saving) return;
    const next = {
      title: draft.title.trim() || book.title, // a book can't end up without a title
      author: draft.author.trim(),
      kind: draft.kind,
      cover: draft.cover.trim(),
    };
    const changes = Object.fromEntries(
      Object.entries(next).filter(([key, value]) => value !== book[key as keyof typeof next])
    ) as Partial<Book>;
    setSaving(true);
    try {
      if (Object.keys(changes).length > 0) await onEdit(book.id, changes);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const refreshMetadata = async () => {
    if (!onRefreshMetadata || refreshing) return;
    setRefreshing(true);
    setRefreshResult(null);
    try {
      setRefreshResult(await onRefreshMetadata(book, refreshFields));
    } finally {
      setRefreshing(false);
    }
  };
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [copied, setCopied] = useState(false);
  const coverUrl = resolveCoverUrl(book);
  const bookCollections = collections.filter((collection) => book.collectionIds.includes(collection.id));

  // Lock page scroll and restore focus to whatever opened the dialog.
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus?.();
    };
  }, []);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      onClose();
      return;
    }

    if (event.key === "Tab") {
      const items = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []).filter(
        (element) => !element.hasAttribute("disabled")
      );
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
      return;
    }

    const target = event.target as HTMLElement;
    const typing = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT";
    if (!typing && onNavigate && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
      onNavigate(event.key === "ArrowLeft" ? -1 : 1);
    }
  };

  const copyIsbn = async () => {
    try {
      await navigator.clipboard.writeText(book.isbn);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard can be unavailable (insecure context); the ISBN stays selectable.
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 sm:items-center sm:p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="book-detail-title"
        onKeyDown={handleKeyDown}
        className="relative flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl"
      >
        {/* Blurred cover as a soft header background */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-40 scale-125 overflow-hidden bg-slate-100 opacity-50 blur-2xl"
        >
          {coverUrl && <img src={coverUrl} alt="" className="h-full w-full object-cover" onError={(e) => e.currentTarget.remove()} />}
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white/80 text-slate-600 shadow hover:bg-white"
        >
          ✕
        </button>

        <div className="relative grid gap-6 overflow-y-auto p-6 sm:grid-cols-[200px_1fr] sm:p-8">
          <div>
            <div className="mx-auto aspect-[2/3] w-full max-w-[200px] overflow-hidden rounded-xl shadow-xl ring-1 ring-black/10 sm:mx-0">
              <BookCover book={book} />
            </div>
            {book.isbn && (
              <div className="mt-4 flex items-center gap-2 text-xs text-slate-500">
                <span>ISBN</span>
                <span className="select-all font-mono text-slate-700">{book.isbn}</span>
                <button
                  type="button"
                  onClick={() => void copyIsbn()}
                  className="rounded-md border border-slate-200 px-1.5 py-0.5 hover:bg-slate-50"
                >
                  {copied ? "copied" : "copy"}
                </button>
              </div>
            )}
          </div>

          <div className="min-w-0 space-y-5">
            {editing ? (
              <form
                aria-label="Edit book"
                className="space-y-3 rounded-2xl border border-slate-200 bg-white/80 p-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  void saveEdit();
                }}
              >
                <h2 id="book-detail-title" className="sr-only">
                  Editing {book.title}
                </h2>
                <label className="block text-sm font-medium text-slate-700">
                  Title
                  <input
                    value={draft.title}
                    onChange={(event) => setDraft({ ...draft, title: event.target.value })}
                    required
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-slate-900"
                  />
                </label>
                <label className="block text-sm font-medium text-slate-700">
                  Author
                  <input
                    value={draft.author}
                    onChange={(event) => setDraft({ ...draft, author: event.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-slate-900"
                  />
                </label>
                <label className="block text-sm font-medium text-slate-700">
                  Category
                  <select
                    value={draft.kind}
                    onChange={(event) => setDraft({ ...draft, kind: event.target.value as BookKind })}
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-900"
                  >
                    {BOOK_KINDS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm font-medium text-slate-700">
                  Cover image URL
                  <input
                    type="url"
                    value={draft.cover}
                    onChange={(event) => setDraft({ ...draft, cover: event.target.value })}
                    placeholder="https://…"
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-slate-900"
                  />
                </label>
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={saving}
                    className="rounded-full bg-indigo-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-60"
                  >
                    {saving ? "Saving…" : "Save"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditing(false)}
                    className="rounded-full border border-slate-200 px-4 py-1.5 text-sm hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-indigo-600">
                  {book.kind} · {book.year}
                </p>
                <h2 id="book-detail-title" className="mt-1 text-2xl font-bold leading-tight text-slate-900 sm:text-3xl">
                  {book.title}
                </h2>
                <p className="mt-1 text-slate-600">{book.author}</p>
                {onEdit && (
                  <button
                    type="button"
                    onClick={startEditing}
                    className="mt-2 rounded-full border border-slate-200 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                  >
                    ✎ Edit title, author, category, cover
                  </button>
                )}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center text-xl" role="group" aria-label="Rating">
                {[1, 2, 3, 4, 5].map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => onRatingChange?.(book.id, value)}
                    aria-label={`${value} star${value > 1 ? "s" : ""}`}
                    className={`transition hover:scale-110 ${book.rating >= value - 0.25 ? "text-amber-400" : "text-slate-300"}`}
                  >
                    ★
                  </button>
                ))}
                <span className="ml-2 text-sm text-slate-500">{book.rating.toFixed(1)}</span>
              </div>

              <div className="flex rounded-full bg-slate-100 p-0.5 text-xs font-semibold" role="group" aria-label="Status">
                {STATUS_ORDER.map((status) => (
                  <button
                    key={status}
                    type="button"
                    aria-pressed={book.status === status}
                    onClick={() => onStatusChange?.(book.id, status)}
                    className={`rounded-full px-3 py-1.5 transition ${
                      book.status === status ? "bg-white text-slate-900 shadow" : "text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    {STATUS_META[status].label}
                  </button>
                ))}
              </div>
            </div>

            {book.description && (
              <p className="max-h-40 overflow-y-auto pr-1 text-[15px] leading-7 text-slate-700">{book.description}</p>
            )}

            {book.tags.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Tags</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {book.tags.map((tag) => (
                    <span key={tag} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                      #{tag}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {bookCollections.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Collections</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {bookCollections.map((collection) => (
                    <span key={collection.id} className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700">
                      {collection.name}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {showRefreshOptions && onRefreshMetadata && (
          <div className="relative border-t border-slate-200 bg-white px-6 py-3 sm:px-8">
            <RefreshFieldsPicker value={refreshFields} onChange={setRefreshFields} disabled={refreshing} />
          </div>
        )}

        {refreshResult && (
          <div role="status" className="relative border-t border-slate-200 bg-slate-50 px-6 py-3 text-sm sm:px-8">
            <p className="font-semibold text-slate-800">{REFRESH_MESSAGES[refreshResult.outcome]}</p>
            {refreshResult.trace.length > 0 && (
              <ul className="mt-2 space-y-1" aria-label="Sources queried">
                {refreshResult.trace.map((entry) => (
                  <li key={entry.name} className="flex items-center justify-between gap-4">
                    {entry.status === "found" && entry.url ? (
                      <a
                        href={entry.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-indigo-600 underline decoration-indigo-300 underline-offset-2 hover:text-indigo-500"
                      >
                        {entry.name} ↗
                      </a>
                    ) : (
                      <span className="text-slate-600">{entry.name}</span>
                    )}
                    <span
                      className={`font-medium ${
                        entry.status === "found"
                          ? "text-emerald-700"
                          : entry.status === "error"
                            ? "text-red-700"
                            : "text-slate-500"
                      }`}
                    >
                      {PROVIDER_STATUS_LABEL[entry.status]}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="relative flex items-center justify-between border-t border-slate-200 bg-white/90 px-6 py-3 sm:px-8">
          <div className="flex items-center gap-2">
            {confirmingDelete ? (
              <>
                <span className="text-sm text-red-700">Remove this book?</span>
                <button
                  type="button"
                  onClick={() => onDelete?.(book.id)}
                  className="rounded-full bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-500"
                >
                  Yes, remove
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(false)}
                  className="rounded-full border border-slate-200 px-3 py-1.5 text-sm hover:bg-slate-50"
                >
                  Cancel
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(true)}
                  className="rounded-full px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50"
                >
                  Remove
                </button>
                {onRefreshMetadata && (
                  <button
                    type="button"
                    onClick={() => void refreshMetadata()}
                    disabled={refreshing || !Object.values(refreshFields).some(Boolean)}
                    aria-busy={refreshing}
                    className="flex items-center gap-2 whitespace-nowrap rounded-full border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-wait disabled:opacity-70"
                  >
                    <svg
                      className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <path d="M21 12a9 9 0 1 1-3-6.7" />
                      <path d="M21 4v5h-5" />
                    </svg>
                    {refreshing ? "Refreshing…" : "Refresh metadata"}
                  </button>
                )}
                {onRefreshMetadata && (
                  <button
                    type="button"
                    onClick={() => setShowRefreshOptions((open) => !open)}
                    aria-expanded={showRefreshOptions}
                    aria-label="Choose fields to refresh"
                    className="rounded-full px-2 py-1.5 text-sm text-slate-500 hover:bg-slate-50"
                  >
                    {showRefreshOptions ? "▴" : "▾"}
                  </button>
                )}
              </>
            )}
          </div>

          <div className="flex items-center gap-2">
            {onNavigate && (
              <>
                <button
                  type="button"
                  onClick={() => onNavigate(-1)}
                  aria-label="Previous book"
                  className="rounded-full border border-slate-200 px-3 py-1.5 text-sm hover:bg-slate-50"
                >
                  ←
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate(1)}
                  aria-label="Next book"
                  className="rounded-full border border-slate-200 px-3 py-1.5 text-sm hover:bg-slate-50"
                >
                  →
                </button>
              </>
            )}
            <button
              type="button"
              data-autofocus
              onClick={onClose}
              className="rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white hover:bg-slate-700"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
