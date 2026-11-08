import type { Book } from "./types";

/**
 * Title as shown in grid / list / shelf: the volume follows it ("Vagabond Vol.7").
 * Nothing is added when there is no volume, or when the stored title already ends with it
 * (items saved before the volume had its own field, e.g. "Berserk, Vol. 3").
 */
export function displayTitle(book: Pick<Book, "title" | "volume">): string {
  const volume = book.volume?.trim();
  if (!volume) return book.title;

  const label = /^\d/.test(volume) ? `Vol.${volume}` : volume; // "Intégrale" reads better without "Vol."
  const alreadyThere = new RegExp(`(?:^|[^\\d])${volume.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\)?$`, "i");
  return alreadyThere.test(book.title) ? book.title : `${book.title} ${label}`;
}
