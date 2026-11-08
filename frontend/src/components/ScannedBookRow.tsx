import type { ScannedBook } from "../hooks/useScanBatch";
import { useI18n } from "../i18n/I18nContext";
import { BOOK_KINDS, type BookKind } from "../types";

const kindStyles: Record<BookKind, string> = {
  Book: "bg-sky-700",
  BD: "bg-amber-700",
  Manga: "bg-pink-700",
};

interface ScannedBookRowProps {
  book: ScannedBook;
  variant: "main" | "rescan";
  onCycleKind: (id: string, kind: BookKind) => void;
  onConfirm: (id: string) => void;
  onRescan: (id: string) => void;
  onMoveBack: (id: string) => void;
  onRelookup: (id: string) => void;
  onRemove: (id: string) => void;
  /** Admins see which catalogue answered what (the same data is saved in the scan log). */
  showDiagnostics?: boolean;
}

const iconButton =
  "flex h-9 w-9 shrink-0 items-center sm:h-10 sm:w-10 justify-center rounded-xl border border-slate-200 bg-white text-base transition hover:bg-slate-50 active:scale-95";

export function ScannedBookRow({
  book,
  variant,
  onCycleKind,
  onConfirm,
  onRescan,
  onMoveBack,
  onRelookup,
  onRemove,
  showDiagnostics = false,
}: ScannedBookRowProps) {
  const { t } = useI18n();
  const loading = book.status === "loading";
  const notFound = book.status === "notFound";
  const nextKind = BOOK_KINDS[(BOOK_KINDS.indexOf(book.kind) + 1) % BOOK_KINDS.length];

  const tone = book.confirmed
    ? "border-emerald-200 bg-emerald-50"
    : notFound
      ? "border-amber-200 bg-amber-50"
      : "border-slate-100 bg-white";

  return (
    <li className={`flex min-w-0 items-center gap-2 rounded-2xl border p-2 sm:gap-3 ${tone}`} data-testid="scanned-row">
      {loading ? (
        <div className="h-[60px] w-[42px] shrink-0 animate-pulse rounded bg-slate-200" />
      ) : book.cover ? (
        <img src={book.cover} alt="" className="h-[60px] w-[42px] shrink-0 rounded object-cover" />
      ) : (
        <div className="flex h-[60px] w-[42px] shrink-0 items-center justify-center rounded bg-slate-300 text-lg text-white">
          ?
        </div>
      )}

      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 break-words text-sm font-semibold text-slate-900">
          {loading ? "Looking up…" : book.title || "Unknown book"}
          {book.owned && (
            <span className="ml-1.5 rounded-full bg-indigo-100 px-1.5 py-0.5 text-[10px] font-bold text-indigo-800">
              Owned
            </span>
          )}
          {notFound && (
            <span className="ml-1.5 rounded-full bg-amber-200 px-1.5 py-0.5 text-[10px] font-bold text-amber-900">
              {t("scan.notFound")}
            </span>
          )}
        </p>
        <p className="truncate text-xs text-slate-500">{book.author || `ISBN ${book.isbn}`}</p>
        {notFound && (
          <p className="mt-0.5 text-xs text-amber-800" data-testid="scan-hint">
            {t(book.reason === "error" ? "scan.hint.error" : "scan.hint.not-found")}
          </p>
        )}
        {notFound && showDiagnostics && (
          <details className="mt-1 text-xs text-slate-600" data-testid="scan-diagnostics">
            <summary className="cursor-pointer font-semibold text-indigo-700">{t("scan.diag.toggle")}</summary>
            <p className="mt-1 font-semibold">{t("scan.diag.sources")}</p>
            {book.trace && book.trace.length > 0 ? (
              <ul className="space-y-0.5">
                {book.trace.map((entry) => (
                  <li key={entry.name} className="flex justify-between gap-3">
                    <span>{entry.name}</span>
                    <span className={entry.status === "error" ? "font-bold text-red-600" : ""}>{t(`scan.diag.${entry.status}`)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p>{t("scan.diag.none")}</p>
            )}
            <p className="mt-1 text-slate-400">{t("scan.diag.logged")}</p>
          </details>
        )}
        <button
          type="button"
          onClick={() => onCycleKind(book.id, nextKind)}
          title="Tap to change the type"
          aria-label={`Type: ${book.kind}. Change to ${nextKind}`}
          className={`mt-1 rounded-full px-2 py-0.5 text-[10px] font-extrabold text-white ${kindStyles[book.kind]}`}
        >
          {book.kind} ▾
        </button>
      </div>

      <div className="flex shrink-0 gap-1">
        {variant === "main" ? (
          <>
            <button
              type="button"
              className={`${iconButton} text-emerald-600`}
              aria-label="Validate"
              aria-pressed={book.confirmed}
              onClick={() => onConfirm(book.id)}
            >
              ✓
            </button>
            <button
              type="button"
              className={`${iconButton} text-indigo-600`}
              aria-label="Rescan later"
              onClick={() => onRescan(book.id)}
            >
              ↻
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className={`${iconButton} text-indigo-600`}
              aria-label="Look up again"
              disabled={loading}
              onClick={() => onRelookup(book.id)}
            >
              ⟳
            </button>
            <button
              type="button"
              className={`${iconButton} text-emerald-600`}
              aria-label="Move back to review"
              onClick={() => onMoveBack(book.id)}
            >
              ↩
            </button>
          </>
        )}
        <button
          type="button"
          className={`${iconButton} text-red-600`}
          aria-label="Remove"
          onClick={() => onRemove(book.id)}
        >
          ✕
        </button>
      </div>
    </li>
  );
}
