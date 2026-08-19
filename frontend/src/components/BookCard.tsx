import type { Book } from "../types";

const statusStyles = {
  owned: "bg-emerald-100 text-emerald-700",
  reading: "bg-sky-100 text-sky-700",
  borrowed: "bg-amber-100 text-amber-700",
  wishlist: "bg-violet-100 text-violet-700",
};

interface BookCardProps {
  book: Book;
  onSelectBook?: (book: Book) => void;
}

export function BookCard({ book, onSelectBook }: BookCardProps) {
  return (
    <article className="group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition duration-200 hover:-translate-y-1 hover:shadow-md">
      <div className="flex h-full flex-col">
        <div className="relative h-44 overflow-hidden">
          <img
            src={book.cover}
            alt={book.title}
            className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
          />
          <div className="absolute inset-x-0 top-0 flex items-center justify-between p-3">
            <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${statusStyles[book.status]}`}>
              {book.status}
            </span>
            <span className="rounded-full bg-slate-950/70 px-2 py-1 text-xs font-medium text-white">
              {book.rating.toFixed(1)}★
            </span>
          </div>
        </div>

        <div className="flex flex-1 flex-col gap-3 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">{book.title}</h3>
              <p className="text-sm text-slate-600">{book.author}</p>
            </div>
            <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-600">
              {book.year}
            </span>
          </div>

          <p className="line-clamp-3 text-sm leading-6 text-slate-600">{book.description}</p>

          <div className="flex flex-wrap gap-2">
            {book.tags.slice(0, 3).map((tag) => (
              <span key={tag} className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.08em] text-slate-600">
                {tag}
              </span>
            ))}
          </div>

          <div className="mt-auto flex items-center justify-between border-t border-slate-200 pt-3">
            <span className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
              ISBN {book.isbn}
            </span>
            <button
              type="button"
              onClick={() => onSelectBook?.(book)}
              className="rounded-full bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-700"
            >
              View details
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}
