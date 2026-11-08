import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { STATUS_META, STATUS_ORDER } from "../bookStatus";
import { useCoverColors } from "../hooks/useCoverColors";
import {
  fallbackColor,
  inkFor,
  packRows,
  parseSeries,
  ROW_HEIGHT,
  spineGeometry,
} from "../services/spines";
import type { Hsl } from "../services/spines";
import { BOOK_KINDS } from "../types";
import type { Book, BookKind } from "../types";
import "./ShelfView.css";

const KIND_META: Record<BookKind, { label: string; icon: string; tint: string }> = {
  Book: { label: "Books", icon: "📖", tint: "#f59e0b" },
  BD: { label: "BD", icon: "🎨", tint: "#3b82f6" },
  Manga: { label: "Manga", icon: "🈶", tint: "#ec4899" },
};

/** Ms between two books in the intro animation (shrunk for big libraries so it never exceeds ~4 s). */
const MAX_STEP = 45;
const MAX_TOTAL = 4000;

interface ShelfBook {
  book: Book;
  series: string;
  volume?: number;
  width: number;
  height: number;
  color: Hsl;
}

const hsl = (c: Hsl, dl = 0) => `hsl(${c.h} ${c.s}% ${Math.max(0, Math.min(100, c.l + dl))}%)`;

function sortShelf(a: ShelfBook, b: ShelfBook) {
  return (
    a.series.localeCompare(b.series, undefined, { sensitivity: "base" }) ||
    (a.volume ?? 0) - (b.volume ?? 0) ||
    a.book.title.localeCompare(b.book.title)
  );
}

function spineVars(kind: BookKind, c: Hsl): React.CSSProperties {
  const vars: Record<string, string> = { "--sv-fg": inkFor(c.l) };
  if (kind === "BD") vars["--sv-art"] = `hsl(${c.h} ${Math.min(c.s, 60)}% ${Math.min(c.l + 26, 86)}%)`;
  if (kind === "Manga") {
    const dark = c.l < 26;
    const grey = dark && c.s < 20;
    const accentL = dark ? Math.max(c.l + 45, 62) : Math.min(c.l, 46);
    vars["--sv-base"] = dark ? "#14161a" : "#f5f3ee";
    vars["--sv-acc"] = `hsl(${c.h} ${grey ? 0 : Math.max(c.s, 55)}% ${grey ? 85 : accentL}%)`;
  }
  return vars as React.CSSProperties;
}

interface SpineProps {
  item: ShelfBook;
  entering: boolean;
  selected: boolean;
  onSelect?: (book: Book) => void;
  onHover: (book: Book | null, x?: number, y?: number) => void;
}

const Spine = memo(function Spine({ item, entering, selected, onSelect, onHover }: SpineProps) {
  const { book, series, volume, width, height, color } = item;
  const ref = useRef<HTMLButtonElement>(null);

  /* Intro animation: the spine flies in diagonally from the bottom-left corner of its shelf card to its slot. */
  useLayoutEffect(() => {
    const el = ref.current;
    if (!entering || !el || typeof el.animate !== "function") return;
    const card = el.closest<HTMLElement>(".sv-shelf");
    const row = el.parentElement;
    if (!card || !row) return;
    const x = -(el.offsetLeft + el.offsetWidth + 30);
    const y = Math.max(80, card.clientHeight - (row.offsetTop + row.offsetHeight)) + 60;
    el.animate(
      [
        { opacity: 0, transform: `translate(${x}px, ${y}px) rotate(-14deg) scale(0.9)` },
        { opacity: 1, offset: 0.12 },
        { transform: "translate(0, -5px) rotate(1deg) scale(1)", offset: 0.85 },
        { opacity: 1, transform: "none" },
      ],
      { duration: 500, easing: "cubic-bezier(.22,.8,.3,1)" }
    );
    // runs once, at mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const kind = book.kind;
  const num = volume ?? "–";
  const bg = hsl(color);

  return (
    <button
      ref={ref}
      type="button"
      aria-label={`${book.title} by ${book.author}`}
      aria-pressed={selected || undefined}
      className={`sv-spine sv-${kind} ${selected ? "is-selected" : ""}`}
      style={{ width, height, backgroundColor: bg, ...spineVars(kind, color) }}
      onClick={() => onSelect?.(book)}
      onMouseMove={(event) => onHover(book, event.clientX, event.clientY)}
      onMouseLeave={() => onHover(null)}
      onFocus={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        onHover(book, rect.right, rect.top);
      }}
      onBlur={() => onHover(null)}
    >
      {kind === "Book" && (
        <>
          <span className="sv-ln a" />
          <em>{book.title}</em>
          <span className="sv-ln d" />
        </>
      )}
      {kind === "BD" && (
        <>
          <span className="sv-num">{num}</span>
          <em>
            {series} <small>/ {book.author}</small>
          </em>
          <span className="sv-foot" />
        </>
      )}
      {kind === "Manga" && (
        <>
          <span className="sv-band" />
          <span className="sv-num">{num}</span>
          <em>{series}</em>
          <span className="sv-logo" />
        </>
      )}
    </button>
  );
});

interface ShelfViewProps {
  books: Book[];
  onSelectBook?: (book: Book) => void;
  /** Ids ticked in selection mode, highlighted on the shelf. */
  checkedIds?: ReadonlySet<string>;
  /** Plays the "books slide in one by one" intro once on mount. Skipped for reduced-motion users. */
  animate?: boolean;
}

function prefersReducedMotion() {
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

/** The whole library as bookcases: one shelf card per category (Book / BD / Manga), spines coloured like their covers. */
export function ShelfView({ books, onSelectBook, checkedIds, animate = true }: ShelfViewProps) {
  const covers = useCoverColors(books);
  const [width, setWidth] = useState(1000);
  const [hover, setHover] = useState<{ book: Book; x: number; y: number } | null>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const playIntro = useRef(animate && !prefersReducedMotion()).current;

  const groups = useMemo(
    () =>
      BOOK_KINDS.map((kind) => {
        const items: ShelfBook[] = books
          .filter((book) => book.kind === kind)
          .map((book) => {
            const { series, volume } = parseSeries(book.title, kind);
            return { book, series, volume, ...spineGeometry(book), color: covers[book.id] ?? fallbackColor(book) };
          })
          .sort(sortShelf);
        return { kind, items };
      }).filter((group) => group.items.length > 0),
    [books, covers]
  );

  const total = groups.reduce((sum, group) => sum + group.items.length, 0);

  /* Track the available width so each board holds as many spines as fit. */
  useLayoutEffect(() => {
    const el = measureRef.current;
    if (!el) return;
    const update = () => setWidth(el.clientWidth || 1000);
    update();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  /* Intro: reveal the books one at a time (global order: shelf by shelf, left to right). */
  const [shown, setShown] = useState(playIntro ? 0 : Infinity);
  const finished = shown >= total;
  useEffect(() => {
    if (finished) {
      if (shown !== Infinity) setShown(Infinity);
      return;
    }
    const step = Math.min(MAX_STEP, MAX_TOTAL / Math.max(total, 1));
    const id = window.setInterval(() => setShown((current) => current + 1), step);
    return () => window.clearInterval(id);
  }, [finished, shown, total]);

  const entering = shown !== Infinity;
  let offset = 0;

  return (
    <div ref={measureRef} className="space-y-5">
      {groups.map(({ kind, items }) => {
        const meta = KIND_META[kind];
        const start = offset;
        offset += items.length;
        const visible = Math.max(0, Math.min(items.length, shown - start));
        const counts = STATUS_ORDER.map((status) => ({
          status,
          count: items.filter((item) => item.book.status === status).length,
        })).filter((entry) => entry.count > 0);
        const rows = packRows(items, width - 40 - 20); // shelf padding + row padding
        let index = start;

        return (
          <section
            key={kind}
            aria-label={meta.label}
            className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
          >
            <header className="flex flex-wrap items-center gap-3 px-5 pt-4">
              <span
                aria-hidden="true"
                className="flex h-9 w-9 items-center justify-center rounded-xl text-lg"
                style={{ backgroundColor: `color-mix(in srgb, ${meta.tint} 18%, transparent)` }}
              >
                {meta.icon}
              </span>
              <h3 className="text-base font-semibold text-slate-900">
                {meta.label}{" "}
                <span className="ml-1 font-medium tabular-nums text-slate-500">{visible}</span>
              </h3>
              <div className="ml-auto flex items-center gap-3 text-xs text-slate-500">
                <span>{counts.map(({ status, count }) => `${count} ${STATUS_META[status].label.toLowerCase()}`).join(" · ")}</span>
                <span aria-hidden="true" className="flex h-1.5 w-28 overflow-hidden rounded-full bg-slate-100">
                  {counts.map(({ status, count }) => (
                    <span
                      key={status}
                      className={STATUS_META[status].dot}
                      style={{ width: `${(count / items.length) * 100}%` }}
                    />
                  ))}
                </span>
              </div>
            </header>

            <div className="sv-shelf">
              {rows.map((row, r) => (
                <div key={r} className="sv-row" style={{ height: ROW_HEIGHT[kind] }}>
                  {row.map((item) => {
                    const position = index++;
                    if (position >= shown) return null;
                    return (
                      <Spine
                        key={item.book.id}
                        item={item}
                        entering={entering}
                        selected={!!checkedIds?.has(item.book.id)}
                        onSelect={onSelectBook}
                        onHover={(book, x = 0, y = 0) => setHover(book ? { book, x, y } : null)}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </section>
        );
      })}

      {hover && (
        <div
          role="tooltip"
          className="sv-tip border border-slate-200 bg-white/90 text-slate-900"
          style={{
            left: Math.min(hover.x + 16, window.innerWidth - 280),
            top: hover.y + 16,
          }}
        >
          <span
            className="sw"
            style={{ backgroundColor: hsl(covers[hover.book.id] ?? fallbackColor(hover.book)) }}
          />
          <b className="block text-[13px]">{hover.book.title}</b>
          <div className="text-slate-500">{hover.book.author}</div>
          <span className="mt-1.5 inline-block rounded-full bg-slate-100 px-2 text-[11px] text-slate-700">
            {KIND_META[hover.book.kind].label} · {STATUS_META[hover.book.status].label}
          </span>
        </div>
      )}
    </div>
  );
}
