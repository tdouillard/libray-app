import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ScannedBookRow } from "../components/ScannedBookRow";
import { isSavable, toBooks, useScanBatch } from "../hooks/useScanBatch";
import { useBarcodeScanner } from "../hooks/useBarcodeScanner";
import { useLibraryData } from "../hooks/useLibraryData";
import { useAuth } from "../auth/AuthContext";
import { normalizeIsbn } from "../services/isbn";
import { logScanFailure } from "../services/scanLogs";
import { BOOK_KINDS, type BookKind } from "../types";

const kindLabels: Record<BookKind, string> = { Book: "📖 Book", BD: "🎨 BD", Manga: "🈶 Manga" };
const kindActive: Record<BookKind, string> = {
  Book: "bg-sky-700 text-white",
  BD: "bg-amber-700 text-white",
  Manga: "bg-pink-700 text-white",
};
const TOAST_MS = 5000;

function beep() {
  try {
    const AudioCtx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 880;
    gain.gain.value = 0.08;
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.08);
    osc.onended = () => void ctx.close();
  } catch {
    /* audio feedback is a nicety */
  }
}

interface Toast {
  message: string;
  undo?: () => void;
}

export function BatchScanPage() {
  const { books, addBooks } = useLibraryData();
  const libraryIsbns = useMemo(() => books.map((b) => b.isbn), [books]);
  const batch = useScanBatch(libraryIsbns);
  const { isAdmin } = useAuth();

  const videoRef = useRef<HTMLVideoElement>(null);
  const [kind, setKind] = useState<BookKind>("Book");
  const kindRef = useRef(kind);
  kindRef.current = kind;

  const [tab, setTab] = useState<"main" | "rescan">("main");
  const [flash, setFlash] = useState(false);
  const [manualIsbn, setManualIsbn] = useState("");
  const [showManual, setShowManual] = useState(false);
  const [message, setMessage] = useState("");
  const [toast, setToast] = useState<Toast | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const toastTimer = useRef<number>();

  const showToast = useCallback((next: Toast) => {
    window.clearTimeout(toastTimer.current);
    setToast(next);
    toastTimer.current = window.setTimeout(() => setToast(null), TOAST_MS);
  }, []);
  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  const handleIsbn = useCallback(
    (isbn: string) => {
      const result = batch.add(isbn, kindRef.current);
      if (result === "added") {
        setMessage("");
        setFlash(true);
        window.setTimeout(() => setFlash(false), 300);
        navigator.vibrate?.(50);
        beep();
      } else if (result === "duplicate") {
        setMessage(`Already in this batch (${isbn})`);
      }
    },
    [batch]
  );

  const scanner = useBarcodeScanner({ videoRef, active: true, continuous: true, onIsbn: handleIsbn });

  const handleManual = (event: React.FormEvent) => {
    event.preventDefault();
    if (!normalizeIsbn(manualIsbn)) {
      setMessage("This is not a valid ISBN (check the digits printed under the barcode).");
      logScanFailure({ isbn: manualIsbn.trim(), kind: kindRef.current, reason: "invalid" });
      return;
    }
    handleIsbn(manualIsbn);
    setManualIsbn("");
  };

  const handleRemove = (id: string) => {
    const undo = batch.remove(id);
    showToast({ message: "Book removed", undo });
  };

  const savableMain = batch.main.filter(isSavable);
  const savableRescan = batch.rescan.filter(isSavable);
  const pendingLookups = [...batch.main, ...batch.rescan].filter((b) => b.status === "loading").length;

  const save = async (items: typeof savableMain) => {
    if (items.length === 0 || saving) return;
    setSaving(true);
    setSaveError("");
    try {
      await addBooks(toBooks(items));
      batch.removeMany(items.map((b) => b.id));
      const counts = items.reduce<Record<string, number>>((acc, b) => {
        acc[b.kind] = (acc[b.kind] ?? 0) + 1;
        return acc;
      }, {});
      const detail = Object.entries(counts)
        .map(([k, n]) => `${n} ${k}`)
        .join(", ");
      showToast({ message: `✔ ${items.length} added to your library (${detail})` });
    } catch (error) {
      console.error(error);
      setSaveError(error instanceof Error ? error.message : "Could not save the books. Your list is kept, try again.");
    } finally {
      setSaving(false);
    }
  };

  const message_ = message || scanner.error;
  const rowProps = {
    onCycleKind: batch.setKind,
    onConfirm: batch.toggleConfirmed,
    onRescan: batch.moveToRescan,
    onMoveBack: batch.moveBack,
    onRelookup: batch.relookup,
    onRemove: handleRemove,
  };

  const renderList = (variant: "main" | "rescan") => {
    const list = variant === "main" ? batch.main : batch.rescan;
    if (list.length === 0) {
      return (
        <p className="p-6 text-center text-sm text-slate-400">
          {variant === "main"
            ? "Scan a barcode: books appear here instantly."
            : "Books you flag with ↻ wait here for a second look."}
        </p>
      );
    }
    return (
      <ul className="space-y-2">
        {list.map((book) => (
          <ScannedBookRow key={book.id} book={book} variant={variant} showDiagnostics={isAdmin} {...rowProps} />
        ))}
      </ul>
    );
  };

  const tabClass = (active: boolean) =>
    `flex-1 rounded-full px-3 py-2 text-sm font-semibold transition ${
      active ? "bg-indigo-600 text-white" : "text-slate-600"
    }`;

  return (
    <div className="w-full max-w-full overflow-x-hidden pb-24">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[380px_minmax(0,1fr)] lg:items-start">
        <div className="sticky top-0 z-10 -mx-4 min-w-0 bg-slate-100 px-4 pb-2 pt-1 sm:mx-0 sm:px-0 lg:top-4">
          <div className="relative h-56 overflow-hidden rounded-3xl bg-slate-900 sm:h-64">
            <video ref={videoRef} className="h-full w-full object-cover" playsInline muted autoPlay />
            <div
              className={`pointer-events-none absolute inset-x-[8%] top-1/2 h-24 -translate-y-1/2 rounded-xl border-2 transition ${
                flash ? "border-emerald-400 shadow-[0_0_0_999px_rgba(34,197,94,0.2)]" : "border-white/70"
              }`}
            />
            {scanner.isStarting && (
              <p className="absolute inset-0 flex items-center justify-center text-sm text-white/80">Starting camera…</p>
            )}
            <span className="absolute left-3 top-3 rounded-full bg-red-500 px-2 py-0.5 text-[11px] font-bold text-white">
              ● LIVE
            </span>
            <span className="absolute right-3 top-3 rounded-full bg-white px-2.5 py-0.5 text-xs font-bold text-slate-900">
              {batch.main.length + batch.rescan.length} scanned
            </span>
            <div className="absolute inset-x-0 bottom-0 flex flex-wrap items-center justify-between gap-2 bg-gradient-to-t from-black/70 to-transparent p-2 sm:p-3">
              {scanner.torchAvailable ? (
                <button
                  type="button"
                  onClick={() => void scanner.toggleTorch()}
                  className="rounded-full border border-white/40 bg-white/10 px-3 py-1.5 text-xs text-white sm:text-sm"
                >
                  {scanner.torchOn ? "🔦 Off" : "🔦 Light"}
                </button>
              ) : (
                <span />
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={scanner.restart}
                  className="whitespace-nowrap rounded-full border border-white/40 bg-white/10 px-3 py-1.5 text-xs text-white sm:text-sm"
                >
                  Restart
                </button>
                <button
                  type="button"
                  onClick={() => setShowManual((v) => !v)}
                  className="whitespace-nowrap rounded-full border border-white/40 bg-white/10 px-3 py-1.5 text-xs text-white sm:text-sm"
                >
                  ⌨ Type ISBN
                </button>
              </div>
            </div>
          </div>

          {showManual && (
            <form className="mt-2 flex gap-2" onSubmit={handleManual}>
              <input
                value={manualIsbn}
                onChange={(e) => setManualIsbn(e.target.value)}
                inputMode="numeric"
                placeholder="978 2 344 05948 7"
                aria-label="ISBN typed manually"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-400"
              />
              <button type="submit" className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white">
                Add
              </button>
            </form>
          )}

          {(message_ || scanner.hint) && (
            <p className={`mt-2 text-sm ${message_ ? "text-red-600" : "text-slate-500"}`}>{message_ || scanner.hint}</p>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-1 rounded-2xl border border-slate-200 bg-white p-1">
            <span className="basis-full px-2 text-xs font-semibold text-slate-500 sm:basis-auto">New scans:</span>
            {BOOK_KINDS.map((k) => (
              <button
                key={k}
                type="button"
                aria-pressed={kind === k}
                onClick={() => setKind(k)}
                className={`min-w-0 flex-1 whitespace-nowrap rounded-xl px-1 py-2 text-xs font-bold transition sm:px-2 sm:text-sm ${
                  kind === k ? kindActive[k] : "text-slate-600"
                }`}
              >
                {kindLabels[k]}
              </button>
            ))}
            <button
              type="button"
              title="Set every book in both lists to the selected type"
              onClick={() => {
                batch.setAllKinds(kind);
                showToast({ message: `All set to ${kind}` });
              }}
              className="whitespace-nowrap rounded-xl border border-dashed border-slate-400 bg-slate-50 px-2 py-2 text-xs text-slate-700"
            >
              Apply to all
            </button>
          </div>
        </div>

        <div className="min-w-0">
          <div className="flex rounded-full border border-slate-200 bg-white p-1 lg:hidden" role="tablist">
            <button type="button" role="tab" aria-selected={tab === "main"} className={tabClass(tab === "main")} onClick={() => setTab("main")}>
              To review ({batch.main.length})
            </button>
            <button type="button" role="tab" aria-selected={tab === "rescan"} className={tabClass(tab === "rescan")} onClick={() => setTab("rescan")}>
              Rescan ({batch.rescan.length})
            </button>
          </div>

          <div className="mt-3 grid grid-cols-1 gap-3 lg:mt-0 lg:grid-cols-2">
            <section className={`rounded-3xl border border-slate-200 bg-white p-3 ${tab === "main" ? "" : "hidden lg:block"}`}>
              <h2 className="mb-2 px-2 text-xs font-bold uppercase tracking-widest text-slate-500">
                To review ({batch.main.length})
              </h2>
              {renderList("main")}
            </section>

            <section className={`rounded-3xl border border-slate-200 bg-white p-3 ${tab === "rescan" ? "" : "hidden lg:block"}`}>
              <h2 className="mb-2 px-2 text-xs font-bold uppercase tracking-widest text-slate-500">
                Rescan ({batch.rescan.length})
              </h2>
              {renderList("rescan")}
              {savableRescan.length > 0 && (
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void save(savableRescan)}
                  className="mt-3 w-full rounded-xl border border-slate-300 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                >
                  Add these {savableRescan.length} to library
                </button>
              )}
            </section>
          </div>
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white px-4 py-3">
        <div className="mx-auto flex max-w-xl flex-col items-center gap-1">
          {saveError && (
            <p className="text-sm text-red-600" role="alert">
              {saveError}
            </p>
          )}
          <button
            type="button"
            disabled={savableMain.length === 0 || saving}
            onClick={() => void save(savableMain)}
            className="w-full rounded-2xl bg-slate-900 py-3 text-base font-bold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving
              ? "Saving…"
              : saveError
                ? `Retry: add ${savableMain.length} book${savableMain.length === 1 ? "" : "s"} to library`
                : `Add ${savableMain.length} book${savableMain.length === 1 ? "" : "s"} to library`}
          </button>
          {pendingLookups > 0 && <p className="text-xs text-slate-500">{pendingLookups} lookup(s) in progress…</p>}
        </div>
      </div>

      {toast && (
        <div
          className="fixed bottom-24 left-1/2 z-30 flex -translate-x-1/2 items-center gap-3 rounded-xl bg-slate-900 px-4 py-2.5 text-sm text-white shadow-lg"
          role="status"
        >
          <span>{toast.message}</span>
          {toast.undo && (
            <button
              type="button"
              className="font-semibold text-indigo-300"
              onClick={() => {
                toast.undo?.();
                setToast(null);
              }}
            >
              Undo
            </button>
          )}
          {toast.message.startsWith("✔") && (
            <Link to="/" className="font-semibold text-indigo-300">
              View library
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
