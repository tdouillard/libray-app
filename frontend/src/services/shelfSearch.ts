import { normalizeIsbn } from "./isbn";

/** One book spine read from a shelf photo. */
export interface DetectedSpine {
  title: string;
  author?: string;
  volume?: number;
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

/**
 * Finds the ISBN of a book from the text read on its spine (Open Library search).
 * Returns null when nothing is similar enough: a wrong match is worse than none.
 */
export async function findIsbnByText(spine: DetectedSpine, signal?: AbortSignal): Promise<TextMatch | null> {
  const query = [spine.title, spine.author, spine.volume].filter(Boolean).join(" ");
  const url =
    `https://openlibrary.org/search.json?q=${encodeURIComponent(query)}` + "&fields=title,author_name,isbn&limit=8";
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  const docs = ((await response.json()) as OpenLibrarySearch).docs ?? [];
  const wanted = spineLabel(spine);
  let best: { score: number; isbn: string; title: string } | null = null;

  for (const doc of docs) {
    if (!doc.title) continue;
    const isbn = doc.isbn?.map((value) => normalizeIsbn(value)).find((value): value is string => Boolean(value));
    if (!isbn) continue;
    const score = Math.max(textSimilarity(wanted, doc.title), textSimilarity(spine.title, doc.title));
    if (score >= MIN_SIMILARITY && (!best || score > best.score)) best = { score, isbn, title: doc.title };
  }

  return best ? { isbn: best.isbn, title: best.title } : null;
}
