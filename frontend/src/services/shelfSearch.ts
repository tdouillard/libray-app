import { normalizeIsbn } from "./isbn";

/** One book spine read from a shelf photo. */
export interface DetectedSpine {
  title: string;
  author?: string;
  volume?: number;
  /** Other spellings of the title that OCR produced: tried when the main one finds nothing. */
  alternatives?: string[];
  /** Edition name printed on the spine (e.g. "VIZBIG"): picks the right edition of a series. */
  hint?: string;
  /**
   * True when the reader is confident the text is really a title. Unmatched reliable spines are still
   * listed (to verify); unmatched unreliable ones (raw OCR lines) are dropped as noise.
   */
  reliable?: boolean;
}

export interface TextMatch {
  isbn: string;
  title: string;
}

const normalizeText = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Dice coefficient on word sets: 1 = same words, 0 = nothing in common. */
export function textSimilarity(a: string, b: string): number {
  const left = new Set(normalizeText(a).split(" ").filter(Boolean));
  const right = new Set(normalizeText(b).split(" ").filter(Boolean));
  if (left.size === 0 || right.size === 0) return 0;
  let common = 0;
  left.forEach((word) => {
    if (right.has(word)) common += 1;
  });
  return (2 * common) / (left.size + right.size);
}

/** Label shown for a detected spine: "Title - 12". */
export const spineLabel = (spine: DetectedSpine) => (spine.volume ? `${spine.title} ${spine.volume}` : spine.title);

interface OpenLibrarySearch {
  docs?: Array<{ title?: string; author_name?: string[]; isbn?: string[] }>;
}

const MIN_SIMILARITY = 0.5;
/** Words that appear in titles of volumes without being part of the series name. */
const FILLER = new Set(["vol", "volume", "volumen", "tome", "band", "edition", "the", "le", "la", "les", "de", "of", "und"]);

const tokensOf = (value: string) => normalizeText(value).split(" ").filter(Boolean);

/**
 * How well a catalogue title fits what was read: word overlap, a title that does not mention the volume is
 * rejected, and unrelated extra words ("Midlife Vagabond 3") lower the score.
 */
export function scoreCatalogueTitle(wanted: { title: string; volume?: number; hint?: string }, docTitle: string): number {
  const docTokens = tokensOf(docTitle);
  if (wanted.volume !== undefined && !docTokens.includes(String(wanted.volume))) return 0;

  const wantedTokens = tokensOf([wanted.title, wanted.hint, wanted.volume].filter(Boolean).join(" "));
  const meaningful = docTokens.filter((t) => !FILLER.has(t));
  const shared = wantedTokens.filter((t) => meaningful.includes(t)).length;
  if (shared === 0) return 0;
  const extras = meaningful.filter((t) => !wantedTokens.includes(t)).length;
  return ((2 * shared) / (wantedTokens.length + meaningful.length)) / (1 + 0.5 * extras) + 0.2 * (shared / wantedTokens.length);
}

async function searchOnce(
  spine: DetectedSpine,
  title: string,
  withHint: boolean,
  signal?: AbortSignal
): Promise<TextMatch | null> {
  const hint = withHint ? spine.hint : undefined;
  const query = [title, hint, spine.author, spine.volume].filter(Boolean).join(" ");
  const url =
    `https://openlibrary.org/search.json?q=${encodeURIComponent(query)}` + "&fields=title,author_name,isbn&limit=10";
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  const docs = ((await response.json()) as OpenLibrarySearch).docs ?? [];
  let best: { score: number; isbn: string; title: string } | null = null;
  for (const doc of docs) {
    if (!doc.title) continue;
    const isbn = doc.isbn?.map((value) => normalizeIsbn(value)).find((value): value is string => Boolean(value));
    if (!isbn) continue;
    const score = scoreCatalogueTitle({ title, volume: spine.volume, hint }, doc.title);
    if (score >= MIN_SIMILARITY && (!best || score > best.score)) best = { score, isbn, title: doc.title };
  }
  return best ? { isbn: best.isbn, title: best.title } : null;
}

/**
 * Finds the ISBN of a book from the text read on its spine (Open Library search): the edition hint first,
 * then without it, for the main spelling of the title and then its alternatives.
 * Returns null when nothing is similar enough: a wrong match is worse than none.
 */
export async function findIsbnByText(spine: DetectedSpine, signal?: AbortSignal): Promise<TextMatch | null> {
  const titles = [spine.title, ...(spine.alternatives ?? [])];
  for (const title of titles) {
    for (const withHint of spine.hint ? [true, false] : [false]) {
      const match = await searchOnce(spine, title, withHint, signal);
      if (match) return match;
    }
  }
  return null;
}
