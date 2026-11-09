import type { Book, BookKind } from "../types";

/* Helpers for the shelf view: series/volume parsing, spine geometry and spine colours. */

export interface Hsl {
  h: number; // 0-360
  s: number; // 0-100
  l: number; // 0-100
}

/* ------------------------------------------------------------------ series / volume */

export interface SeriesInfo {
  series: string;
  volume?: number;
}

const EXPLICIT_VOLUME = /^(.*?)[\s,:–—-]+(?:tome|t|vol(?:ume)?|volume|n[°o]|no|book|#)\s*\.?\s*(\d{1,3})\s*$/i;
const TRAILING_NUMBER = /^(.*\D)\s+(\d{1,3})$/;

/**
 * Splits "Berserk 12", "Astérix, tome 3", "Naruto Vol. 7", "Tintin T5" into series + volume.
 * A bare trailing number is only trusted for BD / Manga (a novel like "Fahrenheit 451" is not volume 451).
 */
export function parseSeries(title: string, kind: BookKind, volumeField?: string): SeriesInfo {
  const parsed = parseSeriesFromTitle(title, kind);
  // The stored volume wins over a number guessed from the title.
  return /^\d{1,3}$/.test(volumeField?.trim() ?? "") ? { ...parsed, volume: Number(volumeField) } : parsed;
}

function parseSeriesFromTitle(title: string, kind: BookKind): SeriesInfo {
  const clean = title.trim();
  const explicit = EXPLICIT_VOLUME.exec(clean);
  if (explicit && explicit[1].trim()) return { series: explicit[1].trim(), volume: Number(explicit[2]) };
  if (kind !== "Book") {
    const trailing = TRAILING_NUMBER.exec(clean);
    if (trailing && Number(trailing[2]) <= 200) return { series: trailing[1].trim(), volume: Number(trailing[2]) };
  }
  return { series: clean };
}

/* ------------------------------------------------------------------ geometry */

/** Stable 0..1 value derived from a string, so a book always gets the same spine. */
export function hash01(text: string, salt = 0): number {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
}

export interface SpineGeometry {
  width: number;
  height: number;
}

export const ROW_HEIGHT: Record<BookKind, number> = { Book: 196, BD: 192, Manga: 172 };

export function spineGeometry(book: Pick<Book, "id" | "kind">): SpineGeometry {
  switch (book.kind) {
    case "BD":
      return { width: 19, height: 176 + Math.floor(hash01(book.id, 1) * 6) };
    case "Manga":
      return { width: 18, height: 154 + Math.floor(hash01(book.id, 1) * 6) };
    default:
      return { width: 19 + Math.floor(hash01(book.id, 2) * 7), height: 156 + Math.floor(hash01(book.id, 1) * 32) };
  }
}

/** Greedy packing: as many spines per shelf board as the width allows (2px gap between spines). */
export function packRows<T extends { width: number }>(items: T[], availableWidth: number): T[][] {
  const rows: T[][] = [[]];
  let used = 0;
  for (const item of items) {
    const current = rows[rows.length - 1];
    if (used + item.width + 2 > availableWidth && current.length) {
      rows.push([]);
      used = 0;
    }
    rows[rows.length - 1].push(item);
    used += item.width + 2;
  }
  return rows;
}

/* ------------------------------------------------------------------ colours */

/** Readable text colour on top of a spine of the given lightness. */
export const inkFor = (l: number) => (l > 58 ? "#15110b" : "#f7f3ea");

/** Muted, pleasant per-kind fallbacks used until (or unless) the cover colour is known. */
const FALLBACK_HUES: Record<BookKind, number[]> = {
  Book: [22, 35, 150, 210, 0, 270, 190, 45],
  BD: [210, 215, 40, 20, 0, 165, 50, 28],
  Manga: [350, 200, 28, 215, 280, 18, 160, 0],
};

export function fallbackColor(book: Pick<Book, "id" | "kind">): Hsl {
  const hues = FALLBACK_HUES[book.kind];
  const h = hues[Math.floor(hash01(book.id, 3) * hues.length)];
  return { h, s: 38 + Math.floor(hash01(book.id, 4) * 25), l: 30 + Math.floor(hash01(book.id, 5) * 18) };
}

function rgbToHsl(r: number, g: number, b: number): Hsl {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0;
  let s = 0;
  if (d) {
    s = d / (1 - Math.abs(2 * l - 1));
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
}

/** Dominant colour of an RGBA pixel buffer: the heaviest hue bucket, weighting vivid mid-tones. */
export function dominantColor(data: ArrayLike<number>): Hsl | null {
  const BUCKETS = 12;
  const weight = new Array<number>(BUCKETS).fill(0);
  const sum = Array.from({ length: BUCKETS }, () => [0, 0, 0]);
  let count = 0;
  let tr = 0;
  let tg = 0;
  let tb = 0;

  for (let i = 0; i + 3 < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    count++;
    tr += r;
    tg += g;
    tb += b;
    const { h, s, l } = rgbToHsl(r, g, b);
    const w = (s / 100) * (1 - Math.abs(l - 50) / 60);
    if (w <= 0.02) continue;
    const bucket = Math.floor(h / (360 / BUCKETS)) % BUCKETS;
    weight[bucket] += w;
    sum[bucket][0] += r * w;
    sum[bucket][1] += g * w;
    sum[bucket][2] += b * w;
  }
  if (!count) return null;

  const best = weight.indexOf(Math.max(...weight));
  // Nearly colourless cover (black, white, grey): use its average tone.
  if (weight[best] < count * 0.04) return rgbToHsl(tr / count, tg / count, tb / count);

  const w = weight[best];
  return rgbToHsl(sum[best][0] / w, sum[best][1] / w, sum[best][2] / w);
}

const colorCache = new Map<string, Hsl | null>();

/** Loads a cover and returns its dominant colour; null when it cannot be read (missing image, no CORS...). */
export function extractCoverColor(url: string): Promise<Hsl | null> {
  const cached = colorCache.get(url);
  if (cached !== undefined) return Promise.resolve(cached);

  return new Promise((resolve) => {
    const done = (value: Hsl | null) => {
      colorCache.set(url, value);
      resolve(value);
    };
    try {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          canvas.width = 24;
          canvas.height = 36;
          const ctx = canvas.getContext("2d", { willReadFrequently: true });
          if (!ctx || img.naturalWidth < 4) return done(null);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          done(dominantColor(ctx.getImageData(0, 0, canvas.width, canvas.height).data));
        } catch {
          done(null); // tainted canvas
        }
      };
      img.onerror = () => done(null);
      img.src = url;
    } catch {
      done(null);
    }
  });
}
