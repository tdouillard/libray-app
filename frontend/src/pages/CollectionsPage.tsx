import { useState } from "react";
import { CollectionCard } from "../components/CollectionCard";
import { useLibraryData } from "../hooks/useLibraryData";
import type { Collection } from "../types";

const defaultCollectionForm = {
  name: "",
  description: "",
  accent: "from-violet-500 to-fuchsia-500",
};

export function CollectionsPage() {
  const { books, collections, isLoading, addCollection } = useLibraryData();
  const [showForm, setShowForm] = useState(false);
  const [formValues, setFormValues] = useState(defaultCollectionForm);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const newCollection: Collection = {
      id: `collection-${Date.now()}`,
      name: formValues.name,
      description: formValues.description || "A curated shelf of favorites.",
      accent: formValues.accent,
      type: "Default",
      bookIds: [],
    };

    await addCollection(newCollection);
    setFormValues(defaultCollectionForm);
    setShowForm(false);
  };

  return (
    <div className="space-y-8">
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-violet-600">
              Collections
            </p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-slate-900">
              Organize your shelves by mood, theme, or series
            </h2>
          </div>

          <button
            type="button"
            onClick={() => setShowForm((current) => !current)}
            className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-slate-50 px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-white"
          >
            {showForm ? "Close form" : "+ New collection"}
          </button>
        </div>
      </section>

      {showForm && (
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <form className="grid gap-4 md:grid-cols-2" onSubmit={handleSubmit}>
            <label className="block text-sm text-slate-700 md:col-span-2">
              Collection name
              <input
                value={formValues.name}
                onChange={(event) => setFormValues((current) => ({ ...current, name: event.target.value }))}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 outline-none transition focus:border-violet-400 focus:bg-white"
                placeholder="My favorite fantasy reads"
                required
              />
            </label>

            <label className="block text-sm text-slate-700 md:col-span-2">
              Description
              <textarea
                value={formValues.description}
                onChange={(event) => setFormValues((current) => ({ ...current, description: event.target.value }))}
                rows={3}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 outline-none transition focus:border-violet-400 focus:bg-white"
                placeholder="A short description ..."
              />
            </label>

            <label className="block text-sm text-slate-700">
              Accent style
              <select
                value={formValues.accent}
                onChange={(event) => setFormValues((current) => ({ ...current, accent: event.target.value }))}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 outline-none transition focus:border-violet-400 focus:bg-white"
              >
                <option value="from-violet-500 to-fuchsia-500">Violet</option>
                <option value="from-sky-500 to-cyan-500">Sky</option>
                <option value="from-emerald-500 to-teal-500">Emerald</option>
                <option value="from-amber-500 to-orange-500">Amber</option>
                <option value="from-pink-500 to-rose-500">Pink</option>
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
                className="rounded-full bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-500"
              >
                Save collection
              </button>
            </div>
          </form>
        </section>
      )}

      <section className="grid gap-6 lg:grid-cols-[1.4fr_0.6fr]">
        <div className="grid gap-5 md:grid-cols-2">
          {isLoading ? (
            <div className="md:col-span-2 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center text-slate-500">
              Loading collections…
            </div>
          ) : collections.length > 0 ? (
            collections.map((collection) => {
              const collectionBooks = books.filter((book) => collection.bookIds.includes(book.id));

              return (
                <CollectionCard
                  key={collection.id}
                  collection={collection}
                  bookCount={collectionBooks.length}
                />
              );
            })
          ) : (
            <div className="md:col-span-2 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center text-slate-500">
              No collections yet. Start by creating one.
            </div>
          )}
        </div>

        <aside className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
            Recent picks
          </p>
          <div className="mt-5 space-y-4">
            {books.slice(0, 4).map((book) => (
              <div key={book.id} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                <img src={book.cover} alt={book.title} className="h-16 w-12 rounded-xl object-cover" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-900">{book.title}</p>
                  <p className="text-xs text-slate-500">{book.author}</p>
                </div>
                <span className="rounded-full bg-white px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-600">
                  {book.status}
                </span>
              </div>
            ))}
          </div>
        </aside>
      </section>
    </div>
  );
}
