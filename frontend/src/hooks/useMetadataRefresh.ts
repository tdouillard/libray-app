import { useCallback, useRef, useState } from "react";
import { refreshBookMetadata } from "../services/bookLookup";
import type { ProviderTrace, RefreshOutcome } from "../services/bookLookup";
import type { Book } from "../types";

export interface ProviderStats {
  found: number;
  notFound: number;
  error: number;
}

export interface RefreshOneResult {
  outcome: RefreshOutcome;
  /** Sources that were queried for this book and what each answered. */
  trace: ProviderTrace[];
}

export interface RefreshProgress {
  total: number;
  done: number;
  /** Books the catalogues answered for (changed + unchanged). */
  refreshed: number;
  /** Books where at least one field differed from before. */
  changed: number;
  /** Books not found, without a valid ISBN, or that errored. */
  failed: number;
  /** Per-source totals across all books queried so far. */
  providers: Record<string, ProviderStats>;
  cancelled: boolean;
  running: boolean;
}

const CONCURRENCY = 3;

/** A book "has no image" when no cover was ever stored for it. */
export const hasNoCover = (book: Book) => !book.cover;

export function useMetadataRefresh(updateBook: (id: string, updates: Partial<Book>) => Promise<void>) {
  const [progress, setProgress] = useState<RefreshProgress | null>(null);
  const cancelRef = useRef(false);

  const refreshOne = useCallback(
    async (book: Book): Promise<RefreshOneResult> => {
      try {
        const result = await refreshBookMetadata(book);
        if (result.outcome !== "updated" || !result.updates) {
          return { outcome: result.outcome, trace: result.trace };
        }
        const changes = Object.fromEntries(
          Object.entries(result.updates).filter(
            ([key, value]) => JSON.stringify(value) !== JSON.stringify(book[key as keyof Book])
          )
        ) as Partial<Book>;
        if (Object.keys(changes).length === 0) {
          return { outcome: "unchanged", trace: result.trace };
        }
        await updateBook(book.id, changes);
        return { outcome: "updated", trace: result.trace };
      } catch (error) {
        console.info("Metadata refresh failed", error);
        return { outcome: "error", trace: [] };
      }
    },
    [updateBook]
  );

  const refreshMany = useCallback(
    async (books: Book[]) => {
      if (books.length === 0) return;
      cancelRef.current = false;
      const state: RefreshProgress = { total: books.length, done: 0, refreshed: 0, changed: 0, failed: 0, providers: {}, cancelled: false, running: true };
      const publish = (extra: Partial<RefreshProgress> = {}) =>
        setProgress({ ...state, ...extra, providers: structuredClone(state.providers) });
      publish();

      let next = 0;
      const worker = async () => {
        while (!cancelRef.current && next < books.length) {
          const book = books[next++];
          const { outcome, trace } = await refreshOne(book);
          for (const { name, status } of trace) {
            const stats = (state.providers[name] ??= { found: 0, notFound: 0, error: 0 });
            if (status === "found") stats.found += 1;
            else if (status === "not-found") stats.notFound += 1;
            else stats.error += 1;
          }
          state.done += 1;
          if (outcome === "updated") {
            state.refreshed += 1;
            state.changed += 1;
          } else if (outcome === "unchanged") {
            state.refreshed += 1;
          } else {
            state.failed += 1;
          }
          publish();
        }
      };

      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, books.length) }, worker));
      publish({ cancelled: cancelRef.current && state.done < state.total, running: false });
    },
    [refreshOne]
  );

  const cancel = useCallback(() => {
    cancelRef.current = true;
  }, []);

  const dismiss = useCallback(() => setProgress(null), []);

  return { progress, refreshOne, refreshMany, cancel, dismiss };
}
