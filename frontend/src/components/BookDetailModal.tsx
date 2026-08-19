import type { Book, BookStatus } from "../types";

interface BookDetailModalProps {
  book: Book | null;
  onClose: () => void;
  onStatusChange?: (bookId: string, status: BookStatus) => void;
  onDelete?: (bookId: string) => void;
}

const statusOptions: BookStatus[] = ["owned", "reading", "borrowed", "wishlist"];

export function BookDetailModal({
  book,
  onClose,
  onStatusChange,
  onDelete,
}: BookDetailModalProps) {
  if (!book) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
      <div className="w-full max-w-3xl overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Book details
            </p>
            <h3 className="mt-1 text-2xl font-bold text-slate-900">{book.title}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            Close
          </button>
        </div>

        <div className="grid gap-6 p-6 md:grid-cols-[220px_1fr]">
          <img src={book.cover} alt={book.title} className="h-72 w-full rounded-2xl object-cover md:h-full" />

          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-indigo-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-indigo-700">
                {book.status}
              </span>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-600">
                {book.rating.toFixed(1)}★
              </span>
            </div>

            <div>
              <p className="text-sm text-slate-500">by {book.author}</p>
              <p className="mt-2 text-base leading-7 text-slate-700">{book.description}</p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                Update status
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {statusOptions.map((status) => (
                  <button
                    key={status}
                    type="button"
                    onClick={() => onStatusChange?.(book.id, status)}
                    className={`rounded-full px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] transition ${
                      book.status === status
                        ? "bg-slate-900 text-white"
                        : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    {status}
                  </button>
                ))}
              </div>
            </div>

            <dl className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl bg-slate-50 p-3">
                <dt className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Year</dt>
                <dd className="mt-1 text-base font-semibold text-slate-900">{book.year}</dd>
              </div>
              <div className="rounded-2xl bg-slate-50 p-3">
                <dt className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">ISBN</dt>
                <dd className="mt-1 text-base font-semibold text-slate-900">{book.isbn}</dd>
              </div>
            </dl>

            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Tags</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {book.tags.map((tag) => (
                  <span key={tag} className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.08em] text-slate-600">
                    {tag}
                  </span>
                ))}
              </div>
            </div>

            <div className="flex justify-end border-t border-slate-200 pt-3">
              <button
                type="button"
                onClick={() => onDelete?.(book.id)}
                className="rounded-full border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-100"
              >
                Remove book
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
