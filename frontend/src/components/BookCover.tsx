import { useState } from "react";
import type { Book, BookKind } from "../types";
import { isbnCoverCandidates, isPlaceholderSize } from "../services/covers";

const PLACEHOLDER: Record<BookKind, { tone: string; icon: JSX.Element }> = {
  Book: {
    tone: "bg-stone-200 text-stone-500",
    icon: (
      <>
        <path d="M6 4h10a2 2 0 0 1 2 2v14H8a2 2 0 0 1-2-2V4Z" />
        <path d="M6 18a2 2 0 0 1 2-2h10" />
        <path d="M10 8h5" />
      </>
    ),
  },
  BD: {
    tone: "bg-amber-100 text-amber-700/60",
    icon: (
      <>
        <rect x="4" y="4" width="16" height="16" rx="1.5" />
        <path d="M4 12h16M12 4v8M9 12v8" />
      </>
    ),
  },
  Manga: {
    tone: "bg-slate-200 text-slate-500",
    icon: (
      <>
        <path d="M17 4H8a2 2 0 0 0-2 2v14h11a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1Z" />
        <path d="M6 8H4M6 12H4M6 16H4" />
        <path d="m10 9 3 3-3 3" />
      </>
    ),
  },
};

/** The stored cover, or the ISBN-based covers (Epagine, then Open Library) when none was saved. */
export function coverCandidates(book: Pick<Book, "cover" | "isbn">): string[] {
  return book.cover ? [book.cover] : isbnCoverCandidates(book.isbn);
}

/** First candidate; BookCover moves on to the next ones if it fails to load. */
export function resolveCoverUrl(book: Pick<Book, "cover" | "isbn">): string | null {
  return coverCandidates(book)[0] ?? null;
}

interface BookCoverProps {
  book: Pick<Book, "title" | "kind" | "cover" | "isbn">;
  /** "full" shows the title on the placeholder; "compact" is icon-only for thumbnails. */
  variant?: "full" | "compact";
  className?: string;
}

/**
 * Fills its parent. Always renders a neutral per-kind placeholder underneath and fades the real
 * cover in on top; if the image is missing, broken or a 1px stub, the placeholder simply stays.
 */
export function BookCover({ book, variant = "full", className = "" }: BookCoverProps) {
  const [failedUrls, setFailedUrls] = useState<string[]>([]);
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);
  const url = coverCandidates(book).find((candidate) => !failedUrls.includes(candidate)) ?? null;
  const markFailed = (failed: string) => setFailedUrls((current) => [...current, failed]);
  const placeholder = PLACEHOLDER[book.kind] ?? PLACEHOLDER.Book;
  const showImage = url !== null;
  const full = variant === "full";

  return (
    <div className={`relative h-full w-full overflow-hidden ${placeholder.tone} ${className}`}>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-3 text-center">
        <svg
          className={full ? "h-10 w-10" : "h-5 w-5"}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          {placeholder.icon}
        </svg>
        {full && (
          <>
            <span className="line-clamp-3 text-xs font-semibold leading-tight text-slate-600">{book.title}</span>
            <span className="text-[10px] font-medium uppercase tracking-widest opacity-70">{book.kind}</span>
          </>
        )}
      </div>

      {showImage && (
        <img
          src={url}
          alt={`Cover of ${book.title}`}
          loading="lazy"
          onLoad={(event) => {
            if (isPlaceholderSize(event.currentTarget.naturalWidth, event.currentTarget.naturalHeight)) {
              markFailed(url);
            } else {
              setLoadedUrl(url);
            }
          }}
          onError={() => markFailed(url)}
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ${
            loadedUrl === url ? "opacity-100" : "opacity-0"
          }`}
        />
      )}
    </div>
  );
}
