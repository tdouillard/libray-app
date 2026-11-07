import type { Book } from "../types";
import { normalizeIsbn } from "./isbn";

/**
 * Looks a book up from its ISBN using several open, CORS-enabled catalogues in parallel and
 * merges the answers:
 *  - Google Books      : best covers/descriptions, good coverage of recent releases
 *  - Open Library      : open data, good for international titles
 *  - BnF (SRU, DC)     : French national library, authoritative for French BD / manga
 *
 * Every provider is optional: a failing / rate-limited / empty provider never breaks the lookup.
 */

export interface LookupResult {
  title?: string;
  author?: string;
  description?: string;
  year?: number;
  cover?: string;
  tags?: string[];
  publisher?: string;
  sources?: string[];
}

type ProviderResult = Omit<LookupResult, "sources"> | null;
type Provider = { name: string; run: (isbn: string, signal: AbortSignal) => Promise<ProviderResult> };

const PROVIDER_TIMEOUT_MS = 8000;
const COVER_TIMEOUT_MS = 4000;
const GOOGLE_BOOKS_API_KEY = import.meta.env?.VITE_GOOGLE_BOOKS_API_KEY as string | undefined;

function parseYear(value: unknown): number | undefined {
  if (typeof value !== "string" && typeof value !== "number") {
    return undefined;
  }
  const match = String(value).match(/\b(1[5-9]\d{2}|20\d{2})\b/);
  return match ? Number(match[1]) : undefined;
}

function toHttps(url: string | undefined): string | undefined {
  return url ? url.replace(/^http:\/\//i, "https://") : undefined;
}

async function fetchJson<T>(url: string, signal: AbortSignal): Promise<T | null> {
  const response = await fetch(url, { signal });
  if (!response.ok) {
    return null;
  }
  return (await response.json()) as T;
}

/* ------------------------------------------------------------------ Google Books */

interface GoogleBooksResponse {
  items?: Array<{
    volumeInfo?: {
      title?: string;
      subtitle?: string;
      authors?: string[];
      publisher?: string;
      publishedDate?: string;
      description?: string;
      categories?: string[];
      imageLinks?: { thumbnail?: string; smallThumbnail?: string };
    };
  }>;
}

const googleBooksProvider: Provider = {
  name: "Google Books",
  async run(isbn, signal) {
    const key = GOOGLE_BOOKS_API_KEY ? `&key=${encodeURIComponent(GOOGLE_BOOKS_API_KEY)}` : "";
    const data = await fetchJson<GoogleBooksResponse>(
      `https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}&maxResults=1${key}`,
      signal
    );
    const info = data?.items?.[0]?.volumeInfo;
    if (!info?.title) {
      return null;
    }

    const thumbnail = info.imageLinks?.thumbnail ?? info.imageLinks?.smallThumbnail;

    return {
      title: info.subtitle ? `${info.title} - ${info.subtitle}` : info.title,
      author: info.authors?.join(", "),
      description: info.description,
      year: parseYear(info.publishedDate),
      publisher: info.publisher,
      cover: toHttps(thumbnail)?.replace("&edge=curl", "").replace("zoom=1", "zoom=2"),
      tags: info.categories?.slice(0, 4),
    };
  },
};

/* ------------------------------------------------------------------ Open Library */

interface OpenLibraryBook {
  title?: string;
  subtitle?: string;
  authors?: Array<{ name?: string }>;
  publishers?: Array<{ name?: string }>;
  publish_date?: string;
  cover?: { large?: string; medium?: string };
  subjects?: Array<{ name?: string }>;
}

const openLibraryProvider: Provider = {
  name: "Open Library",
  async run(isbn, signal) {
    const data = await fetchJson<Record<string, OpenLibraryBook>>(
      `https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`,
      signal
    );
    const book = data?.[`ISBN:${isbn}`];
    if (!book?.title) {
      return null;
    }

    return {
      title: book.subtitle ? `${book.title} - ${book.subtitle}` : book.title,
      author: book.authors
        ?.map((author) => author.name)
        .filter(Boolean)
        .join(", "),
      year: parseYear(book.publish_date),
      publisher: book.publishers?.[0]?.name,
      cover: book.cover?.large ?? book.cover?.medium,
      tags: book.subjects
        ?.map((subject) => subject.name)
        .filter((name): name is string => Boolean(name))
        .slice(0, 4),
    };
  },
};

/* ------------------------------------------------------------------ BnF (France) */

/** "Goscinny, René (1926-1977). Auteur" -> "René Goscinny" */
export function cleanBnfCreator(raw: string): string {
  const withoutRole = raw.replace(/^'+/, "").replace(/\.\s*[A-ZÀ-Ý][^.()]*$/, "");
  const withoutDates = withoutRole.replace(/\s*\([^)]*\)/g, "").trim();
  const [last, first] = withoutDates.split(/,\s*/);
  return first ? `${first} ${last}`.trim() : withoutDates;
}

function parseBnfRecord(xml: string): ProviderResult {
  const doc = new DOMParser().parseFromString(xml, "text/xml");
  const values = (tag: string) =>
    Array.from(doc.getElementsByTagNameNS("http://purl.org/dc/elements/1.1/", tag))
      .map((node) => node.textContent?.normalize("NFC").trim() ?? "")
      .filter(Boolean);

  const title = values("title")[0];
  if (!title) {
    return null;
  }

  const creators = Array.from(new Set(values("creator").map(cleanBnfCreator).filter(Boolean)));
  const publisher = values("publisher")[0]?.replace(/\s*\([^)]*\)\s*$/, "");
  const collection = values("description")
    .find((text) => text.startsWith("Collection :"))
    ?.replace("Collection :", "")
    .trim();

  return {
    title,
    author: creators.join(", ") || undefined,
    year: parseYear(values("date")[0]),
    publisher,
    tags: collection ? [collection] : undefined,
  };
}

const bnfProvider: Provider = {
  name: "BnF",
  async run(isbn, signal) {
    const query = encodeURIComponent(`bib.isbn adj "${isbn}"`);
    const response = await fetch(
      `https://catalogue.bnf.fr/api/SRU?version=1.2&operation=searchRetrieve&query=${query}&recordSchema=dublincore&maximumRecords=1`,
      { signal }
    );
    if (!response.ok) {
      return null;
    }
    return parseBnfRecord(await response.text());
  },
};

/* ------------------------------------------------------------------ cover fallback */

/** Open Library covers by ISBN. Resolves to the URL only when an actual cover exists. */
function probeOpenLibraryCover(isbn: string): Promise<string | undefined> {
  if (typeof Image === "undefined") {
    return Promise.resolve(undefined);
  }

  const url = `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg?default=false`;

  return new Promise((resolve) => {
    const image = new Image();
    const timer = window.setTimeout(() => resolve(undefined), COVER_TIMEOUT_MS);
    image.onload = () => {
      window.clearTimeout(timer);
      resolve(url);
    };
    image.onerror = () => {
      window.clearTimeout(timer);
      resolve(undefined);
    };
    image.src = url;
  });
}

/* ------------------------------------------------------------------ merge + public API */

const providers: Provider[] = [googleBooksProvider, openLibraryProvider, bnfProvider];

function mergeResults(results: Array<{ name: string; value: ProviderResult }>): LookupResult | null {
  const found = results.filter((entry): entry is { name: string; value: NonNullable<ProviderResult> } =>
    Boolean(entry.value)
  );
  if (found.length === 0) {
    return null;
  }

  const pick = <K extends keyof Omit<LookupResult, "sources">>(field: K) =>
    found.map((entry) => entry.value[field]).find((value) => (Array.isArray(value) ? value.length > 0 : Boolean(value)));

  return {
    title: pick("title"),
    author: pick("author"),
    description: pick("description"),
    year: pick("year"),
    cover: pick("cover"),
    tags: pick("tags"),
    publisher: pick("publisher"),
    sources: found.map((entry) => entry.name),
  };
}

export async function lookupBookByIsbn(rawIsbn: string): Promise<LookupResult | null> {
  const isbn = normalizeIsbn(rawIsbn);
  if (!isbn) {
    return null;
  }

  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);

  try {
    const settled = await Promise.all(
      providers.map(async (provider) => {
        try {
          return { name: provider.name, value: await provider.run(isbn, controller.signal) };
        } catch (error) {
          console.info(`${provider.name} lookup failed`, error);
          return { name: provider.name, value: null };
        }
      })
    );

    const merged = mergeResults(settled);
    if (!merged) {
      return null;
    }

    if (!merged.cover) {
      merged.cover = await probeOpenLibraryCover(isbn);
    }

    return merged;
  } finally {
    window.clearTimeout(timer);
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
