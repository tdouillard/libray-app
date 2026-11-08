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
  /** Story author (BD / Manga), only known when the catalogue gives creator roles (BnF). */
  writer?: string;
  /** Illustrator (BD / Manga), same condition as `writer`. */
  artist?: string;
  volume?: string;
  /** Title in the original language (romanised for manga). */
  originalTitle?: string;
  /** Imprint / series line of the editor ("Big Kana"). */
  editorCollection?: string;
  description?: string;
  year?: number;
  cover?: string;
  tags?: string[];
  publisher?: string;
  sources?: string[];
}

/** Joins names, dropping blanks and duplicates ("A, A, B" -> "A, B"). */
export function joinNames(...lists: Array<string | undefined>): string {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const name of lists.flatMap((list) => (list ?? "").split(/,\s*/))) {
    const clean = name.trim();
    if (clean && !seen.has(clean.toLowerCase())) {
      seen.add(clean.toLowerCase());
      names.push(clean);
    }
  }
  return names.join(", ");
}

/** "Monster - Tome 6 (Big Kana)" -> "6"; "Berserk, Vol. 3" -> "3"; "Naruto 12" -> "12". */
export function extractVolume(title: string | undefined): string | undefined {
  if (!title) return undefined;
  const explicit = title.match(/\b(?:tome|vol(?:ume)?\.?|band|n°|no\.?|#)\s*(\d+(?:[.,]\d+)?)/i);
  if (explicit) return explicit[1].replace(",", ".");
  const trailing = title.match(/[\s,:\-–]+(\d{1,3})\s*$/);
  return trailing ? trailing[1] : undefined;
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
      author: joinNames(...(book.authors?.map((author) => author.name) ?? [])) || undefined,
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

/** Writer / artist roles of a BnF creator ("Nagasaki, Takashi. Scénariste" -> writer). Unknown or missing = "author". */
export function bnfCreatorRole(raw: string): "writer" | "artist" | "author" {
  const role = raw.match(/\.\s*([A-ZÀ-Ý][^.()]*)$/)?.[1]?.toLowerCase() ?? "";
  if (/(dessin|illustr|artiste)/.test(role)) return "artist";
  if (/(sc[ée]nari|texte)/.test(role)) return "writer";
  return "author";
}

/**
 * BnF titles are the full catalogue statement: "Title. Part number, Part title / Statement of responsibility".
 * "Kujô l'implacable. 10 / Shôhei Manabe" -> { title: "Kujô l'implacable", volume: "10" }
 */
export function parseBnfTitle(raw: string): { title: string; volume?: string } {
  const withoutResponsibility = raw.replace(/\s+\/\s+.*$/, "").replace(/[\s.]+$/, "").trim();
  const part = withoutResponsibility.match(/^(.*?)\.\s+(\d+(?:[.,]\d+)?)(?:\s*[,:]\s*(.+))?$/);
  if (!part || !part[1].trim()) return { title: withoutResponsibility };
  const base = part[1].trim();
  return { title: part[3] ? `${base} - ${part[3].trim()}` : base, volume: part[2].replace(",", ".") };
}

function parseBnfRecord(xml: string): ProviderResult {
  const doc = new DOMParser().parseFromString(xml, "text/xml");
  const values = (tag: string) =>
    Array.from(doc.getElementsByTagNameNS("http://purl.org/dc/elements/1.1/", tag))
      .map((node) => node.textContent?.normalize("NFC").trim() ?? "")
      .filter(Boolean);

  const parsedTitle = parseBnfTitle(values("title")[0] ?? "");
  const title = parsedTitle.title;
  const permalink = values("identifier").find((id) => /^https?:\/\/catalogue\.bnf\.fr\/ark:/.test(id));
  if (!title) {
    return null;
  }

  const rawCreators = values("creator");
  const creators = Array.from(new Set(rawCreators.map(cleanBnfCreator).filter(Boolean)));
  const byRole = (role: "writer" | "artist" | "author") =>
    joinNames(...rawCreators.filter((raw) => bnfCreatorRole(raw) === role).map(cleanBnfCreator));
  // A plain "Auteur" wrote the story, and also drew it unless an illustrator is credited (typical of manga).
  const plain = byRole("author");
  const explicitArtist = byRole("artist");
  const writer = joinNames(plain, byRole("writer")) || undefined;
  const artist = explicitArtist || plain || undefined;
  const publisher = values("publisher")[0]?.replace(/\s*\([^)]*\)\s*$/, "");
  const collection = values("description")
    .find((text) => text.startsWith("Collection :"))
    ?.replace("Collection :", "")
    .trim();

  return {
    title,
    author: creators.join(", ") || undefined,
    writer,
    artist,
    volume: parsedTitle.volume ?? extractVolume(title),
    year: parseYear(values("date")[0]),
    publisher,
    editorCollection: collection,
    tags: collection ? [collection] : undefined,
    url: permalink ? toHttps(permalink) : undefined,
  };
}

/**
 * The UNIMARC record carries what Dublin Core drops: the original title (454 "translation of"),
 * the collection (225 / 410) and the publisher's blurb (330).
 */
export function parseBnfUnimarc(xml: string): Pick<LookupResult, "originalTitle" | "editorCollection" | "description"> {
  const doc = new DOMParser().parseFromString(xml, "text/xml");
  const fields = Array.from(doc.getElementsByTagNameNS("*", "datafield"));
  const sub = (tag: string, code: string) =>
    fields
      .filter((field) => field.getAttribute("tag") === tag)
      .flatMap((field) =>
        Array.from(field.getElementsByTagNameNS("*", "subfield"))
          .filter((node) => node.getAttribute("code") === code)
          .map((node) => node.textContent?.normalize("NFC").trim() ?? "")
      )
      .filter(Boolean);

  return {
    originalTitle: sub("454", "t")[0],
    editorCollection: sub("225", "a")[0] ?? sub("410", "t")[0],
    description: sub("330", "a")[0],
  };
}

const bnfProvider: Provider = {
  name: "BnF",
  async run(isbn, signal) {
    const query = encodeURIComponent(`bib.isbn adj "${isbn}"`);
    const request = (schema: string) =>
      fetch(
        `https://catalogue.bnf.fr/api/SRU?version=1.2&operation=searchRetrieve&query=${query}&recordSchema=${schema}&maximumRecords=1`,
        { signal }
      );

    // The UNIMARC request only adds details: if it fails, the Dublin Core answer is still used.
    const [response, extras] = await Promise.all([
      request("dublincore"),
      request("unimarcxchange")
        .then(async (r) => (r.ok ? parseBnfUnimarc(await r.text()) : null))
        .catch(() => null),
    ]);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const record = parseBnfRecord(await response.text());
    if (!record || !extras) return record;
    return {
      ...record,
      originalTitle: extras.originalTitle,
      editorCollection: record.editorCollection ?? extras.editorCollection,
      description: extras.description,
    };
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
  data?: {
    Media?: {
      description?: string | null;
      genres?: string[];
      startDate?: { year?: number | null };
      siteUrl?: string | null;
      title?: { romaji?: string | null } | null;
    } | null;
  };
}

/**
 * AniList is searched by title (it has no ISBN index) and describes the whole series, so it is only
 * used to fill a missing description/tags for manga. It never provides the cover (that would be the
 * series cover, not the volume's).
 */
/**
 * AniList allows ~30 requests/minute (and answers 429 without CORS headers beyond that), while a library
 * refresh runs several lookups in parallel. All AniList calls therefore go through one spaced queue.
 */
const ANILIST_GAP_MS = 2200;
const ANILIST_TIMEOUT_MS = 10000;
let anilistQueue: Promise<unknown> = Promise.resolve();
let anilistNextAt = 0;

function anilistSlot(): Promise<void> {
  const slot = anilistQueue.then(async () => {
    const wait = anilistNextAt - Date.now();
    if (wait > 0) await new Promise((resolve) => window.setTimeout(resolve, wait));
    anilistNextAt = Date.now() + ANILIST_GAP_MS;
  });
  anilistQueue = slot;
  return slot;
}

async function anilistFetch(search: string): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    await anilistSlot();
    // Own timeout: the shared catalogue timer may already be spent when this runs.
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), ANILIST_TIMEOUT_MS);
    try {
      const response = await fetch("https://graphql.anilist.co", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          query:
            "query($search:String){Media(search:$search,type:MANGA){description(asHtml:false) genres startDate{year} siteUrl title{romaji}}}",
          variables: { search },
        }),
        signal: controller.signal,
      });
      if (response.status === 429 && attempt < 2) {
        const retryAfter = Number(response.headers.get("Retry-After"));
        anilistNextAt = Date.now() + (Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 60000);
        continue;
      }
      return response;
    } finally {
      window.clearTimeout(timer);
    }
  }
}

async function enrichFromAniList(title: string): Promise<ProviderResult> {
  const search = stripVolume(title);
  if (!search) {
    return null;
  }

  const response = await anilistFetch(search);
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

  return {
    description: description || undefined,
    tags: media.genres?.slice(0, 4),
    originalTitle: media.title?.romaji ?? undefined,
    url: media.siteUrl ?? undefined,
  };
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
    writer: pick("writer"),
    artist: pick("artist"),
    volume: pick("volume") ?? extractVolume(pick("title")),
    originalTitle: pick("originalTitle"),
    editorCollection: pick("editorCollection"),
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

    if (
      options.kind === "Manga" &&
      merged.title &&
      (!merged.description || !merged.tags?.length || !merged.originalTitle)
    ) {
      try {
        // The original title is a better search key than the French one when the catalogue gave it.
        const extra = await enrichFromAniList(merged.originalTitle ?? merged.title);
        const useful = Boolean(extra && (extra.description || extra.tags?.length || extra.originalTitle));
        if (extra && useful) {
          merged.description ||= extra.description;
          merged.originalTitle ||= extra.originalTitle;
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

/** Fields a refresh may overwrite. Year, description and tags keep their existing safe rules. */
export interface RefreshFields {
  title: boolean;
  /** Author, plus writer / artist for BD and Manga. */
  author: boolean;
  cover: boolean;
  category: boolean;
  volume: boolean;
  publisher: boolean;
  editorCollection: boolean;
  originalTitle: boolean;
}
export const ALL_REFRESH_FIELDS: RefreshFields = {
  title: true,
  author: true,
  cover: true,
  category: true,
  volume: true,
  publisher: true,
  editorCollection: true,
  originalTitle: true,
};

const MANGA_HINT = /(?<![\p{L}\d])(manga|manhwa|manhua|shonen|shōnen|seinen|shojo|shōjo|josei|light novel|kana|ki-oon|kurokawa|pika|doki-doki|meian|akata|kazé|kaze|taifu|tonkam)(?![\p{L}\d])/iu;
const BD_HINT = /(?<![\p{L}\d])(bandes? dessinées?|comics?|graphic novels?|bd|cartoons?|comic strips?|dargaud|dupuis|lombard|casterman|futuropolis|urban comics|spirou|tintin)(?![\p{L}\d])/iu;

/**
 * Best guess of the category from what the catalogues said (tags/subjects, publisher, title).
 * Returns undefined when nothing is conclusive, so a refresh never downgrades a category on a guess.
 */
export function inferKind(metadata: Pick<LookupResult, "title" | "tags" | "publisher">): BookKind | undefined {
  const text = [...(metadata.tags ?? []), metadata.publisher ?? "", metadata.title ?? ""].join(" | ");
  if (!text.trim()) return undefined;
  // Manga first: "Glénat Manga" must not read as plain BD.
  if (MANGA_HINT.test(text)) return "Manga";
  if (BD_HINT.test(text)) return "BD";
  return undefined;
}

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
  book: Pick<Book, "isbn" | "description" | "tags" | "kind">,
  fields: RefreshFields = ALL_REFRESH_FIELDS
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
  if (fields.title && metadata.title) updates.title = metadata.title;
  if (metadata.year) updates.year = metadata.year;
  if (fields.cover && metadata.cover) updates.cover = metadata.cover;
  if (fields.category) {
    const kind = inferKind(metadata);
    if (kind) updates.kind = kind;
  }
  if (fields.volume && metadata.volume) updates.volume = metadata.volume;
  if (fields.publisher && metadata.publisher) updates.publisher = metadata.publisher;
  if (fields.editorCollection && metadata.editorCollection) updates.editorCollection = metadata.editorCollection;
  if (fields.originalTitle && metadata.originalTitle) updates.originalTitle = metadata.originalTitle;

  if (fields.author) {
    const kind = updates.kind ?? book.kind;
    if (kind !== "Book" && (metadata.writer || metadata.artist)) {
      // BD / Manga: keep story and drawing apart; `author` stays the combined display line.
      if (metadata.writer) updates.writer = metadata.writer;
      if (metadata.artist) updates.artist = metadata.artist;
      updates.author = joinNames(metadata.writer, metadata.artist);
    } else if (metadata.author) {
      updates.author = metadata.author;
    }
  }

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
    writer: metadata.writer || current.writer || "",
    artist: metadata.artist || current.artist || "",
    volume: metadata.volume || current.volume || "",
    publisher: metadata.publisher || current.publisher || "",
    editorCollection: metadata.editorCollection || current.editorCollection || "",
    originalTitle: metadata.originalTitle || current.originalTitle || "",
    description: metadata.description || current.description || "",
    year: metadata.year || current.year || new Date().getFullYear(),
    cover: metadata.cover || current.cover || "",
    tags: metadata.tags && metadata.tags.length > 0 ? metadata.tags : current.tags ?? ["New"],
  };
}
