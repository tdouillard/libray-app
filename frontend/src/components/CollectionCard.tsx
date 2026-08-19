import type { Collection } from "../types";

interface CollectionCardProps {
  collection: Collection;
  bookCount: number;
}

export function CollectionCard({ collection, bookCount }: CollectionCardProps) {
  return (
    <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className={`h-28 bg-gradient-to-r ${collection.accent}`} />
      <div className="space-y-4 p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              {collection.type}
            </p>
            <h3 className="mt-2 text-xl font-semibold text-slate-900">{collection.name}</h3>
          </div>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
            {bookCount} books
          </span>
        </div>

        <p className="text-sm leading-6 text-slate-600">{collection.description}</p>

        <div className="flex items-center justify-between border-t border-slate-200 pt-4">
          <span className="text-sm font-medium text-slate-500">Preview</span>
          <button className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50">
            Open collection
          </button>
        </div>
      </div>
    </article>
  );
}
