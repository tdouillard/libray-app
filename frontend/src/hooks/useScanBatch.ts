import { useCallback, useEffect, useReducer, useRef } from "react";
import { lookupBookReport } from "../services/bookLookup";
import type { ProviderTrace } from "../services/bookLookup";
import { failureReason, logScanFailure, type ScanFailureReason } from "../services/scanLogs";
import { normalizeIsbn } from "../services/isbn";
import { findIsbnByText, spineLabel, type DetectedSpine } from "../services/shelfSearch";
import type { Book, BookKind } from "../types";

const STORAGE_KEY = "libray.scanBatch";
const MAX_LOOKUPS_IN_FLIGHT = 3;

export type ScanStatus = "loading" | "found" | "notFound";

export interface ScannedBook {
  id: string;
  isbn: string;
  kind: BookKind;
  status: ScanStatus;
  /** Already in the user's library: shown, but never saved again. */
  owned: boolean;
  confirmed: boolean;
  title?: string;
  author?: string;
  description?: string;
  year?: number;
  cover?: string;
  tags?: string[];
  /** Why the lookup failed (only when status is "notFound"). */
  reason?: ScanFailureReason;
  /** What each catalogue answered, kept for the admin diagnostics. */
  trace?: ProviderTrace[];
  /** Created from a shelf photo and not from a barcode. */
  source?: "shelf";
  /** The text read on the spine (shelf photos), kept so the user can check the match. */
  detected?: string;
}

interface BatchState {
  main: ScannedBook[];
  rescan: ScannedBook[];
}

export type AddResult = "added" | "duplicate" | "invalid";

function loadState(): BatchState {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as BatchState | null;
    if (!raw || !Array.isArray(raw.main) || !Array.isArray(raw.rescan)) return { main: [], rescan: [] };
    // A lookup interrupted by a reload never finishes: let the user retry it with the re-lookup button.
    const settle = (b: ScannedBook): ScannedBook => (b.status === "loading" ? { ...b, status: "notFound" } : b);
    return { main: raw.main.map(settle), rescan: raw.rescan.map(settle) };
  } catch {
    return { main: [], rescan: [] };
  }
}

/** A scanned entry can be saved once its lookup is over and it is not already in the library. */
export const isSavable = (b: ScannedBook) => !b.owned && b.status !== "loading";

export function toBooks(items: ScannedBook[]): Book[] {
  return items.map((item) => ({
    id: crypto.randomUUID(),
    kind: item.kind,
    title: item.title || `Unknown book (${item.isbn || item.detected || "?"})`,
    author: item.author ?? "",
    isbn: item.isbn,
    year: item.year ?? 0,
    status: "owned",
    description: item.description || "",
    tags: item.tags && item.tags.length > 0 ? item.tags : ["New"],
    cover: item.cover || "",
    rating: 0,
    collectionIds: [],
  }));
}

/**
 * State of a batch scan session: one list "to review" and one "rescan" list.
 * Entries appear instantly (ISBN only) and are filled in by a throttled background lookup.
 * The session is kept in localStorage so a locked phone or closed tab loses nothing.
 */
export function useScanBatch(libraryIsbns: string[]) {
  const stateRef = useRef<BatchState>(null as unknown as BatchState);
  stateRef.current ??= loadState();
  const [, rerender] = useReducer((n: number) => n + 1, 0);

  const ownedRef = useRef(new Set<string>());
  ownedRef.current = new Set(libraryIsbns.map((i) => normalizeIsbn(i)).filter((i): i is string => Boolean(i)));

  const queueRef = useRef<string[]>([]);
  const inFlightRef = useRef(0);
  const aliveRef = useRef(true);

  const commit = useCallback((next: BatchState) => {
    stateRef.current = next;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* storage full or unavailable: the session just won't survive a reload */
    }
    if (aliveRef.current) rerender();
  }, []);

  const patch = useCallback(
    (id: string, changes: Partial<ScannedBook>) => {
      const apply = (list: ScannedBook[]) => list.map((b) => (b.id === id ? { ...b, ...changes } : b));
      commit({ main: apply(stateRef.current.main), rescan: apply(stateRef.current.rescan) });
    },
    [commit]
  );

  const pump = useCallback(() => {
    while (inFlightRef.current < MAX_LOOKUPS_IN_FLIGHT && queueRef.current.length > 0) {
      const id = queueRef.current.shift()!;
      const entry = [...stateRef.current.main, ...stateRef.current.rescan].find((b) => b.id === id);
      if (!entry) continue; // removed while waiting

      if (!entry.isbn) {
        // Shelf entry that no catalogue matched: there is no ISBN to look up again.
        patch(id, { status: "notFound", reason: "not-found" });
        continue;
      }

      inFlightRef.current += 1;
      lookupBookReport(entry.isbn, { kind: entry.kind })
        .catch(() => null)
        .then((report) => {
          const still = [...stateRef.current.main, ...stateRef.current.rescan].some((b) => b.id === id);
          if (!still) return;
          const meta = report?.result;
          if (meta) {
            patch(id, {
              status: "found",
              title: meta.title,
              author: meta.author,
              description: meta.description,
              year: meta.year,
              cover: meta.cover,
              tags: meta.tags,
              reason: undefined,
              trace: undefined,
            });
            return;
          }
          const trace = report?.trace ?? [];
          const reason = failureReason(report ? trace : undefined);
          patch(id, { status: "notFound", reason, trace });
          logScanFailure({ isbn: entry.isbn, kind: entry.kind, reason, trace });
        })
        .finally(() => {
          inFlightRef.current -= 1;
          pump();
        });
    }
  }, [patch]);

  const enqueue = useCallback(
    (id: string) => {
      queueRef.current.push(id);
      pump();
    },
    [pump]
  );

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const add = useCallback(
    (rawIsbn: string, kind: BookKind, extra: Partial<ScannedBook> = {}): AddResult => {
      const isbn = normalizeIsbn(rawIsbn);
      if (!isbn) return "invalid";
      const { main, rescan } = stateRef.current;
      if ([...main, ...rescan].some((b) => b.isbn === isbn)) return "duplicate";

      const entry: ScannedBook = {
        ...extra,
        id: crypto.randomUUID(),
        isbn,
        kind,
        status: "loading",
        owned: false,
        confirmed: false,
      };
      commit({ main: [entry, ...main], rescan });
      enqueue(entry.id);
      return "added";
    },
    [commit, enqueue]
  );

  /**
   * Adds a spine read from a shelf photo. The text is turned into an ISBN (then the normal lookup fills in
   * the rest). Without a match, a spine the reader trusts goes to the rescan list as "to verify"; raw
   * unreliable text is dropped. A failing catalogue throws, so the caller can tell "unknown" from "offline".
   */
  const addDetected = useCallback(
    async (spine: DetectedSpine, kind: BookKind): Promise<AddResult | "unmatched"> => {
      const detected = spineLabel(spine);
      const match = await findIsbnByText(spine);
      if (match) return add(match.isbn, kind, { source: "shelf", detected });
      if (!spine.reliable) return "unmatched";

      const { main, rescan } = stateRef.current;
      if ([...main, ...rescan].some((b) => b.source === "shelf" && b.detected === detected)) return "duplicate";
      const entry: ScannedBook = {
        id: crypto.randomUUID(),
        isbn: "",
        kind,
        status: "notFound",
        reason: "not-found",
        owned: false,
        confirmed: false,
        title: detected,
        author: spine.author,
        source: "shelf",
        detected,
      };
      commit({ main, rescan: [entry, ...rescan] });
      return "added";
    },
    [add, commit]
  );

  const setKind = useCallback((id: string, kind: BookKind) => patch(id, { kind }), [patch]);

  const setAllKinds = useCallback(
    (kind: BookKind) => {
      const apply = (list: ScannedBook[]) => list.map((b) => ({ ...b, kind }));
      commit({ main: apply(stateRef.current.main), rescan: apply(stateRef.current.rescan) });
    },
    [commit]
  );

  const toggleConfirmed = useCallback(
    (id: string) => {
      const entry = stateRef.current.main.find((b) => b.id === id);
      if (entry) patch(id, { confirmed: !entry.confirmed });
    },
    [patch]
  );

  const moveToRescan = useCallback(
    (id: string) => {
      const { main, rescan } = stateRef.current;
      const entry = main.find((b) => b.id === id);
      if (!entry) return;
      commit({ main: main.filter((b) => b.id !== id), rescan: [{ ...entry, confirmed: false }, ...rescan] });
    },
    [commit]
  );

  const moveBack = useCallback(
    (id: string) => {
      const { main, rescan } = stateRef.current;
      const entry = rescan.find((b) => b.id === id);
      if (!entry) return;
      commit({ main: [entry, ...main], rescan: rescan.filter((b) => b.id !== id) });
    },
    [commit]
  );

  /** Removes an entry and returns a function that puts it back at the same place. */
  const remove = useCallback(
    (id: string): (() => void) => {
      const { main, rescan } = stateRef.current;
      const list = main.some((b) => b.id === id) ? "main" : "rescan";
      const source = list === "main" ? main : rescan;
      const index = source.findIndex((b) => b.id === id);
      const entry = source[index];
      if (!entry) return () => {};

      commit({ ...stateRef.current, [list]: source.filter((b) => b.id !== id) });
      return () => {
        const current = stateRef.current[list];
        if (current.some((b) => b.id === id)) return;
        const restored = [...current];
        restored.splice(Math.min(index, restored.length), 0, entry);
        commit({ ...stateRef.current, [list]: restored });
      };
    },
    [commit]
  );

  const relookup = useCallback(
    (id: string) => {
      patch(id, { status: "loading" });
      enqueue(id);
    },
    [patch, enqueue]
  );

  /** Drops entries by id (used after they were saved to the library). */
  const removeMany = useCallback(
    (ids: string[]) => {
      const gone = new Set(ids);
      const keep = (list: ScannedBook[]) => list.filter((b) => !gone.has(b.id));
      commit({ main: keep(stateRef.current.main), rescan: keep(stateRef.current.rescan) });
    },
    [commit]
  );

  // "Owned" is derived at render time so it stays right when the library finishes loading after the first scans.
  const withOwned = (list: ScannedBook[]) => list.map((b) => ({ ...b, owned: ownedRef.current.has(b.isbn) }));

  return {
    main: withOwned(stateRef.current.main),
    rescan: withOwned(stateRef.current.rescan),
    add,
    addDetected,
    setKind,
    setAllKinds,
    toggleConfirmed,
    moveToRescan,
    moveBack,
    remove,
    removeMany,
    relookup,
  };
}
