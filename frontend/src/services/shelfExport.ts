import { STATUS_META, STATUS_ORDER } from "../bookStatus";
import { BOOK_KINDS } from "../types";
import type { Book, BookKind } from "../types";

const KIND_LINE: Record<BookKind, { icon: string; label: string }> = {
  Book: { icon: "📖", label: "Books" },
  BD: { icon: "🎨", label: "BD" },
  Manga: { icon: "🈶", label: "Manga" },
};

/** Plain-text totals of the library, ready to paste into Signal / Discord / WhatsApp. */
export function buildLibrarySummary(books: Book[]): string {
  const statusCounts = (list: Book[]) =>
    STATUS_ORDER.map((status) => ({ status, count: list.filter((b) => b.status === status).length }))
      .filter((entry) => entry.count > 0)
      .map(({ status, count }) => `${count} ${STATUS_META[status].label.toLowerCase()}`)
      .join(", ");

  const lines = [`📚 My library: ${books.length} item${books.length === 1 ? "" : "s"}`, ""];
  for (const kind of BOOK_KINDS) {
    const list = books.filter((b) => b.kind === kind);
    if (list.length === 0) continue;
    lines.push(`${KIND_LINE[kind].icon} ${KIND_LINE[kind].label}: ${list.length} (${statusCounts(list)})`);
  }
  const all = statusCounts(books);
  if (all) lines.push("", `Total: ${all}`);
  return lines.join("\n");
}
