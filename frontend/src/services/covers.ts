import { normalizeIsbn } from "./isbn";

/**
 * Cover URLs derived from an ISBN.
 *
 * Epagine hosts the images of many French bookshop sites (librairie-de-paris.fr, ...). The URL is
 * predictable from the ISBN-13 and the images come from the Tite-Live trade database. It is an
 * undocumented URL, so it is only ever used as a best-effort source with fallbacks behind it.
 * There are no CORS headers: use it in an <img>, never with fetch() / canvas.
 */
export function epagineCoverUrl(isbn: string): string | null {
  const isbn13 = normalizeIsbn(isbn);
  return isbn13 ? `https://images.epagine.fr/${isbn13.slice(-3)}/${isbn13}_1_75.jpg` : null;
}

export function openLibraryCoverUrl(isbn: string): string | null {
  const isbn13 = normalizeIsbn(isbn);
  return isbn13 ? `https://covers.openlibrary.org/b/isbn/${isbn13}-L.jpg?default=false` : null;
}

/**
 * When Epagine has no cover it still answers 200, with a 154x173 "no cover" PNG. Anything that tiny
 * (or a 1px stub) is not a real cover.
 */
export function isPlaceholderSize(width: number, height: number): boolean {
  return width < 10 || (width === 154 && height === 173);
}

/** Ordered list of ISBN-based cover URLs to try when the book has no stored cover. */
export function isbnCoverCandidates(isbn: string | undefined): string[] {
  if (!isbn) {
    return [];
  }
  return [epagineCoverUrl(isbn), openLibraryCoverUrl(isbn)].filter((url): url is string => Boolean(url));
}

/** Resolves to the URL only when the image loads and is not a "no cover" placeholder. */
export function probeCover(url: string, timeoutMs: number): Promise<string | undefined> {
  if (typeof Image === "undefined") {
    return Promise.resolve(undefined);
  }

  return new Promise((resolve) => {
    const image = new Image();
    const timer = window.setTimeout(() => resolve(undefined), timeoutMs);
    image.onload = () => {
      window.clearTimeout(timer);
      resolve(isPlaceholderSize(image.naturalWidth, image.naturalHeight) ? undefined : url);
    };
    image.onerror = () => {
      window.clearTimeout(timer);
      resolve(undefined);
    };
    image.src = url;
  });
}
