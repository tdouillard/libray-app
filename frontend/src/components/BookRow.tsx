import { STATUS_META } from "../bookStatus";
import { displayTitle } from "../bookTitle";
import type { Book } from "../types";
import { BookCover } from "./BookCover";

interface BookRowProps {
  book: Book;
  onSelectBook?: (book: Book) => void;
  /** When true, the row shows a checkbox and `onSelectBook` is used to toggle it. */
  selectionMode?: boolean;
  selected?: boolean;
}

export function BookRow({ book, onSelectBook, selectionMode = false, selected = false }: BookRowProps) {
  const status = STATUS_META[book.status];

  return (
    <button
      type="button"
      onClick={() => onSelectBook?.(book)}
      aria-pressed={selectionMode ? selected : undefined}
      className={`flex w-full items-center gap-4 border-b border-slate-100 px-4 py-3 text-left last:border-0 hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none ${
        selected ? "bg-indigo-50" : ""
      }`}
    >
      {selectionMode && (
        <span
          aria-hidden="true"
          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border text-xs font-bold ${
            selected ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-300 bg-white text-transparent"
          }`}
        >
          ✓
        </span>
      )}
      <div className="h-16 w-11 shrink-0 overflow-hidden rounded-md shadow ring-1 ring-black/5">
        <BookCover book={book} variant="compact" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold text-slate-900">{displayTitle(book)}</p>
        <p className="truncate text-sm text-slate-500">{book.author}</p>
      </div>
      <span className="hidden w-16 text-xs font-semibold uppercase tracking-wider text-slate-400 sm:block">
        {book.kind}
      </span>
      <span className="hidden w-12 text-sm text-slate-500 md:block">{book.year}</span>
      <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${status.chip}`}>{status.label}</span>
      <span className="w-12 text-right text-sm text-slate-600">★ {book.rating.toFixed(1)}</span>
    </button>
  );
}
