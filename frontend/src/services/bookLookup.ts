import type { Book, BookKind } from "../types";
import { epagineCoverUrl, openLibraryCoverUrl, probeCover } from "./covers";
import { normalizeIsbn } from "./isbn";

/**
 * Looks a book up from its ISBN using open, CORS-enabled catalogues in parallel and
 * merges the answers:
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

/** `url` points at the record that was found, so the UI can link to it. */
type ProviderResult = (Omit<LookupResult, "sources"> & { url?: string }) | null;
type Provider = { name: string; run: (isbn: string, signal: AbortSignal) => Promise<ProviderResult> };

const PROVIDER_TIMEOUT_MS = 8000;
const COVER_TIMEOUT_MS = 4000;

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
    throw new Error(`HTTP ${response.status}`);
  }
  return (await response.json()) as T;
}

/* ------------------------------------------------------------------ Open Library */

interface OpenLibraryBook {
  title?: string;
  subtitle?: string;
  authors?: Array<{ name?: string }>;
  publishers?: Array<{ name?: string }>;
  publish_date?: string;
  cover?: { large?: string; medium?: string };
  subjects?: Array<{ name?: string }>;
  url?: string;
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
      cover: toHttps(book.cover?.large ?? book.cover?.medium),
      url: toHttps(book.url) ?? `https://openlibrary.org/isbn/${isbn}`,
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
  const permalink = values("identifier").find((id) => /^https?:\/\/catalogue\.bnf\.fr\/ark:/.test(id));
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
    url: permalink ? toHttps(permalink) : undefined,
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
      throw new Error(`HTTP ${response.status}`);
    }
    return parseBnfRecord(await response.text());
  },
};

/* ------------------------------------------------------------------ AniList (manga enrichment) */

/** "One Piece - Tome 12" / "Berserk, Vol. 3" -> "One Piece" / "Berserk" */
export function stripVolume(title: string): string {
  return title
    .replace(/[\s,:\-–]*\b(tome|vol(?:ume)?\.?|band|#)\s*\d+.*$/i, "")
    .replace(/[\s,:\-–]+\d+\s*$/, "")
    .trim();
}

interface AniListResponse {
  data?: { Media?: { description?: string | null; genres?: string[]; startDate?: { year?: number | null }; siteUrl?: string | null } | null };
}

/**
 * AniList is searched by title (it has no ISBN index) and describes the whole series, so it is only
 * used to fill a missing description/tags for manga. It never provides the cover (that would be the
 * series cover, not the volume's).
 */
async function enrichFromAniList(title: string, signal: AbortSignal): Promise<ProviderResult> {
  const search = stripVolume(title);
  if (!search) {
    return null;
  }

  const response = await fetch("https://graphql.anilist.co", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      query:
        "query($search:String){Media(search:$search,type:MANGA){description(asHtml:false) genres startDate{year} siteUrl}}",
      variables: { search },
    }),
    signal,
  });
  if (!response.ok) {
    if (response.status === 404) {
      return null; // AniList answers 404 when nothing matches
    }
    throw new Error(`HTTP ${response.status}`);
  }

  const media = ((await response.json()) as AniListResponse).data?.Media;
  if (!media) {
    return null;
  }

  const description = media.description
    ?.replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .trim();

  return { description: description || undefined, tags: media.genres?.slice(0, 4), url: media.siteUrl ?? undefined };
}

/* ------------------------------------------------------------------ cover fallback */

/** Cover sources tried in order when no catalogue returned one. */
const COVER_SOURCES: Array<{ name: string; url: (isbn: string) => string | null }> = [
  { name: "Epagine covers", url: epagineCoverUrl },
  { name: "Open Library covers", url: openLibraryCoverUrl },
];

/* ------------------------------------------------------------------ merge + public API */

const providers: Provider[] = [openLibraryProvider, bnfProvider];

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

/** What happened when one source was queried. "error" = network failure, timeout or HTTP error. */
export type ProviderStatus = "found" | "not-found" | "error";
export interface ProviderTrace {
  name: string;
  status: ProviderStatus;
  /** Link to the record or image that was found (only when status is "found"). */
  url?: string;
}

export interface LookupReport {
  result: LookupResult | null;
  /** Every source that was actually queried, in order. */
  trace: ProviderTrace[];
}

/** Like `lookupBookByIsbn`, but also reports which sources were queried and what each one answered. */
export async function lookupBookReport(rawIsbn: string, options: { kind?: BookKind } = {}): Promise<LookupReport> {
  const isbn = normalizeIsbn(rawIsbn);
  if (!isbn) {
    return { result: null, trace: [] };
  }

  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);

  try {
    const settled = await Promise.all(
      providers.map(async (provider) => {
        try {
          const value = await provider.run(isbn, controller.signal);
          return { name: provider.name, value, status: (value ? "found" : "not-found") as ProviderStatus };
        } catch (error) {
          console.info(`${provider.name} lookup failed`, error);
          return { name: provider.name, value: null, status: "error" as ProviderStatus };
        }
      })
    );

    const trace: ProviderTrace[] = settled.map(({ name, status, value }) => ({
      name,
      status,
      url: status === "found" ? value?.url : undefined,
    }));
    const merged = mergeResults(settled);
    if (!merged) {
      return { result: null, trace };
    }

    if (options.kind === "Manga" && merged.title && (!merged.description || !merged.tags?.length)) {
      try {
        const extra = await enrichFromAniList(merged.title, controller.signal);
        const useful = Boolean(extra && (extra.description || extra.tags?.length));
        if (extra && useful) {
          merged.description ||= extra.description;
          if (!merged.tags?.length) merged.tags = extra.tags;
          merged.sources = [...(merged.sources ?? []), "AniList"];
        }
        trace.push({ name: "AniList", status: useful ? "found" : "not-found", url: useful ? extra?.url : undefined });
      } catch (error) {
        console.info("AniList lookup failed", error);
        trace.push({ name: "AniList", status: "error" });
      }
    }

    for (const source of COVER_SOURCES) {
      if (merged.cover) break;
      const candidate = source.url(isbn);
      merged.cover = candidate ? await probeCover(candidate, COVER_TIMEOUT_MS) : undefined;
      trace.push({ name: source.name, status: merged.cover ? "found" : "not-found", url: merged.cover });
    }

    return { result: merged, trace };
  } finally {
    window.clearTimeout(timer);
  }
}

export async function lookupBookByIsbn(
  rawIsbn: string,
  options: { kind?: BookKind } = {}
): Promise<LookupResult | null> {
  return (await lookupBookReport(rawIsbn, options)).result;
}

const PLACEHOLDER_DESCRIPTION = "A newly added title to your library.";

/** "updated" = at least one field changed; "unchanged" = catalogues answered but nothing differed. */
export type RefreshOutcome = "updated" | "unchanged" | "not-found" | "no-isbn" | "error";

export interface RefreshResult {
  outcome: Exclude<RefreshOutcome, "error">;
  trace: ProviderTrace[];
  /** Present when `outcome` is "updated" or "unchanged" (candidate fields, before diffing). */
  updates?: Partial<Book>;
}

/**
 * Re-queries the catalogues for an existing book and returns the fields to save.
 * Catalogue data replaces title/author/year/cover; description and tags are only replaced when the
 * book still has the default placeholder, so anything the user wrote is preserved.
 */
export async function refreshBookMetadata(
  book: Pick<Book, "isbn" | "description" | "tags" | "kind">
): Promise<RefreshResult> {
  const isbn = normalizeIsbn(book.isbn);
  if (!isbn) {
    return { outcome: "no-isbn", trace: [] };
  }

  const { result: metadata, trace } = await lookupBookReport(isbn, { kind: book.kind });
  if (!metadata) {
    return { outcome: "not-found", trace };
  }

  const updates: Partial<Book> = {};
  if (metadata.title) updates.title = metadata.title;
  if (metadata.author) updates.author = metadata.author;
  if (metadata.year) updates.year = metadata.year;
  if (metadata.cover) updates.cover = metadata.cover;

  if (metadata.description && (!book.description || book.description === PLACEHOLDER_DESCRIPTION)) {
    updates.description = metadata.description;
  }
  const hasOnlyDefaultTags = book.tags.length === 0 || (book.tags.length === 1 && book.tags[0] === "New");
  if (metadata.tags && metadata.tags.length > 0 && hasOnlyDefaultTags) {
    updates.tags = metadata.tags;
  }

  return { outcome: "updated", trace, updates };
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
