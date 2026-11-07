import { STATUS_META } from "../bookStatus";
import type { Book } from "../types";
import { BookCover } from "./BookCover";

interface BookCardProps {
  book: Book;
  onSelectBook?: (book: Book) => void;
  /** When true, the card shows a checkbox and `onSelectBook` is used to toggle it. */
  selectionMode?: boolean;
  selected?: boolean;
}

export function BookCard({ book, onSelectBook, selectionMode = false, selected = false }: BookCardProps) {
  const status = STATUS_META[book.status];

  return (
    <button
      type="button"
      onClick={() => onSelectBook?.(book)}
      aria-label={`${book.title} by ${book.author}`}
      aria-pressed={selectionMode ? selected : undefined}
      className="group flex h-full w-full flex-col items-stretch justify-start text-left focus:outline-none"
    >
      <div
        className={`relative aspect-[2/3] origin-bottom overflow-hidden rounded-l-sm rounded-r-xl shadow-md transition duration-200 group-hover:-translate-y-1 group-hover:-rotate-[0.4deg] group-hover:shadow-xl group-focus-visible:ring-4 group-focus-visible:ring-indigo-300 ${
          selected ? "ring-4 ring-indigo-500" : "ring-1 ring-black/5"
        }`}
      >
        <BookCover book={book} />
        {/* Hardcover spine: a bright hinge line, then a soft shadow falling onto the cover. */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-0 w-3 bg-gradient-to-r from-black/30 via-black/5 to-transparent"
        />
        <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-[3px] w-px bg-white/30" />
        {selectionMode && (
          <span
            aria-hidden="true"
            className={`absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full text-sm font-bold ring-2 ring-white ${
              selected ? "bg-indigo-600 text-white" : "bg-white/80 text-transparent"
            }`}
          >
            ✓
          </span>
        )}
        <span className="absolute bottom-2 right-2 rounded-full bg-slate-950/70 px-2 py-0.5 text-[11px] font-medium text-white opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100">
          ★ {book.rating.toFixed(1)}
        </span>
      </div>
      {/* Fixed two-line title block so every author line starts at the same height. */}
      <p className="mt-2 line-clamp-2 text-sm font-semibold leading-snug text-slate-900">{book.title}</p>
      <p className="truncate text-xs text-slate-500">{book.author}</p>
      {/* Status bar: a short tick that grows to full width on hover. */}
      <span
        title={status.label}
        className={`mt-2 block h-[3px]  w-7 rounded-full transition-all duration-200 group-hover:w-full group-focus-visible:w-full ${status.dot}`}
      />
      <span className="sr-only">{status.label}</span>
    </button>
  );
}
