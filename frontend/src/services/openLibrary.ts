import type { Book } from "../types";

interface OpenLibraryWork {
  title?: string;
  authors?: Array<{ name?: string }>;
  description?: string | { value?: string };
  covers?: number[];
  first_publish_year?: number;
  subjects?: string[];
}

interface LookupResult {
  title?: string;
  author?: string;
  description?: string;
  year?: number;
  cover?: string;
  tags?: string[];
}

export async function lookupBookByIsbn(isbn: string): Promise<LookupResult | null> {
  const normalizedIsbn = isbn.replace(/\s+/g, "");
  if (!normalizedIsbn) {
    return null;
  }

  try {
    const response = await fetch(`https://openlibrary.org/isbn/${encodeURIComponent(normalizedIsbn)}.json`);
    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as OpenLibraryWork;
    const title = data.title ?? "";
    const author = data.authors?.[0]?.name ?? "Unknown author";
    const description = typeof data.description === "string"
      ? data.description
      : data.description?.value ?? "";
    const year = data.first_publish_year ?? new Date().getFullYear();
    const cover = data.covers?.[0]
      ? `https://covers.openlibrary.org/b/id/${data.covers[0]}-L.jpg`
      : undefined;
    const tags = (data.subjects ?? []).slice(0, 4);

    return {
      title,
      author,
      description,
      year,
      cover,
      tags,
    };
  } catch {
    return null;
  }
}

export function buildBookFormFromMetadata(
  metadata: LookupResult,
  current: Partial<Book>
): Partial<Book> {
  return {
    ...current,
    title: metadata.title || current.title || "",
    author: metadata.author || current.author || "",
    description: metadata.description || current.description || "",
    year: metadata.year || current.year || new Date().getFullYear(),
    cover: metadata.cover || current.cover || "",
    tags: metadata.tags && metadata.tags.length > 0 ? metadata.tags : current.tags ?? ["New"],
  };
}
