import type { ScannedBook } from "../hooks/useScanBatch";
import { BOOK_KINDS, type BookKind } from "../types";

const kindStyles: Record<BookKind, string> = {
  Book: "bg-sky-700",
  BD: "bg-amber-700",
  Manga: "bg-pink-700",
};

interface ScannedBookRowProps {
  book: ScannedBook;
  variant: "main" | "rescan";
  onCycleKind: (id: string, kind: BookKind) => void;
  onConfirm: (id: string) => void;
  onRescan: (id: string) => void;
  onMoveBack: (id: string) => void;
  onRelookup: (id: string) => void;
  onRemove: (id: string) => void;
}

const iconButton =
  "flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-base transition hover:bg-slate-50 active:scale-95";

export function ScannedBookRow({
  book,
  variant,
  onCycleKind,
  onConfirm,
  onRescan,
  onMoveBack,
  onRelookup,
  onRemove,
}: ScannedBookRowProps) {
  const loading = book.status === "loading";
  const notFound = book.status === "notFound";
  const nextKind = BOOK_KINDS[(BOOK_KINDS.indexOf(book.kind) + 1) % BOOK_KINDS.length];

  const tone = book.confirmed
    ? "border-emerald-200 bg-emerald-50"
    : notFound
      ? "border-amber-200 bg-amber-50"
      : "border-slate-100 bg-white";

  return (
    <li className={`flex items-center gap-3 rounded-2xl border p-2 ${tone}`} data-testid="scanned-row">
      {loading ? (
        <div className="h-[60px] w-[42px] shrink-0 animate-pulse rounded bg-slate-200" />
      ) : book.cover ? (
        <img src={book.cover} alt="" className="h-[60px] w-[42px] shrink-0 rounded object-cover" />
      ) : (
        <div className="flex h-[60px] w-[42px] shrink-0 items-center justify-center rounded bg-slate-300 text-lg text-white">
          ?
        </div>
      )}

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-slate-900">
          {loading ? "Looking up…" : book.title || "Unknown book"}
          {book.owned && (
            <span className="ml-1.5 rounded-full bg-indigo-100 px-1.5 py-0.5 text-[10px] font-bold text-indigo-800">
              Owned
            </span>
          )}
          {notFound && (
            <span className="ml-1.5 rounded-full bg-amber-200 px-1.5 py-0.5 text-[10px] font-bold text-amber-900">
              Not found
            </span>
          )}
        </p>
        <p className="truncate text-xs text-slate-500">{book.author || `ISBN ${book.isbn}`}</p>
        <button
          type="button"
          onClick={() => onCycleKind(book.id, nextKind)}
          title="Tap to change the type"
          aria-label={`Type: ${book.kind}. Change to ${nextKind}`}
          className={`mt-1 rounded-full px-2 py-0.5 text-[10px] font-extrabold text-white ${kindStyles[book.kind]}`}
        >
          {book.kind} ▾
        </button>
      </div>

      <div className="flex shrink-0 gap-1">
        {variant === "main" ? (
          <>
            <button
              type="button"
              className={`${iconButton} text-emerald-600`}
              aria-label="Validate"
              aria-pressed={book.confirmed}
              onClick={() => onConfirm(book.id)}
            >
              ✓
            </button>
            <button
              type="button"
              className={`${iconButton} text-indigo-600`}
              aria-label="Rescan later"
              onClick={() => onRescan(book.id)}
            >
              ↻
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className={`${iconButton} text-indigo-600`}
              aria-label="Look up again"
              disabled={loading}
              onClick={() => onRelookup(book.id)}
            >
              ⟳
            </button>
            <button
              type="button"
              className={`${iconButton} text-emerald-600`}
              aria-label="Move back to review"
              onClick={() => onMoveBack(book.id)}
            >
              ↩
            </button>
          </>
        )}
        <button
          type="button"
          className={`${iconButton} text-red-600`}
          aria-label="Remove"
          onClick={() => onRemove(book.id)}
        >
          ✕
        </button>
      </div>
    </li>
  );
}
