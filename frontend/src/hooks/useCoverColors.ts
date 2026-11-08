import { useEffect, useState } from "react";
import { resolveCoverUrl } from "../components/BookCover";
import { extractCoverColor } from "../services/spines";
import type { Hsl } from "../services/spines";
import type { Book } from "../types";

const CONCURRENCY = 4;

/**
 * Dominant cover colour per book id, extracted in the background (a few covers at a time).
 * Books without a readable cover are simply absent: the caller falls back to a stable colour.
 */
export function useCoverColors(books: Pick<Book, "id" | "cover" | "isbn">[]): Record<string, Hsl> {
  const [colors, setColors] = useState<Record<string, Hsl>>({});

  useEffect(() => {
    let cancelled = false;
    const todo = books
      .filter((book) => !colors[book.id])
      .map((book) => ({ id: book.id, url: resolveCoverUrl(book) }))
      .filter((item): item is { id: string; url: string } => !!item.url);
    if (!todo.length) return;

    let next = 0;
    const worker = async () => {
      while (!cancelled && next < todo.length) {
        const { id, url } = todo[next++];
        const color = await extractCoverColor(url);
        if (color && !cancelled) setColors((current) => (current[id] ? current : { ...current, [id]: color }));
      }
    };
    for (let i = 0; i < CONCURRENCY; i++) void worker();

    return () => {
      cancelled = true;
    };
    // `colors` is intentionally left out: only newly seen books need work.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [books]);

  return colors;
}
